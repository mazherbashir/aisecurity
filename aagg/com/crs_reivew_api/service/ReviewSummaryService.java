package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.VeracodeReportDTO;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class ReviewSummaryService {

    private final VeracodeConfig veracodeConfig;

    public ReviewSummaryService(VeracodeConfig veracodeConfig) {
        this.veracodeConfig = veracodeConfig;
    }

    public static final String HEADER_STYLE = """
[code]
<style>
    .bg-gray {background-color: gray; color: white;}
    .bg-green {background-color: green; color: white;}
    .info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
    .verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
    .low, .bg-gold {background-color: gold; color: black;}
    .medium, .bg-darkorange {background-color: darkorange; color: black;}
    .high, .bg-red {background-color: red; color: white;}
    .veryhigh, .critical, .bg-darkred {background-color: darkred; color: white;}
    .heading {border-radius: 5px; display: inline-block; font-weight: bold;
        padding: 5px 25px; text-transform: uppercase;}
    .highlight {padding: 2px 5px 5px;}
    .crs-rounded, .rounded {border-radius: 15px; display: inline-block; font-weight: bold;
        margin: 1px; padding: 2px 7.5px; text-align: center;}
    .minwidth {min-width: 50px;}
    .textbold {font-weight: bold; font-size: 1.2em;color: red;}
    code {background: #f0f0f0; padding: 2px 4px; border-radius: 4px; font-family: monospace;}
    a {color: #0000EE; text-decoration: underline;}
</style>
""";

    public static final String SAST_HEADER = """
<style>
    table.crs {border-collapse: collapse;}
    table.crs th {text-align: left !important; white-space: nowrap;}
    table.crs th, td {border: 1px solid black; padding: 3px 5px; text-align: center;}
    table.crs tr:nth-child(even) {background-color: gainsboro;}
    table.crs td:nth-of-type(2) {text-align: left}
</style>
<p><b>Open Flaw and Mitigation Proposal Summary</b></p>
<table class='crs' border=1 cellspacing=2>
    <tr><th>Severity</th><th>Flaw</th><th>Mitigation</th><th>Count</th><th>Fix By Date</th></tr>
""";

    public static final String SAST_FOOTER = """
</table>
<p><b><i>Low severity findings do not impede sign-off. However, low severity findings are still expected to be fixed within 180 days of identification.</i></b></p>
<hr/>
""";

    public static final String SCA_DETAIL_HEADER = """
<style>
    table.crs {border-collapse: collapse;}
    table.crs th {white-space: nowrap;}
    table.crs th, td {border: 1px solid black; padding: 3px 5px; text-align: left;}
    table.crs tr:nth-child(even) {background-color: gainsboro;}
</style>
<h4>Software Composition Analysis Table</h4>
<table class="crs" border=1 cellpadding=5>
    <tr><th><b>Component</b></th><th><b>Current Version</b></th><th><b>Security Finding(s)</b></th><th><b>Fix By Date</b></th><th><b>Vulnerability</b></th><th><b>Mitigation(s)</b></th></tr>
""";

    public static final String NODE_MSG = "If this is a transitive dependency, you can utilize the <code><a target=\"_blank\" href=\"https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides\">overrides</a></code> section of the <code>package.json</code> to force the dependency to a vulnerability-free version in NPM v8.3+. Otherwise, try utilizing the <code><a target=\"_blank\" href=\"https://www.npmjs.com/package/force-resolutions\">force-resolutions</a></code> package to force the dependency to a vulnerability-free version. Additionally, ensure that only production dependencies are included by running <code>npm install --production</code> and including the generated <code>package-lock.json</code> file in the scan.";

    public static final String REQUEST_MSG = "This option is not valid for the <code>request</code> component as the library has been deprecated and there are no future updates. For further guidance on mitigating the <code>request</code> vulnerabilities, see the <a class=\"crs-rounded bg-gray\" target=\"_blank\" href=\"https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%20Documents/Client-Facing%20Documentation/CRS%20SAST%20Developer%20Guidance.docx?d=w18d11ae841444f1ba48c2efe66bc6c92&e=M7j31q&nav=eyJoIjoiMjY5MzU4NzU4In0\">CRS SAST Developer Guidelines</a>.";

    public static final String JAVA_MSG = "For Java/Jar files, \"not used in production\" is NOT a mitigation that can be approved as they may potentially be accessed using other attack vectors.";

    public static final String FOOTER_MSG = """
<hr/>For more information about CRS, please see the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
""";

    public String generateReviewSummary(VeracodeReportDTO dto) {
        if (dto == null || dto.overview == null) {
            return "";
        }

        StringBuilder html = new StringBuilder();
        html.append(HEADER_STYLE);

        // Build Main Header
        String mainHeader = buildMainHeader(dto.overview);
        html.append(mainHeader);

        // Check Scan Too Old Notice
        if (isScanTooOld(dto.overview.submittedDate != null ? dto.overview.submittedDate : dto.overview.generationDate)) {
            html.append(buildScanTooOldMsg(dto.overview));
        }

        // 1. CODE FLAW (SAST Section)
        String sastSection = buildSastSection(dto);
        if (!sastSection.isEmpty()) {
            html.append(sastSection);
        }

        // 2. SCA findings (SCA Section)
        String scaSection = buildScaSection(dto);
        if (!scaSection.isEmpty()) {
            html.append(scaSection);
        }

        // 3. MISSING SCA MESSAGE / Blank Architecture Notice
        if (dto.architectures != null && !dto.architectures.isEmpty()) {
            Set<String> ecosystems = parseEcosystems(dto.scaEcosystems);
            if (veracodeConfig.getNoSca() != null) {
                for (String noScaItem : veracodeConfig.getNoSca()) {
                    ecosystems.add(noScaItem.trim().toUpperCase());
                }
            }
            for (String arch : dto.architectures) {
                if (!ecosystems.contains(arch.trim().toUpperCase())) {
                    html.append(buildMissingScaMsg(arch));
                }
            }
        } else {
            html.append(buildBlankArchitectureMsg());
        }

        // 4. MODULE SELECTION ISSUE
        if (dto.unselectedModules != null && !dto.unselectedModules.isEmpty()) {
            html.append(buildModuleSelectionMsg(dto.overview, dto.selectedModules, dto.unselectedModules));
        }

        // 5. AFTER THAT SHOW THE REST, IN ANY ORDER
        // Missing Precompiled Files Notice
        if (dto.noPrecompile != null && !dto.noPrecompile.isEmpty()) {
            html.append(buildNoPrecompileMsg());
        }

        // Minified Files Notice
        if (dto.minifedFiles != null && !dto.minifedFiles.isEmpty()) {
            html.append(buildMinifiedFilesMsg(dto.minifedFiles));
        }

        html.append(FOOTER_MSG);
        String rawHtml = html.toString();
        return rawHtml.replaceAll("\r\n", "\n")
                      .replaceAll("\r", "\n")
                      .trim();
    }

    private String buildSastSection(VeracodeReportDTO dto) {
        if (dto.sastSummary == null || dto.sastSummary.breakdown == null || dto.sastSummary.breakdown.isEmpty()) {
            return "";
        }

        StringBuilder rows = new StringBuilder();
        boolean hasOutstandingHigh = false;
        boolean hasOutstandingLow = false;
        boolean hasAnyVulnerability = false;

        for (Map.Entry<String, VeracodeReportDTO.SeverityBreakdownDTO> entry : dto.sastSummary.breakdown.entrySet()) {
            String severity = entry.getKey();
            VeracodeReportDTO.SeverityBreakdownDTO data = entry.getValue();
            if (data == null || data.findings == null) continue;

            for (VeracodeReportDTO.CweFindingDTO finding : data.findings) {
                hasAnyVulnerability = true;
                String cweStr = finding.cwe != null ? finding.cwe : "";
                Matcher m = Pattern.compile("\\d+").matcher(cweStr);
                String extractedCwe = m.find() ? m.group() : "";
                String remediationDate = finding.remediation_due_date != null ? finding.remediation_due_date.split(" ")[0] : "N/A";
                int totalCount = finding.count;

                int approvedCount = 0;
                int rejectedCount = 0;

                if (dto.findingsWithCommentsSAST != null) {
                    for (VeracodeReportDTO.FindingDTO f : dto.findingsWithCommentsSAST) {
                        if (extractedCwe.equals(f.cweid)) {
                            if (f.reviewComment != null && f.reviewComment.toLowerCase().startsWith("proposal approved")) {
                                approvedCount++;
                            } else if (f.reviewComment != null && f.reviewComment.toLowerCase().startsWith("proposal rejected")) {
                                rejectedCount++;
                            }
                        }
                    }
                }

                int noneCount = Math.max(0, totalCount - approvedCount - rejectedCount);
                int outstandingCount = noneCount + rejectedCount;

                if (outstandingCount > 0) {
                    String sLower = severity.toLowerCase().replace(" ", "");
                    if (List.of("medium", "high", "veryhigh", "critical").contains(sLower)) {
                        hasOutstandingHigh = true;
                    } else {
                        hasOutstandingLow = true;
                    }
                }

                String displayedSeverity = severity;
                String severityClass = severity.toLowerCase().replace(" ", "");

                if (noneCount > 0) {
                    rows.append(buildSastTableRow(displayedSeverity, severityClass, finding.categoryname, extractedCwe, cweStr, "None", "bg-gold", noneCount, remediationDate));
                }
                if (approvedCount > 0) {
                    rows.append(buildSastTableRow(displayedSeverity, severityClass, finding.categoryname, extractedCwe, cweStr, "Approved", "bg-green", approvedCount, remediationDate));
                }
                if (rejectedCount > 0) {
                    rows.append(buildSastTableRow(displayedSeverity, severityClass, finding.categoryname, extractedCwe, cweStr, "Rejected", "bg-red", rejectedCount, remediationDate));
                }
            }
        }

        if (rows.length() == 0) return "";

        String headingClass = "bg-green";
        if (hasAnyVulnerability) {
            if (hasOutstandingHigh) {
                headingClass = "bg-red";
            } else if (hasOutstandingLow) {
                headingClass = "bg-gold";
            }
        }

        StringBuilder sastHtml = new StringBuilder();
        sastHtml.append(String.format("<h3 class=\"heading %s\">Code Flaws</h3></br>\n", headingClass));
        sastHtml.append(SAST_HEADER);
        sastHtml.append(rows);
        sastHtml.append(SAST_FOOTER);
        return sastHtml.toString();
    }

    private String buildSastTableRow(String displayedSeverity, String severityClass, String categoryName, String extractedCwe, String cweStr, String label, String bgClass, int count, String fixByDate) {
        String flawContent = (categoryName != null && !categoryName.isEmpty())
            ? String.format("%s (<a target=\"_blank\" href=\"https://cwe.mitre.org/data/definitions/%s.html\">%s</a>)", categoryName, extractedCwe, cweStr)
            : String.format("<a target=\"_blank\" href=\"https://cwe.mitre.org/data/definitions/%s.html\">%s</a>", extractedCwe, cweStr);

        return String.format("""
            <tr>
              <td><span class="crs-rounded minwidth %s">%s</span></td>
              <td>%s</td>
              <td><span class="crs-rounded sev %s">%s</span></td>
              <td>%d</td>
              <td>%s</td>
          </tr>
""", severityClass, displayedSeverity, flawContent, bgClass, label, count, fixByDate);
    }

    private static class SeverityInfo {
        final String name;
        final int count;
        final String cssClass;
        SeverityInfo(String name, int count, String cssClass) {
            this.name = name;
            this.count = count;
            this.cssClass = cssClass;
        }
    }

    public Map<String, Integer> getScaSeverityCounts(VeracodeReportDTO dto) {
        Map<String, Integer> sevCounts = new LinkedHashMap<>();
        sevCounts.put("Very High", 0);
        sevCounts.put("High", 0);
        sevCounts.put("Medium", 0);
        sevCounts.put("Low", 0);
        sevCounts.put("Information", 0);

        if (dto.scaDetails != null && !dto.scaDetails.isEmpty()) {
            Pattern p = Pattern.compile("(?i)(Very\\s*High|VeryHigh|Critical|High|Medium|Low|Information|Info):\\s*(\\d+)");
            for (VeracodeReportDTO.ScaDetailDTO detail : dto.scaDetails) {
                if (detail.severityCounts != null) {
                    Matcher m = p.matcher(detail.severityCounts);
                    while (m.find()) {
                        String raw = m.group(1).trim().replaceAll("\\s+", "").toLowerCase();
                        String norm = "Medium";
                        if (raw.equals("veryhigh") || raw.equals("critical")) norm = "Very High";
                        else if (raw.equals("high")) norm = "High";
                        else if (raw.equals("medium")) norm = "Medium";
                        else if (raw.equals("low")) norm = "Low";
                        else if (raw.equals("information") || raw.equals("info")) norm = "Information";

                        int cnt = Integer.parseInt(m.group(2));
                        sevCounts.put(norm, sevCounts.get(norm) + cnt);
                    }
                }
            }
        }

        int totalFromDetails = sevCounts.values().stream().mapToInt(Integer::intValue).sum();
        if (totalFromDetails == 0 && dto.scaSummary != null && dto.scaSummary.breakdown != null && !dto.scaSummary.breakdown.isEmpty()) {
            for (Map.Entry<String, VeracodeReportDTO.SeverityBreakdownDTO> entry : dto.scaSummary.breakdown.entrySet()) {
                String raw = entry.getKey() != null ? entry.getKey().trim().replaceAll("\\s+", "").toLowerCase() : "";
                String norm = "Medium";
                if (raw.equals("veryhigh") || raw.equals("critical")) norm = "Very High";
                else if (raw.equals("high")) norm = "High";
                else if (raw.equals("medium")) norm = "Medium";
                else if (raw.equals("low")) norm = "Low";
                else if (raw.equals("information") || raw.equals("info")) norm = "Information";

                int val = entry.getValue() != null ? entry.getValue().total : 0;
                sevCounts.put(norm, sevCounts.get(norm) + val);
            }
        }

        return sevCounts;
    }

    public int getHighestSeverityRank(String severityCounts) {
        if (severityCounts == null || severityCounts.trim().isEmpty()) {
            return 99;
        }
        String s = severityCounts.toLowerCase().replaceAll("\\s+", "");
        if (s.contains("veryhigh") || s.contains("critical")) return 1;
        if (s.contains("high")) return 2;
        if (s.contains("medium")) return 3;
        if (s.contains("low")) return 4;
        if (s.contains("info") || s.contains("information")) return 5;
        return 99;
    }

    public String formatSecurityFindingsCell(String severityCounts, boolean isCheckmarx) {
        if (severityCounts == null || severityCounts.trim().isEmpty()) {
            return "None";
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("Very High", 0);
        counts.put("High", 0);
        counts.put("Medium", 0);
        counts.put("Low", 0);
        counts.put("Information", 0);

        Pattern p = Pattern.compile("(?i)(Very\\s*High|VeryHigh|Critical|High|Medium|Low|Information|Info):\\s*(\\d+)");
        Matcher m = p.matcher(severityCounts);
        boolean foundAny = false;
        while (m.find()) {
            foundAny = true;
            String raw = m.group(1).trim().replaceAll("\\s+", "").toLowerCase();
            String norm = "Medium";
            if (raw.equals("veryhigh") || raw.equals("critical")) norm = "Very High";
            else if (raw.equals("high")) norm = "High";
            else if (raw.equals("medium")) norm = "Medium";
            else if (raw.equals("low")) norm = "Low";
            else if (raw.equals("information") || raw.equals("info")) norm = "Information";

            int cnt = Integer.parseInt(m.group(2));
            counts.put(norm, counts.get(norm) + cnt);
        }

        if (!foundAny) {
            return safe(severityCounts);
        }

        List<String> rendered = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : counts.entrySet()) {
            if (entry.getValue() > 0) {
                String sev = entry.getKey();
                int count = entry.getValue();
                String displayedSev = sev;
                String sevClass = sev.toLowerCase().replaceAll("\\s+", "");
                if ("Very High".equals(sev)) {
                    if (isCheckmarx) {
                        displayedSev = "Critical";
                        sevClass = "critical";
                    } else {
                        displayedSev = "Very High";
                        sevClass = "veryhigh";
                    }
                } else if ("Information".equals(sev)) {
                    displayedSev = "Info";
                    sevClass = "info";
                }
                rendered.add(String.format("<span class=\"crs-rounded minwidth %s\">%s</span>: %d", sevClass, displayedSev, count));
            }
        }

        return rendered.isEmpty() ? "None" : String.join("<br/>", rendered);
    }

    private String safe(String val, String fallback) {
        return (val == null || val.trim().isEmpty()) ? fallback : val.trim();
    }

    private String buildScaSection(VeracodeReportDTO dto) {
        if (dto.scaSummary == null || (dto.scaSummary.vulnerabilities == 0 && (dto.scaDetails == null || dto.scaDetails.isEmpty()))) {
            return "";
        }

        StringBuilder scaHtml = new StringBuilder();
        int vulnerabilities = dto.scaSummary.vulnerabilities;
        int vulnerablePackages = dto.scaSummary.totalVulnerablePackages;
        int totalPackages = dto.scaSummary.totalPackages;

        String scaEcosystems = dto.scaEcosystems != null ? dto.scaEcosystems.toUpperCase() : "";
        boolean hasJS = scaEcosystems.contains("JAVASCRIPT");
        boolean hasJava = scaEcosystems.contains("JAVA");

        boolean hasRequestPkg = dto.scaDetails != null && dto.scaDetails.stream()
                .anyMatch(d -> d.packageName != null && d.packageName.equalsIgnoreCase("request"));

        String nodeMsgUsed = hasJS ? " " + NODE_MSG : "";
        String requestMsgUsed = hasRequestPkg ? REQUEST_MSG : "";
        String javaMsgUsed = hasJava ? " " + JAVA_MSG : "";

        String remediationGuidance = String.format("""
Please be advised, the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:b:/r/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/Standards/PwC%%20NIS%%20Application%%20Readiness%%20Standard.pdf">Application Readiness Standard</a> requires that secure code findings identified during the Software Composition Analysis of third-party components must resolved via upgrade, removal, mitigation, or replacement.<br/><br/>
Code Review Services recommends upgrading the third-party component with a vulnerability-free version when possible.%s If no vulnerability-free version exists, then the following actions can be taken:
<ol>
    <li>Remove the component if it is not necessary or being used.</li>
    <li>Analyze to determine if the reported vulnerability applies to the application.<ul>
        <li>If the application <b>is not</b> affected, <a target="_blank" href="https://docs.veracode.com/r/Address_Veracode_SCA_Vulnerabilities">a mitigation proposal can be created</a>.</li>
        <li>If the application <b>is</b> affected, there may be a defensive mechanism that can be implemented to mitigate the security risk.%s</li></ul></li>
    <li>Replace the vulnerable component with a different component.</li>
    <li>Actively look for a new patched version of the component and upgrade as soon as a fixed version is available.%s</li>
</ol>
<br/>
""", nodeMsgUsed, javaMsgUsed, requestMsgUsed);

        boolean isCheckmarx = dto.overview != null && "checkmarx".equalsIgnoreCase(dto.overview.scanType);
        Map<String, Integer> sevCounts = getScaSeverityCounts(dto);

        List<SeverityInfo> activeSeverities = new ArrayList<>();
        if (sevCounts.get("Very High") > 0) {
            activeSeverities.add(new SeverityInfo(isCheckmarx ? "Critical" : "Very High", sevCounts.get("Very High"), isCheckmarx ? "critical" : "veryhigh"));
        }
        if (sevCounts.get("High") > 0) {
            activeSeverities.add(new SeverityInfo("High", sevCounts.get("High"), "high"));
        }
        if (sevCounts.get("Medium") > 0) {
            activeSeverities.add(new SeverityInfo("Medium", sevCounts.get("Medium"), "medium"));
        }
        if (sevCounts.get("Low") > 0) {
            activeSeverities.add(new SeverityInfo("Low", sevCounts.get("Low"), "low"));
        }
        if (sevCounts.get("Information") > 0) {
            activeSeverities.add(new SeverityInfo("Info", sevCounts.get("Information"), "info"));
        }

        String vulnerabilitySentencePart = "";
        if (!activeSeverities.isEmpty()) {
            List<String> descriptions = new ArrayList<>();
            for (SeverityInfo s : activeSeverities) {
                descriptions.add(String.format("%d <span class=\"crs-rounded %s\">%s</span>", s.count, s.cssClass, s.name));
            }
            if (descriptions.size() > 1) {
                String allButLast = String.join(", ", descriptions.subList(0, descriptions.size() - 1));
                String last = descriptions.get(descriptions.size() - 1);
                vulnerabilitySentencePart = allButLast + " and " + last;
            } else {
                vulnerabilitySentencePart = descriptions.get(0);
            }
        } else {
            vulnerabilitySentencePart = String.valueOf(vulnerabilities);
        }

        StringBuilder listItems = new StringBuilder();
        for (SeverityInfo s : activeSeverities) {
            listItems.append(String.format("        <li><span class=\"crs-rounded minwidth %s\">%s</span>: %d</li>\n", s.cssClass, s.name, s.count));
        }

        if (vulnerabilities == 0) {
            scaHtml.append(String.format("""
<h3 class="heading bg-green">Third-party Components</h3><br/>
A review of the third-party components in the Software Composition Analysis was performed. There are no identified vulnerabilities in the Software Composition Analysis of the third-party components.<br/>
<h4>Third-Party Component Summary</h4>
<ul>
    <li>Components: %d</li>
    <li>Vulnerable Components: 0</li>
    <li>Vulnerabilities: 0<ul>
    </ul></li>
</ul>
<br/>
""", totalPackages));
        } else {
            scaHtml.append(String.format("""
<h3 class="heading bg-red">Third-party Components</h3><br/>
A review of the third-party components in the Software Composition Analysis was performed. There are %s severity vulnerabilities that affect %d third-party components.<br/>
<h4>Third-Party Component Summary</h4>
<ul>
    <li>Components: %d</li>
    <li>Vulnerable Components: %d</li>
    <li>Vulnerabilities: %d<ul>
%s    </ul></li>
</ul>
<br/>
%s""", vulnerabilitySentencePart, vulnerablePackages, totalPackages, vulnerablePackages, vulnerabilities, listItems.toString(), remediationGuidance));
        }

        // Render SCA Detail Table
        String header = SCA_DETAIL_HEADER;
        if (dto.scaSafeVersionEnabled) {
            header = header.replace(
                "<th><b>Current Version</b></th>",
                "<th><b>Current Version</b></th><th><b>Recommended Version(s)</b></th>"
            );
        }
        scaHtml.append(header);

        if (dto.scaDetails != null && !dto.scaDetails.isEmpty()) {
            List<VeracodeReportDTO.ScaDetailDTO> sortedDetails = new ArrayList<>(dto.scaDetails);
            sortedDetails.sort(Comparator.comparingInt(d -> getHighestSeverityRank(d.severityCounts)));

            for (VeracodeReportDTO.ScaDetailDTO detail : sortedDetails) {
                String safeVer = (detail.safeVersion != null && !detail.safeVersion.trim().isEmpty()) ? detail.safeVersion.trim() : "N/A";
                String safeVerHtml = dto.scaSafeVersionEnabled ? String.format("          <td>%s</td>\n", safe(safeVer)) : "";
                String cveLinks = "";
                if (detail.cveList != null && !detail.cveList.isEmpty()) {
                    cveLinks = Arrays.stream(detail.cveList.split(","))
                            .map(String::trim)
                            .filter(cve -> !cve.isEmpty())
                            .map(cve -> String.format("<a target=\"_blank\" href=\"http://web.nvd.nist.gov/view/vuln/detail?vulnId=%s\">%s</a>", cve, cve))
                            .collect(Collectors.joining("</div><div>"));
                }

                // Check mitigation status
                String label = "None";
                String bgClass = "bg-gold";
                if (dto.findingsWithCommentsSCA != null) {
                    for (VeracodeReportDTO.FindingDTO f : dto.findingsWithCommentsSCA) {
                        if (detail.packageName != null && detail.packageName.equalsIgnoreCase(f.location)) {
                            if (f.reviewComment != null && f.reviewComment.toLowerCase().startsWith("proposal approved")) {
                                label = "Approved";
                                bgClass = "bg-green";
                            } else if (f.reviewComment != null && f.reviewComment.toLowerCase().startsWith("proposal rejected")) {
                                label = "Rejected";
                                bgClass = "bg-red";
                            }
                        }
                    }
                }

                String severityHtml = formatSecurityFindingsCell(detail.severityCounts, isCheckmarx);
                String fixByDate = (detail.remediation_due_date != null && !detail.remediation_due_date.trim().isEmpty()) ? detail.remediation_due_date.trim() : "N/A";

                scaHtml.append(String.format("""
      <tr>
          <td>%s</td>
          <td>%s</td>
%s          <td>%s</td>
          <td>%s</td>
          <td><div class="top_row"><div>%s</div></div></td>
          <td><span class="crs-rounded minwidth %s">%s</span></td>
      </tr>
""", safe(detail.packageName), safe(detail.version), safeVerHtml, severityHtml, safe(fixByDate), cveLinks, bgClass, label));
            }
        }

        scaHtml.append("</table>\n");
        return scaHtml.toString();
    }

    public boolean isScanTooOld(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) return false;
        try {
            LocalDate date;
            String clean = dateStr.trim();
            if (clean.length() > 10) {
                clean = clean.substring(0, 10);
            }
            date = LocalDate.parse(clean, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            long daysOld = ChronoUnit.DAYS.between(date, LocalDate.now());
            int validityDays = (veracodeConfig != null) ? veracodeConfig.getScanValidityDays() : 90;
            if (validityDays <= 0) validityDays = 90;
            return daysOld > validityDays;
        } catch (Exception e) {
            return false;
        }
    }

    public String buildScanTooOldMsg(VeracodeReportDTO.ScanOverviewDTO overview) {
        String safeDate = safe(overview != null && overview.submittedDate != null ? overview.submittedDate : (overview != null ? overview.generationDate : null));
        if (safeDate.isEmpty()) safeDate = "[Date]";

        if (overview != null && "checkmarx".equalsIgnoreCase(overview.scanType)) {
            String encodedBranch = encodeCheckmarxBranch(overview.scanName);
            String profileUrl = (overview.appId != null && !overview.appId.trim().isEmpty())
                    ? String.format("https://us.ast.checkmarx.net/projects/%s/overview?branch=%s", overview.appId.trim(), encodedBranch)
                    : "https://us.ast.checkmarx.net/";
            String viewerLink = (!safe(overview.sandboxId).isEmpty()) ? safe(overview.sandboxId) : profileUrl;
            return String.format("""
<h3 class="heading bg-red">Scan Too Old</h3></br>
The latest scan <code><a target="_blank" href="%s">%s</a></code> from %s cannot be considered valid for sign-off as it is too old and may contain vulnerabilities that have been identified since the scan has been performed.<br/>
<br/>
Code Review Services will only take action on full application scans in Checkmarx.<br/>
<br/>
Additionally, CRS does not require periodic sign-off unless material production changes (see page 9 of the <a target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/PwC%%20ISP%%20Terms%%20and%%20Definitions.pdf">PwC Information Security Policy Terms and Definitions</a>) are made. However, during the development process it is required that scans are run during all development activities to identify current risks that require remediation.
""", viewerLink, safe(overview.scanName), safeDate);
        }

        String scanLink = String.format("https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:%s:%s:%s:%s:%s::::%s",
                safe(overview != null ? overview.accountId : ""),
                safe(overview != null ? overview.appId : ""),
                safe(overview != null ? overview.buildId : ""),
                safe(overview != null ? overview.analysisId : ""),
                safe(overview != null ? overview.staticAnalysisUnitId : ""),
                safe(overview != null ? overview.sandboxId : ""));
        return String.format("""
<h3 class="heading bg-red">Scan Too Old</h3></br>
The latest policy scan <code><a target="_blank" href="%s">%s</a></code> from %s cannot be considered valid for sign-off as it is too old and may contain vulnerabilities that have been identified since the scan has been performed.<br/>
<br/>
Code Review Services will only take action on full application policy scans in Veracode. If a new full scan of all of the modules in the application has been completed in the sandbox, the <a target="_blank" href="https://docs.veracode.com/r/t_promote_sandbox">sandbox scan can be promoted to a policy scan</a> without the need to run a new scan.<br/>
<br/>
Additionally, CRS does not require periodic sign-off unless material production changes (see page 9 of the <a target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%%20Documents/PwC%%20ISP%%20Terms%%20and%%20Definitions.pdf">PwC Information Security Policy Terms and Definitions</a>) are made. However, during the development process it is required that scans are run during all development activities to identify current risks that require remediation.
""", scanLink, safe(overview != null ? overview.scanName : ""), safeDate);
    }

    /**
     * Builds the formatted HTML notification template when a scan is older than the configured validity period.
     */
    public String buildScanTooOldHtml(VeracodeReportDTO.ScanOverviewDTO overview) {
        StringBuilder html = new StringBuilder();
        html.append(HEADER_STYLE);
        if (overview != null) {
            String header = buildMainHeader(overview);
            html.append(header);
            if (!header.endsWith("<hr/>\n") && !header.endsWith("<hr/>")) {
                html.append("<hr/>\n");
            }
        }
        html.append(buildScanTooOldMsg(overview));
        html.append(FOOTER_MSG);
        return html.toString();
    }

    private String buildModuleSelectionMsg(VeracodeReportDTO.ScanOverviewDTO overview, List<String> selected, List<String> unselected) {
        String scanLink = String.format("https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:%s:%s:%s:%s:%s::::%s",
            safe(overview.accountId), safe(overview.appId), safe(overview.buildId), safe(overview.analysisId), safe(overview.staticAnalysisUnitId), safe(overview.sandboxId));
        String reviewModulesUrl = String.format("https://analysiscenter.veracode.com/auth/index.jsp#AnalyzeAppModuleList:%s:%s:%s:%s:%s:::results:%s",
            safe(overview.accountId), safe(overview.appId), safe(overview.buildId), safe(overview.analysisId), safe(overview.staticAnalysisUnitId), safe(overview.sandboxId));

        String selectedList = selected.stream().map(m -> "\t<li><code>" + m + "</code></li>").collect(Collectors.joining("\n"));
        String unselectedList = unselected.stream().map(m -> "\t<li><code>" + m + "</code></li>").collect(Collectors.joining("\n"));

        return String.format("""
<hr/>
<h3 class="heading bg-red">Module Selection</h3></br>
Code Review Services can only take action on full application policy scans. All application-specific modules (frontend, backend, middleware, APIs, etc.) for deployment <b>must be uploaded in a single policy scan and selected as entry points</b>. Only application-specific modules should be selected as entry points, i.e. third-party components should not be selected and explicitly stated to be third-party.<br/>
<br/>
The latest policy scan <code><a target="_blank" href="%s">%s</a></code> has the following module(s) selected as entry points:
<ul>
%s
</ul>
However, there are other module(s) that appear to contain PwC first-party code or customized content and were not selected as entry points for the Veracode scan engine:
<ul>
%s
</ul>
Confirm if the scan contains all the application components and their modules are all selected as entry points.<br/>
<br/>
If the scan doesn't contain all the application components and their modules, then perform a new scan that includes all application specific modules and select the modules as entry points for the scan.<br/>
<br/>
If the scan contains all the application components and their modules are not all selected as entry points, then ensure that all application specific modules are selected as entry points on the <code><a target="_blank" href="%s">Review Modules</a></code> page and click the <code>Start Rescan</code> button to rescan.<br/>
<br/>
<b>Note:</b> If any of the newly selected entry point modules contain issues, such as missing supporting files, parsing failures, and minified files, then those issues will need to be resolved as well.<br/>
<br/>
For more information on scan quality and module selection, please see the <a target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%%20Documents/Client-Facing%%20Documentation/CRS%%20Process%%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f&nav=eyJoIjoiMjA5MzI3MDY0NCJ9">Ensuring Scan Quality</a> section of the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%%20Documents/Client-Facing%%20Documentation/CRS%%20Process%%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.
""", scanLink, safe(overview.scanName), selectedList, unselectedList, reviewModulesUrl);
    }

    private String buildMissingScaMsg(String arch) {
        return String.format("""
<hr/>
<h3 class="heading bg-red">Missing Software Composition Analysis for %s</h3></br>
A review of the third-party components in Software Composition Analysis was performed and there are no third-party components identified in this scan. It is a requirement of static code analysis to include Software Composition Analysis of third-party dependencies for a complete scan.<br/>
<br/>
Confirm if you have any third-party components/dependencies. If so, to successfully upload and scan an application that includes Veracode Software Composition Analysis, your application upload must include the appropriate <a target="_blank" href="https://docs.veracode.com/r/Understanding_the_Upload_and_Scan_Language_Support_Matrix">package manager artifacts</a> for the relevant supported language(s).
""", arch);
    }

    private String buildBlankArchitectureMsg() {
        return """
<hr/>
<h3 class="heading bg-red">Missing Architecture and Software Composition Analysis</h3></br>
No architecture or language technology was identified in the static scan results (architecture is blank). Because no architecture was detected, Software Composition Analysis (SCA) results could not be validated for sign-off. It is a requirement of static code analysis to include Software Composition Analysis of third-party dependencies for a complete scan.<br/>
<br/>
Confirm if your application modules are properly selected and precompiled with appropriate package manager artifacts for scanning.
""";
    }

    private String buildNoPrecompileMsg() {
        return """
<hr/>
<h3 class="heading bg-red">Missing Precompiled Files</h3></br>
The scan reported <i>Support Issue: No precompiled files were found for this .NET web application</i> in the uploaded modules. If your application has any ASP.NET front-end code, then the application must be precompiled to include the front-end code for scanning.<br/>
<br/>
Confirm if this application has ASP.NET front-end code, and <b>if so, precompile and rescan</b>. See Veracode's documentation on <a target="_blank" href="https://docs.veracode.com/r/compilation_ASPnet">Packaging ASP.NET Web Applications</a> for more information.
""";
    }

    private String buildMinifiedFilesMsg(List<String> minifiedFiles) {
        String listItems = minifiedFiles.stream().map(file -> "\t<li><code>" + file + "</code></li>").collect(Collectors.joining("\n"));
        return String.format("""
<hr/>
<h3 class="heading bg-red">Minified Files</h3></br>
The scan reported <i>Support Issue: Ignored file [filename] because we think it is minified</i> in the uploaded modules selected as entry points. Code Review Services can only take action on full application policy scans and ignored files can affect the completeness of the scan.<br/>
<br/>
Ensure that all application-specific files are uploaded unminified in a single policy scan. <b>Only application-specific files must be unminified</b>, i.e. third-party files can be minified if they are explicitly stated to be third-party.<br/>
<br/>
Confirm if the file(s) below are required for production, and <b>if so, unminify the file(s) and rescan</b>:<br/>
<br/>
<b> Minified files exists in the following module(s)</b>
<ul>
%s
</ul>
<b>Note:</b> The Veracode scan engine uses line length in determining if a file is minified. If the file is not minified but is reported as such, ensure that there are no lines with a length of 500 or more characters.
""", listItems);
    }

    private Set<String> parseEcosystems(String raw) {
        Set<String> set = new HashSet<>();
        if (raw == null || raw.isEmpty()) return set;
        String clean = raw.replaceAll("[\\[\\]]", "");
        for (String part : clean.split(",")) {
            if (!part.trim().isEmpty()) {
                set.add(part.trim().toUpperCase());
            }
        }
        return set;
    }

    public String encodeCheckmarxBranch(String branch) {
        if (branch == null || branch.trim().isEmpty()) {
            return "";
        }
        String clean = branch.trim();
        try {
            clean = java.net.URLDecoder.decode(clean, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception ignored) {}
        return java.net.URLEncoder.encode(clean, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
    }

    public String buildCheckmarxProfileUrl(String appId, String branch) {
        String safeAppId = (appId != null && !appId.trim().isEmpty()) ? appId.trim() : "---";
        String encodedBranch = encodeCheckmarxBranch(branch);
        return String.format("https://us.ast.checkmarx.net/projects/%s/overview?branch=%s", safeAppId, encodedBranch);
    }

    public String buildMainHeader(VeracodeReportDTO.ScanOverviewDTO overview) {
        if (overview == null) {
            return "";
        }
        String accountId = safe(overview.accountId);
        String appId = safe(overview.appId);
        String buildId = safe(overview.buildId);
        String analysisId = safe(overview.analysisId);
        String unitId = safe(overview.staticAnalysisUnitId);
        String sandboxId = safe(overview.sandboxId);
        String scanName = safe(overview.scanName);
        String profileName = safe(overview.applicationName);

        if ("checkmarx".equalsIgnoreCase(overview.scanType)) {
            String encodedBranch = encodeCheckmarxBranch(scanName);
            String profileUrl = !appId.isEmpty()
                    ? String.format("https://us.ast.checkmarx.net/projects/%s/overview?branch=%s", appId, encodedBranch)
                    : "https://us.ast.checkmarx.net/";
            String viewerLink = (!sandboxId.isEmpty()) ? sandboxId : profileUrl;

            return String.format("""
Code Review Services (CRS) has assessed your latest scan <code><a target="_blank" href="%s">%s</a></code> (SAST) of the <code><a target="_blank" href="%s">%s</a></code> application from branch <code class="crs-rounded bg-gray">%s</code> for quality and completeness and reviewed the open findings and available mitigation proposals. Please take a look at those findings in the comments below. If more assistance is needed, please schedule a consultation call by selecting the <i><b>Remediation Consultation</b></i> option from the appointment calendar. For more help, refer to the <i><b>Scheduling Consultations</b></i> section, as detailed in the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%%20Documents/Client-Facing%%20Documentation/CRS%%20Process%%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.<br/>
<hr/>
""", viewerLink, appId, profileUrl, profileName, scanName);
        } else {
            return String.format(
                "Code Review Services (CRS) has assessed your latest policy-level scan <code><a target=\"_blank\" href=\"https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:%s:%s:%s:%s:%s::::%s\">%s</a></code> of the <code><a target=\"_blank\" href=\"https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:%s:%s:%s\">%s</a></code> application for quality and completeness and reviewed the open findings and available mitigation proposals. If more assistance is needed, please schedule a consultation call by selecting the <i><b>Remediation Consultation</b></i> option from the appointment calendar. For more help, refer to the <i><b>Scheduling Consultations</b></i> section, as detailed in the <a class=\"crs-rounded bg-gray\" target=\"_blank\" href=\"https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%%20Documents/Client-Facing%%20Documentation/CRS%%20Process%%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f\">CRS Process Overview</a> document.<br/>\n<hr/>\n",
                accountId, appId, buildId, analysisId, unitId, sandboxId, scanName, accountId, appId, buildId, profileName
            );
        }
    }

    /**
     * Builds the formatted HTML notification template when a scan was previously signed off
     * for an older ticket (scanName ends with a different RITM number).
     */
    public String buildNewPolicyScanRequiredHtml(VeracodeReportDTO.ScanOverviewDTO overview) {
        StringBuilder html = new StringBuilder();
        html.append(HEADER_STYLE);
        if (overview != null) {
            String header = buildMainHeader(overview);
            html.append(header);
            if (!header.endsWith("<hr/>\n") && !header.endsWith("<hr/>")) {
                html.append("<hr/>\n");
            }
        }
        html.append("""
<h3 class="heading bg-red">New Policy Scan Required</h3></br>
There is no new policy scan to review since the last sign-off assessment.<br/>
<br/>
Please note that Code Review Services will only take action on full application policy scans. If a new full scan of all of the modules in the application has been completed in the sandbox, the <a target="_blank" href="https://docs.veracode.com/r/t_promote_sandbox">sandbox scan can be promoted to a policy scan</a> without the need to run a new scan.<br/>
<br/>
If there are no new scans that need to be assessed for sign-off, please let us know.
""");
        html.append(FOOTER_MSG);
        return html.toString();
    }

    private String safe(String val) {
        return val != null ? val : "";
    }
}
