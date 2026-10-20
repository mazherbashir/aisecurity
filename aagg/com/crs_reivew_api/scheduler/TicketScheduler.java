package com.crs_reivew_api.scheduler;

import com.crs_reivew_api.component.TaskFileStore;
import com.crs_reivew_api.component.TaskMemory;
import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.SnowDuplicateTaskDTO;
import com.crs_reivew_api.dto.SnowRitmDTO;
import com.crs_reivew_api.dto.SnowScTaskDTO;
import com.crs_reivew_api.dto.VeracodeReportDTO;
import com.crs_reivew_api.service.CheckmarxService;
import com.crs_reivew_api.service.ReviewSummaryService;
import com.crs_reivew_api.service.SnowService;
import com.crs_reivew_api.service.VeracodeService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * <h1>ServiceNow Automated Ticket Scheduler</h1>
 * <p>
 * Background worker task that automatically queries open ServiceNow catalog tasks ({@code sc_task}),
 * evaluates request types (Sign-Off vs. Pending / Initial Assessment / Rescan), and executes automated workflows:
 * </p>
 * <ul>
 *   <li><b>Task Memory & Deduplication</b>: Maintains an in-memory LRU cache ({@link TaskMemory}) backed by persistent file store
 *       ({@link TaskFileStore}) to prevent redundant processing of already completed SCTASK items.</li>
 *   <li><b>Local JSON File Mode</b>: Supports reading tickets from a local JSON file ({@code crs.snow.scheduler.read-from-local-file})
 *       for testing and offline operation.</li>
 *   <li><b>Branching Logic</b>:
 *     <ul>
 *       <li><b>Sign-Off Requests</b> (Request Reason == "Sign Off"): Automatically updates scan names, uploads PDF reports to ServiceNow,
 *           updates RITM variables, and closes catalog tasks (State 3: Closed Complete).</li>
 *       <li><b>Pending Requests</b> (Request Reason != "Sign Off"): Evaluates scans, logs review comments, posts pending updates to ServiceNow,
 *           and transitions task state to Pending (State -5: Pending).</li>
 *     </ul>
 *   </li>
 * </ul>
 *
 * @see com.crs_reivew_api.service.SnowService
 * @see com.crs_reivew_api.controller.SnowController
 */
@Component
public class TicketScheduler {

    private static final Logger logger = LoggerFactory.getLogger(TicketScheduler.class);
    private static final Pattern SCAN_NAME_RITM_PATTERN = Pattern.compile("(?i)(?:^|[^a-zA-Z0-9])(RITM\\d+)[\\s\\)\\]\\.]*$");

    private final SnowService snowService;
    private final VeracodeService veracodeService;
    private final VeracodeConfig config;
    private final TaskMemory taskMemory;
    private final TaskFileStore taskFileStore;
    
    @Autowired(required = false)
    private CheckmarxService checkmarxService;

    @Autowired(required = false)
    private ReviewSummaryService reviewSummaryService;

    @Autowired(required = false)
    private com.crs_reivew_api.statistics.service.SchedulerMetricsService metricsService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public TicketScheduler(
            SnowService snowService,
            VeracodeService veracodeService,
            VeracodeConfig config,
            TaskMemory taskMemory,
            TaskFileStore taskFileStore) {
        this.snowService = snowService;
        this.veracodeService = veracodeService;
        this.config = config;
        this.taskMemory = taskMemory;
        this.taskFileStore = taskFileStore;
    }

    public CheckmarxService getCheckmarxService() {
        return checkmarxService;
    }

    public void setCheckmarxService(CheckmarxService checkmarxService) {
        this.checkmarxService = checkmarxService;
    }

    public ReviewSummaryService getReviewSummaryService() {
        return reviewSummaryService;
    }

    public void setReviewSummaryService(ReviewSummaryService reviewSummaryService) {
        this.reviewSummaryService = reviewSummaryService;
    }

    public com.crs_reivew_api.statistics.service.SchedulerMetricsService getMetricsService() {
        return metricsService;
    }

    public void setMetricsService(com.crs_reivew_api.statistics.service.SchedulerMetricsService metricsService) {
        this.metricsService = metricsService;
    }

    /**
     * Scheduled job running inside the Spring Boot server process.
     * Repetition delay is controlled via crs.snow.scheduler.delay-ms (default 5 minutes / 300000ms).
     */
    @Scheduled(fixedDelayString = "${crs.snow.scheduler.delay-ms:300000}")
    public void scheduleSctaskProcessing() {
        if (!config.isSnowSchedulerEnabled()) {
            logger.debug("ServiceNow SCTASK Scheduler is currently disabled via crs.snow.scheduler.enabled=false. Skipping execution.");
            return;
        }

        if (metricsService != null) {
            metricsService.startPolling();
        }

        logger.info("Starting ServiceNow SCTASK Scheduler run...");
        int processedCount = 0;
        int skippedCount = 0;
        try {
            JsonNode rootNode = fetchOpenTicketsFromServiceNow();
            if (rootNode == null || !rootNode.has("result") || !rootNode.get("result").isArray()) {
                logger.info("No open remediation tickets found in ServiceNow.");
                return;
            }

            JsonNode tasksArray = rootNode.get("result");
            int totalCount = tasksArray.size();
            logger.info("Retrieved {} open catalog task(s) from ServiceNow.", totalCount);

            for (JsonNode item : tasksArray) {
                SnowScTaskDTO scTaskDto = snowService.extractScTaskDto(item);
                if (scTaskDto == null || scTaskDto.getNumber() == null || scTaskDto.getNumber().trim().isEmpty()) {
                    continue;
                }

                String sctaskNumber = scTaskDto.getNumber().trim();
                String ritmNumber = scTaskDto.getRequestItemNumber();

                // Check in-memory LRU store to prevent re-processing
                if (taskMemory.contains(sctaskNumber)) {
                    logger.debug("SCTASK {} is already processed (in TaskMemory LRU). Skipping.", sctaskNumber);
                    skippedCount++;
                    continue;
                }

                if (metricsService != null) {
                    metricsService.startProcessingTicket(sctaskNumber, ritmNumber);
                }

                logger.info("Processing new SCTASK: {} (Associated RITM: {})", sctaskNumber, ritmNumber);

                SnowRitmDTO ritmDto = null;
                if (ritmNumber != null && !ritmNumber.trim().isEmpty()) {
                    try {
                        ritmDto = snowService.getRitmDetails(ritmNumber);
                    } catch (Exception e) {
                        logger.warn("Failed to fetch RITM details for {}: {}", ritmNumber, e.getMessage());
                    }
                }

                String scaTool = (ritmDto != null) ? ritmDto.getScaTool() : null;
                String appProfileName = (ritmDto != null) ? ritmDto.getApplicationProfileName() : null;
                String appVersion = (ritmDto != null) ? ritmDto.getApplicationVersion() : null;
                String requestReason = (ritmDto != null) ? ritmDto.getRequestReason() : null;

                try {
                    if (scaTool != null && scaTool.toLowerCase().contains("veracode")) {
                        logger.info("Detected Veracode SCA Tool for SCTASK {} (RITM: {}). Raw Profile: '{}', Version: '{}', Request Reason: '{}'", sctaskNumber, ritmNumber, appProfileName, appVersion, requestReason);
                        processVeracodeTask(sctaskNumber, ritmNumber, appProfileName, appVersion, requestReason);
                    } else {
                        logger.info("Detected Non-Veracode SCA Tool ('{}') for SCTASK {} (RITM: {}). Considering as Checkmarx. Raw Profile: '{}', Version: '{}', Request Reason: '{}'", scaTool, sctaskNumber, ritmNumber, appProfileName, appVersion, requestReason);
                        processNonVeracodeTask(sctaskNumber, ritmNumber, scaTool != null ? scaTool : "Checkmarx", appProfileName, appVersion, requestReason);
                    }
                } finally {
                    if (metricsService != null) {
                        metricsService.clearCurrentTicket();
                    }
                }

                // Call generic placeholder processTicket method
                processTicket(sctaskNumber, ritmNumber, ritmDto);

                // Update LRU memory and append to history file
                String timestamp = Instant.now().toString();
                taskMemory.put(sctaskNumber, timestamp);
                taskFileStore.appendEntry(sctaskNumber, timestamp);

                processedCount++;
            }

            logger.info("ServiceNow SCTASK Scheduler run finished. Processed: {}, Skipped: {}, Total LRU memory size: {}",
                    processedCount, skippedCount, taskMemory.size());

        } catch (Exception e) {
            logger.error("Error occurred during ServiceNow SCTASK Scheduler run: {}", e.getMessage(), e);
        } finally {
            if (metricsService != null) {
                metricsService.finishPolling(processedCount, skippedCount);
            }
        }
    }

    /**
     * Fetches open remediation catalog tasks from ServiceNow or reads from a local JSON file
     * if crs.snow.scheduler.read-from-local-file is set to true.
     */
    public JsonNode fetchOpenTicketsFromServiceNow() {
        if (config.isSnowSchedulerReadFromLocalFile()) {
            String filePath = config.getSnowSchedulerLocalFilePath();
            logger.info("crs.snow.scheduler.read-from-local-file is enabled. Reading open tickets from local file: {}", filePath);
            try {
                File file = new File(filePath);
                if (!file.exists()) {
                    logger.error("Local tickets file not found at path: {}", file.getAbsolutePath());
                    return null;
                }
                return objectMapper.readTree(file);
            } catch (Exception e) {
                logger.error("Failed to read open tickets from local file '{}': {}", filePath, e.getMessage(), e);
                return null;
            }
        }
        return snowService.openRemediation(500, null, null);
    }

    /**
     * Placeholder method for custom ticket processing logic.
     */
    public void processTicket(String sctaskNumber, String ritmNumber, SnowRitmDTO ritmDto) {
        logger.info("Executed processTicket() for SCTASK: {} (RITM: {})", sctaskNumber, ritmNumber);
    }

    /**
     * Helper method to clean and deduplicate application profile names (removes "Application:" and duplicate values).
     * For Veracode:
     * - If there is a pipe '|', removes the pipe and takes the first part.
     * - If there is a slash '/', takes the first part before the slash.
     */
    public String cleanVeracodeProfileName(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return "";
        }
        String text = raw.trim();

        if (text.toLowerCase().startsWith("application:")) {
            text = text.substring("application:".length()).trim();
        } else {
            text = text.replaceAll("(?i)\\bapplication:\\b", "").trim();
        }

        // Check for pipe '|': take the first part
        int pipeIdx = text.indexOf('|');
        if (pipeIdx != -1) {
            text = text.substring(0, pipeIdx).trim();
        }

        // For Veracode only: check for slash '/': take the first part
        int slashIdx = text.indexOf('/');
        if (slashIdx != -1) {
            text = text.substring(0, slashIdx).trim();
        }

        String[] parts = text.split("[,\\s]+");
        List<String> uniqueParts = new ArrayList<>();
        for (String part : parts) {
            String p = part.trim();
            if (!p.isEmpty() && !uniqueParts.contains(p)) {
                uniqueParts.add(p);
            }
        }

        if (uniqueParts.isEmpty()) {
            return text;
        }

        return String.join(" ", uniqueParts);
    }

    /**
     * Cleans and deduplicates Checkmarx profile names without stripping slashes '/'.
     */
    public String cleanCheckmarxProfileName(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return "";
        }
        String text = raw.trim();

        if (text.toLowerCase().startsWith("application:")) {
            text = text.substring("application:".length()).trim();
        } else {
            text = text.replaceAll("(?i)\\bapplication:\\b", "").trim();
        }

        String[] parts = text.split("[,\\s]+");
        List<String> uniqueParts = new ArrayList<>();
        for (String part : parts) {
            String p = part.trim();
            if (!p.isEmpty() && !uniqueParts.contains(p)) {
                uniqueParts.add(p);
            }
        }

        if (uniqueParts.isEmpty()) {
            return text;
        }

        return String.join(" ", uniqueParts);
    }

    /**
     * Parses profile name and branch name for non-Veracode tools (e.g. Checkmarx).
     * If there is a pipe '|', removes it, uses the first part as profileName and second part as branchName.
     * If there is 'BRANCH:', uses part before as profileName and part after as branchName.
     * Note: '/' is NOT removed for Checkmarx as it can be part of project name or branch name.
     */
    public String[] parseNonVeracodeProfileAndBranch(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return new String[] {"", null};
        }
        String text = raw.trim();
        if (text.toLowerCase().startsWith("application:")) {
            text = text.substring("application:".length()).trim();
        } else {
            text = text.replaceAll("(?i)\\bapplication:\\b", "").trim();
        }

        String profilePart = text;
        String branchPart = null;

        int pipeIdx = text.indexOf('|');
        if (pipeIdx != -1) {
            profilePart = text.substring(0, pipeIdx).trim();
            branchPart = text.substring(pipeIdx + 1).trim();
        } else {
            int branchIdx = text.toUpperCase().indexOf("BRANCH:");
            if (branchIdx != -1) {
                profilePart = text.substring(0, branchIdx).trim();
                branchPart = text.substring(branchIdx + "BRANCH:".length()).trim();
            }
        }

        if (branchPart != null) {
            if (branchPart.toUpperCase().startsWith("BRANCH:")) {
                branchPart = branchPart.substring("BRANCH:".length()).trim();
            }
            if (branchPart.isEmpty()) {
                branchPart = null;
            }
        }

        String cleanedProfile = cleanCheckmarxProfileName(profilePart);
        return new String[] { cleanedProfile, branchPart };
    }

    /**
     * Checks if a string plausibly represents a git branch name (e.g. "merge", "master", "main", "dev")
     * rather than a version number (e.g. "v1.0.0", "2.10.0.2") or empty/placeholder string.
     */
    public boolean isLikelyBranchName(String str) {
        if (str == null || str.trim().isEmpty()) return false;
        String s = str.trim().toLowerCase();
        if (s.equals("n/a") || s.equals("na") || s.equals("none") || s.equals("null")) return false;
        // If it starts with 'v' followed by digits and dots (like v1.0.0, v2.1) or pure numbers/dots, it's a version, not branch
        if (s.matches("^v?\\d+(\\.\\d+)+.*$") || s.matches("^v?\\d+$")) return false;
        return true;
    }

    private static final Pattern MULTI_PART_VERSION =
            Pattern.compile("^(?i)v?(\\d+)\\.(\\d+)(?:\\.(\\d+))?((?:\\.\\d+)*)([-+].*)?$");
    private static final Pattern SINGLE_PART_VERSION =
            Pattern.compile("^(?i)v?(\\d{1,4})([-+].*)?$");

    /**
     * Format application version per rule:
     * - If version is null/empty or equals "N/A", "na", or "n/a" (case-insensitive), change to "v1.0.0".
     * - If version is a semantic version (e.g. 1, 1.0, 2.0, 0.0, 1.0.0, 2.10.0.2), normalize to 3-part semver with leading 'v' (e.g. v1.0.0, v2.0.0, v0.0.0).
     * - Replace space, double spaces, or commas with "_".
     */
    public static String sanitizeVersion(String rawVersion) {
        if (rawVersion == null || rawVersion.trim().isEmpty()) {
            return "v1.0.0";
        }
        String clean = rawVersion.trim();
        if (clean.equalsIgnoreCase("n/a") || clean.equalsIgnoreCase("na") || clean.equalsIgnoreCase("none") || clean.equalsIgnoreCase("null")) {
            return "v1.0.0";
        }

        // If rawVersion contains '=' or variable name artifacts, extract first token
        if (clean.contains("=") || clean.toLowerCase().contains("data_classification") || clean.toLowerCase().contains("exposure")) {
            int firstSpace = clean.indexOf(" ");
            if (firstSpace != -1) {
                clean = clean.substring(0, firstSpace).trim();
            }
            int firstEq = clean.indexOf("=");
            if (firstEq != -1) {
                clean = clean.substring(0, firstEq).trim();
            }
        }

        // Normalize common prefixes like "version ", "ver ", "v ", "v."
        if (clean.matches("^(?i)ver(sion)?[\\s_:]+\\d.*")) {
            clean = clean.replaceFirst("^(?i)ver(sion)?[\\s_:]+", "");
        } else if (clean.matches("^(?i)v[\\s_:]+\\d.*")) {
            clean = clean.replaceFirst("^(?i)v[\\s_:]+", "");
        } else if (clean.matches("^(?i)v\\.\\d.*")) {
            clean = clean.substring(2);
        }

        while (clean.endsWith(".")) {
            clean = clean.substring(0, clean.length() - 1);
        }

        clean = clean.replaceAll("[,\\s]+", "_");
        if (clean.isEmpty() || clean.equals("_") || clean.equals("=")) {
            return "v1.0.0";
        }

        // Check multi-part dot-separated version (e.g. 1.0, 2.0, 0.0, 1.0.0, 2.10.0.2, v1.0, v2.0)
        Matcher multiMatcher = MULTI_PART_VERSION.matcher(clean);
        if (multiMatcher.matches()) {
            String major = multiMatcher.group(1);
            String minor = multiMatcher.group(2);
            String patch = multiMatcher.group(3) != null ? multiMatcher.group(3) : "0";
            String extra = multiMatcher.group(4) != null ? multiMatcher.group(4) : "";
            String suffix = multiMatcher.group(5) != null ? multiMatcher.group(5) : "";
            return "v" + major + "." + minor + "." + patch + extra + suffix;
        }

        // Check single-part integer version (e.g. 1, 2, 0, v1, v2)
        Matcher singleMatcher = SINGLE_PART_VERSION.matcher(clean);
        if (singleMatcher.matches()) {
            String major = singleMatcher.group(1);
            String suffix = singleMatcher.group(2) != null ? singleMatcher.group(2) : "";
            return "v" + major + ".0.0" + suffix;
        }

        return clean;
    }

    public String sanitizeApplicationVersion(String rawVersion) {
        return sanitizeVersion(rawVersion);
    }

    /**
     * Extracts date portion only (e.g. "2026-10-05") from timestamp strings such as
     * "2026-10-05 12:15:35 UTC" or "2026-10-05T12:15:35Z" for clean scan name formatting.
     */
    public String extractDateOnly(String rawDate) {
        if (rawDate == null || rawDate.trim().isEmpty()) {
            return LocalDate.now().toString();
        }
        String clean = rawDate.trim();
        int spaceIdx = clean.indexOf(" ");
        if (spaceIdx != -1) {
            clean = clean.substring(0, spaceIdx).trim();
        }
        int tIdx = clean.indexOf("T");
        if (tIdx != -1) {
            clean = clean.substring(0, tIdx).trim();
        }
        return clean;
    }

    /**
     * Builds a sanitized PDF filename from an application title and current date.
     * Pattern: CustomizedReport_<sanitizedAppName>_<DD_Mon_YYYY>.pdf
     * Example: "CustomizedReport_DEU_xLOS_PwC_Products_Platform_on_SAP_Cloud_Platform_06_Mar_2026.pdf"
     */
    public String buildPdfFilename(String title) {
        return buildPdfFilename(title, LocalDate.now());
    }

    public String buildPdfFilename(String title, LocalDate date) {
        String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Report";

        // 1) Remove accents / diacritics
        String sanitized = java.text.Normalizer.normalize(safeTitle, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");

        // 2) Replace any sequence of non-alphanumeric characters with underscore
        sanitized = sanitized.replaceAll("[^A-Za-z0-9]+", "_");

        // 3) Collapse multiple underscores and trim from ends
        sanitized = sanitized.replaceAll("_+", "_").replaceAll("^_+|_+$", "");

        if (sanitized.isEmpty()) {
            sanitized = "Report";
        }

        // Format date -> DD_Mon_YYYY (e.g. 06_Mar_2026 or 05_Oct_2026)
        if (date == null) {
            date = LocalDate.now();
        }
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd_MMM_yyyy", java.util.Locale.ENGLISH);
        String datePart = date.format(formatter);

        return "CustomizedReport_" + sanitized + "_" + datePart + ".pdf";
    }

    /**
     * Calculates future working days skipping weekends (Saturday & Sunday).
     */
    public String calculateWorkingDaysAhead(int days) {
        LocalDate result = LocalDate.now();
        int added = 0;
        while (added < days) {
            result = result.plusDays(1);
            if (result.getDayOfWeek() != java.time.DayOfWeek.SATURDAY && result.getDayOfWeek() != java.time.DayOfWeek.SUNDAY) {
                added++;
            }
        }
        return result.toString();
    }

    public String parseDataClassification(String policyName) {
        if (policyName == null) return "Highly Confidential (DC2+ & DC3)";
        String lower = policyName.toLowerCase();
        if (lower.contains("highly confidential") || lower.contains("dc2") || lower.contains("dc3")) {
            return "Highly Confidential (DC2+ & DC3)";
        } else if (lower.contains("confidential")) {
            return "Confidential";
        } else if (lower.contains("public")) {
            return "Public";
        } else if (lower.contains("internal")) {
            return "Internal";
        }
        return "Highly Confidential (DC2+ & DC3)";
    }

    public String parseExposure(String policyName) {
        if (policyName == null) return "Internal";
        String lower = policyName.toLowerCase();
        if (lower.contains("external") || lower.contains("internet")) {
            return "External";
        }
        return "Internal";
    }

    /**
     * Builds the sign-off additionMessage HTML snippet with [code]...[/code] wrapper.
     */
    public String buildSignOffAdditionMessage(String scanUrl, String newScanName, String scanToolProfileUrl, String appProfileName, String attachmentUrl, String reportName) {
        String safeScanUrl = scanUrl != null ? scanUrl : "";
        String safeScanName = newScanName != null ? newScanName : "";
        String safeProfileUrl = scanToolProfileUrl != null ? scanToolProfileUrl : "";
        String safeProfileName = appProfileName != null ? appProfileName : "";
        String safeAttachmentUrl = attachmentUrl != null ? attachmentUrl : "";
        String safeReportName = reportName != null ? reportName : "Veracode_Report.pdf";

        return """
[code]
<style>
\t.bg-gray {background-color: gray; color: white;}
\t.bg-green {background-color: green; color: white;}
\t.info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
\t.verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
\t.low, .bg-gold {background-color: gold; color: black;}
\t.medium, .bg-darkorange {background-color: darkorange; color: black;}
\t.high, .bg-red {background-color: red; color: white;}
\t.veryhigh, .bg-darkred {background-color: darkred; color: white;}
\t.heading {border-radius: 5px; display: inline-block; font-weight: bold;
\t\tpadding: 5px 25px; text-transform: uppercase;}
\t.highlight {padding: 2px 5px 5px;}
\t.rounded {border-radius: 15px; display: inline-block; font-weight: bold;
\t\tmargin: 1px; padding: 2px 7.5px; text-align: center;}
\t.minwidth {min-width: 50px;}
</style>
The SAST assessment has been completed successfully with no remaining open findings in adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for this assessed version, scan <code><a target="_blank" href="%s">%s</a></code>, of the <code><a target="_blank" href="%s">%s</a></code> application. For more details, please see the Veracode report <code><a target="_blank" href="%s">%s</a></code> attached to this request. Please note that after this sign-off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!
<hr/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeScanUrl, safeScanName, safeProfileUrl, safeProfileName, safeAttachmentUrl, safeReportName);
    }

    public String[] extractGracePeriodDays(String gracePeriodStr) {
        String vhHigh = "60";
        String med = "90";
        if (gracePeriodStr != null && !gracePeriodStr.trim().isEmpty()) {
            java.util.regex.Matcher m1 = java.util.regex.Pattern.compile("veryhigh/high:\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(gracePeriodStr);
            if (m1.find()) {
                vhHigh = m1.group(1);
            }
            java.util.regex.Matcher m2 = java.util.regex.Pattern.compile("Medium:\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(gracePeriodStr);
            if (m2.find()) {
                med = m2.group(1);
            }
        }
        return new String[]{vhHigh, med};
    }

    /**
     * Builds the Remediation Plan (RP) sign-off additionMessage HTML snippet for Veracode.
     */
    public String buildVeracodeRpSignOffAdditionMessage(
            String scanUrl, String newScanName, String scanToolProfileUrl, String appProfileName,
            String attachmentUrl, String reportName, String rpNumber, String estimatedCompletionDate,
            boolean withinGracePeriod, String gracePeriodStr, String accountId, String appId, String buildId,
            String analysisId, String staticAnalysisUnitId, String sandboxId) {

        String safeScanName = newScanName != null ? newScanName : "";
        String safeProfileName = appProfileName != null ? appProfileName : "";
        String safeAttachmentUrl = attachmentUrl != null ? attachmentUrl : "";
        String safeReportName = reportName != null ? reportName : "Veracode_Report.pdf";
        String safeRpNumber = rpNumber != null ? rpNumber.trim() : "";
        String safeDate = estimatedCompletionDate != null ? estimatedCompletionDate.trim() : "";
        String meetText = withinGracePeriod ? "does" : "does not";

        String[] days = extractGracePeriodDays(gracePeriodStr);
        String vhHighDays = days[0];
        String medDays = days[1];

        String veracodeScanLink = (scanUrl != null && !scanUrl.trim().isEmpty()) ? scanUrl
                : "https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:" + (accountId != null ? accountId : "") + ":" + (appId != null ? appId : "") + ":" + (buildId != null ? buildId : "") + ":" + (analysisId != null ? analysisId : "") + ":" + (staticAnalysisUnitId != null ? staticAnalysisUnitId : "") + "::::" + (sandboxId != null ? sandboxId : "");

        String veracodeProfileLink = (scanToolProfileUrl != null && !scanToolProfileUrl.trim().isEmpty()) ? scanToolProfileUrl
                : "https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:" + (accountId != null ? accountId : "") + ":" + (appId != null ? appId : "") + ":" + (buildId != null ? buildId : "");

        return """
[code]
<style>
\t.bg-gray {background-color: gray; color: white;}
\t.bg-green {background-color: green; color: white;}
\t.info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
\t.verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
\t.low, .bg-gold {background-color: gold; color: black;}
\t.medium, .bg-darkorange {background-color: darkorange; color: black;}
\t.high, .bg-red {background-color: red; color: white;}
\t.veryhigh, .bg-darkred {background-color: darkred; color: white;}
\t.heading {border-radius: 5px; display: inline-block; font-weight: bold;
\t\tpadding: 5px 25px; text-transform: uppercase;}
\t.highlight {padding: 2px 5px 5px;}
\t.rounded {border-radius: 15px; display: inline-block; font-weight: bold;
\t\tmargin: 1px; padding: 2px 7.5px; text-align: center;}
\t.minwidth {min-width: 50px;}
</style>
The SAST assessment has been completed successfully with open findings. The remediation plan <code><a target="_blank" href="https://eu.workbench.pwc.com/home/my-reports/IRM-ARR-Dashboard">%s</a></code> is in place for the open findings in adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for this assessed version, scan <code><a target="_blank" href="%s">%s</a></code>, of the <code><a target="_blank" href="%s">%s</a></code> application. For more details, please see the Veracode report <code><a target="_blank" href="%s">%s</a></code> attached to this request. Please note that after this sign off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!
<hr/>
<p><b><u>Remediation Plan %s Risk Review</u></b><br/>
The estimated completion date of %s <u>%s meet</u> the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a> Vulnerability Remediation Timeframe for <span class="rounded veryhigh">Very High</span> and <span class="rounded high">High</span> findings (within %s days) and <span class="rounded medium">Medium</span> findings (within %s days).</p>
<hr/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeRpNumber, veracodeScanLink, safeScanName, veracodeProfileLink, safeProfileName, safeAttachmentUrl, safeReportName, safeRpNumber, safeDate, meetText, vhHighDays, medDays);
    }

    /**
     * Helper method to check if the Request Reason qualifies as a Sign-Off request.
     * Returns true if requestReason is "Sign Off", "Sign-Off", "Signoff" (case-insensitive).
     */
    public boolean isSignoffRequestReason(String requestReason) {
        if (requestReason == null || requestReason.trim().isEmpty()) {
            return false;
        }
        String clean = requestReason.trim().replaceAll("[\\s_-]", "").toLowerCase();
        return "signoff".equals(clean);
    }

    /**
     * Helper method to check if the Request Reason qualifies as a Mitigation Approval Review (MAR) request.
     * Returns true if requestReason is "Mitigation Approval Review", "Mitigation Approval", "MAR" (case-insensitive).
     */
    public boolean isMarRequestReason(String requestReason) {
        if (requestReason == null || requestReason.trim().isEmpty()) {
            return false;
        }
        String clean = requestReason.trim().replaceAll("[\\s_-]", "").toLowerCase();
        return "mitigationapprovalreview".equals(clean)
                || "mitigationapproval".equals(clean)
                || "mar".equals(clean);
    }

    /**
     * Helper method to check if a ServiceNow task state represents a closed state (3=Closed Complete, 4=Closed Incomplete, 7=Closed Skipped).
     */
    public boolean isClosedState(String state) {
        if (state == null || state.trim().isEmpty()) {
            return false;
        }
        String clean = state.trim().replaceAll("[\\s_-]", "").toLowerCase();
        return "3".equals(clean) || "4".equals(clean) || "7".equals(clean)
                || "closedcomplete".equals(clean)
                || "closedincomplete".equals(clean)
                || "closedskipped".equals(clean)
                || "closed".equals(clean);
    }


    /**
     * Helper method to fetch Veracode report, update scan name, download/upload PDF, update RITM variables, and post SCTASK update to ServiceNow.
     */
    void processVeracodeTask(String sctaskNumber, String ritmNumber, String rawAppProfileName, String rawAppVersion) {
        processVeracodeTask(sctaskNumber, ritmNumber, rawAppProfileName, rawAppVersion, null);
    }

    void processVeracodeTask(String sctaskNumber, String ritmNumber, String rawAppProfileName, String rawAppVersion, String requestReason) {
        long startTime = System.currentTimeMillis();
        String cleanProfile = cleanVeracodeProfileName(rawAppProfileName);
        String formattedAppVersion = sanitizeApplicationVersion(rawAppVersion);
        logger.info("Processing Veracode task for SCTASK: {}, RITM: {}, Cleaned Profile: '{}', Sanitized Version: '{}', Request Reason: '{}'",
                sctaskNumber, ritmNumber, cleanProfile, formattedAppVersion, requestReason);

        if (cleanProfile == null || cleanProfile.isEmpty()) {
            logger.warn("Cleaned Application Profile Name is empty for SCTASK {}", sctaskNumber);
            if (metricsService != null) {
                metricsService.recordTicketResult(sctaskNumber, ritmNumber, "VERACODE", requestReason,
                        "ERROR", "FAILED", "PROFILE_NOT_FOUND", System.currentTimeMillis() - startTime);
            }
            return;
        }

        // Check for open duplicate requests before pulling scan from Veracode
        if (checkAndHandleDuplicateRequest(sctaskNumber, ritmNumber, rawAppProfileName != null ? rawAppProfileName : cleanProfile, "VERACODE", requestReason, startTime)) {
            return;
        }

        boolean isMarRequest = isMarRequestReason(requestReason);
        boolean isSignoffRequest = isSignoffRequestReason(requestReason);
        boolean isApplicableRequest = isMarRequest || isSignoffRequest || requestReason == null;
        boolean reviewProposal = config.isReviewProposal();
        boolean reviewProposalWithAi = false;
        String aiModelToUse = null;

        if (reviewProposal && isApplicableRequest) {
            aiModelToUse = config.getReviewProposalAiModel();
            reviewProposalWithAi = true;
            logger.info("Proposal review with AI is ENABLED with AI model '{}' for SCTASK {} (Request Reason: '{}')", aiModelToUse, sctaskNumber, requestReason);
        } else {
            logger.info("Proposal review with AI is DISABLED (reviewProposal={}, isApplicableRequest={}) for SCTASK {} (Request Reason: '{}')",
                    reviewProposal, isApplicableRequest, sctaskNumber, requestReason);
        }

        VeracodeReportDTO report = null;
        String reviewCommentsHtml = null;
        String veracodeErrorType = null;

        try {
            report = veracodeService.getFinalReport(cleanProfile, null, null, true, true, aiModelToUse, reviewProposalWithAi);
            reviewCommentsHtml = (report != null) ? report.reviewCommentsHtml : null;
        } catch (Exception e) {
            if (isBuildIdError(e)) {
                veracodeErrorType = "SCAN_NOT_FOUND";
                logger.warn("Veracode build ID missing or failed for profile '{}' for SCTASK {}: {}. Generating Policy Scan Required notification.",
                        cleanProfile, sctaskNumber, e.getMessage());
                reviewCommentsHtml = buildPolicyScanRequiredHtml();
            } else {
                veracodeErrorType = "PROFILE_NOT_FOUND";
                logger.warn("Veracode profile '{}' not found or error occurred for SCTASK {}: {}. Generating profile missing notification.",
                        cleanProfile, sctaskNumber, e.getMessage());
                reviewCommentsHtml = buildMissingVeracodeProfileHtml(cleanProfile, ritmNumber);
            }
        }

        if (reviewCommentsHtml != null && !reviewCommentsHtml.trim().isEmpty()) {
            saveAutoLogFile(ritmNumber, reviewCommentsHtml);
        }

        if (report == null) {
            // Missing profile or build ID error case: post notification comment to ServiceNow SCTASK if comments posting enabled
            executePendingBlock(sctaskNumber, ensureCodeTags(reviewCommentsHtml));
            if (metricsService != null) {
                metricsService.recordTicketResult(sctaskNumber, ritmNumber, "VERACODE", requestReason,
                        veracodeErrorType != null ? veracodeErrorType : "ERROR", "FAILED",
                        veracodeErrorType != null ? veracodeErrorType : "SCAN_NOT_FOUND", System.currentTimeMillis() - startTime);
            }
            return;
        }


        // 5. Post SCTASK Status Update (Sign-Off vs Pending)
        String reportStatus = (report.status != null) ? report.status : "Pending";

        if (!isSignoffRequest && isSignOffStatus(reportStatus)) {
            logger.info("JSON status is '{}', but Request Reason ('{}') is NOT Sign-Off for SCTASK {}. Qualifying only for Pending status block.",
                    reportStatus, requestReason, sctaskNumber);
        }

        // Check if report status is Sign-Off but scanName belongs to an older RITM sign-off
        String scanName = (report.overview != null) ? report.overview.scanName : null;
        String scanRitm = extractRitmFromScanName(scanName);
        if (isSignOffStatus(reportStatus) && scanRitm != null && (ritmNumber == null || !scanRitm.equalsIgnoreCase(ritmNumber.trim()))) {
            logger.warn("JSON status is '{}', but scanName '{}' ends with RITM '{}' which does not match processing RITM '{}' for SCTASK {}. Generating New Policy Scan Required notification.",
                    reportStatus, scanName, scanRitm, ritmNumber, sctaskNumber);
            String newPolicyScanRequiredHtml = buildNewPolicyScanRequiredHtml(report.overview);
            saveAutoLogFile(ritmNumber, newPolicyScanRequiredHtml);
            executePendingBlock(sctaskNumber, ensureCodeTags(newPolicyScanRequiredHtml), true);
            if (metricsService != null) {
                metricsService.recordTicketResult(sctaskNumber, ritmNumber, "VERACODE", requestReason,
                        "RESCAN_REQUIRED", "PENDING", "RESCAN_REQUIRED", System.currentTimeMillis() - startTime);
            }
            return;
        }

        boolean canAutoSignoff = isSignOffStatus(reportStatus) && isSignoffRequest && config.isAutoSignoffEnabled();

        if (canAutoSignoff) {
            assignSctaskForSignOff(sctaskNumber);

            String rawSubmittedDate = (report.overview != null && report.overview.submittedDate != null)
                    ? report.overview.submittedDate : LocalDate.now().toString();
            String submittedDate = extractDateOnly(rawSubmittedDate);

            String newScanName = submittedDate + " " + formattedAppVersion + " APR " + (ritmNumber != null ? ritmNumber : "");

            // 1. Update Veracode profile scan name API
            if (report.overview != null && report.overview.buildId != null) {
                try {
                    String updateResult = veracodeService.updateScanName(cleanProfile, report.overview.buildId, newScanName);
                    logger.info("Scheduler updateScanName result for SCTASK {}: {}", sctaskNumber, updateResult);
                } catch (Exception ex) {
                    logger.warn("Failed to update Veracode scan name to '{}' for SCTASK {}: {}", newScanName, sctaskNumber, ex.getMessage());
                }
            }

            // 2. Wait 2 seconds
            try {
                Thread.sleep(2000);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }

            // 3. Download the Veracode Report PDF & Upload to SNOW
            String attachmentUrl = "";
            String pdfFileName = buildPdfFilename(cleanProfile);
            try {
                byte[] pdfBytes = veracodeService.downloadCustomPdfReport(cleanProfile);
                if (pdfBytes != null && pdfBytes.length > 0) {
                    JsonNode uploadResp = snowService.uploadPdfAttachment(pdfBytes, pdfFileName, ritmNumber);
                    if (uploadResp != null && uploadResp.has("result") && uploadResp.get("result").isObject()) {
                        JsonNode resObj = uploadResp.get("result");
                        attachmentUrl = resObj.hasNonNull("attachment_link") ? resObj.get("attachment_link").asText()
                                : (resObj.hasNonNull("attachment_url") ? resObj.get("attachment_url").asText() : "");
                    }
                }
            } catch (Exception e) {
                logger.warn("Failed to download or upload PDF report for SCTASK {}: {}", sctaskNumber, e.getMessage());
            }

            // 4. Update RITM Variables
            ObjectNode ritmVarsNode = objectMapper.createObjectNode();
            if (report.assessmentFindings != null) ritmVarsNode.put("assessment_findings", report.assessmentFindings);
            ritmVarsNode.put("date_of_assessed_scan", submittedDate);
            ritmVarsNode.put("application_version", formattedAppVersion);
            ritmVarsNode.put("scan_name", newScanName);
            if (report.scanToolProfileUrl != null) {
                ritmVarsNode.put("scan_tool_profile_url", report.scanToolProfileUrl);
                ritmVarsNode.put("application_profile_url", report.scanToolProfileUrl);
            }
            if (report.scanUrl != null) ritmVarsNode.put("scan_url", report.scanUrl);
            ritmVarsNode.put("sign_off_reason", "no_flaw");
            ritmVarsNode.put("mitigation_proposals_reviewed", "0");

            String policyName = (report.overview != null && report.overview.policyName != null) ? report.overview.policyName : "";
            ritmVarsNode.put("data_classification", parseDataClassification(policyName));
            ritmVarsNode.put("exposure", parseExposure(policyName));

            try {
                snowService.updateRitmVariables(ritmNumber, ritmVarsNode, report);
                logger.info("Successfully updated RITM variables for {}", ritmNumber);
            } catch (Exception e) {
                logger.error("Failed to update RITM variables for {}: {}", ritmNumber, e.getMessage(), e);
            }

            String additionMessage = buildSignOffAdditionMessage(
                    report.scanUrl, newScanName, report.scanToolProfileUrl, cleanProfile, attachmentUrl, pdfFileName);
            String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

            ObjectNode closePayload = objectMapper.createObjectNode();
            closePayload.put("u_number", sctaskNumber);
            closePayload.put("u_action", "closeSctask");
            String snowUser = config.getSnowSignoffAutoUserId();
            if (snowUser != null && !snowUser.trim().isEmpty()) {
                closePayload.put("u_assigned_to", snowUser.trim());
            }
            closePayload.put("u_additional_comments", additionMessage);
            closePayload.put("u_closure_message", closureMessage);
            closePayload.put("u_state", 3); // CLOSED_COMPLETE
            closePayload.put("u_work_notes", "This request has been processed by Automation");

            JsonNode closeResp = snowService.updateScTask(closePayload);
            logger.info("ServiceNow closeSctask response for {}: {}", sctaskNumber, closeResp);

            if (metricsService != null) {
                metricsService.recordTicketResult(sctaskNumber, ritmNumber, "VERACODE", requestReason,
                        "CLEAN_SIGNOFF", "SUCCESS", null, System.currentTimeMillis() - startTime);
            }

        } else {
            logger.info("Report status is '{}' (not eligible for auto sign-off). PDF report download and attachment upload are skipped for SCTASK {} (only performed for Sign-Off). Executing pending comments block.",
                    reportStatus, sctaskNumber);
            executePendingBlock(sctaskNumber, reviewCommentsHtml);
            if (metricsService != null) {
                String action = isMarRequest ? "MITIGATION_REVIEW" : "COMMENTS_ADDED";
                metricsService.recordTicketResult(sctaskNumber, ritmNumber, "VERACODE", requestReason,
                        action, "PENDING", null, System.currentTimeMillis() - startTime);
            }
        }
    }

    /**
     * Assigns the open SCTASK to the configured automation user and transitions state to WORK_IN_PROGRESS ("2").
     */
    public JsonNode assignSctaskForSignOff(String sctaskNumber) {
        String snowUser = config.getSnowSignoffAutoUserId();
        if (snowUser == null || snowUser.trim().isEmpty()) {
            return null;
        }
        ObjectNode assignPayload = objectMapper.createObjectNode();
        assignPayload.put("u_number", sctaskNumber);
        assignPayload.put("u_assigned_to", snowUser.trim());
        assignPayload.put("u_state", "2"); // WORK_IN_PROGRESS
        assignPayload.put("u_work_notes", "Ticket assigned to " + snowUser.trim() + " and moved to Work In Progress for automated sign-off");

        try {
            JsonNode assignResp = snowService.updateScTask(assignPayload);
            logger.info("ServiceNow assignSctask response for {}: {}", sctaskNumber, assignResp);
            return assignResp;
        } catch (Exception ex) {
            logger.warn("Failed to assign SCTASK {} to {} with state 2: {}", sctaskNumber, snowUser, ex.getMessage());
            return null;
        }
    }

    /**
     * Shared comments block used by both Veracode and Checkmarx when a ticket does not qualify for auto sign-off.
     * Evaluates crs.snow.post-scheduler-comments-to-snow and crs.snow.comments.status-update.
     */
    public void executePendingBlock(String sctaskNumber, String reviewCommentsHtml) {
        executePendingBlock(sctaskNumber, reviewCommentsHtml, false);
    }

    public void executePendingBlock(String sctaskNumber, String reviewCommentsHtml, boolean forcePendingState) {
        if (!config.isPostSchedulerCommentsToSnow()) {
            logger.info("postSchedulerCommentsToSnow is false. Skipping ServiceNow comments posting for SCTASK {}.", sctaskNumber);
            return;
        }

        ObjectNode pendingPayload = objectMapper.createObjectNode();
        pendingPayload.put("u_number", sctaskNumber);
        pendingPayload.put("u_additional_comments", reviewCommentsHtml != null ? reviewCommentsHtml : "");

        if (config.isCommentsStatusUpdate()) {
            pendingPayload.put("u_action", "setReviewComments");
            String status = config.getCommentsStatus();
            String resolvedCode = com.crs_reivew_api.util.SnowSctaskStatusMap.resolveStatusToStateCode(status != null ? status : "Pending");
            if (forcePendingState) {
                pendingPayload.put("u_state", -5);
            } else if (resolvedCode != null) {
                try {
                    pendingPayload.put("u_state", Integer.parseInt(resolvedCode));
                } catch (NumberFormatException e) {
                    pendingPayload.put("u_state", resolvedCode);
                }
            } else {
                pendingPayload.put("u_state", -5); // default PENDING
            }

            String userId = config.getCommentsUserId();
            if (userId != null && !userId.trim().isEmpty()) {
                pendingPayload.put("u_assigned_to", userId.trim());
            }

            if (forcePendingState || "-5".equals(resolvedCode) || "pending".equalsIgnoreCase(status)) {
                pendingPayload.put("u_pending_reason", "Awaiting Customer Response");
                pendingPayload.put("u_end_pending", calculateWorkingDaysAhead(2));
            }
            logger.info("Posting comments with status update (state={}, assignedTo={}) for SCTASK {}",
                    pendingPayload.get("u_state"), userId, sctaskNumber);
        } else {
            pendingPayload.put("u_action", "Add Comment");
            logger.info("Posting comments without status update (crs.snow.comments.status-update=false) for SCTASK {}", sctaskNumber);
        }

        JsonNode pendingResp = snowService.updateScTask(pendingPayload);
        logger.info("ServiceNow comments posting response for {}: {}", sctaskNumber, pendingResp);
    }

    /**
     * Builds the formatted HTML notification template when open duplicate requests are found
     * for the same application profile.
     */
    public String buildDuplicateRequestHtml(String sctaskNumber, String ritmNumber, String appProfileName, List<SnowDuplicateTaskDTO> duplicates) {
        String safeProfile = (appProfileName != null && !appProfileName.trim().isEmpty()) ? appProfileName.trim() : "Unknown Profile";
        String requestIdentifier = (ritmNumber != null && !ritmNumber.trim().isEmpty())
                ? ritmNumber.trim()
                : ((sctaskNumber != null && !sctaskNumber.trim().isEmpty()) ? sctaskNumber.trim() : "this request");
        int count = duplicates != null ? duplicates.size() : 0;

        StringBuilder rows = new StringBuilder();
        if (duplicates != null) {
            for (SnowDuplicateTaskDTO d : duplicates) {
                String dRitm = (d.getRequestItemNumber() != null && !d.getRequestItemNumber().trim().isEmpty()) ? d.getRequestItemNumber().trim() : "N/A";
                String dRequestor = (d.getRequestor() != null && !d.getRequestor().trim().isEmpty()) ? d.getRequestor().trim() : "N/A";
                String dState = (d.getState() != null && !d.getState().trim().isEmpty()) ? d.getState().trim() : "Open";
                String dTitle = (d.getShortDescription() != null && !d.getShortDescription().trim().isEmpty()) ? d.getShortDescription().trim() : "N/A";
                String dOwner = (d.getAssignedTo() != null && !d.getAssignedTo().trim().isEmpty()) ? d.getAssignedTo().trim() : "Unassigned";

                String stateBadge = switch (dState.toLowerCase()) {
                    case "work in progress", "wip", "2" -> "<span class=\"rounded bg-dodgerblue highlight\">" + dState + "</span>";
                    case "pending", "-5" -> "<span class=\"rounded bg-gold highlight\">" + dState + "</span>";
                    case "open", "1" -> "<span class=\"rounded bg-green highlight\">" + dState + "</span>";
                    default -> "<span class=\"rounded bg-gray highlight\">" + dState + "</span>";
                };

                rows.append("""
                    <tr>
                        <td style="padding: 8px 10px; border: 1px solid #ddd; font-weight: bold;"><code>%s</code></td>
                        <td style="padding: 8px 10px; border: 1px solid #ddd;">%s</td>
                        <td style="padding: 8px 10px; border: 1px solid #ddd;">%s</td>
                        <td style="padding: 8px 10px; border: 1px solid #ddd;">%s</td>
                        <td style="padding: 8px 10px; border: 1px solid #ddd;">%s</td>
                    </tr>
                """.formatted(dRitm, dRequestor, stateBadge, dTitle, dOwner));
            }
        }

        return """
[code]
<style>
\t.bg-gray {background-color: gray; color: white;}
\t.bg-green {background-color: green; color: white;}
\t.bg-purple {background-color: purple; color: white;}
\t.info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
\t.verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
\t.low, .bg-gold {background-color: gold; color: black;}
\t.medium, .bg-darkorange {background-color: darkorange; color: black;}
\t.high, .bg-red {background-color: red; color: white;}
\t.veryhigh, .bg-darkred {background-color: darkred; color: white;}
\t.heading {border-radius: 5px; display: inline-block; font-weight: bold;
\t\tpadding: 5px 25px; text-transform: uppercase;}
\t.highlight {padding: 2px 5px 5px;}
\t.rounded {border-radius: 15px; display: inline-block; font-weight: bold;
\t\tmargin: 1px; padding: 2px 7.5px; text-align: center;}
\t.minwidth {min-width: 50px;}
\t.dup-table {border-collapse: collapse; width: 100%%; margin-top: 10px; margin-bottom: 12px; font-family: Arial, sans-serif; font-size: 13px;}
\t.dup-table th {background-color: #f2f2f2; color: #333; text-align: left; padding: 8px 10px; border: 1px solid #ddd; font-weight: bold;}
\t.dup-table td {padding: 8px 10px; border: 1px solid #ddd; text-align: left; vertical-align: top;}
\t.dup-table tr:nth-child(even) {background-color: #fbfbfb;}
</style>

<h3 class="heading bg-darkorange">Potential Duplicate Review Request</h3><br/>
An active or open security review request already exists for the application profile <span class="rounded bg-purple highlight">%s</span>.<br/><br/>
Before Code Review Services can proceed with this request (<b>%s</b>), please note that <b>%d</b> existing open review request(s) are currently in progress or awaiting action for this profile:<br/>

<table class="dup-table">
  <thead>
    <tr>
      <th style="width: 16%%;">RITM</th>
      <th style="width: 20%%;">Requestor</th>
      <th style="width: 16%%;">State</th>
      <th style="width: 28%%;">Short Description</th>
      <th style="width: 20%%;">Assigned To</th>
    </tr>
  </thead>
  <tbody>
%s
  </tbody>
</table>

<div style="border: 1px solid #f0ad4e; background-color: #fcf8e3; color: #8a6d3b; padding: 10px 14px; border-radius: 5px; margin-top: 10px; margin-bottom: 10px; font-size: 13px;">
  <b>Action Required:</b> To avoid duplicate reviews and conflicting scan assessments, this ticket is being placed in <span class="rounded bg-gold highlight">Pending</span> status. Please coordinate with the requestor or the assigned CRS staff for the existing request(s) listed above, or consolidate your submission. If you believe this request is distinct, please provide clarification in a comment.
</div>

<hr/>
If more assistance is needed, please schedule a consultation call by selecting the <i><b>Remediation Consultation</b></i> option from the appointment calendar. For more help, refer to the <i><b>Scheduling Consultations</b></i> section, as detailed in the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%%20Documents/Client-Facing%%20Documentation/CRS%%20Process%%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.<br/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeProfile, requestIdentifier, count, rows.toString());
    }

    /**
     * Checks if there are open duplicate catalog tasks in ServiceNow for the given application profile.
     * If duplicates are found, formats the duplicate notification comment, saves the auto log,
     * updates the SCTASK in ServiceNow to Pending state, records metrics, and returns true.
     *
     * @param sctaskNumber Current SCTASK number being processed
     * @param ritmNumber Associated RITM number
     * @param rawAppProfileName Application profile name
     * @param tool SCA Tool (e.g. VERACODE or Checkmarx)
     * @param requestReason Request Reason
     * @param startTime Start timestamp of ticket processing
     * @return true if duplicate requests were detected and handled; false otherwise
     */
    public boolean checkAndHandleDuplicateRequest(String sctaskNumber, String ritmNumber, String rawAppProfileName,
                                                  String tool, String requestReason, long startTime) {
        if (!config.isCheckDuplicateRequests()) {
            return false;
        }

        if (rawAppProfileName == null || rawAppProfileName.trim().isEmpty()) {
            return false;
        }

        String searchProfile = rawAppProfileName.trim();
        if (searchProfile.toLowerCase().startsWith("application:")) {
            searchProfile = searchProfile.substring("application:".length()).trim();
        }

        try {
            List<SnowDuplicateTaskDTO> duplicates = snowService.findDuplicateTasks(sctaskNumber, searchProfile);
            if (duplicates != null && !duplicates.isEmpty()) {
                logger.warn("Duplicate request detected for SCTASK {} (RITM: {}, Profile: '{}'). Found {} open duplicate task(s). Posting duplicate notification and skipping scan pull (status-update: {}).",
                        sctaskNumber, ritmNumber, searchProfile, duplicates.size(), config.isCommentsStatusUpdate());

                String duplicateHtml = buildDuplicateRequestHtml(sctaskNumber, ritmNumber, searchProfile, duplicates);
                saveAutoLogFile(ritmNumber, duplicateHtml);
                executePendingBlock(sctaskNumber, ensureCodeTags(duplicateHtml), true);

                if (metricsService != null) {
                    metricsService.recordTicketResult(sctaskNumber, ritmNumber, tool, requestReason,
                            "DUPLICATE_REQUEST", config.isCommentsStatusUpdate() ? "PENDING" : "COMMENT_ADDED", "DUPLICATE_REQUEST", System.currentTimeMillis() - startTime);
                }
                return true;
            }
        } catch (Exception e) {
            logger.error("Error checking duplicate requests for SCTASK {} (Profile: '{}'): {}",
                    sctaskNumber, searchProfile, e.getMessage(), e);
        }

        return false;
    }

    /**
     * Helper method to process non-Veracode tools (e.g., Checkmarx).
     */
    void processNonVeracodeTask(String sctaskNumber, String ritmNumber, String scaTool, String rawAppProfileName, String appVersion) {
        processNonVeracodeTask(sctaskNumber, ritmNumber, scaTool, rawAppProfileName, appVersion, null);
    }

    void processNonVeracodeTask(String sctaskNumber, String ritmNumber, String scaTool, String rawAppProfileName, String appVersion, String requestReason) {
        long startTime = System.currentTimeMillis();
        String[] profileAndBranch = parseNonVeracodeProfileAndBranch(rawAppProfileName);
        String profileName = profileAndBranch[0];
        String branchName = (profileAndBranch[1] != null && !profileAndBranch[1].trim().isEmpty())
                ? profileAndBranch[1].trim()
                : (isLikelyBranchName(appVersion) ? appVersion.trim() : null);

        logger.info("Processing Non-Veracode ({}) task for SCTASK: {}, RITM: {}, Profile: '{}', Branch: '{}', Version: '{}', Request Reason: '{}'",
                scaTool, sctaskNumber, ritmNumber, profileName, branchName, appVersion, requestReason);

        if (profileName == null || profileName.isEmpty()) {
            logger.warn("Profile name is empty after cleaning for Checkmarx SCTASK {}. Skipping.", sctaskNumber);
            if (metricsService != null) {
                metricsService.recordTicketResult(sctaskNumber, ritmNumber, scaTool != null ? scaTool : "Checkmarx", requestReason,
                        "ERROR", "FAILED", "PROFILE_NOT_FOUND", System.currentTimeMillis() - startTime);
            }
            return;
        }

        // Check for open duplicate requests before pulling scan from Checkmarx
        if (checkAndHandleDuplicateRequest(sctaskNumber, ritmNumber, rawAppProfileName != null ? rawAppProfileName : profileName, scaTool != null ? scaTool : "Checkmarx", requestReason, startTime)) {
            return;
        }

        boolean isMarRequest = isMarRequestReason(requestReason);
        boolean isSignoffRequest = isSignoffRequestReason(requestReason);
        boolean isApplicableRequest = isMarRequest || isSignoffRequest || requestReason == null;
        boolean reviewProposal = config.isReviewProposal();
        boolean reviewProposalWithAi = false;
        String aiModelToUse = null;

        if (reviewProposal && isApplicableRequest) {
            aiModelToUse = config.getReviewProposalAiModel();
            reviewProposalWithAi = true;
            logger.info("Checkmarx proposal review with AI is ENABLED with AI model '{}' for SCTASK {} (Request Reason: '{}')", aiModelToUse, sctaskNumber, requestReason);
        } else {
            logger.info("Checkmarx proposal review with AI is DISABLED (reviewProposal={}, isApplicableRequest={}) for SCTASK {} (Request Reason: '{}')",
                    reviewProposal, isApplicableRequest, sctaskNumber, requestReason);
        }

        if (checkmarxService != null) {
            VeracodeReportDTO report = null;
            String reviewCommentsHtml = null;

            try {
                report = checkmarxService.getReport(profileName, branchName, null, true, aiModelToUse, reviewProposalWithAi);
                reviewCommentsHtml = (report != null) ? report.reviewCommentsHtml : null;
            } catch (Exception e) {
                logger.warn("Failed to retrieve Checkmarx report for SCTASK {} / Profile '{}': {}", sctaskNumber, profileName, e.getMessage());
            }

            if (reviewCommentsHtml != null && !reviewCommentsHtml.trim().isEmpty()) {
                saveAutoLogFile(ritmNumber, reviewCommentsHtml);
            }

            if (report == null) {
                logger.warn("Checkmarx report could not be retrieved for SCTASK {} / Profile '{}'", sctaskNumber, profileName);
                if (reviewCommentsHtml != null && !reviewCommentsHtml.trim().isEmpty()) {
                    executePendingBlock(sctaskNumber, ensureCodeTags(reviewCommentsHtml));
                }
                if (metricsService != null) {
                    metricsService.recordTicketResult(sctaskNumber, ritmNumber, scaTool != null ? scaTool : "Checkmarx", requestReason,
                            "ERROR", "FAILED", "SCAN_NOT_FOUND", System.currentTimeMillis() - startTime);
                }
                return;
            }

            String reportStatus = (report.status != null) ? report.status : "Pending";
            boolean hasOpenVulns = hasMediumOrAboveVulnerabilities(report);

            if (!isSignoffRequest && "Sign-Off".equalsIgnoreCase(reportStatus)) {
                logger.info("JSON status is 'Sign-Off', but Request Reason ('{}') is NOT Sign-Off for Checkmarx SCTASK {}. Qualifying only for Pending status block.",
                        requestReason, sctaskNumber);
            }

            boolean canAutoSignoff = "Sign-Off".equalsIgnoreCase(reportStatus) && !hasOpenVulns && isSignoffRequest && config.isAutoSignoffCheckmarxEnabled();

            if (canAutoSignoff) {
                assignSctaskForSignOff(sctaskNumber);

                // Checkmarx Sign-Off Block
                String rawGenDate = (report.overview != null && report.overview.generationDate != null)
                        ? report.overview.generationDate : LocalDate.now().toString();
                String cleanDate = extractDateOnly(rawGenDate);
                String formattedVersion = sanitizeApplicationVersion(appVersion);

                String actualBranch = (report.overview != null && report.overview.scanName != null && !report.overview.scanName.trim().isEmpty())
                        ? report.overview.scanName.trim()
                        : (branchName != null ? branchName : "");

                Path pdfPath = null;
                try {
                    pdfPath = checkmarxService.downloadPdfReport(profileName, actualBranch);
                } catch (Exception ex) {
                    logger.warn("Could not download Checkmarx PDF report for {}: {}", profileName, ex.getMessage());
                }

                Path jsonPath = checkmarxService.findReportJsonFile(profileName, actualBranch, report);
                String zipFolderName = buildCheckmarxZipFolderName(profileName, cleanDate, formattedVersion, ritmNumber);
                String zipFileName = zipFolderName + ".zip";
                String attachmentUrl = "";

                try {
                    Path zipPath = createCheckmarxZipArchive(zipFolderName, pdfPath, jsonPath);
                    byte[] zipBytes = Files.readAllBytes(zipPath);
                    JsonNode uploadResp = snowService.uploadZipAttachment(zipBytes, zipFileName, ritmNumber);
                    if (uploadResp != null && uploadResp.has("result") && uploadResp.get("result").isObject()) {
                        JsonNode resObj = uploadResp.get("result");
                        attachmentUrl = resObj.hasNonNull("attachment_link") ? resObj.get("attachment_link").asText()
                                : (resObj.hasNonNull("attachment_url") ? resObj.get("attachment_url").asText() : "");
                    }
                } catch (Exception ex) {
                    logger.warn("Could not create/upload Checkmarx ZIP for {}: {}", profileName, ex.getMessage());
                }

                String profileUrl = (report.scanToolProfileUrl != null && !report.scanToolProfileUrl.isEmpty())
                        ? report.scanToolProfileUrl
                        : ((report.scanUrl != null && !report.scanUrl.isEmpty()) ? report.scanUrl : "https://us.ast.checkmarx.net/");

                String additionMessage = buildCheckmarxSignOffAdditionMessage(attachmentUrl, zipFileName, profileUrl, profileName);
                String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

                if (ritmNumber != null && !ritmNumber.trim().isEmpty()) {
                    try {
                        ObjectNode ritmVarsNode = objectMapper.createObjectNode();
                        if (report.assessmentFindings != null) ritmVarsNode.put("assessment_findings", report.assessmentFindings);
                        ritmVarsNode.put("date_of_assessed_scan", cleanDate);
                        ritmVarsNode.put("application_version", formattedVersion);
                        ritmVarsNode.put("scan_name", actualBranch);
                        ritmVarsNode.put("scan_tool_profile_url", profileUrl);
                        ritmVarsNode.put("application_profile_url", profileUrl);
                        if (report.scanUrl != null) ritmVarsNode.put("scan_url", report.scanUrl);
                        ritmVarsNode.put("sign_off_reason", "no_flaw");
                        ritmVarsNode.put("mitigation_proposals_reviewed", "0");
                        String policyName = (report.overview != null && report.overview.policyName != null) ? report.overview.policyName : "";
                        ritmVarsNode.put("data_classification", parseDataClassification(policyName));
                        ritmVarsNode.put("exposure", parseExposure(policyName));
                        snowService.updateRitmVariables(ritmNumber, ritmVarsNode, report);
                    } catch (Exception e) {
                        logger.warn("Failed to update RITM variables for Checkmarx SCTASK {}: {}", sctaskNumber, e.getMessage());
                    }
                }

                ObjectNode closePayload = objectMapper.createObjectNode();
                closePayload.put("u_number", sctaskNumber);
                closePayload.put("u_action", "closeSctask");
                String snowUser = config.getSnowSignoffAutoUserId();
                if (snowUser != null && !snowUser.trim().isEmpty()) {
                    closePayload.put("u_assigned_to", snowUser.trim());
                }
                closePayload.put("u_additional_comments", additionMessage);
                closePayload.put("u_closure_message", closureMessage);
                closePayload.put("u_state", 3); // CLOSED_COMPLETE
                closePayload.put("u_work_notes", "This Checkmarx request has been processed by Automation");

                JsonNode closeResp = snowService.updateScTask(closePayload);
                logger.info("ServiceNow Checkmarx closeSctask response for {}: {}", sctaskNumber, closeResp);

                if (metricsService != null) {
                    metricsService.recordTicketResult(sctaskNumber, ritmNumber, scaTool != null ? scaTool : "Checkmarx", requestReason,
                            "CLEAN_SIGNOFF", "SUCCESS", null, System.currentTimeMillis() - startTime);
                }
            } else {
                logger.info("Checkmarx report status is '{}' (hasOpenVulns={}, isSignoffRequest={}, autoSignoffCheckmarxEnabled={}). PDF download and attachment upload are skipped for SCTASK {} (only performed for Sign-Off). Executing pending comments block.",
                        reportStatus, hasOpenVulns, isSignoffRequest, config.isAutoSignoffCheckmarxEnabled(), sctaskNumber);
                // Shared Pending Block
                executePendingBlock(sctaskNumber, reviewCommentsHtml);
                if (metricsService != null) {
                    String action = isMarRequest ? "MITIGATION_REVIEW" : "COMMENTS_ADDED";
                    metricsService.recordTicketResult(sctaskNumber, ritmNumber, scaTool != null ? scaTool : "Checkmarx", requestReason,
                            action, "PENDING", null, System.currentTimeMillis() - startTime);
                }
            }
        }
    }

    /**
     * Builds the Checkmarx sign-off additionMessage HTML snippet.
     */
    /**
     * Builds the Checkmarx sign-off additionMessage HTML snippet using archive URL, archive name, and profile URL.
     */
    public String buildCheckmarxSignOffAdditionMessage(String archiveUrl, String archiveName, String profileUrl, String appProfileName) {
        String safeArchiveUrl = archiveUrl != null ? archiveUrl : "";
        String safeArchiveName = archiveName != null ? archiveName : "";
        String safeProfileUrl = (profileUrl != null && !profileUrl.isEmpty()) ? profileUrl : "https://us.ast.checkmarx.net/";
        String safeProfile = appProfileName != null ? appProfileName : "";

        return """
[code]
<style>
\t.bg-gray {background-color: gray; color: white;}
\t.bg-green {background-color: green; color: white;}
\t.info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
\t.verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
\t.low, .bg-gold {background-color: gold; color: black;}
\t.medium, .bg-darkorange {background-color: darkorange; color: black;}
\t.high, .bg-red {background-color: red; color: white;}
\t.veryhigh, .critical, .bg-darkred {background-color: darkred; color: white;}
\t.heading {border-radius: 5px; display: inline-block; font-weight: bold;
\t\tpadding: 5px 25px; text-transform: uppercase;}
\t.highlight {padding: 2px 5px 5px;}
\t.crs-rounded, .rounded {border-radius: 15px; display: inline-block; font-weight: bold;
\t\tmargin: 1px; padding: 2px 7.5px; text-align: center;}
\t.minwidth {min-width: 50px;}
</style>
The SAST assessment has been completed successfully with no remaining open findings in adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for this assessed version, scans within <code><a target="_blank" href="%s">%s</a></code>, of the <code><a target="_blank" href="%s">%s</a></code> application. Please note that after this sign-off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!
<hr/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeArchiveUrl, safeArchiveName, safeProfileUrl, safeProfile);
    }

    public String buildCheckmarxSignOffAdditionMessage(String appProfileName, String branchName, String ritmNumber) {
        return buildCheckmarxSignOffAdditionMessage("", "Checkmarx_Archive.zip", "https://us.ast.checkmarx.net/", appProfileName);
    }

    /**
     * Builds the Remediation Plan (RP) sign-off additionMessage HTML snippet for Checkmarx.
     */
    public String buildCheckmarxRpSignOffAdditionMessage(
            String archiveUrl, String archiveName, String profileUrl, String appProfileName,
            String rpNumber, String estimatedCompletionDate, boolean withinGracePeriod, String gracePeriodStr) {

        String safeArchiveUrl = archiveUrl != null ? archiveUrl : "";
        String safeArchiveName = archiveName != null ? archiveName : "";
        String safeProfileUrl = (profileUrl != null && !profileUrl.isEmpty()) ? profileUrl : "https://us.ast.checkmarx.net/";
        String safeProfile = appProfileName != null ? appProfileName : "";
        String safeRpNumber = rpNumber != null ? rpNumber.trim() : "";
        String safeDate = estimatedCompletionDate != null ? estimatedCompletionDate.trim() : "";
        String meetText = withinGracePeriod ? "does" : "does not";

        String[] days = extractGracePeriodDays(gracePeriodStr);
        String vhHighDays = days[0];
        String medDays = days[1];

        return """
[code]
<style>
\t.bg-gray {background-color: gray; color: white;}
\t.bg-green {background-color: green; color: white;}
\t.info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
\t.verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
\t.low, .bg-gold {background-color: gold; color: black;}
\t.medium, .bg-darkorange {background-color: darkorange; color: black;}
\t.high, .bg-red {background-color: red; color: white;}
\t.veryhigh, .critical, .bg-darkred {background-color: darkred; color: white;}
\t.heading {border-radius: 5px; display: inline-block; font-weight: bold;
\t\tpadding: 5px 25px; text-transform: uppercase;}
\t.highlight {padding: 2px 5px 5px;}
\t.crs-rounded, .rounded {border-radius: 15px; display: inline-block; font-weight: bold;
\t\tmargin: 1px; padding: 2px 7.5px; text-align: center;}
\t.minwidth {min-width: 50px;}
</style>
The SAST assessment has been completed successfully with open findings. The remediation plan <code><a target="_blank" href="https://eu.workbench.pwc.com/home/my-reports/IRM-ARR-Dashboard">%s</a></code> is in place for the open findings in adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for this assessed version, scans within <code><a target="_blank" href="%s">%s</a></code>, of the <code><a target="_blank" href="%s">%s</a></code> application. Please note that after this sign-off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!
<hr/>
<p><b><u>Remediation Plan %s Risk Review</u></b><br/>
The estimated completion date of %s <u>%s meet</u> the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a> Vulnerability Remediation Timeframe for <span class="rounded critical">Critical</span> and <span class="rounded high">High</span> findings (within %s days) and <span class="rounded medium">Medium</span> findings (within %s days).</p>
<hr/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeRpNumber, safeArchiveUrl, safeArchiveName, safeProfileUrl, safeProfile, safeRpNumber, safeDate, meetText, vhHighDays, medDays);
    }

    public String buildCheckmarxRpSignOffAdditionMessage(
            String appProfileName, String branchName, String ritmNumber,
            String rpNumber, String estimatedCompletionDate, boolean withinGracePeriod, String gracePeriodStr) {
        return buildCheckmarxRpSignOffAdditionMessage("", "Checkmarx_Archive.zip", "https://us.ast.checkmarx.net/", appProfileName, rpNumber, estimatedCompletionDate, withinGracePeriod, gracePeriodStr);
    }

    /**
     * Builds folder name for Checkmarx zip archive:
     * profile-name + generationDate + version-number + ritm
     * All special characters, spaces, and dots are replaced with underscores.
     */
    public String buildCheckmarxZipFolderName(String profileName, String generationDate, String versionNumber, String ritmNumber) {
        String p = (profileName != null && !profileName.trim().isEmpty()) ? profileName.trim() : "Checkmarx";
        String d = (generationDate != null && !generationDate.trim().isEmpty()) ? generationDate.trim() : LocalDate.now().toString();
        String v = (versionNumber != null && !versionNumber.trim().isEmpty()) ? versionNumber.trim() : "1_0_0";
        String r = (ritmNumber != null && !ritmNumber.trim().isEmpty()) ? ritmNumber.trim() : "";

        String raw = p + "_" + d + "_" + v + (r.isEmpty() ? "" : "_" + r);
        String clean = raw.replaceAll("[^a-zA-Z0-9]", "_").replaceAll("_+", "_");
        return clean.replaceAll("^_|_$", "");
    }

    /**
     * Creates a folder with the specified folderName, copies the PDF and JSON files into it,
     * and zips the folder into {folderName}.zip.
     */
    public Path createCheckmarxZipArchive(String folderName, Path pdfFile, Path jsonFile) throws IOException {
        Path baseDir = Paths.get("checkmarx", "archives");
        Files.createDirectories(baseDir);

        Path folder = baseDir.resolve(folderName);
        Files.createDirectories(folder);

        if (pdfFile != null && Files.exists(pdfFile)) {
            String pdfTargetName = pdfFile.getFileName().toString();
            Files.copy(pdfFile, folder.resolve(pdfTargetName), StandardCopyOption.REPLACE_EXISTING);
        }

        if (jsonFile != null && Files.exists(jsonFile)) {
            String jsonTargetName = jsonFile.getFileName().toString();
            Files.copy(jsonFile, folder.resolve(jsonTargetName), StandardCopyOption.REPLACE_EXISTING);
        }

        Path zipFile = baseDir.resolve(folderName + ".zip");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            try (java.util.stream.Stream<Path> stream = Files.walk(folder)) {
                for (Path path : (Iterable<Path>) stream::iterator) {
                    if (Files.isRegularFile(path)) {
                        String entryName = folderName + "/" + folder.relativize(path).toString().replace("\\", "/");
                        zos.putNextEntry(new ZipEntry(entryName));
                        Files.copy(path, zos);
                        zos.closeEntry();
                    }
                }
            }
        }
        return zipFile;
    }

    /**
     * Checks if a report contains open findings of Critical, Very High, High, or Medium severity.
     */
    public boolean hasMediumOrAboveVulnerabilities(VeracodeReportDTO report) {
        if (report == null) return false;
        java.util.List<String> mediumOrAboveSevs = java.util.Arrays.asList("CRITICAL", "VERY HIGH", "VERYHIGH", "HIGH", "MEDIUM");
        if (report.sastSummary != null && report.sastSummary.breakdown != null) {
            for (java.util.Map.Entry<String, VeracodeReportDTO.SeverityBreakdownDTO> entry : report.sastSummary.breakdown.entrySet()) {
                String sevKey = entry.getKey() != null ? entry.getKey().trim().toUpperCase() : "";
                if (mediumOrAboveSevs.contains(sevKey)) {
                    VeracodeReportDTO.SeverityBreakdownDTO breakdown = entry.getValue();
                    if (breakdown != null && (breakdown.total > 0 || (breakdown.findings != null && !breakdown.findings.isEmpty()))) {
                        return true;
                    }
                }
            }
        }
        if (report.scaSummary != null && report.scaSummary.breakdown != null) {
            for (java.util.Map.Entry<String, VeracodeReportDTO.SeverityBreakdownDTO> entry : report.scaSummary.breakdown.entrySet()) {
                String sevKey = entry.getKey() != null ? entry.getKey().trim().toUpperCase() : "";
                if (mediumOrAboveSevs.contains(sevKey)) {
                    VeracodeReportDTO.SeverityBreakdownDTO breakdown = entry.getValue();
                    if (breakdown != null && (breakdown.total > 0 || (breakdown.findings != null && !breakdown.findings.isEmpty()))) {
                        return true;
                    }
                }
            }
        }
        if ((report.sastSummary == null || report.sastSummary.breakdown == null || report.sastSummary.breakdown.isEmpty())
         && (report.scaSummary == null || report.scaSummary.breakdown == null || report.scaSummary.breakdown.isEmpty())) {
            int sastTotal = (report.sastSummary != null) ? report.sastSummary.vulnerabilities : 0;
            int scaTotal = (report.scaSummary != null) ? report.scaSummary.vulnerabilities : 0;
            if ((sastTotal > 0 || scaTotal > 0) && !"Sign-Off".equalsIgnoreCase(report.status)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Ensures comment text containing HTML is wrapped with ServiceNow [code] and [/code] tags
     * so that ServiceNow renders the HTML instead of displaying it as raw text.
     */
    public String ensureCodeTags(String comment) {
        if (comment == null || comment.trim().isEmpty()) {
            return "";
        }
        String trimmed = comment.trim();
        if (trimmed.startsWith("[code]") && trimmed.endsWith("[/code]")) {
            return trimmed;
        }
        return "[code]\n" + trimmed + "\n[/code]";
    }

    /**
     * Builds the formatted HTML notification template when a Veracode application profile is missing or not found.
     */
    public String buildMissingVeracodeProfileHtml(String appProfileName, String ritmNumber) {
        String safeProfile = (appProfileName != null && !appProfileName.trim().isEmpty()) ? appProfileName.trim() : "UNKNOWN_PROFILE";
        String safeRitm = (ritmNumber != null && !ritmNumber.trim().isEmpty()) ? ritmNumber.trim() : "UNKNOWN_RITM";

        return """
[code]
<style>
    .bg-gray {background-color: gray; color: white;}
    .bg-green {background-color: green; color: white;}
    .info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
    .verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
    .low, .bg-gold {background-color: gold; color: black;}
    .medium, .bg-darkorange {background-color: darkorange; color: black;}
    .high, .bg-red {background-color: red; color: white;}
    .veryhigh, .bg-darkred {background-color: darkred; color: white;}
    .heading {border-radius: 5px; display: inline-block; font-weight: bold;
        padding: 5px 25px; text-transform: uppercase;}
    .highlight {padding: 2px 5px 5px;}
    .rounded {border-radius: 15px; display: inline-block; font-weight: bold;
        margin: 1px; padding: 2px 7.5px; text-align: center;}
    .minwidth {min-width: 50px;}
</style>

The application profile
<span class="rounded bg-red highlight">%s</span>
submitted with this <b>%s</b> does not correspond to an existing application profile in Veracode.

<p><b>Before Code Review Services can proceed</b>, please provide the correct Veracode application profile.</p>

<div style="border:1px solid #f0ad4e; background-color:#fcf8e3; color:#8a6d3b; padding:10px; border-radius:5px; margin-top:10px;">
    <b>Important:</b> The provided application profile could not be found in Veracode.
    <br/><br/>
    If no application profile exists yet, the application has not been onboarded to the scanning platform. According to <a target="_blank" href="https://pwceur.sharepoint.com/:p:/r/sites/GBL-IFS-NIS-Application-Security/_layouts/15/Doc.aspx?sourcedoc=%%7B7D36A28C-D1A4-4D48-B044-9A25AC0DA588%%7D&file=CRS%%20High%%20Level%%20User%%20Guide.pptx&action=edit&mobileredirect=true">CRS High Level User Guide.pptx</a>, you must first submit a <b>Create Scanning Tool Profile</b> request during the onboarding phase.
    <br/><br/>
    You can begin the onboarding process by submitting a
    <a target="_blank" href="https://pwcnetwork.service-now.com/hub?id=sc_cat_item&sys_id=6382512ddb59bf40dbf414a05b96194e">Create Scanning Tool Profile</a>
 
    request.
    <br/><br/>
    The current request was submitted as a <b>Sign-off Request</b>, which is the final stage of the CRS process and requires an existing application profile, completed scan results, and remediation/mitigation activities to be completed before CRS can perform a review.
    <br/><br/>
    <b>CRS Process Summary:</b>
    <ol style="margin-top:5px;">
        <li><b>Phase 1 - Onboarding:</b> Register the application and submit a <i>Create Scanning Tool Profile</i> request.</li>
        <li><b>Phase 2 - Scan and Review Results:</b> Upload code and perform Veracode scans.</li>
        <li><b>Phase 3 - Remediate and Mitigate Findings:</b> Address scan findings and submit mitigation proposals if required.</li>
        <li><b>Phase 4 - Request Sign-off:</b> Submit a Sign-off Request after the previous phases have been completed.</li>
    </ol>

    Please submit a <b>Create Scanning Tool Profile</b> request and wait for confirmation that the application profile has been created. Once the profile is available, complete the required scans, review and remediate any findings, obtain mitigation approvals where applicable, and submit a Sign-off Request only after all preceding CRS phases have been completed.
</div>

<hr/>

If more assistance is needed, please schedule a consultation call by selecting the <i><b>Remediation Consultation</b></i> option from the appointment calendar. For more help, refer to the <i><b>Scheduling Consultations</b></i> section, as detailed in the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%%20Documents/Client-Facing%%20Documentation/CRS%%20Process%%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.
<br/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeProfile, safeRitm);
    }

    /**
     * Checks if an exception caught during Veracode processing indicates a missing or failed Build ID.
     */
    public boolean isBuildIdError(Throwable t) {
        Throwable curr = t;
        while (curr != null) {
            String msg = curr.getMessage();
            if (msg != null) {
                String lower = msg.toLowerCase();
                if (lower.contains("failed to get build id") || lower.contains("no builds found")) {
                    return true;
                }
            }
            curr = curr.getCause();
        }
        return false;
    }

    /**
     * Builds the formatted HTML notification template when a Veracode build ID is missing or failed (Policy Scan Required).
     */
    public String buildPolicyScanRequiredHtml() {
        return """
[code]
<style>
    .bg-gray {background-color: gray; color: white;}
    .bg-green {background-color: green; color: white;}
    .info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
    .verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
    .low, .bg-gold {background-color: gold; color: black;}
    .medium, .bg-darkorange {background-color: darkorange; color: black;}
    .high, .bg-red {background-color: red; color: white;}
    .veryhigh, .bg-darkred {background-color: darkred; color: white;}
    .heading {border-radius: 5px; display: inline-block; font-weight: bold;
        padding: 5px 25px; text-transform: uppercase;}
    .highlight {padding: 2px 5px 5px;}
    .rounded {border-radius: 15px; display: inline-block; font-weight: bold;
        margin: 1px; padding: 2px 7.5px; text-align: center;}
    .minwidth {min-width: 50px;}
</style>
<h3 class="heading bg-red">Policy Scan Required</h3><br/>
Unable to retrieve a valid Build ID for this application.<br/><br/>
This may occur if:
<ul>
<li>No scan has been uploaded for the application.</li>
<li>A scan is currently running or processing.</li>
<li>The most recent scan has not completed successfully.</li>
<li>No policy scan is available for review.</li>
</ul>
Code Review Services can only perform sign-off activities against a completed full application policy scan.<br/><br/>
If a full scan of all application modules has been completed in a sandbox, the sandbox scan can be promoted to a policy scan without running a new scan:
<a target="_blank" href="https://docs.veracode.com/r/t_promote_sandbox">Promote Sandbox to Policy Scan</a>.<br/><br/>
Once a completed policy scan is available, please update the ticket and we will continue the review. If there are no new scans requiring assessment, please let us know.[/code]
""";
    }

    /**
     * Extracts a trailing RITM number from a scan name (e.g. '2026-10-14 1.0.0 APR RITM0012345' -> 'RITM0012345').
     * Returns null if the scan name does not end with a valid RITM number.
     */
    public String extractRitmFromScanName(String scanName) {
        if (scanName == null || scanName.trim().isEmpty()) {
            return null;
        }
        Matcher matcher = SCAN_NAME_RITM_PATTERN.matcher(scanName.trim());
        if (matcher.find()) {
            return matcher.group(1).toUpperCase();
        }
        return null;
    }

    /**
     * Checks if a status string represents a Sign-Off status (e.g. 'Sign-Off', 'Signoff', 'Siganoff').
     */
    public boolean isSignOffStatus(String status) {
        if (status == null) return false;
        String clean = status.trim().toLowerCase().replaceAll("[^a-z]", "");
        return clean.equals("signoff") || clean.equals("siganoff");
    }

    /**
     * Builds the formatted HTML notification template when a scan was previously signed off
     * for an older ticket (scanName ends with a different RITM number than the one being processed).
     */
    public String buildNewPolicyScanRequiredHtml(VeracodeReportDTO.ScanOverviewDTO overview) {
        if (reviewSummaryService != null) {
            return reviewSummaryService.buildNewPolicyScanRequiredHtml(overview);
        }
        return new ReviewSummaryService(config).buildNewPolicyScanRequiredHtml(overview);
    }

    /**
     * Creates a log record under logs/snow/auto/<RITM>_<DATE>.txt containing the reviewCommentsHtml.
     */
    public void saveAutoLogFile(String ritmNumber, String reviewCommentsHtml) {
        try {
            File dir = new File("logs/snow/auto");
            if (!dir.exists()) {
                boolean created = dir.mkdirs();
                if (created) {
                    logger.info("Created logs directory: {}", dir.getAbsolutePath());
                }
            }

            String safeRitm = (ritmNumber != null && !ritmNumber.trim().isEmpty()) ? ritmNumber.trim() : "UNKNOWN_RITM";
            String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            String fileName = safeRitm + "_" + dateStr + ".txt";

            File logFile = new File(dir, fileName);
            Files.writeString(logFile.toPath(), reviewCommentsHtml, StandardCharsets.UTF_8);
            logger.info("Saved auto review comments log record to {}", logFile.getAbsolutePath());

        } catch (Exception e) {
            logger.error("Failed to save auto log file for RITM {}: {}", ritmNumber, e.getMessage(), e);
        }
    }
}

