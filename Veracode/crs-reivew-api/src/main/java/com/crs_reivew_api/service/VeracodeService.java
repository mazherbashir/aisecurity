package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.VeracodeReportDTO;
import com.crs_reivew_api.model.veracode.*;
import com.veracode.apiwrapper.wrappers.ResultsAPIWrapper;
import com.veracode.apiwrapper.wrappers.UploadAPIWrapper;
import com.veracode.apiwrapper.wrappers.MitigationAPIWrapper;
import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Unmarshaller;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.*;
import java.util.stream.Collectors;

import com.crs_reivew_api.util.VeracodeException;

@Service
public class VeracodeService {

    @Autowired
    private VeracodeConfig veracodeConfig;

    public String getAppId(String appName) {
        if (appName != null) appName = appName.trim();
        try {
            Map<String, String> appMap = getApplicationsMap();
            
            if (appMap.containsKey(appName)) {
                return appMap.get(appName);
            }
            
            // Fuzzy match if not found
            List<String> suggestions = findBestMatches(appName, appMap.keySet());
            throw new VeracodeException("Application '" + appName + "' not found.", "INVALID_APP", suggestions);
            
        } catch (VeracodeException ve) {
            throw ve;
        } catch (Exception e) {
            throw new VeracodeException("Failed to get App ID: " + e.getMessage(), "SYSTEM_ERROR");
        }
    }

    private Map<String, String> getApplicationsMap() throws Exception {
        java.nio.file.Path cachePath = java.nio.file.Paths.get("veracode", "history", "applications.json");
        boolean shouldRefresh = true;

        if (java.nio.file.Files.exists(cachePath)) {
            long lastModified = java.nio.file.Files.getLastModifiedTime(cachePath).toMillis();
            long thirtyDaysMillis = 30L * 24 * 60 * 60 * 1000;
            if (System.currentTimeMillis() - lastModified < thirtyDaysMillis) {
                shouldRefresh = false;
            }
        }

        if (!shouldRefresh) {
            try {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                return mapper.readValue(cachePath.toFile(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {});
            } catch (Exception e) {
                debugLog("DEBUG: Error reading application cache, refreshing: " + e.getMessage());
            }
        }

        // Fetch from API
        try {
            UploadAPIWrapper uploadWrapper = new UploadAPIWrapper();
            setupCredentials(uploadWrapper);
            String xml = uploadWrapper.getAppList();
            
            if (xml == null || xml.contains("<error>")) {
                throw new VeracodeException("Veracode API returned an error: " + xml, "SYSTEM_ERROR");
            }
            
            saveXmlToLog("app_list", "all", xml);

            Map<String, String> appMap = new HashMap<>();
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new InputSource(new StringReader(xml)));
            var nodes = doc.getElementsByTagName("app");
            for (int i = 0; i < nodes.getLength(); i++) {
                var node = nodes.item(i);
                String name = node.getAttributes().getNamedItem("app_name").getNodeValue();
                String id = node.getAttributes().getNamedItem("app_id").getNodeValue();
                appMap.put(name, id);
            }

            // Save to cache
            java.nio.file.Files.createDirectories(cachePath.getParent());
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.enable(com.fasterxml.jackson.databind.SerializationFeature.INDENT_OUTPUT);
            mapper.writeValue(cachePath.toFile(), appMap);
            
            return appMap;
        } catch (Exception e) {
            if (e instanceof VeracodeException) throw e;
            throw new VeracodeException("Veracode API is currently unavailable: " + e.getMessage(), "SYSTEM_ERROR");
        }
    }

    private List<String> findBestMatches(String input, Set<String> names) {
        String lowerInput = input.toLowerCase();
        
        return names.stream()
            .map(name -> {
                int score = calculateSimilarityScore(lowerInput, name.toLowerCase());
                return new AbstractMap.SimpleEntry<>(name, score);
            })
            .filter(entry -> entry.getValue() > 0)
            .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
            .limit(5)
            .map(Map.Entry::getKey)
            .collect(Collectors.toList());
    }

    private int calculateSimilarityScore(String input, String target) {
        if (input.equals(target)) return 1000;
        
        // Priority 1: One starts with the other
        if (target.startsWith(input) || input.startsWith(target)) {
            return 800 + Math.min(input.length(), target.length());
        }
        
        // Priority 2: One contains the other
        if (target.contains(input) || input.contains(target)) {
            return 600 + Math.min(input.length(), target.length());
        }
        
        // Priority 3: Shared prefix length
        int commonPrefix = 0;
        for (int i = 0; i < Math.min(input.length(), target.length()); i++) {
            if (input.charAt(i) == target.charAt(i)) commonPrefix++;
            else break;
        }
        
        if (commonPrefix >= 5) {
            return 400 + commonPrefix;
        }
        
        return 0;
    }

    public String getLatestBuildId(String appId) {
        try {
            UploadAPIWrapper uploadWrapper = new UploadAPIWrapper();
            setupCredentials(uploadWrapper);
            String xml = uploadWrapper.getBuildList(appId);
            saveXmlToLog("build_list", appId, xml);
            debugLog("[" + java.time.LocalDateTime.now() + "] Raw Build List for App ID " + appId + ": " + xml);
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new InputSource(new StringReader(xml)));
            var nodes = doc.getElementsByTagName("build");
            if (nodes.getLength() > 0) {
                return nodes.item(nodes.getLength() - 1).getAttributes().getNamedItem("build_id").getNodeValue();
            }
            throw new RuntimeException("No builds found for app " + appId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to get Build ID", e);
        }
    }

    public VeracodeReport getDetailedReportObject(String buildId) {
        try {
            ResultsAPIWrapper resultsWrapper = new ResultsAPIWrapper();
            setupCredentials(resultsWrapper);
            String xml = resultsWrapper.detailedReport(buildId);
            
            // Save to log file for analysis
            saveXmlToLog("detailed_report", buildId, xml);

            debugLog("[" + java.time.LocalDateTime.now() + "] Detailed Report Snippet: " + (xml.length() > 500 ? xml.substring(0, 500) : xml));
            JAXBContext context = JAXBContext.newInstance(VeracodeReport.class);
            Unmarshaller unmarshaller = context.createUnmarshaller();
            return (VeracodeReport) unmarshaller.unmarshal(new StringReader(xml));
        } catch (Exception e) {
            throw new RuntimeException("Failed to get report object", e);
        }
    }

    private void saveXmlToLog(String prefix, String id, String xml) {
        if (!veracodeConfig.isSaveXmlLogs()) return;
        try {
            String timestamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            java.nio.file.Path logDir = java.nio.file.Paths.get("veracode", "logs");
            java.nio.file.Files.createDirectories(logDir);
            
            String fileName = String.format("%s_%s_%s.xml", prefix, id, timestamp);
            java.nio.file.Files.writeString(logDir.resolve(fileName), xml);
            debugLog("DEBUG: Saved XML log to: " + logDir.resolve(fileName));
        } catch (Exception e) {
            System.err.println("Warning: Could not save XML log: " + e.getMessage());
        }
    }

    private void debugLog(String message) {
        if (veracodeConfig.isDebug()) {
            System.out.println(message);
        }
    }

    public String updateMitigation(String buildId, String flawIdList, String action, String comment) {
        // Map UI actions to Veracode expected actions
        String mappedAction = action;
        if (action != null) {
            String lowerAction = action.trim().toLowerCase();
            if (lowerAction.equals("accept") || lowerAction.equals("approve")) {
                mappedAction = "accepted";
            } else if (lowerAction.equals("reject")) {
                mappedAction = "rejected";
            }
        }

        String mode = veracodeConfig.getMitigationProposalEnabled();
        
        if ("false".equalsIgnoreCase(mode)) {
            throw new RuntimeException("Mitigation Configuration is disabled. Please enabled it if you want to send the equest to Veracode");
        }

        if ("debug".equalsIgnoreCase(mode)) {
            debugLog("DEBUG: Mitigation Proposal Bypass (Debug Mode). Build: " + buildId + ", Action: " + mappedAction);
            return "Success (Debug Mode - Request Bypassed)";
        }

        StringBuilder debugInfo = new StringBuilder();
        debugInfo.append("====== VERACODE API REQUEST ======\n");
        debugInfo.append("Endpoint URL: https://analysiscenter.veracode.com/api/5.0/updatemitigationinfo.do\n");
        debugInfo.append("HTTP Method: POST\n");
        debugInfo.append("Content-Type: application/x-www-form-urlencoded\n");
        debugInfo.append("Parameters Sent:\n");
        debugInfo.append("  build_id: ").append(buildId).append("\n");
        debugInfo.append("  action: ").append(mappedAction).append("\n");
        debugInfo.append("  flaw_id_list: ").append(flawIdList).append("\n");
        debugInfo.append("  comment: ").append(comment).append("\n");
        debugInfo.append("==================================\n");

        System.out.println(debugInfo.toString());

        try {
            MitigationAPIWrapper mitigationWrapper = new MitigationAPIWrapper();
            setupCredentials(mitigationWrapper);
            
            String xml = mitigationWrapper.updateMitigationInfo(buildId, flawIdList, mappedAction, comment);
            
            debugInfo.append("====== VERACODE API RESPONSE ======\n");
            debugInfo.append(xml).append("\n");
            debugInfo.append("===================================\n");
            
            System.out.println("====== VERACODE API RESPONSE ======");
            System.out.println(xml);
            System.out.println("===================================");
            
            saveDebugLog(debugInfo.toString());
            
            if (xml.contains("<error>")) {
                throw new RuntimeException("Veracode API Error: " + xml);
            }
            
            return xml;
        } catch (Exception e) {
            debugInfo.append("====== VERACODE API EXCEPTION ======\n");
            debugInfo.append(e.toString()).append("\n");
            for (StackTraceElement element : e.getStackTrace()) {
                debugInfo.append("\t").append(element.toString()).append("\n");
            }
            debugInfo.append("====================================\n");
            
            System.err.println("====== VERACODE API EXCEPTION ======");
            e.printStackTrace();
            System.err.println("====================================");
            
            saveDebugLog(debugInfo.toString());
            
            throw new RuntimeException("Failed to update mitigation: " + e.getMessage(), e);
        }
    }

    private void setupCredentials(Object wrapper) {
        String id = veracodeConfig.getKey().getId();
        String secret = veracodeConfig.getKey().getSecret();

        if (id == null || id.isEmpty() || secret == null || secret.isEmpty()) {
            try {
                String home = System.getProperty("user.home");
                java.nio.file.Path credPath = java.nio.file.Paths.get(home, ".veracode", "credentials");
                if (java.nio.file.Files.exists(credPath)) {
                    List<String> lines = java.nio.file.Files.readAllLines(credPath);
                    for (String line : lines) {
                        String trimmed = line.trim();
                        if (trimmed.startsWith("veracode_api_key_id")) {
                            id = trimmed.split("=")[1].trim();
                        } else if (trimmed.startsWith("veracode_api_key_secret")) {
                            secret = trimmed.split("=")[1].trim();
                        }
                    }
                }
            } catch (Exception e) {
                if (veracodeConfig.isDebug()) {
                    System.err.println("DEBUG: Error reading Veracode credentials file: " + e.getMessage());
                }
            }
        }

        if (id == null || id.isEmpty() || secret == null || secret.isEmpty()) {
            throw new RuntimeException("CRITICAL: Veracode credentials not found. Please ensure 'veracode_api_key_id' and 'veracode_api_key_secret' are set in application.properties or your local ~/.veracode/credentials file.");
        }

        try {
            if (wrapper instanceof UploadAPIWrapper) {
                ((UploadAPIWrapper) wrapper).setUpApiCredentials(id, secret);
            } else if (wrapper instanceof ResultsAPIWrapper) {
                ((ResultsAPIWrapper) wrapper).setUpApiCredentials(id, secret);
            } else if (wrapper instanceof MitigationAPIWrapper) {
                ((MitigationAPIWrapper) wrapper).setUpApiCredentials(id, secret);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to set up API credentials using provided keys", e);
        }
    }

    private void saveDebugLog(String content) {
        try {
            String timestamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            java.nio.file.Path logDir = java.nio.file.Paths.get("veracode", "logs");
            java.nio.file.Files.createDirectories(logDir);
            String fileName = String.format("mitigation_debug_%s.txt", timestamp);
            java.nio.file.Files.writeString(logDir.resolve(fileName), content);
            System.out.println("Saved detailed mitigation debug info to: " + logDir.resolve(fileName).toAbsolutePath());
        } catch (Exception e) {
            System.err.println("Warning: Could not save debug log: " + e.getMessage());
        }
    }

    public VeracodeReportDTO getFinalReport(String applicationName, String appId, String buildId, boolean includeBuildInfo) {
        if (applicationName != null) applicationName = applicationName.trim();
        
        // Load from history if filename is provided
        if (applicationName != null && applicationName.toLowerCase().endsWith(".json")) {
            debugLog("DEBUG: Loading report from history file: " + applicationName);
            return loadHistoryFile(applicationName);
        }
        
        String effectiveAppId = (appId != null && !appId.isEmpty()) ? appId : getAppId(applicationName);
        String effectiveBuildId = (buildId != null && !buildId.isEmpty()) ? buildId : getLatestBuildId(effectiveAppId);
        
        VeracodeReport report = getDetailedReportObject(effectiveBuildId);
        
        VeracodeReportDTO dto = new VeracodeReportDTO();
        
        // Initialize Mitigation Breakdowns
        dto.mitigationBreakdownSAST.put("Total", 0);
        dto.mitigationBreakdownSAST.put("High", 0);
        dto.mitigationBreakdownSAST.put("Medium", 0);
        dto.mitigationBreakdownSAST.put("Low", 0);
        dto.mitigationBreakdownSAST.put("Information", 0);

        dto.mitigationBreakdownSCA.put("Total", 0);
        dto.mitigationBreakdownSCA.put("Very High", 0);
        dto.mitigationBreakdownSCA.put("High", 0);
        dto.mitigationBreakdownSCA.put("Medium", 0);
        dto.mitigationBreakdownSCA.put("Low", 0);
        
        // Map Overview
        dto.overview.applicationName = report.getAppName();
        dto.overview.appId = report.getAppId();
        dto.overview.accountId = report.getAccountId();
        dto.overview.buildId = report.getBuildId();
        dto.overview.analysisId = report.getAnalysisId();
        dto.overview.scanName = report.getScanName();
        dto.overview.generationDate = report.getGenerationDate();
        dto.overview.policyName = report.getPolicyName();
        dto.overview.policyComplianceStatus = report.getPolicyComplianceStatus();
        dto.overview.sandboxId = report.getSandboxId();
        dto.overview.tier = calculateTier(report.getPolicyName());

        dto.overview.staticAnalysisUnitId = report.getStaticAnalysisUnitId();
        if (report.getStaticAnalysis() != null) {
            dto.overview.sastScore = report.getStaticAnalysis().getScore();
            dto.overview.sastRating = report.getStaticAnalysis().getRating();
            if (dto.overview.staticAnalysisUnitId == null) {
                dto.overview.staticAnalysisUnitId = report.getStaticAnalysis().getStaticAnalysisUnitId();
            }
        }

        // Conditionally Fetch Build Info
        if (includeBuildInfo) {
            try {
                dto.buildInfo = getBuildInfo(effectiveBuildId);
            } catch (Exception e) {
                System.err.println("Warning: Could not fetch build info: " + e.getMessage());
            }
        }

        // Find Modules using robust DOM parsing (bypasses JAXB namespace issues)
        try {
            // 1. Get Selected Modules and Architectures from Detailed Report XML
                String detailedXml = getRawDetailedReport(effectiveBuildId);
                populateModulesAndArchitectures(detailedXml, dto);
                
                // NEW: Populate breakdown and findings using the same XML
                generateDetailedBreakdown(detailedXml, report, dto);
                
                debugLog("DEBUG: DOM processed detailed report for breakdown and modules.");

            // 2. Get Unselected Modules from Prescan Results XML (KEEP FILTERS HERE)
            PrescanResults prescan = getPreScanResults(effectiveAppId, effectiveBuildId);
            if (prescan != null && prescan.getModules() != null) {
                debugLog("DEBUG: Processing " + prescan.getModules().size() + " modules from prescan.");
                int prescanPythonCount = 0;
                int prescanJsCount = 0;
                
                for (PrescanModule m : prescan.getModules()) {
                    String moduleName = m.getName();
                    String finalFileName = m.getFileName();
                    if (moduleName == null) continue;

                    // Handle Generic Modules separately via balancing logic later
                    if (moduleName.equalsIgnoreCase("Python Files")) {
                        prescanPythonCount++;
                        continue;
                    }
                    if (moduleName.equalsIgnoreCase("JS Files") || moduleName.equalsIgnoreCase("JavaScript Files")) {
                        prescanJsCount++;
                        continue;
                    }
                    
                    // Filter: Skip if explicitly a dependency (unless it's a jar/zip) or has fatal errors
                    if (m.hasFatalErrors()) {
                        debugLog("DEBUG: Skipping unselected module (Fatal Errors): " + moduleName);
                        continue;
                    }
                    if (m.isDependency() && !moduleName.toLowerCase().endsWith(".zip") && !moduleName.toLowerCase().endsWith(".jar") &&
                        (finalFileName == null || (!finalFileName.toLowerCase().endsWith(".zip") && !finalFileName.toLowerCase().endsWith(".jar")))) {
                        debugLog("DEBUG: Skipping unselected module (Dependency): " + moduleName);
                        continue;
                    }

                    // CHECK: Is this specific module already selected?
                    boolean isAlreadySelected = dto.selectedModules.stream()
                        .anyMatch(selected -> {
                            String selLower = selected.toLowerCase();
                            String modLower = moduleName.toLowerCase();
                            String fileLower = (finalFileName != null) ? finalFileName.toLowerCase() : null;

                            boolean nameMatch = selLower.equals(modLower);
                            boolean fileMatch = (fileLower != null && selLower.equals(fileLower));
                            boolean nameInside = selLower.contains(modLower);
                            boolean fileInside = (fileLower != null && selLower.contains(fileLower));
                            
                            // Handles "Go files within 936599.zip" matching "936599.zip"
                            boolean selectedInsideName = modLower.contains(selLower);
                            boolean selectedInsideFile = (fileLower != null && fileLower.contains(selLower));

                            return nameMatch || fileMatch || nameInside || fileInside || selectedInsideName || selectedInsideFile;
                        });

                    if (isAlreadySelected) {
                        debugLog("DEBUG: Skipping unselected module (Already Selected): " + moduleName);
                        continue;
                    }

                    String displayName = (finalFileName != null && !finalFileName.isEmpty()) ? finalFileName : moduleName;
                    
                    boolean isExplicitInclude = veracodeConfig.getIncludeModules() != null && veracodeConfig.getIncludeModules().stream()
                        .anyMatch(inc -> displayName.toLowerCase().contains(inc.toLowerCase()));

                    boolean hasSelectedMatch = dto.selectedModules.stream()
                        .anyMatch(selected -> {
                            String s = selected.toLowerCase();
                            String d = displayName.toLowerCase();
                            // Exact prefix/suffix match
                            if (d.startsWith(s) || d.endsWith(s)) return true;
                            
                            // Fuzzy prefix match: check if both start with the same 6 characters
                            if (s.length() >= 6 && d.length() >= 6) {
                                String sPrefix = s.substring(0, 6);
                                String dPrefix = d.substring(0, 6);
                                if (sPrefix.equals(dPrefix)) return true;
                            }
                            return false;
                        });

                    // Rule: Include only if explicitly in include-modules OR if prefix/suffix matches a selected module
                    if (isExplicitInclude || hasSelectedMatch) {
                        boolean isIgnored = veracodeConfig.getIgnoreModules().stream()
                            .anyMatch(ignore -> displayName.toLowerCase().contains(ignore.toLowerCase()));
                        
                        if (!isIgnored) {
                            if (!dto.unselectedModules.contains(displayName)) {
                                dto.unselectedModules.add(displayName);
                            }
                        } else {
                            debugLog("DEBUG: Skipping unselected module (Ignored via blacklist): " + displayName);
                        }
                    } else {
                        debugLog("DEBUG: Skipping unselected module (Not in inclusion list): " + displayName);
                    }
                }

                // Apply Balancing Logic for Python
                long selectedPythonCount = dto.selectedModules.stream()
                    .filter(s -> s.toLowerCase().startsWith("python files within") || s.toLowerCase().startsWith("python files"))
                    .count();
                int missingPython = prescanPythonCount - (int)selectedPythonCount;
                for (int i = 0; i < missingPython; i++) {
                    if (!dto.unselectedModules.contains("Python Files")) {
                        dto.unselectedModules.add("Python Files");
                    }
                }
                if (missingPython > 0) debugLog("DEBUG: Added " + missingPython + " unselected Python Files via balancing logic.");

                // Apply Balancing Logic for JS
                long selectedJsCount = dto.selectedModules.stream()
                    .filter(s -> s.toLowerCase().startsWith("js files within") || s.toLowerCase().startsWith("javascript files within"))
                    .count();
                int missingJs = prescanJsCount - (int)selectedJsCount;
                for (int i = 0; i < missingJs; i++) {
                    if (!dto.unselectedModules.contains("JS Files")) {
                        dto.unselectedModules.add("JS Files");
                    }
                }
                if (missingJs > 0) debugLog("DEBUG: Added " + missingJs + " unselected JS Files via balancing logic.");
            }
        } catch (Exception e) {
            System.err.println("Warning: Could not perform gap analysis: " + e.getMessage());
            e.printStackTrace();
        }

        // Mapping is now handled by generateDetailedBreakdown
        saveJsonToLog(dto.overview.applicationName, dto);
        return dto;
    }

    private void saveJsonToLog(String appName, Object dto) {
        if (!veracodeConfig.isSaveJsonHistory()) return;
        try {
            String sanitizedAppName = appName != null ? appName.replaceAll("[^a-zA-Z0-9]", "_") : "Unknown";
            
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.enable(com.fasterxml.jackson.databind.SerializationFeature.INDENT_OUTPUT);
            String json = mapper.writeValueAsString(dto);
            
            java.nio.file.Path historyDir = java.nio.file.Paths.get("veracode", "history");
            java.nio.file.Files.createDirectories(historyDir);
            
            String fileName;
            java.nio.file.Path baseFile = historyDir.resolve(sanitizedAppName + ".json");
            if (!java.nio.file.Files.exists(baseFile)) {
                fileName = sanitizedAppName + ".json";
            } else {
                int runningNumber = getNextRunningNumber(historyDir, sanitizedAppName);
                fileName = String.format("%s_%02d.json", sanitizedAppName, runningNumber);
            }
            
            java.nio.file.Path targetFile = historyDir.resolve(fileName);
            java.nio.file.Files.writeString(targetFile, json);
            debugLog("DEBUG: Saved JSON history to: " + targetFile);
        } catch (Exception e) {
            System.err.println("Warning: Could not save JSON history: " + e.getMessage());
        }
    }

    private VeracodeReportDTO loadHistoryFile(String fileName) {
        try {
            java.nio.file.Path historyDir = java.nio.file.Paths.get("veracode", "history");
            java.nio.file.Path targetFile = historyDir.resolve(fileName);
            
            if (!java.nio.file.Files.exists(targetFile)) {
                throw new RuntimeException("History file not found: " + targetFile);
            }
            
            String json = java.nio.file.Files.readString(targetFile);
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            return mapper.readValue(json, VeracodeReportDTO.class);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load history file " + fileName + ": " + e.getMessage(), e);
        }
    }

    private int getNextRunningNumber(java.nio.file.Path dir, String sanitizedAppName) {
        try {
            if (!java.nio.file.Files.exists(dir)) return 1;
            try (java.util.stream.Stream<java.nio.file.Path> stream = java.nio.file.Files.list(dir)) {
                return stream
                    .map(p -> p.getFileName().toString())
                    .filter(name -> name.startsWith(sanitizedAppName + "_") && name.endsWith(".json"))
                    .map(name -> {
                        try {
                            String numPart = name.substring(sanitizedAppName.length() + 1, name.lastIndexOf("."));
                            return Integer.parseInt(numPart);
                        } catch (Exception e) { return 0; }
                    })
                    .max(Integer::compare)
                    .orElse(0) + 1;
            }
        } catch (Exception e) {
            return 1;
        }
    }

    private String formatBreakdown(Map<Integer, Integer> map) {
        return String.format("Very High: %d, High: %d, Medium: %d, Low: %d, Very Low: %d, Info: %d",
            map.getOrDefault(5, 0), map.getOrDefault(4, 0), map.getOrDefault(3, 0),
            map.getOrDefault(2, 0), map.getOrDefault(1, 0), map.getOrDefault(0, 0));
    }

    public BuildInfo getBuildInfo(String buildId) {
        try {
            UploadAPIWrapper uploadWrapper = new UploadAPIWrapper();
            setupCredentials(uploadWrapper);
            String xml = uploadWrapper.getBuildInfo(buildId);
            saveXmlToLog("build_info", buildId, xml);
            debugLog("[" + java.time.LocalDateTime.now() + "] Raw Build Info for ID " + buildId + ": " + xml);

            if (xml.contains("<error>")) {
                JAXBContext errContext = JAXBContext.newInstance(VeracodeError.class);
                Unmarshaller errUnmarshaller = errContext.createUnmarshaller();
                VeracodeError error = (VeracodeError) errUnmarshaller.unmarshal(new StringReader(xml));
                System.err.println("Veracode API Error: " + error.getMessage());
                return null;
            }

            JAXBContext context = JAXBContext.newInstance(BuildInfo.class);
            Unmarshaller unmarshaller = context.createUnmarshaller();
            return (BuildInfo) unmarshaller.unmarshal(new StringReader(xml));
        } catch (Exception e) {
            throw new RuntimeException("Build Info failed: " + e.getMessage(), e);
        }
    }

    public PrescanResults getPreScanResults(String appId, String buildId) {
        try {
            UploadAPIWrapper uploadWrapper = new UploadAPIWrapper();
            setupCredentials(uploadWrapper);
            String xml = uploadWrapper.getPreScanResults(appId, buildId);
            saveXmlToLog("prescan_results", buildId, xml);
            debugLog("[" + java.time.LocalDateTime.now() + "] Raw Prescan Results: " + (xml.length() > 500 ? xml.substring(0, 500) : xml));

            if (xml.contains("<error>")) {
                System.err.println("Veracode API Error in Prescan: " + xml);
                return null;
            }

            JAXBContext context = JAXBContext.newInstance(PrescanResults.class);
            Unmarshaller unmarshaller = context.createUnmarshaller();
            return (PrescanResults) unmarshaller.unmarshal(new StringReader(xml));
        } catch (Exception e) {
            throw new RuntimeException("Prescan Results failed: " + e.getMessage(), e);
        }
    }

    public String getRawDetailedReport(String buildId) {
        try {
            ResultsAPIWrapper resultsWrapper = new ResultsAPIWrapper();
            setupCredentials(resultsWrapper);
            return resultsWrapper.detailedReport(buildId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to get raw detailed report", e);
        }
    }

    private void populateModulesAndArchitectures(String xml, VeracodeReportDTO dto) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new InputSource(new StringReader(xml)));
            
            Set<String> archSet = new HashSet<>();
            var staticAnalysisNodes = doc.getElementsByTagNameNS("*", "static-analysis");
            if (staticAnalysisNodes.getLength() > 0) {
                var staticAnalysis = staticAnalysisNodes.item(0);
                var children = staticAnalysis.getChildNodes();
                for (int i = 0; i < children.getLength(); i++) {
                    var child = children.item(i);
                    if (child.getLocalName() != null && child.getLocalName().equals("modules")) {
                        var moduleNodes = child.getChildNodes();
                        for (int j = 0; j < moduleNodes.getLength(); j++) {
                            var moduleNode = moduleNodes.item(j);
                            if (moduleNode.getLocalName() != null && moduleNode.getLocalName().equals("module")) {
                                var attrs = moduleNode.getAttributes();
                                var nameAttr = attrs.getNamedItem("name");
                                var archAttr = attrs.getNamedItem("architecture");
                                var fileNameAttr = attrs.getNamedItem("file_name");
                                
                                String moduleName = (nameAttr != null) ? nameAttr.getNodeValue() : "";
                                String fileName = (fileNameAttr != null) ? fileNameAttr.getNodeValue() : "";
                                
                                boolean isIgnored = veracodeConfig.getIgnoreModules().stream()
                                    .anyMatch(ignore -> (!moduleName.isEmpty() && moduleName.toLowerCase().contains(ignore.toLowerCase())) ||
                                                        (!fileName.isEmpty() && fileName.toLowerCase().contains(ignore.toLowerCase())));
                                
                                if (isIgnored) {
                                    debugLog("DEBUG: Skipping architecture/selection for ignored module: " + (moduleName.isEmpty() ? fileName : moduleName));
                                    continue;
                                }

                                if (nameAttr != null) {
                                    dto.selectedModules.add(moduleName);
                                }
                                // If fileName is present in detailed report, add it too to ensure matches
                                if (fileNameAttr != null) {
                                    dto.selectedModules.add(fileName);
                                }
                                if (archAttr != null) {
                                    archSet.add(mapToPrettyName(archAttr.getNodeValue()));
                                }
                            }
                        }
                    }
                }
            }
            dto.architectures.addAll(archSet);
        } catch (Exception e) {
            System.err.println("Error parsing modules from XML: " + e.getMessage());
        }
    }

    private List<String> extractModulesFromDetailedReport(String xml) {
        VeracodeReportDTO tempDto = new VeracodeReportDTO();
        populateModulesAndArchitectures(xml, tempDto);
        return tempDto.selectedModules;
    }

    public String getSastResult(String applicationName) { return "Use /getfinalreport for full data"; }
    public String getBuildId(String appId) { return "Legacy - use /getfinalreport"; }
    public String getDetailedReport(String buildId) { return "Legacy - use /getfinalreport"; }

    private void generateDetailedBreakdown(String xml, VeracodeReport report, VeracodeReportDTO dto) {
        try {
            if (report == null || report.getSeverities() == null) return;

            // Map to hold counts: Severity -> CWE -> List of Flaws
            var severityMap = new java.util.TreeMap<Integer, java.util.Map<String, java.util.List<Flaw>>>(java.util.Collections.reverseOrder());
            int totalSast = 0;
            List<VeracodeReportDTO.FindingDTO> findings = new java.util.ArrayList<>();

            for (Severity severity : report.getSeverities()) {
                int sev = severity.getLevel();
                if (severity.getCategories() == null) continue;

                for (Category category : severity.getCategories()) {
                    if (category.getCwes() == null) continue;

                    for (Cwe cweObj : category.getCwes()) {
                        if (cweObj.getStaticFlaws() == null || cweObj.getStaticFlaws().getFlaws() == null) continue;

                        for (Flaw flaw : cweObj.getStaticFlaws().getFlaws()) {
                            String mitigationStatus = flaw.getMitigationStatus();
                            String remediationStatus = flaw.getRemediationStatus();

                            if (mitigationStatus != null) mitigationStatus = mitigationStatus.trim();
                            
                            // Logic: Exclude "accepted" or "Fixed" from breakdown and total
                            if ("accepted".equalsIgnoreCase(mitigationStatus) || "Fixed".equalsIgnoreCase(remediationStatus)) {
                                continue;
                            }

                            String cweId = String.valueOf(cweObj.getCweId());
                            String cwe = "CWE-" + cweId;

                            severityMap.putIfAbsent(sev, new java.util.TreeMap<>());
                            severityMap.get(sev).putIfAbsent(cwe, new java.util.ArrayList<>());
                            severityMap.get(sev).get(cwe).add(flaw);
                            totalSast++;

                            // Logic for findingsWithComments: Report ONLY mitigation_status="proposed" with actual comments
                            if ("proposed".equalsIgnoreCase(mitigationStatus)) {
                                List<String> comments = new ArrayList<>();
                                if (flaw.getMitigationList() != null && flaw.getMitigationList().getMitigations() != null) {
                                    for (ScaMitigation mit : flaw.getMitigationList().getMitigations()) {
                                        String comment = mit.getDescription();
                                        if (comment == null || comment.isEmpty()) {
                                            comment = mit.getComment();
                                        }
                                        if (comment != null && !comment.isEmpty()) {
                                            comments.add(comment);
                                        }
                                    }
                                }

                                if (!comments.isEmpty()) {
                                    var fDto = new VeracodeReportDTO.FindingDTO();
                                    fDto.type = "SAST";
                                    fDto.id = String.valueOf(flaw.getIssueId());
                                    fDto.cweid = cweId;
                                    fDto.title = flaw.getCategoryName();
                                    fDto.severity = getSeverityName(sev);
                                    fDto.location = flaw.getSourceFile() + ":" + flaw.getLine();
                                    fDto.userComments = comments;
                                    fDto.remediation_due_date = calculateDueDate(flaw.getDateFirstOccurrence(), dto.overview.tier, fDto.severity);
                                    findings.add(fDto);
                                }
                            }
                        }
                    }
                }
            }
            
            dto.sastSummary.vulnerabilities = totalSast;
            dto.findingsWithCommentsSAST.addAll(findings);
            
            // Format Breakdown String
            severityMap.forEach((sev, cweMap) -> {
                String sevName = getSeverityName(sev);
                var sevBreakdown = new VeracodeReportDTO.SeverityBreakdownDTO();
                sevBreakdown.total = cweMap.values().stream().mapToInt(java.util.List::size).sum();
                
                cweMap.forEach((cwe, list) -> {
                    // Find oldest date
                    String oldestDate = list.stream()
                        .map(Flaw::getDateFirstOccurrence)
                        .filter(d -> d != null && !d.isEmpty())
                        .min(String::compareTo)
                        .orElse("");
                    
                    var finding = new VeracodeReportDTO.CweFindingDTO();
                    finding.cwe = cwe;
                    finding.count = list.size();
                    finding.date_first_occurrence = oldestDate;
                    finding.remediation_due_date = calculateDueDate(oldestDate, dto.overview.tier, getSeverityName(sev));
                    sevBreakdown.findings.add(finding);
                });
                dto.sastSummary.breakdown.put(sevName, sevBreakdown);
            });
            
            // Map SCA separately
            updateScaSummaryFromReport(report, dto);
            populateScaDetailSectionFromReport(report, dto);
            
            // Finalize Mitigation Breakdowns by looping over the populated lists
            populateMitigationBreakdowns(dto);
            
        } catch (Exception e) {
            System.err.println("Error generating detailed breakdown: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void updateScaSummaryFromReport(VeracodeReport report, VeracodeReportDTO dto) {
        if (report == null || report.getSca() == null || report.getSca().getVulnerableComponents() == null) {
            return;
        }

        var scaTotals = new java.util.HashMap<Integer, Integer>();
        for (int i = 0; i <= 5; i++) scaTotals.put(i, 0);

        int vulnerabilitiesSca = 0;
        int totalVulnerablePackages = 0;
        var comps = report.getSca().getVulnerableComponents().getComponents();
        if (comps == null) return;

        for (var comp : comps) {
            boolean hasOpenVulnerability = false;
            if (comp.getVulnerabilityList() == null || comp.getVulnerabilityList().getVulnerabilities() == null) continue;

            for (var vuln : comp.getVulnerabilityList().getVulnerabilities()) {
                if (isScaVulnerabilityMitigated(vuln)) continue;

                int sev = (vuln.getSeverity() != null) ? vuln.getSeverity() : 0;
                scaTotals.put(sev, scaTotals.get(sev) + 1);
                vulnerabilitiesSca++;
                hasOpenVulnerability = true;

                // Mitigation checks for SCA using JAXB (Proposed but not yet approved)
                boolean hasProposedAction = false;
                var scaComments = new java.util.ArrayList<String>();

                if (vuln.getMitigationList() != null && vuln.getMitigationList().getMitigations() != null) {
                    for (var mit : vuln.getMitigationList().getMitigations()) {
                        String action = mit.getAction();
                        if ("Mitigate by Design".equalsIgnoreCase(action) || 
                            "Mitigate By Environment".equalsIgnoreCase(action) || 
                            "Potential False Positive".equalsIgnoreCase(action)) {
                            hasProposedAction = true;
                            String comment = mit.getDescription();
                            if (comment == null || comment.isEmpty()) {
                                comment = mit.getComment();
                            }
                            if (comment != null && !comment.isEmpty()) {
                                scaComments.add(comment);
                            }
                        }
                    }
                }

                if (hasProposedAction) {
                    var fDto = new VeracodeReportDTO.FindingDTO();
                    fDto.type = "SCA";
                    fDto.id = vuln.getCveId();
                    fDto.cweid = vuln.getCweId();
                    fDto.title = vuln.getCveId();
                    fDto.severity = getSeverityName(sev);
                    fDto.location = comp.getLibrary();
                    fDto.userComments = scaComments;
                    fDto.remediation_due_date = calculateDueDate(vuln.getFirstFoundDate(), dto.overview.tier, fDto.severity);
                    dto.findingsWithCommentsSCA.add(fDto);
                }
            }
            if (hasOpenVulnerability) {
                totalVulnerablePackages++;
            }
        }
        dto.scaSummary.vulnerabilities = vulnerabilitiesSca;
        dto.scaSummary.totalPackages = comps.size(); // Approximation if total_components isn't in JAXB yet
        dto.scaSummary.totalVulnerablePackages = totalVulnerablePackages;
        dto.scaSummary.breakdown.putAll(formatScaBreakdown(scaTotals));
    }

    private void populateScaDetailSectionFromReport(VeracodeReport report, VeracodeReportDTO dto) {
        if (report == null || report.getSca() == null || report.getSca().getVulnerableComponents() == null) {
            return;
        }

        var ecosystems = new java.util.HashSet<String>();
        var comps = report.getSca().getVulnerableComponents().getComponents();
        if (comps == null) return;

        for (var comp : comps) {
            String library = comp.getLibrary();
            String libId = comp.getLibraryId();
            if (libId != null && libId.contains(":")) {
                String eco = libId.split(":")[0];
                boolean ignore = veracodeConfig.getIgnoreEcosystems().stream()
                    .anyMatch(ecoName -> ecoName.equalsIgnoreCase(eco));
                if (!ignore) {
                    ecosystems.add(mapToPrettyName(eco));
                }
            }

            if (comp.getVulnerabilityList() == null || comp.getVulnerabilityList().getVulnerabilities() == null) continue;
            
            var componentVulns = new java.util.ArrayList<ScaVulnerability>();
            for (var vuln : comp.getVulnerabilityList().getVulnerabilities()) {
                if (!isScaVulnerabilityMitigated(vuln)) {
                    componentVulns.add(vuln);
                }
            }

            if (!componentVulns.isEmpty()) {
                var detail = new VeracodeReportDTO.ScaDetailDTO();
                detail.packageName = library;
                detail.version = comp.getVersion();
                
                detail.firstFoundDate = componentVulns.stream()
                    .map(v -> v.getFirstFoundDate())
                    .filter(d -> d != null && !d.isEmpty())
                    .min(String::compareTo)
                    .orElse("");
                
                detail.cveList = componentVulns.stream()
                    .map(v -> v.getCveId())
                    .distinct()
                    .collect(java.util.stream.Collectors.joining(","));
                
                var counts = new java.util.TreeMap<String, Integer>(java.util.Collections.reverseOrder());
                int maxSev = 0;
                for (var v : componentVulns) {
                    int sValue = (v.getSeverity() != null) ? v.getSeverity() : 0;
                    if (sValue > maxSev) maxSev = sValue;
                    
                    String sDesc = v.getSeverityDesc();
                    if (sDesc == null || sDesc.isEmpty()) {
                        sDesc = getSeverityName(sValue);
                    }
                    counts.put(sDesc, counts.getOrDefault(sDesc, 0) + 1);
                }
                detail.remediation_due_date = calculateDueDate(detail.firstFoundDate, dto.overview.tier, getSeverityName(maxSev));
                
                var severityList = new java.util.ArrayList<String>();
                counts.forEach((sev, count) -> severityList.add(sev + ": " + count));
                detail.severityCounts = String.join(", ", severityList);
                
                dto.scaDetails.add(detail);
            }
        }
        dto.scaEcosystems = ecosystems.toString();
        verifyPackaging(new java.util.HashSet<>(dto.architectures), ecosystems, dto);
    }

    private boolean isScaVulnerabilityMitigated(ScaVulnerability vuln) {
        if ("accepted".equalsIgnoreCase(vuln.getMitigationStatus())) return true;
        if ("true".equalsIgnoreCase(vuln.getMitigation())) {
            if (vuln.getMitigationList() != null && vuln.getMitigationList().getMitigations() != null) {
                for (var mit : vuln.getMitigationList().getMitigations()) {
                    if ("Approve Mitigation".equalsIgnoreCase(mit.getAction())) return true;
                }
            }
            // If mitigation=true but no approval list found, Veracode usually implies it's resolved in detailed reports
            return true;
        }
        return false;
    }

    private void verifyPackaging(java.util.Set<String> architectures, java.util.Set<String> ecosystems, VeracodeReportDTO dto) {
        var mappings = veracodeConfig.getArchitectureMappings();
        if (mappings == null || mappings.isEmpty()) return;

        // 1. Architecture detected in SAST but Ecosystem missing in SCA
        for (String arch : architectures) {
            // Find mapping for this arch (which is already a pretty name)
            String rawExpected = mappings.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(arch))
                .map(java.util.Map.Entry::getValue)
                .findFirst()
                .orElse(null);

            if (rawExpected != null) {
                String[] expectedEcos = rawExpected.split(",");
                boolean foundAny = false;
                for (String eco : expectedEcos) {
                    String trimmedEco = eco.trim();
                    // Map the technical expected eco to its pretty name
                    String prettyEco = mapToPrettyName(trimmedEco);
                    if (ecosystems.contains(prettyEco)) {
                        foundAny = true;
                        break;
                    }
                }

                if (!foundAny) {
                    // Special cases (using pretty names)
                    if (arch.equalsIgnoreCase("JavaScript") && ecosystems.contains("JavaScript")) continue; // Should be handled by loop but just in case
                    if (arch.equalsIgnoreCase("Java") && ecosystems.contains("Java")) continue;
                    
                    dto.packagingAnomalies.add("Architecture " + arch + " detected in SAST but no corresponding SCA ecosystem (" + rawExpected + ") found. Packaging may be incomplete.");
                }
            }
        }

        // 2. Ecosystem detected in SCA but Architecture missing in SAST scan
        for (String eco : ecosystems) {
            boolean archFound = false;
            boolean hasMappingForEco = false;

            // Find if any mapping includes this eco
            for (java.util.Map.Entry<String, String> entry : mappings.entrySet()) {
                String prettyArch = entry.getKey();
                String rawVal = entry.getValue();
                if (rawVal == null) continue;
                
                boolean ecoInList = java.util.Arrays.stream(rawVal.split(","))
                    .anyMatch(v -> {
                        String technical = v.trim();
                        return technical.equalsIgnoreCase(eco) || mapToPrettyName(technical).equalsIgnoreCase(eco);
                    });

                if (ecoInList) {
                    hasMappingForEco = true;
                    if (architectures.contains(prettyArch)) {
                        archFound = true;
                        break;
                    }
                }
            }

            if (hasMappingForEco && !archFound) {
                String expectedArches = mappings.entrySet().stream()
                    .filter(e -> e.getValue() != null && java.util.Arrays.stream(e.getValue().split(",")).anyMatch(v -> {
                        String t = v.trim();
                        return t.equalsIgnoreCase(eco) || mapToPrettyName(t).equalsIgnoreCase(eco);
                    }))
                    .map(java.util.Map.Entry::getKey)
                    .distinct()
                    .collect(java.util.stream.Collectors.joining(" or "));
                
                dto.packagingAnomalies.add("Ecosystem " + eco + " detected in SCA but no corresponding architecture (" + expectedArches + ") was scanned in SAST. Check module selection.");
            }
        }
    }

    private String getSeverityName(int sev) {
        return switch (sev) {
            case 5 -> "Very High";
            case 4 -> "High";
            case 3 -> "Medium";
            case 2 -> "Low";
            case 1 -> "Very Low";
            default -> "Info";
        };
    }

    private java.util.Map<String, VeracodeReportDTO.SeverityBreakdownDTO> formatScaBreakdown(java.util.Map<Integer, Integer> map) {
        var breakdown = new java.util.LinkedHashMap<String, VeracodeReportDTO.SeverityBreakdownDTO>();
        for (int sev = 5; sev >= 2; sev--) {
            var b = new VeracodeReportDTO.SeverityBreakdownDTO();
            b.total = map.getOrDefault(sev, 0);
            breakdown.put(getSeverityName(sev), b);
        }
        return breakdown;
    }

    private void populateMitigationBreakdowns(VeracodeReportDTO dto) {
        // SAST Breakdown
        for (VeracodeReportDTO.FindingDTO f : dto.findingsWithCommentsSAST) {
            dto.mitigationBreakdownSAST.put("Total", dto.mitigationBreakdownSAST.get("Total") + 1);
            String sev = f.severity;
            String key = switch (sev) {
                case "Very High", "High" -> "High";
                case "Medium" -> "Medium";
                case "Low", "Very Low" -> "Low";
                default -> "Information";
            };
            dto.mitigationBreakdownSAST.put(key, dto.mitigationBreakdownSAST.get(key) + 1);
        }

        // SCA Breakdown
        for (VeracodeReportDTO.FindingDTO f : dto.findingsWithCommentsSCA) {
            dto.mitigationBreakdownSCA.put("Total", dto.mitigationBreakdownSCA.get("Total") + 1);
            String sev = f.severity;
            if (dto.mitigationBreakdownSCA.containsKey(sev)) {
                dto.mitigationBreakdownSCA.put(sev, dto.mitigationBreakdownSCA.get(sev) + 1);
            }
        }
    }

    private String calculateTier(String policyName) {
        if (policyName == null || !policyName.startsWith("PwC")) return "N/A";
        
        // Remove 6 characters as requested
        if (policyName.length() <= 6) return "N/A";
        String trimmed = policyName.substring(6);
        if (!trimmed.contains("_")) return "N/A";
        
        String[] parts = trimmed.split("_", 2);
        // Remove leading digits (e.g., "3HighlyConfidential" -> "HighlyConfidential")
        String dataClassification = parts[0].replaceAll("^\\d+", "");
        // Only take the first part of the exposure (e.g., "External_something" -> "External")
        String tierExposure = parts[1].split("_")[0];
        
        var tierMappings = veracodeConfig.getTierMappings();
        if (tierMappings.containsKey(tierExposure)) {
            return tierMappings.get(tierExposure).getOrDefault(dataClassification, "N/A");
        }
        
        return "N/A";
    }

    private String calculateDueDate(String dateStr, String tier, String severity) {
        if (dateStr == null || dateStr.isEmpty() || tier == null || "N/A".equals(tier)) return null;
        
        var gracePeriods = veracodeConfig.getGracePeriods();
        if (!gracePeriods.containsKey(tier)) return null;
        
        // Normalize severity name (e.g., "Very High" -> "VeryHigh") to match config keys
        String normalizedSeverity = severity != null ? severity.replace(" ", "") : "";
        Integer days = gracePeriods.get(tier).get(normalizedSeverity);
        if (days == null) return null;
        
        try {
            java.time.LocalDateTime ldt;
            if (dateStr.length() > 10) {
                // SCA format "2026-03-24 18:11:44 UTC"
                String cleanDate = dateStr.replace(" UTC", "");
                ldt = java.time.LocalDateTime.parse(cleanDate, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            } else {
                // SAST format "2026-03-24"
                ldt = java.time.LocalDate.parse(dateStr, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
            }
            
            return ldt.plusDays(days).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        } catch (Exception e) {
            return null;
        }
    }

    private String mapToPrettyName(String technicalName) {
        var mappings = veracodeConfig.getArchitectureMappings();
        if (mappings == null || mappings.isEmpty()) return technicalName;
        
        return mappings.entrySet().stream()
            .filter(e -> {
                if (e.getKey().equalsIgnoreCase(technicalName)) return true;
                String val = e.getValue();
                if (val == null) return false;
                return java.util.Arrays.stream(val.split(","))
                    .anyMatch(v -> v.trim().equalsIgnoreCase(technicalName));
            })
            .map(java.util.Map.Entry::getKey)
            .findFirst()
            .orElse(technicalName);
    }
}
