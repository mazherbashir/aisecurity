package com.crs_reivew_api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import com.crs_reivew_api.config.VeracodeConfig;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class CheckmarxService {

    @Autowired
    private VeracodeConfig veracodeConfig;

    @Value("${crs.checkmarx.api.key:}")
    private String apiKey;

    @Value("${crs.checkmarx.auth.url:https://us.iam.checkmarx.net/auth/realms/pwc-tax/protocol/openid-connect/token}")
    private String authUrl;

    @Value("${crs.checkmarx.api.url:https://us.ast.checkmarx.net/api}")
    private String apiUrl;

    @Value("${crs.checkmarx.polling.interval:5000}")
    private long pollingInterval;

    @Value("${crs.checkmarx.polling.retry:15}")
    private int pollingRetry;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    private String cachedToken;
    private long tokenSavedTime;

    private final Path tokenCachePath = Paths.get("checkmarx", "logs", "token.json");
    private final Path projectCachePath = Paths.get("checkmarx", "logs", "projects_cache.json");

    public com.crs_reivew_api.dto.VeracodeReportDTO getReport(String applicationName, String branchName, String tierValue) {
        try {
            System.out.println("Starting Checkmarx report retrieval for App: " + applicationName + ", Branch: " + branchName);
            
            // Bypass API if applicationName ends with .json
            if (applicationName != null && applicationName.toLowerCase().endsWith(".json")) {
                System.out.println("DEBUG: Loading report from checkmarx history file: " + applicationName);
                return loadHistoryFile(applicationName);
            }

            // 1. Get Token
            String token = getToken();

            // 2. Get Project ID
            String projectId = getProjectId(token, applicationName);
            if (projectId == null) {
                throw new RuntimeException("Error: Project ID not found for application: " + applicationName);
            }

            // 3. Get Last Scan ID
            String scanId = getLastScanId(token, projectId, branchName);
            if (scanId == null) {
                throw new RuntimeException("Error: Could not find a completed SAST scan for branch: " + branchName);
            }

            // 4. Request Report Generation
            String reportId = requestReportGeneration(token, projectId, branchName, scanId);
            if (reportId == null) {
                throw new RuntimeException("Error: Failed to request report generation.");
            }

            // 5. Poll and Download
            String downloadPath = pollAndDownloadReport(token, reportId, projectId, branchName);
            System.out.println("Success! Report downloaded to: " + downloadPath);
            
            com.crs_reivew_api.dto.VeracodeReportDTO dto = parseCheckmarxReport(Paths.get(downloadPath), tierValue, token, projectId, scanId);
            if (tierValue != null && !tierValue.isEmpty()) {
                dto.overview.tier = tierValue;
            }
            
            saveHistory(applicationName, dto);
            return dto;

        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Checkmarx error: " + e.getMessage(), e);
        }
    }

    private com.crs_reivew_api.dto.VeracodeReportDTO parseCheckmarxReport(Path filePath, String tierValue, String token, String projectId, String scanId) throws Exception {
        com.crs_reivew_api.dto.VeracodeReportDTO dto = new com.crs_reivew_api.dto.VeracodeReportDTO();
        dto.scaSafeVersionEnabled = veracodeConfig.isScaSafeVersionEnabled();
        JsonNode root = mapper.readTree(filePath.toFile());

        String tenantId = "";
        // 1. Overview
        JsonNode header = root.path("reportHeader");
        if (!header.isMissingNode()) {
            dto.overview.applicationName = header.path("projectName").asText();
            dto.overview.generationDate = header.path("scanDate").asText();
            tenantId = header.path("tenantId").asText();
        }
        
        dto.overview.scanType = "checkmarx";
        
        String resolvedScanId = null;
        JsonNode scanInformation = root.path("scanInformation");
        if (!scanInformation.isMissingNode() && scanInformation.hasNonNull("scanId")) {
            resolvedScanId = scanInformation.path("scanId").asText().trim();
        }
        if (resolvedScanId == null || resolvedScanId.isEmpty() || resolvedScanId.equals(projectId)) {
            resolvedScanId = scanId;
        }

        if (!scanInformation.isMissingNode()) {
            String viewerLink = scanInformation.path("viewerLink").asText();
            dto.overview.sandboxId = viewerLink;
            dto.overview.scanName = scanInformation.path("branch").asText();
        }
        
        // Mappings:
        // 1. Map scanId to buildId
        dto.overview.buildId = resolvedScanId;
        // 2. Map projectId to accountId
        dto.overview.accountId = projectId;
        // 3. Map tenantId to analysisId
        dto.overview.analysisId = tenantId;
        
        // appId mapped to projectId
        if (projectId != null) {
            dto.overview.appId = projectId;
        }

        // Initialize SAST counts
        dto.mitigationBreakdownSAST.put("Total", 0);
        dto.mitigationBreakdownSAST.put("Critical", 0);
        dto.mitigationBreakdownSAST.put("High", 0);
        dto.mitigationBreakdownSAST.put("Medium", 0);
        dto.mitigationBreakdownSAST.put("Low", 0);
        dto.mitigationBreakdownSAST.put("Information", 0);

        // Initialize SCA counts
        dto.mitigationBreakdownSCA.put("Total", 0);
        dto.mitigationBreakdownSCA.put("Critical", 0);
        dto.mitigationBreakdownSCA.put("High", 0);
        dto.mitigationBreakdownSCA.put("Medium", 0);
        dto.mitigationBreakdownSCA.put("Low", 0);
        dto.mitigationBreakdownSCA.put("Information", 0);

        JsonNode scannerOverview = root.path("scannerOverview");
        if (!scannerOverview.isMissingNode()) {
            JsonNode sastResults = scannerOverview.path("sastResults");
            if (!sastResults.isMissingNode() && sastResults.has("percentage")) {
                dto.overview.sastScore = sastResults.path("percentage").asInt();
            }
        }
        
        // 2. Parse language (architectures)w into architectures
        JsonNode languageOverview = root.path("languageOverview");
        if (languageOverview.isArray()) {
            for (JsonNode langNode : languageOverview) {
                String langName = langNode.path("languageName").asText();
                if (!langName.isEmpty()) {
                    dto.architectures.add(langName);
                }
            }
        }
        
        dto.scaEcosystems = String.join(",", dto.architectures);

        // 3. Parse scanResults
        JsonNode scanResults = root.path("scanResults");
        if (scanResults.isMissingNode()) {
             // Depending on checkmarx report format version, findings might just be an array
             scanResults = root;
        }
        
        JsonNode resultsList = scanResults.path("resultsList");
        if (resultsList.isMissingNode()) {
            resultsList = scanResults;
        }

        // Data structures for grouping sastSummary breakdown
        Map<String, Map<String, com.crs_reivew_api.dto.VeracodeReportDTO.CweFindingDTO>> sastBreakdownMap = new java.util.LinkedHashMap<>();
        int sastSummaryTotal = 0;
        int scaSummaryTotal = 0;

        int sastMitigationTotal = 0;
        int scaMitigationTotal = 0;

        if (resultsList.isArray()) {
            for (JsonNode resultNode : resultsList) {
                String type = resultNode.path("scannerName").asText("SAST"); // default to SAST if not specified
                String queryName = resultNode.path("queryName").asText(resultNode.path("vulnerabilityType").asText());
                String cweId = resultNode.path("cweId").asText();

                JsonNode vulnerabilities = resultNode.path("vulnerabilities");
                if (vulnerabilities.isArray()) {
                    for (JsonNode vuln : vulnerabilities) {
                        String state = vuln.path("state").asText();
                        // Ignore "Not Exploitable" completely
                        if ("Not Exploitable".equalsIgnoreCase(state)) {
                            continue;
                        }

                        String severityStr = vuln.path("severity").asText("Medium");
                        String firstFoundDate = vuln.path("firstFoundDate").asText();

                        // 1. Logic for sastSummary (All that are NOT 'Not Exploitable', i.e. To Verify & Proposed Not Exploitable)
                        if ("SAST".equalsIgnoreCase(type)) {
                            sastSummaryTotal++;
                            
                            sastBreakdownMap.putIfAbsent(severityStr, new java.util.LinkedHashMap<>());
                            Map<String, com.crs_reivew_api.dto.VeracodeReportDTO.CweFindingDTO> cweMap = sastBreakdownMap.get(severityStr);
                            
                            String cweKey = "CWE-" + cweId;
                            com.crs_reivew_api.dto.VeracodeReportDTO.CweFindingDTO cweDto = cweMap.get(cweKey);
                            if (cweDto == null) {
                                cweDto = new com.crs_reivew_api.dto.VeracodeReportDTO.CweFindingDTO();
                                cweDto.cwe = cweKey;
                                cweDto.categoryname = queryName;
                                cweDto.count = 0;
                                cweDto.date_first_occurrence = firstFoundDate;
                                cweDto.remediation_due_date = calculateDueDate(firstFoundDate, tierValue, severityStr);
                                cweMap.put(cweKey, cweDto);
                            }
                            cweDto.count++;
                            
                            // Note: remediation_due_date computed above
                        } else if ("SCA".equalsIgnoreCase(type)) {
                            scaSummaryTotal++;
                        }

                        // 2. Logic for Mitigation Proposal (ONLY Proposed Not Exploitable)
                        if ("Proposed Not Exploitable".equalsIgnoreCase(state)) {
                            com.crs_reivew_api.dto.VeracodeReportDTO.FindingDTO finding = new com.crs_reivew_api.dto.VeracodeReportDTO.FindingDTO();
                            finding.type = type;
                            finding.title = queryName;
                            finding.cweid = cweId;
                            finding.severity = severityStr;
                            finding.id = vuln.path("similarityId").asText(vuln.path("id").asText());
                            finding.location = vuln.path("sourceFileName").asText();
                            finding.fileName = finding.location;
                            finding.state = state;
                            finding.firstFoundDate = firstFoundDate;
                            finding.remediation_due_date = calculateDueDate(firstFoundDate, tierValue, severityStr);
                            
                            // Extract notes.comment to userComments
                            JsonNode notes = vuln.path("notes");
                            finding.userComments = new java.util.ArrayList<>();
                            if (notes.isArray()) {
                                for (JsonNode note : notes) {
                                    if (note.has("comment")) {
                                        finding.userComments.add(note.path("comment").asText());
                                    }
                                }
                            } else if (!notes.isMissingNode() && notes.has("comment")) {
                                finding.userComments.add(notes.path("comment").asText());
                            }

                            if ("SAST".equalsIgnoreCase(type)) {
                                sastMitigationTotal++;
                                dto.mitigationBreakdownSAST.put("Total", sastMitigationTotal);
                                dto.mitigationBreakdownSAST.put(severityStr, dto.mitigationBreakdownSAST.getOrDefault(severityStr, 0) + 1);
                                dto.findingsWithCommentsSAST.add(finding);
                            } else if ("SCA".equalsIgnoreCase(type)) {
                                scaMitigationTotal++;
                                dto.mitigationBreakdownSCA.put("Total", scaMitigationTotal);
                                dto.mitigationBreakdownSCA.put(severityStr, dto.mitigationBreakdownSCA.getOrDefault(severityStr, 0) + 1);
                                dto.findingsWithCommentsSCA.add(finding);
                            }
                        }
                    }
                }
            }
        }

        // Finalize sastSummary breakdown
        dto.sastSummary.vulnerabilities = sastSummaryTotal;
        for (Map.Entry<String, Map<String, com.crs_reivew_api.dto.VeracodeReportDTO.CweFindingDTO>> entry : sastBreakdownMap.entrySet()) {
            com.crs_reivew_api.dto.VeracodeReportDTO.SeverityBreakdownDTO sevBreakdown = new com.crs_reivew_api.dto.VeracodeReportDTO.SeverityBreakdownDTO();
            int sevTotal = 0;
            for (com.crs_reivew_api.dto.VeracodeReportDTO.CweFindingDTO cweDto : entry.getValue().values()) {
                sevBreakdown.findings.add(cweDto);
                sevTotal += cweDto.count;
            }
            sevBreakdown.total = sevTotal;
            dto.sastSummary.breakdown.put(entry.getKey(), sevBreakdown);
        }

        dto.scaSummary.vulnerabilities = scaSummaryTotal;

        // 4. Parse scaScanResults
        JsonNode scaScanResults = root.path("scaScanResults");
        int apiTotalPackages = -1;
        if (!scaScanResults.isMissingNode() && !scaScanResults.isNull()) {
            dto.scaSummary.vulnerabilities = scaScanResults.path("totalResults").asInt(0);
            
            // Fetch total packages using scan-summary API
            apiTotalPackages = getScaTotalPackages(token, scanId);
            if (apiTotalPackages >= 0) {
                dto.scaSummary.totalPackages = apiTotalPackages;
            }
            
            JsonNode sevBreakdownArray = scaScanResults.path("severitiesBreakdown");
            if (sevBreakdownArray.isArray()) {
                for (JsonNode sevNode : sevBreakdownArray) {
                    String level = sevNode.path("level").asText();
                    int value = sevNode.path("value").asInt(0);
                    if (value > 0) {
                        com.crs_reivew_api.dto.VeracodeReportDTO.SeverityBreakdownDTO sevBreakdown = new com.crs_reivew_api.dto.VeracodeReportDTO.SeverityBreakdownDTO();
                        sevBreakdown.total = value;
                        dto.scaSummary.breakdown.put(level, sevBreakdown);
                    }
                }
            }

            JsonNode packagesArray = scaScanResults.path("packages");
            if (packagesArray.isArray()) {
                int vulnerableCount = 0;
                for (JsonNode pkgNode : packagesArray) {
                    vulnerableCount++;
                    com.crs_reivew_api.dto.VeracodeReportDTO.ScaDetailDTO scaDetail = new com.crs_reivew_api.dto.VeracodeReportDTO.ScaDetailDTO();
                    scaDetail.packageName = pkgNode.path("packageName").asText();
                    scaDetail.version = pkgNode.path("packageVersion").asText();
                    
                    // Aggregate severities and CVEs
                    java.util.Map<String, Integer> sevCounts = new java.util.LinkedHashMap<>();
                    java.util.Set<String> uniqueCves = new java.util.LinkedHashSet<>();
                    JsonNode pkgCats = pkgNode.path("packageCategory");
                    String earliestDate = null;
                    
                    String packageId = pkgNode.path("packageId").asText();
                    String ecosystem = "";
                    if (packageId != null && packageId.contains("-")) {
                        ecosystem = packageId.split("-")[0];
                    }
                    
                    if (veracodeConfig.isScaSafeVersionEnabled() && !ecosystem.isEmpty()) {
                        String ghsaFix = fetchFixedVersionFromGitHub(scaDetail.packageName, ecosystem);
                        if (ghsaFix == null) {
                            scaDetail.safeVersion = veracodeConfig.getScaNoFixMessage();
                        } else if (isVersionLower(ghsaFix, scaDetail.version)) {
                            scaDetail.safeVersion = veracodeConfig.getScaStaleFixMessage();
                        } else {
                            scaDetail.safeVersion = ghsaFix;
                        }
                    }

                    if (pkgCats.isArray()) {
                        for (JsonNode catNode : pkgCats) {
                            JsonNode catResults = catNode.path("categoryResults");
                            if (catResults.isArray()) {
                                for (JsonNode resNode : catResults) {
                                    String cve = resNode.path("cve").asText();
                                    if (cve != null && !cve.isEmpty()) {
                                        uniqueCves.add(cve);
                                    }

                                    String severity = resNode.path("severity").asText();
                                    if (severity != null && !severity.isEmpty()) {
                                        sevCounts.put(severity, sevCounts.getOrDefault(severity, 0) + 1);
                                    }
                                    
                                    String date = resNode.path("firstDetectionDate").asText();
                                    if (earliestDate == null || date.compareTo(earliestDate) < 0) {
                                        earliestDate = date;
                                    }
                                    
                                    String state = resNode.path("state").asText();
                                    if ("Proposed Not Exploitable".equalsIgnoreCase(state)) {
                                        com.crs_reivew_api.dto.VeracodeReportDTO.FindingDTO finding = new com.crs_reivew_api.dto.VeracodeReportDTO.FindingDTO();
                                        finding.type = "SCA";
                                        finding.id = resNode.path("resultId").asText(); // resultId to id
                                        finding.title = cve; // cve to title
                                        finding.severity = severity; // severity to severity
                                        finding.location = pkgNode.path("packageId").asText(); // packageId TO location
                                        finding.fileName = finding.location;
                                        finding.cve_summary = resNode.path("description").asText(); // description TO cve_summary
                                        finding.state = state;
                                        finding.firstFoundDate = date;
                                        finding.remediation_due_date = calculateDueDate(date, tierValue, severity);
                                        finding.userComments = new java.util.ArrayList<>(); // Explicitly blank for SCA
                                        
                                        // Attempt to fetch comments from Risk Management API
                                        // populateScaComments(token, scaDetail.packageName, scaDetail.version, ecosystem, cve, finding);
                                        
                                        dto.findingsWithCommentsSCA.add(finding);
                                        
                                        dto.mitigationBreakdownSCA.put("Total", dto.mitigationBreakdownSCA.getOrDefault("Total", 0) + 1);
                                        dto.mitigationBreakdownSCA.put(severity, dto.mitigationBreakdownSCA.getOrDefault(severity, 0) + 1);
                                    }
                                }
                            }
                        }
                    }
                    
                    StringBuilder sevStr = new StringBuilder();
                    for (java.util.Map.Entry<String, Integer> entry : sevCounts.entrySet()) {
                        if (sevStr.length() > 0) sevStr.append(" ");
                        sevStr.append(entry.getKey()).append(": ").append(entry.getValue());
                    }
                    scaDetail.severityCounts = sevStr.toString();
                    scaDetail.cveList = String.join(",", uniqueCves);
                    scaDetail.firstFoundDate = earliestDate;
                    
                    // calculate remediation_due_date based on highest severity
                    String highestSev = "Low";
                    if (sevCounts.containsKey("Critical") || sevCounts.containsKey("VeryHigh") || sevCounts.containsKey("Very High")) highestSev = "High";
                    else if (sevCounts.containsKey("High")) highestSev = "High";
                    else if (sevCounts.containsKey("Medium")) highestSev = "Medium";
                    
                    scaDetail.remediation_due_date = calculateDueDate(earliestDate, tierValue, highestSev);
                    
                    dto.scaDetails.add(scaDetail);
                }
                dto.scaSummary.totalVulnerablePackages = vulnerableCount;
                if (apiTotalPackages < 0) {
                    dto.scaSummary.totalPackages = vulnerableCount; // Could differ if we had a non-vulnerable list
                }
            } else {
                dto.scaSummary.totalVulnerablePackages = 0;
                if (apiTotalPackages < 0) {
                    dto.scaSummary.totalPackages = 0;
                }
            }
        }

        // 5. Compute policyComplianceStatus
        JsonNode scanInformationNode = root.path("scanInformation");
        JsonNode policyActionNode = scanInformationNode.path("policyAction");
        if (!policyActionNode.isMissingNode() && !policyActionNode.asText().isEmpty()) {
            dto.overview.policyComplianceStatus = policyActionNode.asText();
        } else {
            boolean failed = false;
            String[] targetSeverities = {"Critical", "VeryHigh", "Very High", "High", "Medium"};
            
            for (String sev : targetSeverities) {
                if (dto.sastSummary.breakdown.containsKey(sev) && dto.sastSummary.breakdown.get(sev).total > 0) {
                    failed = true;
                    break;
                }
                if (dto.scaSummary.breakdown.containsKey(sev) && dto.scaSummary.breakdown.get(sev).total > 0) {
                    failed = true;
                    break;
                }
            }
            
            dto.overview.policyComplianceStatus = failed ? "Failed" : "Passed";
        }

        return dto;
    }

    private int getScaTotalPackages(String token, String scanId) {
        if (token == null || scanId == null || scanId.isEmpty()) {
            return -1;
        }
        try {
            String url = apiUrl + "/scan-summary?scan-ids=" + scanId;
            System.out.println("Fetching scan summary from Checkmarx: " + url);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + token)
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            String responseBody = response.body();

            // Save JSON to the logs folder
            try {
                Path logsDir = Paths.get("checkmarx", "logs");
                Files.createDirectories(logsDir);
                Files.writeString(logsDir.resolve("scansummary_" + scanId + ".json"), responseBody);
                System.out.println("Saved scan summary to: " + logsDir.resolve("scansummary_" + scanId + ".json").toAbsolutePath());
            } catch (Exception fileEx) {
                System.err.println("Warning: Failed to save scan-summary log file: " + fileEx.getMessage());
            }

            if (response.statusCode() == 200) {
                JsonNode root = mapper.readTree(responseBody);
                
                // Try to find scaPackagesCounters (with s) first, then scaPackagesCounter (without s)
                JsonNode counterNode = findJsonNode(root, "scaPackagesCounters");
                if (counterNode == null || counterNode.isMissingNode()) {
                    counterNode = findJsonNode(root, "scaPackagesCounter");
                }
                
                if (counterNode != null && !counterNode.isMissingNode() && counterNode.hasNonNull("totalCounter")) {
                    int total = counterNode.get("totalCounter").asInt(-1);
                    System.out.println("Successfully retrieved scaPackagesCounters/scaPackagesCounter totalCounter: " + total);
                    return total;
                } else {
                    System.err.println("Warning: scaPackagesCounters/scaPackagesCounter node or totalCounter was not found in scan-summary response.");
                }
            } else {
                System.err.println("Warning: Failed to fetch scan summary. HTTP " + response.statusCode() + ": " + responseBody);
            }
        } catch (Exception e) {
            System.err.println("Error fetching scan summary for packages count: " + e.getMessage());
            e.printStackTrace();
        }
        return -1;
    }

    private JsonNode findJsonNode(JsonNode root, String key) {
        if (root == null) return null;
        if (root.has(key)) return root.get(key);
        if (root.isArray()) {
            for (JsonNode child : root) {
                JsonNode res = findJsonNode(child, key);
                if (res != null) return res;
            }
        } else if (root.isObject()) {
            java.util.Iterator<JsonNode> elements = root.elements();
            while (elements.hasNext()) {
                JsonNode res = findJsonNode(elements.next(), key);
                if (res != null) return res;
            }
        }
        return null;
    }

    private String getToken() throws Exception {
        // In-memory cache check
        if (cachedToken != null && (System.currentTimeMillis() - tokenSavedTime) < 1500 * 1000) {
            return cachedToken;
        }

        // File cache check
        if (Files.exists(tokenCachePath)) {
            long lastModified = Files.getLastModifiedTime(tokenCachePath).toMillis();
            if ((System.currentTimeMillis() - lastModified) < 1500 * 1000) {
                JsonNode node = mapper.readTree(tokenCachePath.toFile());
                if (node.has("access_token")) {
                    this.cachedToken = node.get("access_token").asText();
                    this.tokenSavedTime = lastModified;
                    return this.cachedToken;
                }
            }
        }

        System.out.println("Fetching new Checkmarx Token...");
        String effectiveApiKey = apiKey;
        
        if (effectiveApiKey == null || effectiveApiKey.isEmpty()) {
            try {
                Path credPath = Paths.get(System.getProperty("user.home"), ".crs-tool", "credentials");
                if (Files.exists(credPath)) {
                    for (String line : Files.readAllLines(credPath)) {
                        String trimmed = line.trim();
                        if (trimmed.startsWith("crs.checkmarx.api.key")) {
                            effectiveApiKey = trimmed.substring(trimmed.indexOf("=") + 1).trim();
                            break;
                        }
                    }
                }
            } catch (Exception e) {
                System.err.println("Warning: Could not read credentials file: " + e.getMessage());
            }
        }

        if (effectiveApiKey == null || effectiveApiKey.isEmpty()) {
            throw new RuntimeException("Checkmarx API Key is not configured in application.properties or ~/.crs-tool/credentials");
        }

        String requestBody = "grant_type=refresh_token&client_id=ast-app&refresh_token=" + effectiveApiKey;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(authUrl))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new RuntimeException("Failed to get Checkmarx token: " + response.body());
        }

        JsonNode root = mapper.readTree(response.body());
        String token = root.get("access_token").asText();

        // Save to cache
        this.cachedToken = token;
        this.tokenSavedTime = System.currentTimeMillis();
        Files.createDirectories(tokenCachePath.getParent());
        Files.writeString(tokenCachePath, response.body());

        return token;
    }

    private String getProjectId(String token, String applicationName) throws Exception {
        // Fetch from cache if exists and < 1 day old
        Map<String, String> projectMap = new HashMap<>();
        boolean refreshNeeded = true;

        if (Files.exists(projectCachePath)) {
            long lastModified = Files.getLastModifiedTime(projectCachePath).toMillis();
            if ((System.currentTimeMillis() - lastModified) < 24 * 60 * 60 * 1000) {
                refreshNeeded = false;
                JsonNode root = mapper.readTree(projectCachePath.toFile());
                root.fields().forEachRemaining(entry -> projectMap.put(entry.getKey(), entry.getValue().asText()));
                if (projectMap.containsKey(applicationName)) {
                    return projectMap.get(applicationName);
                } else {
                    refreshNeeded = true; // cache miss, force refresh
                }
            }
        }

        if (refreshNeeded) {
            System.out.println("Fetching Checkmarx projects list...");
            int offset = 0;
            int limit = 100;
            boolean hasMore = true;

            while (hasMore && offset < 1000) { // arbitrary max to prevent infinite loops
                String url = apiUrl + "/projects?limit=" + limit + "&offset=" + offset;
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Authorization", "Bearer " + token)
                        .header("Accept", "application/json")
                        .GET()
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) {
                    throw new RuntimeException("Failed to fetch projects: " + response.body());
                }

                JsonNode root = mapper.readTree(response.body());
                JsonNode projects = root.path("projects");
                
                if (projects == null || projects.isMissingNode()) {
                    projects = root; // API might return an array directly, checkmarx /api/projects varies by version, usually it's an array or has 'projects'
                }
                
                if (projects.isArray() && projects.size() > 0) {
                    for (JsonNode proj : projects) {
                        String name = proj.path("name").asText();
                        String id = proj.path("id").asText();
                        projectMap.put(name, id);
                    }
                    offset += limit;
                } else {
                    hasMore = false;
                }
            }

            Files.createDirectories(projectCachePath.getParent());
            Files.writeString(projectCachePath, mapper.writeValueAsString(projectMap));
        }

        return projectMap.get(applicationName);
    }

    private String getLastScanId(String token, String projectId, String branchName) throws Exception {
        // Try project-ids as it's the standard Checkmarx One parameter (the .bat might have had a typo)
        String url = apiUrl + "/projects/last-scan?project-ids=" + projectId + "&branch=" + branchName + "&engine=sast&scan-status=Completed&limit=1";
        System.out.println("Fetching last scan: " + url);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/json")
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        String responseBody = response.body();
        // Save the raw response as requested by the user
        Files.createDirectories(Paths.get("checkmarx", "logs"));
        Files.writeString(Paths.get("checkmarx", "logs", "lastscan.json"), responseBody);
        
        if (response.statusCode() != 200) {
            throw new RuntimeException("Failed to get last scan: " + responseBody);
        }

        JsonNode root = mapper.readTree(responseBody);
        
        // The last-scan response is typically an object keyed by projectId
        // e.g. {"<project-id>": {"id": "<scan-id>", "status": "Completed", ...}}
        if (root.has(projectId)) {
            return root.get(projectId).path("id").asText();
        }

        // Fallbacks for other possible formats if the API changed
        if (root.isArray() && root.size() > 0) {
            return root.get(0).path("id").asText();
        } else if (root.has("id")) {
            return root.path("id").asText();
        } else if (root.has("scanId")) {
             return root.path("scanId").asText();
        }
        
        throw new RuntimeException("Could not find a valid scan for project " + projectId + ". Raw Response saved to checkmarx/logs/lastscan.json");
    }

    private String requestReportGeneration(String token, String projectId, String branchName, String scanId) throws Exception {
        String url = apiUrl + "/reports/v2";

        String jsonPayload = String.format(
            "{\n" +
            "  \"reportName\": \"improved-scan-report\",\n" +
            "  \"reportType\": \"cli\",\n" +
            "  \"fileFormat\": \"json\",\n" +
            "  \"reportFilename\": \"Cx_Report_%s_%s\",\n" +
            "  \"entities\": [\n" +
            "    {\n" +
            "      \"entity\": \"scan\",\n" +
            "      \"ids\": [\"%s\"]\n" +
            "    }\n" +
            "  ],\n" +
            "  \"filters\": {\n" +
            "    \"scanners\": [\"sast\",\"sca\"],\n" +
            "    \"severities\": [\"critical\",\"high\",\"medium\",\"low\",\"information\"],\n" +
            "    \"states\": [\"to-verify\",\"proposed-not-exploitable\"]\n" +
            "  }\n" +
            "}", projectId, branchName, scanId);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 300) {
            throw new RuntimeException("Failed to request report generation: " + response.body());
        }

        JsonNode root = mapper.readTree(response.body());
        return root.path("reportId").asText();
    }

    private String pollAndDownloadReport(String token, String reportId, String projectId, String branchName) throws Exception {
        String url = apiUrl + "/reports/" + reportId;
        String downloadUrl = null;
        String fileName = null;

        System.out.println("Polling report status...");
        int attempt = 0;
        while (attempt < pollingRetry) {
            attempt++;
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + token)
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new RuntimeException("Error polling report status: " + response.body());
            }

            JsonNode root = mapper.readTree(response.body());
            String status = root.path("status").asText();

            System.out.println("Report Status: " + status + " (Attempt " + attempt + "/" + pollingRetry + ")");
            if ("completed".equalsIgnoreCase(status)) {
                downloadUrl = root.path("url").asText();
                
                // Fallback: Check if it's nested or named differently, adjust if needed
                if (downloadUrl == null || downloadUrl.isEmpty() || "null".equals(downloadUrl)) {
                     // Checkmarx report status sometimes puts it in 'reportUrl'
                     downloadUrl = root.path("reportUrl").asText();
                }

                fileName = root.path("filename").asText();
                if (fileName == null || fileName.isEmpty() || "null".equals(fileName)) {
                    fileName = "Cx_Report_" + projectId + "_" + branchName + ".json";
                }
                break;
            } else if ("failed".equalsIgnoreCase(status)) {
                throw new RuntimeException("Report generation failed.");
            }

            Thread.sleep(pollingInterval);
        }

        if (downloadUrl == null || downloadUrl.isEmpty() || "null".equals(downloadUrl)) {
            throw new RuntimeException("Checkmarx report download timed out after " + pollingRetry + " attempts. Please update the configuration (polling interval or retry limit) and try again, or contact Checkmarx support.");
        }

        // Download the file
        System.out.println("Downloading report from: " + downloadUrl);
        Path targetDir = Paths.get("checkmarx", "logs");
        Files.createDirectories(targetDir);
        Path targetFile = targetDir.resolve(fileName);

        // Note: Sometimes Checkmarx requires the auth token to download the report file as well
        HttpRequest downloadRequest = HttpRequest.newBuilder()
                .uri(URI.create(downloadUrl))
                .header("Authorization", "Bearer " + token)
                .GET()
                .build();

        HttpResponse<Path> downloadResponse = httpClient.send(downloadRequest, HttpResponse.BodyHandlers.ofFile(targetFile));
        
        if (downloadResponse.statusCode() >= 300) {
            // fallback: download might not require auth
            HttpRequest downloadRequestNoAuth = HttpRequest.newBuilder()
                    .uri(URI.create(downloadUrl))
                    .GET()
                    .build();
            downloadResponse = httpClient.send(downloadRequestNoAuth, HttpResponse.BodyHandlers.ofFile(targetFile));
            if (downloadResponse.statusCode() >= 300) {
                throw new RuntimeException("Failed to download report. HTTP " + downloadResponse.statusCode());
            }
        }

        return targetFile.toAbsolutePath().toString();
    }

    private void populateScaComments(String token, String packageName, String packageVersion, String packageManager, String vulnerabilityId, com.crs_reivew_api.dto.VeracodeReportDTO.FindingDTO finding) {
        // Disabled: Checkmarx One does not support API retrieval of SCA comments
        if (true) return;
        try {
            String pm = packageManager.toLowerCase().trim();
            if (pm.equals("python")) {
                pm = "pip";
            }
            
            // Checkmarx One SCA Risk Instances query endpoint
            String url = apiUrl + "/sca/management-of-risk/risk-instances"
                    + "?packageName=" + java.net.URLEncoder.encode(packageName, java.nio.charset.StandardCharsets.UTF_8)
                    + "&packageVersion=" + java.net.URLEncoder.encode(packageVersion, java.nio.charset.StandardCharsets.UTF_8)
                    + "&packageManager=" + java.net.URLEncoder.encode(pm, java.nio.charset.StandardCharsets.UTF_8)
                    + "&vulnerabilityId=" + java.net.URLEncoder.encode(vulnerabilityId, java.nio.charset.StandardCharsets.UTF_8);
            
            System.out.println("====== CHECKMARX SCA COMMENTS DEBUG ======");
            System.out.println("Target URL: " + url);
            System.out.println("HTTP Method: GET");
            System.out.println("Headers: Authorization (Bearer token attached), Accept (application/json)");
            System.out.println("==========================================");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + token)
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            
            System.out.println("====== CHECKMARX SCA COMMENTS RESPONSE ======");
            System.out.println("Status Code: " + response.statusCode());
            System.out.println("Response Body: " + response.body());
            System.out.println("=============================================");

            if (response.statusCode() == 200) {
                JsonNode root = mapper.readTree(response.body());
                java.util.Set<String> uniqueComments = new java.util.LinkedHashSet<>();
                
                // Method 1: Dig out all "comment" fields in the response JSON tree recursively
                java.util.List<JsonNode> commentNodes = root.findValues("comment");
                for (JsonNode node : commentNodes) {
                    if (node.isTextual() && !node.asText().trim().isEmpty()) {
                        uniqueComments.add(node.asText().trim());
                    }
                }
                
                // Method 2: Traverse "comments" arrays recursively
                java.util.List<JsonNode> commentsNodes = root.findValues("comments");
                for (JsonNode commentsNode : commentsNodes) {
                    if (commentsNode.isArray()) {
                        for (JsonNode commentElement : commentsNode) {
                            if (commentElement.isTextual() && !commentElement.asText().trim().isEmpty()) {
                                uniqueComments.add(commentElement.asText().trim());
                            } else if (commentElement.hasNonNull("comment")) {
                                String cText = commentElement.get("comment").asText().trim();
                                if (!cText.isEmpty()) {
                                    uniqueComments.add(cText);
                                }
                            }
                        }
                    }
                }
                
                finding.userComments.addAll(uniqueComments);
            } else {
                System.err.println("Warning: Failed to fetch SCA comments for " + finding.id + ". HTTP " + response.statusCode() + ": " + response.body());
            }
        } catch (Exception e) {
            System.err.println("====== CHECKMARX SCA COMMENTS EXCEPTION ======");
            e.printStackTrace();
            System.err.println("==============================================");
        }
    }

    private String calculateDueDate(String dateStr, String tier, String severity) {
        if (dateStr == null || dateStr.isEmpty())
            return null;
        
        String effectiveTier = (tier == null || tier.isEmpty() || "N/A".equals(tier)) ? "tier-1" : tier;

        var gracePeriods = veracodeConfig.getGracePeriods();
        if (!gracePeriods.containsKey(effectiveTier))
            return null;

        String normalizedSeverity = severity != null ? severity.replace(" ", "") : "";
        if (normalizedSeverity.equalsIgnoreCase("Critical")) normalizedSeverity = "VeryHigh";

        Integer days = gracePeriods.get(effectiveTier).get(normalizedSeverity);
        if (days == null)
            return null;

        try {
            java.time.LocalDateTime ldt;
            if (dateStr.length() > 10) {
                // E.g. "2026-03-24 18:11:44 UTC" or "2026-03-24T18:11:44"
                String cleanDate = dateStr.replace(" UTC", "");
                if (cleanDate.contains("T")) {
                    try {
                        ldt = java.time.LocalDateTime.parse(cleanDate.substring(0, 19), java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                    } catch(Exception ex) {
                         ldt = java.time.LocalDateTime.parse(cleanDate, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                    }
                } else {
                    ldt = java.time.LocalDateTime.parse(cleanDate, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                }
            } else {
                ldt = java.time.LocalDate.parse(dateStr, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
            }

            return ldt.plusDays(days).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        } catch (Exception e) {
            return null;
        }
    }

    private void saveHistory(String applicationName, com.crs_reivew_api.dto.VeracodeReportDTO dto) {
        if (!veracodeConfig.isSaveJsonHistory()) return;
        try {
            Path historyDir = Paths.get("checkmarx", "history");
            Files.createDirectories(historyDir);
            
            String branchName = dto.overview.scanName != null ? dto.overview.scanName : "unknown_branch";
            String baseName = applicationName + "_" + branchName;
            String safeAppName = baseName.replaceAll("[^a-zA-Z0-9.-]", "_");
            
            String fileName;
            Path baseFile = historyDir.resolve(safeAppName + ".json");
            if (!Files.exists(baseFile)) {
                fileName = safeAppName + ".json";
            } else {
                int runningNumber = getNextRunningNumber(historyDir, safeAppName);
                fileName = String.format("%s_%02d.json", safeAppName, runningNumber);
            }
            
            Path historyFile = historyDir.resolve(fileName);
            Files.writeString(historyFile, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(dto));
        } catch (Exception e) {
            System.err.println("Warning: Failed to save Checkmarx history: " + e.getMessage());
        }
    }

    private int getNextRunningNumber(Path dir, String sanitizedAppName) {
        try {
            if (!Files.exists(dir))
                return 1;
            try (java.util.stream.Stream<Path> stream = Files.list(dir)) {
                return stream
                        .map(p -> p.getFileName().toString())
                        .filter(name -> name.startsWith(sanitizedAppName + "_") && name.endsWith(".json"))
                        .map(name -> {
                            try {
                                String numPart = name.substring(sanitizedAppName.length() + 1, name.lastIndexOf("."));
                                return Integer.parseInt(numPart);
                            } catch (Exception e) {
                                return 0;
                            }
                        })
                        .max(Integer::compare)
                        .orElse(0) + 1;
            }
        } catch (Exception e) {
            return 1;
        }
    }

    private com.crs_reivew_api.dto.VeracodeReportDTO loadHistoryFile(String fileName) {
        try {
            Path historyDir = Paths.get("checkmarx", "history").toAbsolutePath().normalize();
            Path targetFile = historyDir.resolve(fileName).toAbsolutePath().normalize();

            if (!targetFile.startsWith(historyDir)) {
                throw new IllegalArgumentException("Access Denied: Invalid history file path.");
            }

            if (!Files.exists(targetFile)) {
                throw new RuntimeException("History file not found: " + targetFile);
            }

            String json = Files.readString(targetFile);
            com.crs_reivew_api.dto.VeracodeReportDTO dto = mapper.readValue(json, com.crs_reivew_api.dto.VeracodeReportDTO.class);
            if (dto != null) {
                dto.scaSafeVersionEnabled = veracodeConfig.isScaSafeVersionEnabled();
            }
            
            // Fix buildId if it contains the projectId (appId) instead of the scanId
            if (dto != null && dto.overview != null && dto.overview.buildId != null && dto.overview.buildId.equals(dto.overview.appId)) {
                if (dto.overview.analysisId != null && !dto.overview.analysisId.isEmpty() && !dto.overview.analysisId.equals(dto.overview.appId)) {
                    dto.overview.buildId = dto.overview.analysisId;
                } else if (dto.overview.accountId != null && !dto.overview.accountId.isEmpty() && !dto.overview.accountId.equals(dto.overview.appId)) {
                    dto.overview.buildId = dto.overview.accountId;
                }
            }
            
            return dto;
        } catch (Exception e) {
            throw new RuntimeException("Failed to load history file " + fileName + ": " + e.getMessage(), e);
        }
    }

    private String fetchFixedVersionFromGitHub(String packageName, String ecosystem) {
        String token = veracodeConfig.getGithubToken();
        if (token == null || token.isEmpty()) {
            if (veracodeConfig.isScaSafeVersionEnabled()) {
                System.out.println(
                        "WARNING: SCA Safe Version is ENABLED but veracode.api.githubToken is NOT configured. Skipping remediation lookups.");
            }
            return null;
        }

        try {
            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();

            // Map to GitHub Ecosystems
            String ghEcosystem = switch (ecosystem.toLowerCase()) {
                case "maven" -> "MAVEN";
                case "npm" -> "NPM";
                case "pip", "pypi", "python" -> "PIP";
                case "go" -> "GO";
                case "nuget" -> "NUGET";
                case "rubygems", "gem" -> "RUBYGEMS";
                case "crates.io", "rust" -> "RUST";
                case "packagist", "php" -> "COMPOSER";
                default -> null;
            };

            if (ghEcosystem == null)
                return null;

            String query = "query { securityVulnerabilities(first: 1, package: \"" + packageName + "\", ecosystem: "
                    + ghEcosystem + ") { " +
                    "nodes { firstPatchedVersion { identifier } } } }";

            com.fasterxml.jackson.databind.node.ObjectNode rootNode = mapper.createObjectNode();
            rootNode.put("query", query);

            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(URI.create("https://api.github.com/graphql"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + token)
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(rootNode)))
                    .build();

            java.net.http.HttpResponse<String> response = client.send(request,
                    java.net.http.HttpResponse.BodyHandlers.ofString());

            if (veracodeConfig.isSaveScaLog()) {
                try {
                    java.nio.file.Path logDir = java.nio.file.Paths.get("checkmarx", "logs");
                    java.nio.file.Files.createDirectories(logDir);
                    String safeName = packageName.replaceAll("[^a-zA-Z0-9]", "_");
                    java.nio.file.Files.writeString(logDir.resolve("github_response_" + safeName + ".json"),
                            response.body());
                } catch (Exception e) {
                }
            }

            if (response.statusCode() == 200) {
                com.fasterxml.jackson.databind.JsonNode resRoot = mapper.readTree(response.body());
                com.fasterxml.jackson.databind.JsonNode nodes = resRoot.path("data").path("securityVulnerabilities")
                        .path("nodes");
                if (nodes.isArray() && nodes.size() > 0) {
                    String fixed = nodes.get(0).path("firstPatchedVersion").path("identifier").asText();
                    if (fixed != null && !fixed.isEmpty() && !fixed.equals("null")) {
                        return fixed;
                    }
                }
            } else {
                System.out.println("DEBUG: GitHub GraphQL failed with status " + response.statusCode() + ": " + response.body());
            }
        } catch (Exception e) {
            System.out.println("DEBUG: GitHub API call failed: " + e.getMessage());
        }
        return null;
    }

    private boolean isVersionLower(String v1, String v2) {
        if (v1 == null || v2 == null)
            return false;
        try {
            String[] parts1 = v1.replaceAll("[^0-9.]", "").split("\\.");
            String[] parts2 = v2.replaceAll("[^0-9.]", "").split("\\.");
            int length = Math.max(parts1.length, parts2.length);
            for (int i = 0; i < length; i++) {
                int p1 = i < parts1.length && !parts1[i].isEmpty() ? Integer.parseInt(parts1[i]) : 0;
                int p2 = i < parts2.length && !parts2[i].isEmpty() ? Integer.parseInt(parts2[i]) : 0;
                if (p1 < p2)
                    return true;
                if (p1 > p2)
                    return false;
            }
        } catch (Exception e) {
            return v1.compareTo(v2) < 0;
        }
        return false;
    }

    public String updatePredicate(String projectId, String scanId, String similarityIdList, String state, String comment, String severity) {
        try {
            if (scanId == null || scanId.isEmpty()) {
                throw new RuntimeException("scanId or buildId is required for Checkmarx mitigation update.");
            }

            String token = getToken();
            if (token == null) {
                throw new RuntimeException("Failed to obtain Checkmarx authentication token.");
            }

            // If severity was not supplied, lookup from history/logs
            String effectiveSeverity = severity;
            if (effectiveSeverity == null || effectiveSeverity.isEmpty()) {
                effectiveSeverity = findSeverityForSimilarityId(projectId, similarityIdList.split(",")[0]);
            }

            String mappedState = mapState(state);
            java.util.List<java.util.Map<String, Object>> predicateList = new java.util.ArrayList<>();

            for (String simId : similarityIdList.split(",")) {
                java.util.Map<String, Object> predicate = new java.util.HashMap<>();
                predicate.put("similarityId", simId.trim());
                predicate.put("scanId", scanId.trim());
                predicate.put("projectId", projectId);
                predicate.put("severity", effectiveSeverity.toUpperCase());
                predicate.put("state", mappedState);
                predicate.put("comment", comment != null ? comment : "");
                predicateList.add(predicate);
            }

            String requestBody = mapper.writeValueAsString(predicateList);
            String url = apiUrl + "/sast-results-predicates";

            System.out.println("====== CHECKMARX SAST PREDICATE API REQUEST ======");
            System.out.println("URL: " + url);
            System.out.println("Method: POST");
            System.out.println("Payload: " + requestBody);
            System.out.println("=============================================");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            System.out.println("====== CHECKMARX SAST PREDICATE API RESPONSE ======");
            System.out.println("Status: " + response.statusCode());
            System.out.println("Body: " + response.body());
            System.out.println("===============================================");

            if (response.statusCode() >= 300) {
                throw new RuntimeException("Checkmarx API error (HTTP " + response.statusCode() + "): " + response.body());
            }

            return response.body();
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to update Checkmarx predicate: " + e.getMessage(), e);
        }
    }

    public String updatePredicatesList(JsonNode arrayNode) {
        try {
            String token = getToken();
            if (token == null) {
                throw new RuntimeException("Failed to obtain Checkmarx authentication token.");
            }

            java.util.List<java.util.Map<String, Object>> predicateList = new java.util.ArrayList<>();
            for (JsonNode item : arrayNode) {
                String projectId = item.path("projectId").isMissingNode() ? item.path("appId").asText(null) : item.path("projectId").asText(null);
                String similarityId = item.path("similarityId").isMissingNode() ? item.path("flawIdList").asText(null) : item.path("similarityId").asText(null);
                String state = item.path("state").isMissingNode() ? item.path("action").asText(null) : item.path("state").asText(null);
                String comment = item.path("comment").asText("");
                String severity = item.path("severity").asText(null);

                String scanId = item.hasNonNull("scanId") ? item.get("scanId").asText() : item.path("buildId").asText(null);
                if (scanId == null || scanId.isEmpty()) {
                    throw new RuntimeException("scanId or buildId is required for each predicate item in Checkmarx mitigation update.");
                }

                // If similarityId is a comma-separated list of IDs, we split it!
                java.util.List<String> simIds = new java.util.ArrayList<>();
                if (similarityId != null && similarityId.contains(",")) {
                    for (String s : similarityId.split(",")) {
                        simIds.add(s.trim());
                    }
                } else if (similarityId != null) {
                    simIds.add(similarityId.trim());
                }

                for (String simId : simIds) {
                    String effectiveSeverity = severity;
                    if (effectiveSeverity == null || effectiveSeverity.isEmpty()) {
                        effectiveSeverity = findSeverityForSimilarityId(projectId, simId);
                    }
                    String mappedState = mapState(state);

                    java.util.Map<String, Object> predicate = new java.util.HashMap<>();
                    predicate.put("similarityId", simId);
                    predicate.put("scanId", scanId.trim());
                    predicate.put("projectId", projectId);
                    predicate.put("severity", effectiveSeverity.toUpperCase());
                    predicate.put("state", mappedState);
                    predicate.put("comment", comment);
                    predicateList.add(predicate);
                }
            }

            if (predicateList.isEmpty()) {
                throw new RuntimeException("No valid predicates found in the request array.");
            }

            String requestBody = mapper.writeValueAsString(predicateList);
            String url = apiUrl + "/sast-results-predicates";

            System.out.println("====== CHECKMARX SAST PREDICATES BATCH API REQUEST ======");
            System.out.println("URL: " + url);
            System.out.println("Method: POST");
            System.out.println("Payload: " + requestBody);
            System.out.println("=====================================================");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            System.out.println("====== CHECKMARX SAST PREDICATES BATCH API RESPONSE ======");
            System.out.println("Status: " + response.statusCode());
            System.out.println("Body: " + response.body());
            System.out.println("======================================================");

            if (response.statusCode() >= 300) {
                throw new RuntimeException("Checkmarx API error (HTTP " + response.statusCode() + "): " + response.body());
            }

            return response.body();
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to update Checkmarx predicates: " + e.getMessage(), e);
        }
    }

    private String mapState(String state) {
        if (state != null) {
            String lowerState = state.trim().toLowerCase();
            if (lowerState.equals("accepted") || lowerState.equals("approve") || lowerState.equals("approved") || lowerState.equals("accept")) {
                return "NOT_EXPLOITABLE";
            } else if (lowerState.equals("rejected") || lowerState.equals("reject") || lowerState.equals("to_verify")) {
                return "TO_VERIFY";
            } else {
                return state.toUpperCase();
            }
        }
        return "NOT_EXPLOITABLE"; // default fallback
    }

    public String findSeverityForSimilarityId(String projectId, String similarityId) {
        try {
            // 1. Search checkmarx/logs folder
            Path logDir = Paths.get("checkmarx", "logs");
            if (Files.exists(logDir)) {
                try (java.util.stream.Stream<Path> stream = Files.list(logDir)) {
                    java.util.List<Path> candidateFiles = stream
                        .filter(p -> p.getFileName().toString().startsWith("Cx_Report_" + projectId + "_") && p.getFileName().toString().endsWith(".json"))
                        .collect(java.util.stream.Collectors.toList());
                    
                    for (Path file : candidateFiles) {
                        try {
                            JsonNode root = mapper.readTree(file.toFile());
                            JsonNode resultsList = root.path("scanResults").path("resultsList");
                            if (resultsList.isMissingNode()) {
                                resultsList = root.path("resultsList");
                            }
                            if (resultsList.isMissingNode()) {
                                resultsList = root;
                            }
                            if (resultsList.isArray()) {
                                for (JsonNode resultNode : resultsList) {
                                    JsonNode vulnerabilities = resultNode.path("vulnerabilities");
                                    if (vulnerabilities.isArray()) {
                                        for (JsonNode vuln : vulnerabilities) {
                                            String simId = vuln.path("similarityId").asText(vuln.path("id").asText());
                                            if (similarityId.equals(simId)) {
                                                String severity = vuln.path("severity").asText();
                                                if (severity != null && !severity.isEmpty()) {
                                                    return severity.toUpperCase();
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            // Check SCA packages/results
                            JsonNode scaScanResults = root.path("scaScanResults");
                            if (!scaScanResults.isMissingNode() && !scaScanResults.isNull()) {
                                JsonNode packagesArray = scaScanResults.path("packages");
                                if (packagesArray.isArray()) {
                                    for (JsonNode pkgNode : packagesArray) {
                                        JsonNode pkgCats = pkgNode.path("packageCategory");
                                        if (pkgCats.isArray()) {
                                            for (JsonNode catNode : pkgCats) {
                                                JsonNode catResults = catNode.path("categoryResults");
                                                if (catResults.isArray()) {
                                                    for (JsonNode resNode : catResults) {
                                                        String resultId = resNode.path("resultId").asText();
                                                        if (similarityId.equals(resultId)) {
                                                            String severity = resNode.path("severity").asText();
                                                            if (severity != null && !severity.isEmpty()) {
                                                                return severity.toUpperCase();
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (Exception ex) {
                            // ignore and try next file
                        }
                    }
                }
            }

            // 2. Search checkmarx/history folder
            Path historyDir = Paths.get("checkmarx", "history");
            if (Files.exists(historyDir)) {
                try (java.util.stream.Stream<Path> stream = Files.list(historyDir)) {
                    java.util.List<Path> candidateFiles = stream
                        .filter(p -> p.getFileName().toString().startsWith(projectId + "_") || p.getFileName().toString().contains(projectId))
                        .collect(java.util.stream.Collectors.toList());
                    
                    if (candidateFiles.isEmpty()) {
                        try (java.util.stream.Stream<Path> s2 = Files.list(historyDir)) {
                            candidateFiles = s2.filter(p -> p.getFileName().toString().endsWith(".json")).collect(java.util.stream.Collectors.toList());
                        }
                    }

                    for (Path file : candidateFiles) {
                        try {
                            JsonNode root = mapper.readTree(file.toFile());
                            JsonNode sastFindings = root.path("findingsWithCommentsSAST");
                            if (sastFindings.isArray()) {
                                for (JsonNode f : sastFindings) {
                                    String id = f.path("id").asText();
                                    if (similarityId.equals(id)) {
                                        String severity = f.path("severity").asText();
                                        if (severity != null && !severity.isEmpty()) {
                                            return severity.toUpperCase();
                                        }
                                    }
                                }
                            }
                            JsonNode scaFindings = root.path("findingsWithCommentsSCA");
                            if (scaFindings.isArray()) {
                                for (JsonNode f : scaFindings) {
                                    String id = f.path("id").asText();
                                    if (similarityId.equals(id)) {
                                        String severity = f.path("severity").asText();
                                        if (severity != null && !severity.isEmpty()) {
                                            return severity.toUpperCase();
                                        }
                                    }
                                }
                            }
                        } catch (Exception ex) {
                            // ignore and try next file
                        }
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "HIGH"; // default fallback if not found
    }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public String getAuthUrl() { return authUrl; }
    public void setAuthUrl(String authUrl) { this.authUrl = authUrl; }

    public String getApiUrl() { return apiUrl; }
    public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }

    public long getPollingInterval() { return pollingInterval; }
    public void setPollingInterval(long pollingInterval) { this.pollingInterval = pollingInterval; }

    public int getPollingRetry() { return pollingRetry; }
    public void setPollingRetry(int pollingRetry) { this.pollingRetry = pollingRetry; }
}

