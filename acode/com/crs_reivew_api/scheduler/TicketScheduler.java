package com.crs_reivew_api.scheduler;

import com.crs_reivew_api.component.TaskFileStore;
import com.crs_reivew_api.component.TaskMemory;
import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.SnowRitmDTO;
import com.crs_reivew_api.dto.SnowScTaskDTO;
import com.crs_reivew_api.dto.VeracodeReportDTO;
import com.crs_reivew_api.service.CheckmarxService;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

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

    private final SnowService snowService;
    private final VeracodeService veracodeService;
    private final VeracodeConfig config;
    private final TaskMemory taskMemory;
    private final TaskFileStore taskFileStore;
    
    @Autowired(required = false)
    private CheckmarxService checkmarxService;

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

        logger.info("Starting ServiceNow SCTASK Scheduler run...");
        try {
            JsonNode rootNode = fetchOpenTicketsFromServiceNow();
            if (rootNode == null || !rootNode.has("result") || !rootNode.get("result").isArray()) {
                logger.info("No open remediation tickets found in ServiceNow.");
                return;
            }

            JsonNode tasksArray = rootNode.get("result");
            int totalCount = tasksArray.size();
            logger.info("Retrieved {} open catalog task(s) from ServiceNow.", totalCount);

            int processedCount = 0;
            int skippedCount = 0;

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

                if (scaTool != null && scaTool.toLowerCase().contains("veracode")) {
                    logger.info("Detected Veracode SCA Tool for SCTASK {} (RITM: {}). Raw Profile: '{}', Version: '{}', Request Reason: '{}'", sctaskNumber, ritmNumber, appProfileName, appVersion, requestReason);
                    processVeracodeTask(sctaskNumber, ritmNumber, appProfileName, appVersion, requestReason);
                } else if (scaTool != null && !scaTool.trim().isEmpty()) {
                    logger.info("Detected Non-Veracode Tool ({}) for SCTASK {} (RITM: {}). Raw Profile: '{}', Version: '{}', Request Reason: '{}'", scaTool, sctaskNumber, ritmNumber, appProfileName, appVersion, requestReason);
                    processNonVeracodeTask(sctaskNumber, ritmNumber, scaTool, appProfileName, appVersion, requestReason);
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
     * Parses profile name and branch name for non-Veracode tools (e.g. "USA-DEV-SOLUTION BRANCH:MASTER").
     */
    public String[] parseNonVeracodeProfileAndBranch(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return new String[] {"", null};
        }
        String cleaned = cleanVeracodeProfileName(raw);
        int branchIdx = cleaned.toUpperCase().indexOf("BRANCH:");
        if (branchIdx != -1) {
            String profileName = cleaned.substring(0, branchIdx).trim();
            String branchName = cleaned.substring(branchIdx + "BRANCH:".length()).trim();
            return new String[] { profileName, branchName };
        }
        return new String[] { cleaned, null };
    }

    /**
     * Format application version per rule:
     * - If version is null/empty or equals "N/A", "na", or "n/a" (case-insensitive), change to "v1.0.0".
     * - Replace space, double spaces, or commas with "_".
     */
    public String sanitizeApplicationVersion(String rawVersion) {
        if (rawVersion == null || rawVersion.trim().isEmpty()) {
            return "v1.0.0";
        }
        String clean = rawVersion.trim();
        if (clean.equalsIgnoreCase("n/a") || clean.equalsIgnoreCase("na")) {
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

        clean = clean.replaceAll("[,\\s]+", "_");
        if (clean.isEmpty() || clean.equals("_") || clean.equals("=")) {
            return "v1.0.0";
        }

        return clean;
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
     * Helper method to fetch Veracode report, update scan name, download/upload PDF, update RITM variables, and post SCTASK update to ServiceNow.
     */
    private void processVeracodeTask(String sctaskNumber, String ritmNumber, String rawAppProfileName, String rawAppVersion) {
        processVeracodeTask(sctaskNumber, ritmNumber, rawAppProfileName, rawAppVersion, null);
    }

    private void processVeracodeTask(String sctaskNumber, String ritmNumber, String rawAppProfileName, String rawAppVersion, String requestReason) {
        String cleanProfile = cleanVeracodeProfileName(rawAppProfileName);
        String formattedAppVersion = sanitizeApplicationVersion(rawAppVersion);
        logger.info("Processing Veracode task for SCTASK: {}, RITM: {}, Cleaned Profile: '{}', Sanitized Version: '{}', Request Reason: '{}'",
                sctaskNumber, ritmNumber, cleanProfile, formattedAppVersion, requestReason);

        if (cleanProfile == null || cleanProfile.isEmpty()) {
            logger.warn("Cleaned Application Profile Name is empty for SCTASK {}", sctaskNumber);
            return;
        }

        VeracodeReportDTO report = null;
        String reviewCommentsHtml = null;

        try {
            report = veracodeService.getFinalReport(cleanProfile, null, null, true, true);
            reviewCommentsHtml = (report != null) ? report.reviewCommentsHtml : null;
        } catch (Exception e) {
            logger.warn("Veracode profile '{}' not found or error occurred for SCTASK {}: {}. Generating profile missing notification.",
                    cleanProfile, sctaskNumber, e.getMessage());
            reviewCommentsHtml = buildMissingVeracodeProfileHtml(cleanProfile, ritmNumber);
        }

        if (reviewCommentsHtml != null && !reviewCommentsHtml.trim().isEmpty()) {
            saveAutoLogFile(ritmNumber, reviewCommentsHtml);
        }

        // Step S -> T: Check postSchedulerToSnow flag
        if (!config.isPostSchedulerToSnow()) {
            logger.info("postSchedulerToSnow is false. Skipping ServiceNow posting for SCTASK {}.", sctaskNumber);
            return;
        }

        if (report == null) {
            // Missing profile case: post notification comment to ServiceNow SCTASK
            ObjectNode updatePayload = objectMapper.createObjectNode();
            updatePayload.put("u_number", sctaskNumber);
            updatePayload.put("u_action", "Add Comment");
            updatePayload.put("u_additional_comments", reviewCommentsHtml);
            snowService.updateScTask(updatePayload);
            return;
        }

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

        // 5. Post SCTASK Status Update (Sign-Off vs Pending)
        String reportStatus = (report.status != null) ? report.status : "Pending";
        boolean isSignoffRequest = isSignoffRequestReason(requestReason);

        if (!isSignoffRequest && "Sign-Off".equalsIgnoreCase(reportStatus)) {
            logger.info("JSON status is 'Sign-Off', but Request Reason ('{}') is NOT Sign-Off for SCTASK {}. Qualifying only for Pending status block.",
                    requestReason, sctaskNumber);
        }

        boolean canAutoSignoff = "Sign-Off".equalsIgnoreCase(reportStatus) && isSignoffRequest && config.isAutoSignoffEnabled();

        if (canAutoSignoff) {
            String additionMessage = buildSignOffAdditionMessage(
                    report.scanUrl, newScanName, report.scanToolProfileUrl, cleanProfile, attachmentUrl, pdfFileName);
            String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

            ObjectNode closePayload = objectMapper.createObjectNode();
            closePayload.put("u_number", sctaskNumber);
            closePayload.put("u_action", "closeSctask");
            closePayload.put("u_additional_comments", additionMessage);
            closePayload.put("u_closure_message", closureMessage);
            closePayload.put("u_state", 3); // CLOSED_COMPLETE
            closePayload.put("u_work_notes", "This request has been processed by Automation");

            JsonNode closeResp = snowService.updateScTask(closePayload);
            logger.info("ServiceNow closeSctask response for {}: {}", sctaskNumber, closeResp);

        } else {
            executePendingBlock(sctaskNumber, reviewCommentsHtml);
        }
    }

    /**
     * Shared Pending Block used by both Veracode and Checkmarx when a ticket does not qualify for auto sign-off.
     */
    public void executePendingBlock(String sctaskNumber, String reviewCommentsHtml) {
        String endPendingDate = calculateWorkingDaysAhead(2);

        ObjectNode pendingPayload = objectMapper.createObjectNode();
        pendingPayload.put("u_number", sctaskNumber);
        pendingPayload.put("u_action", "setReviewComments");
        pendingPayload.put("u_state", -5); // PENDING
        pendingPayload.put("u_pending_reason", "Awaiting Customer Response");
        pendingPayload.put("u_end_pending", endPendingDate);
        pendingPayload.put("u_additional_comments", reviewCommentsHtml != null ? reviewCommentsHtml : "");

        JsonNode pendingResp = snowService.updateScTask(pendingPayload);
        logger.info("ServiceNow setPending response for {}: {}", sctaskNumber, pendingResp);
    }

    /**
     * Helper method to process non-Veracode tools (e.g., Checkmarx).
     */
    private void processNonVeracodeTask(String sctaskNumber, String ritmNumber, String scaTool, String rawAppProfileName, String appVersion) {
        processNonVeracodeTask(sctaskNumber, ritmNumber, scaTool, rawAppProfileName, appVersion, null);
    }

    private void processNonVeracodeTask(String sctaskNumber, String ritmNumber, String scaTool, String rawAppProfileName, String appVersion, String requestReason) {
        String[] profileAndBranch = parseNonVeracodeProfileAndBranch(rawAppProfileName);
        String profileName = profileAndBranch[0];
        String branchName = (profileAndBranch[1] != null && !profileAndBranch[1].trim().isEmpty()) ? profileAndBranch[1].trim() : appVersion;

        logger.info("Processing Non-Veracode ({}) task for SCTASK: {}, RITM: {}, Profile: '{}', Branch: '{}', Version: '{}', Request Reason: '{}'",
                scaTool, sctaskNumber, ritmNumber, profileName, branchName, appVersion, requestReason);

        if (checkmarxService != null && scaTool != null && scaTool.toLowerCase().contains("checkmarx")) {
            try {
                VeracodeReportDTO report = checkmarxService.getReport(profileName, branchName, null, true);
                String reviewCommentsHtml = (report != null) ? report.reviewCommentsHtml : null;

                if (reviewCommentsHtml != null && !reviewCommentsHtml.trim().isEmpty()) {
                    saveAutoLogFile(ritmNumber, reviewCommentsHtml);
                }

                if (!config.isPostSchedulerToSnow()) {
                    logger.info("postSchedulerToSnow is false. Skipping ServiceNow posting for Checkmarx SCTASK {}.", sctaskNumber);
                    return;
                }

                String reportStatus = (report != null && report.status != null) ? report.status : "Pending";
                boolean isSignoffRequest = isSignoffRequestReason(requestReason);

                if (!isSignoffRequest && "Sign-Off".equalsIgnoreCase(reportStatus)) {
                    logger.info("JSON status is 'Sign-Off', but Request Reason ('{}') is NOT Sign-Off for Checkmarx SCTASK {}. Qualifying only for Pending status block.",
                            requestReason, sctaskNumber);
                }

                boolean canAutoSignoff = "Sign-Off".equalsIgnoreCase(reportStatus) && isSignoffRequest && config.isAutoSignoffEnabled();

                if (canAutoSignoff) {
                    // Checkmarx Sign-Off Block
                    String additionMessage = buildCheckmarxSignOffAdditionMessage(profileName, branchName, ritmNumber);
                    String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

                    ObjectNode closePayload = objectMapper.createObjectNode();
                    closePayload.put("u_number", sctaskNumber);
                    closePayload.put("u_action", "closeSctask");
                    closePayload.put("u_additional_comments", additionMessage);
                    closePayload.put("u_closure_message", closureMessage);
                    closePayload.put("u_state", 3); // CLOSED_COMPLETE
                    closePayload.put("u_work_notes", "This Checkmarx request has been processed by Automation");

                    JsonNode closeResp = snowService.updateScTask(closePayload);
                    logger.info("ServiceNow Checkmarx closeSctask response for {}: {}", sctaskNumber, closeResp);
                } else {
                    // Shared Pending Block
                    executePendingBlock(sctaskNumber, reviewCommentsHtml);
                }
            } catch (Exception e) {
                logger.warn("Failed to process Checkmarx report for SCTASK {} / Profile {}: {}", sctaskNumber, profileName, e.getMessage());
            }
        }
    }

    /**
     * Builds the Checkmarx sign-off additionMessage HTML snippet.
     */
    public String buildCheckmarxSignOffAdditionMessage(String appProfileName, String branchName, String ritmNumber) {
        String safeProfile = appProfileName != null ? appProfileName : "";
        String safeBranch = branchName != null ? branchName : "";

        return """
[code]
<style>
\t.bg-gray {background-color: gray; color: white;}
\t.rounded {border-radius: 15px; display: inline-block; font-weight: bold; margin: 1px; padding: 2px 7.5px; text-align: center;}
</style>
The Checkmarx SAST assessment has been completed successfully with no remaining open findings in adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for project <code>%s</code> (branch <code>%s</code>). Please note that after this sign-off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!
<hr/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeProfile, safeBranch);
    }

    /**
     * Builds the Remediation Plan (RP) sign-off additionMessage HTML snippet for Checkmarx.
     */
    public String buildCheckmarxRpSignOffAdditionMessage(
            String appProfileName, String branchName, String ritmNumber,
            String rpNumber, String estimatedCompletionDate, boolean withinGracePeriod, String gracePeriodStr) {

        String safeProfile = appProfileName != null ? appProfileName : "";
        String safeBranch = branchName != null ? branchName : "";
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
\t.veryhigh, .bg-darkred {background-color: darkred; color: white;}
\t.critical {background-color: darkred; color: white;}
\t.heading {border-radius: 5px; display: inline-block; font-weight: bold;
\t\tpadding: 5px 25px; text-transform: uppercase;}
\t.highlight {padding: 2px 5px 5px;}
\t.rounded {border-radius: 15px; display: inline-block; font-weight: bold;
\t\tmargin: 1px; padding: 2px 7.5px; text-align: center;}
\t.minwidth {min-width: 50px;}
</style>
The SAST assessment has been completed successfully with open findings. The remediation plan <code><a target="_blank" href="https://eu.workbench.pwc.com/home/my-reports/IRM-ARR-Dashboard">%s</a></code> is in place for the open findings in adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for project <code>%s</code> (branch <code>%s</code>). Please note that after this sign-off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!
<hr/>
<p><b><u>Remediation Plan %s Risk Review</u></b><br/>
The estimated completion date of %s <u>%s meet</u> the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a> Vulnerability Remediation Timeframe for <span class="rounded critical">Critical</span> and <span class="rounded high">High</span> findings (within %s days) and <span class="rounded medium">Medium</span> findings (within %s days).</p>
<hr/>
For more information about CRS, please see the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""".formatted(safeRpNumber, safeProfile, safeBranch, safeRpNumber, safeDate, meetText, vhHighDays, medDays);
    }

    /**
     * Builds the formatted HTML notification template when a Veracode application profile is missing or not found.
     */
    public String buildMissingVeracodeProfileHtml(String appProfileName, String ritmNumber) {
        String safeProfile = (appProfileName != null && !appProfileName.trim().isEmpty()) ? appProfileName.trim() : "UNKNOWN_PROFILE";
        String safeRitm = (ritmNumber != null && !ritmNumber.trim().isEmpty()) ? ritmNumber.trim() : "UNKNOWN_RITM";

        return """
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
""".formatted(safeProfile, safeRitm);
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

