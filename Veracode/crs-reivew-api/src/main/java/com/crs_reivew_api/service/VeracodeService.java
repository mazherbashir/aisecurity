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

    private DocumentBuilderFactory createSecureDocumentBuilderFactory() {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        try {
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
        } catch (Exception e) {
            // Ignore feature unsupported exceptions
        }
        return factory;
    }

    public String getAppId(String appName) {
        if (appName != null)
            appName = appName.trim();
        try {
            Map<String, String> appMap = getApplicationsMap(false);

            if (appMap.containsKey(appName)) {
                return appMap.get(appName);
            }

            // Cache miss! Let's force a refresh to get the latest list from Veracode
            debugLog("DEBUG: Cache miss for '" + appName + "', forcing fresh API update...");
            appMap = getApplicationsMap(true);

            if (appMap.containsKey(appName)) {
                return appMap.get(appName);
            }

            // Still not found? Perform fuzzy matching on the updated list
            List<String> suggestions = findBestMatches(appName, appMap.keySet());
            throw new VeracodeException("Application '" + appName + "' not found.", "INVALID_APP", suggestions);

        } catch (VeracodeException ve) {
            throw ve;
        } catch (Exception e) {
            throw new VeracodeException("Failed to get App ID: " + e.getMessage(), "SYSTEM_ERROR");
        }
    }

    private Map<String, String> getApplicationsMap(boolean forceRefresh) throws Exception {
        java.nio.file.Path cachePath = java.nio.file.Paths.get("veracode", "history", "applications.json");
        boolean shouldRefresh = forceRefresh;

        if (!shouldRefresh && java.nio.file.Files.exists(cachePath)) {
            long lastModified = java.nio.file.Files.getLastModifiedTime(cachePath).toMillis();
            long oneDayMillis = 1L * 24 * 60 * 60 * 1000;
            if (System.currentTimeMillis() - lastModified < oneDayMillis) {
                shouldRefresh = false;
            } else {
                shouldRefresh = true;
            }
        } else if (!java.nio.file.Files.exists(cachePath)) {
            shouldRefresh = true;
        }

        if (!shouldRefresh) {
            try {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                return mapper.readValue(cachePath.toFile(),
                        new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {
                        });
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
            DocumentBuilderFactory factory = createSecureDocumentBuilderFactory();
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
            if (e instanceof VeracodeException)
                throw e;
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
        if (input.equals(target))
            return 1000;

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
            if (input.charAt(i) == target.charAt(i))
                commonPrefix++;
            else
                break;
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
            DocumentBuilderFactory factory = createSecureDocumentBuilderFactory();
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

            if (xml != null && xml.contains("<error>")) {
                if (xml.contains("No report available")) {
                    throw new RuntimeException(
                            "Veracode Error: No report available. There may be a scan in progress. Please check Veracode or try again later.");
                }
                throw new RuntimeException("Veracode API Error: " + xml);
            }

            // Save to log file for analysis
            saveXmlToLog("detailed_report", buildId, xml);

            debugLog("[" + java.time.LocalDateTime.now() + "] Detailed Report Snippet: "
                    + (xml.length() > 500 ? xml.substring(0, 500) : xml));
            JAXBContext context = JAXBContext.newInstance(VeracodeReport.class);
            Unmarshaller unmarshaller = context.createUnmarshaller();
            return (VeracodeReport) unmarshaller.unmarshal(new StringReader(xml));
        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new RuntimeException("Failed to get report object", e);
        }
    }

    private void saveXmlToLog(String prefix, String id, String xml) {
        if (!veracodeConfig.isSaveXmlLogs())
            return;
        try {
            String safePrefix = prefix != null ? prefix.replaceAll("[^a-zA-Z0-9_]", "") : "log";
            String safeId = id != null ? id.replaceAll("[^a-zA-Z0-9\\-]", "") : "unknown";
            String timestamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            java.nio.file.Path logDir = java.nio.file.Paths.get("veracode", "logs").toAbsolutePath().normalize();
            java.nio.file.Files.createDirectories(logDir);

            String fileName = String.format("%s_%s_%s.xml", safePrefix, safeId, timestamp);
            java.nio.file.Path targetFile = logDir.resolve(fileName).toAbsolutePath().normalize();
            if (!targetFile.startsWith(logDir)) {
                throw new IllegalArgumentException("Access Denied: Invalid log file path.");
            }
            java.nio.file.Files.writeString(targetFile, xml);
            debugLog("DEBUG: Saved XML log to: " + targetFile);
        } catch (Exception e) {
            System.err.println("Warning: Could not save XML log: " + e.getMessage());
        }
    }

    private void debugLog(String message) {
        if (veracodeConfig.isDebug()) {
            System.out.println(message);
        }
    }

    public String updateMitigation(String buildId, String appId, String flawIdList, String action, String comment,
            String cveId, String type) {
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
            throw new RuntimeException(
                    "Mitigation Configuration is disabled. Please enabled it if you want to send the equest to Veracode");
        }

        if ("debug".equalsIgnoreCase(mode)) {
            debugLog("DEBUG: Mitigation Proposal Bypass (Debug Mode). Build: " + buildId + ", Action: " + mappedAction);
            return "Success (Debug Mode - Request Bypassed)";
        }

        String apiType = veracodeConfig.getMitigationApiType();
        StringBuilder debugInfo = new StringBuilder();
        debugInfo.append("====== VERACODE API REQUEST ======\n");
        debugInfo.append("API Type: ").append(apiType).append("\n");
        if ("REST".equalsIgnoreCase(apiType)) {
            debugInfo.append("Endpoint: REST Annotations API\n");
        } else {
            debugInfo.append("Endpoint URL: https://analysiscenter.veracode.com/api/5.0/updatemitigationinfo.do\n");
        }
        debugInfo.append("HTTP Method: POST\n");
        debugInfo.append("Parameters Sent:\n");
        debugInfo.append("  build_id: ").append(buildId).append("\n");
        debugInfo.append("  action: ").append(mappedAction).append("\n");
        debugInfo.append("  flaw_id_list: ").append(flawIdList).append("\n");
        debugInfo.append("  cve_id: ").append(cveId).append("\n");
        debugInfo.append("  type: ").append(type).append("\n");
        debugInfo.append("  comment: ").append(comment).append("\n");
        debugInfo.append("==================================\n");

        System.out.println(debugInfo.toString());

        try {
            if ("REST".equalsIgnoreCase(veracodeConfig.getMitigationApiType())) {
                return submitRestMitigation(buildId, appId, flawIdList, mappedAction, comment, cveId, type, debugInfo);
            }

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

    private String[] getCredentials() {
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
            throw new RuntimeException(
                    "CRITICAL: Veracode credentials not found. Please ensure 'veracode_api_key_id' and 'veracode_api_key_secret' are set in application.properties or your local ~/.veracode/credentials file.");
        }
        return new String[] { id, secret };
    }

    private void setupCredentials(com.veracode.apiwrapper.AbstractAPIWrapper wrapper) {
        String[] creds = getCredentials();
        String id = creds[0];
        String secret = creds[1];

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

    private String submitRestMitigation(String buildId, String appId, String flawIdList, String action, String comment,
            String cveIdUI, String typeUI, StringBuilder debugInfo) throws Exception {
        String[] creds = getCredentials();
        String id = creds[0];
        String secret = creds[1];
        java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();

        // Step 1: Resolve appId if not provided
        if (appId == null || appId.isEmpty()) {
            ResultsAPIWrapper resultsWrapper = new ResultsAPIWrapper();
            setupCredentials(resultsWrapper);

            String buildXml = resultsWrapper.detailedReport(buildId);
            if (buildXml == null || buildXml.contains("<error>")) {
                throw new RuntimeException("Failed to get detailed report for build " + buildId + ": " + buildXml);
            }

            try {
                DocumentBuilderFactory factory = createSecureDocumentBuilderFactory();
                DocumentBuilder builder = factory.newDocumentBuilder();
                Document doc = builder.parse(new InputSource(new StringReader(buildXml)));
                var nodes = doc.getElementsByTagName("detailedreport");
                if (nodes.getLength() > 0) {
                    appId = nodes.item(0).getAttributes().getNamedItem("app_id").getNodeValue();
                }
            } catch (Exception e) {
                throw new RuntimeException("Error parsing detailed report XML", e);
            }
        }

        if (appId == null || appId.isEmpty()) {
            throw new RuntimeException("Could not resolve legacy app_id for build " + buildId);
        }

        // Step 2: Get Application GUID
        String appGuid = getApplicationGuid(appId);
        String cveId = cveIdUI;
        boolean isSca = "SCA".equalsIgnoreCase(typeUI);

        // If flawIdList is a CVE, resolve it dynamically to Veracode's internal
        // component ID!
        if (flawIdList != null && flawIdList.toUpperCase().startsWith("CVE-")) {
            cveId = flawIdList.toUpperCase();
            flawIdList = resolveScaCveToFindingId(appGuid, flawIdList);
            isSca = true;
        } else if (isSca) {
            // We already have cveId and component_id from the UI, no reverse lookup needed!
        }

        // Step 3: Post Annotation
        String urlStr;
        if (isSca) {
            urlStr = "https://api.veracode.com/srcclr/v3/applications/" + appGuid + "/sca_annotations";
        } else {
            urlStr = "https://api.veracode.com/appsec/v2/applications/" + appGuid + "/annotations";
        }
        java.net.URL annUrl = new java.net.URL(urlStr);
        String annAuth = com.veracode.http.util.HmacAuthHeaderGenerator.getVeracodeAuthorizationHeader(id, secret,
                annUrl, "POST");

        // Use REST API action string mapping:
        // SCA (v3) requires "APPROVE" or "REJECT". SAST (v2) requires "ACCEPTED" or
        // "REJECTED".
        String restAction;
        if (isSca) {
            if (action.equalsIgnoreCase("accepted") || action.equalsIgnoreCase("accept")
                    || action.equalsIgnoreCase("approve")) {
                restAction = "APPROVE";
            } else if (action.equalsIgnoreCase("rejected") || action.equalsIgnoreCase("reject")) {
                restAction = "REJECT";
            } else {
                restAction = action.toUpperCase();
            }
        } else {
            restAction = action.toUpperCase();
        }

        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.node.ObjectNode payload = mapper.createObjectNode();

        if (isSca) {
            payload.put("annotation_type", "VULNERABILITY");
            payload.put("action", restAction);
            payload.put("comment", comment);

            com.fasterxml.jackson.databind.node.ArrayNode annotationsArray = mapper.createArrayNode();
            com.fasterxml.jackson.databind.node.ObjectNode annotationObj = mapper.createObjectNode();
            annotationObj.put("component_id", flawIdList);
            if (cveId != null) {
                annotationObj.put("cve_name", cveId);
            }
            annotationsArray.add(annotationObj);
            payload.set("annotations", annotationsArray);
        } else {
            payload.put("issue_list", flawIdList);
            payload.put("comment", comment);
            payload.put("action", restAction);
        }

        debugInfo.append("====== REST API EXECUTION ======\n");
        debugInfo.append("Target URL: ").append(annUrl.toString()).append("\n");
        debugInfo.append("HTTP Method: POST\n");
        debugInfo.append("Headers: Authorization (HMAC Signed), Content-Type (application/json)\n");
        debugInfo.append("JSON Payload:\n").append(payload.toString()).append("\n");

        java.net.http.HttpRequest annReq = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(annUrl.toString()))
                .header("Authorization", annAuth)
                .header("Content-Type", "application/json")
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(payload.toString()))
                .build();

        System.out.println("DEBUG: Sending JSON payload to Veracode (" + annUrl.toString() + "):");
        System.out.println(payload.toString());

        java.net.http.HttpResponse<String> annRes = client.send(annReq,
                java.net.http.HttpResponse.BodyHandlers.ofString());

        debugInfo.append("Response Status Code: ").append(annRes.statusCode()).append("\n");
        debugInfo.append("Response Body: ").append(annRes.body()).append("\n");
        debugInfo.append("================================\n");

        if (annRes.statusCode() < 200 || annRes.statusCode() >= 300) {
            String errorMsg = annRes.body();
            try {
                com.fasterxml.jackson.databind.JsonNode errNode = mapper.readTree(errorMsg);
                if (errNode.has("_embedded") && errNode.get("_embedded").has("api_errors")
                        && errNode.get("_embedded").get("api_errors").isArray()) {
                    errorMsg = "Veracode API Error: "
                            + errNode.get("_embedded").get("api_errors").get(0).get("detail").asText();
                } else if (errNode.has("message") || errNode.has("http_status") || errNode.has("http_code")) {
                    StringBuilder sb = new StringBuilder("Veracode API Error: ");
                    if (errNode.has("http_code")) {
                        sb.append(errNode.get("http_code").asText()).append(" ");
                    }
                    if (errNode.has("http_status")) {
                        sb.append(errNode.get("http_status").asText());
                    }
                    if (errNode.has("message")) {
                        sb.append(" (Correlation ID: ").append(errNode.get("message").asText()).append(")");
                    }
                    errorMsg = sb.toString();
                }
            } catch (Exception parseEx) {
                // Keep raw body if parsing fails
                errorMsg = "HTTP " + annRes.statusCode() + " - " + errorMsg;
            }
            throw new RuntimeException(errorMsg);
        }

        debugLog("DEBUG: REST Mitigation Success: " + annRes.body());
        return annRes.body();
    }

    private void saveDebugLog(String content) {
        if (!veracodeConfig.isSaveXmlLogs())
            return;
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

    private String getApplicationGuid(String appId) throws Exception {
        String[] creds = getCredentials();
        String id = creds[0];
        String secret = creds[1];
        java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();

        java.net.URL appsUrl = new java.net.URL("https://api.veracode.com/appsec/v1/applications?legacy_id=" + appId);
        String appsAuth = com.veracode.http.util.HmacAuthHeaderGenerator.getVeracodeAuthorizationHeader(id, secret,
                appsUrl, "GET");

        java.net.http.HttpRequest appsReq = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(appsUrl.toString()))
                .header("Authorization", appsAuth)
                .GET()
                .build();

        java.net.http.HttpResponse<String> appsRes = client.send(appsReq,
                java.net.http.HttpResponse.BodyHandlers.ofString());
        if (appsRes.statusCode() != 200) {
            throw new RuntimeException("Failed to get application GUID: " + appsRes.body());
        }

        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.JsonNode appsRoot = mapper.readTree(appsRes.body());
        com.fasterxml.jackson.databind.JsonNode appsArr = appsRoot.path("_embedded").path("applications");
        if (appsArr.isArray() && appsArr.size() > 0) {
            return appsArr.get(0).path("guid").asText();
        }

        throw new RuntimeException("Application GUID not found in API response for legacy ID " + appId);
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
                case "pip", "pypi" -> "PIP";
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

            com.fasterxml.jackson.databind.node.ObjectNode root = mapper.createObjectNode();
            root.put("query", query);

            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create("https://api.github.com/graphql"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + token)
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root)))
                    .build();

            java.net.http.HttpResponse<String> response = client.send(request,
                    java.net.http.HttpResponse.BodyHandlers.ofString());

            // Save raw GitHub response for verification (Granular control)
            if (veracodeConfig.isSaveScaLog()) {
                try {
                    java.nio.file.Path logDir = java.nio.file.Paths.get("veracode", "logs");
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
                debugLog("DEBUG: GitHub GraphQL failed with status " + response.statusCode() + ": " + response.body());
            }
        } catch (Exception e) {
            debugLog("DEBUG: GitHub API call failed: " + e.getMessage());
        }
        return null;
    }

    public VeracodeReportDTO getFinalReport(String applicationName, String appId, String buildId,
            boolean includeBuildInfo) {
        if (applicationName != null)
            applicationName = applicationName.trim();

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

        String rawPolicyName = report.getPolicyName();
        if (rawPolicyName != null && rawPolicyName.startsWith("PwC_DC")) {
            // Strip 'PwC_DC' and any numbers immediately following it
            dto.overview.policyName = rawPolicyName.replaceAll("^PwC_DC\\d*", "");
        } else {
            dto.overview.policyName = rawPolicyName;
        }

        dto.overview.policyComplianceStatus = report.getPolicyComplianceStatus();
        dto.overview.sandboxId = report.getSandboxId();
        dto.overview.tier = calculateTier(report.getPolicyName());

        if (dto.overview.tier != null && !"N/A".equals(dto.overview.tier)) {
            var gracePeriods = veracodeConfig.getGracePeriods();
            if (gracePeriods.containsKey(dto.overview.tier)) {
                var tierMap = gracePeriods.get(dto.overview.tier);
                Integer h = tierMap.getOrDefault("High", 0);
                Integer m = tierMap.getOrDefault("Medium", 0);
                Integer l = tierMap.getOrDefault("Low", 0);
                dto.overview.gracePeriod = String.format("veryhigh/high:%d , Medium:%d , Low:%d", h, m, l);
            }
        }

        dto.overview.staticAnalysisUnitId = report.getStaticAnalysisUnitId();
        if (report.getStaticAnalysis() != null) {
            dto.overview.sastScore = report.getStaticAnalysis().getScore();
            dto.overview.sastRating = report.getStaticAnalysis().getRating();
            dto.overview.submittedDate = report.getStaticAnalysis().getSubmittedDate();
            if (dto.overview.staticAnalysisUnitId == null) {
                dto.overview.staticAnalysisUnitId = report.getStaticAnalysis().getStaticAnalysisUnitId();
            }
        }

        // Conditionally Fetch Build Info
        if (includeBuildInfo) {
            try {
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

                // Track all skipped dependencies in a pre-pass to prevent adding them later as
                // non-dependencies
                Set<String> skippedDependencies = new HashSet<>();
                for (PrescanModule m : prescan.getModules()) {
                    String moduleName = m.getName();
                    String finalFileName = m.getFileName();
                    if (moduleName == null)
                        continue;

                    boolean isDep = m.isDependency() && !moduleName.toLowerCase().endsWith(".zip")
                            && !moduleName.toLowerCase().endsWith(".jar") &&
                            (finalFileName == null || (!finalFileName.toLowerCase().endsWith(".zip")
                                    && !finalFileName.toLowerCase().endsWith(".jar")));

                    if (isDep) {
                        skippedDependencies.add(moduleName.toLowerCase());
                        if (finalFileName != null) {
                            skippedDependencies.add(finalFileName.toLowerCase());
                        }
                    }
                }

                for (PrescanModule m : prescan.getModules()) {
                    String moduleName = m.getName();
                    String finalFileName = m.getFileName();
                    if (moduleName == null)
                        continue;

                    // Handle Generic Modules separately via balancing logic later
                    if (moduleName.equalsIgnoreCase("Python Files")) {
                        prescanPythonCount++;
                        continue;
                    }
                    if (moduleName.equalsIgnoreCase("JS Files") || moduleName.equalsIgnoreCase("JavaScript Files")) {
                        prescanJsCount++;
                        continue;
                    }

                    // Filter: Skip if explicitly a dependency (unless it's a jar/zip), has fatal
                    // errors,
                    // or if it was marked as a dependency elsewhere in the upload.
                    if (m.hasFatalErrors()) {
                        debugLog("DEBUG: Skipping unselected module (Fatal Errors): " + moduleName);
                        continue;
                    }

                    boolean isDependencyOrSkipped = (m.isDependency() && !moduleName.toLowerCase().endsWith(".zip")
                            && !moduleName.toLowerCase().endsWith(".jar") &&
                            (finalFileName == null || (!finalFileName.toLowerCase().endsWith(".zip")
                                    && !finalFileName.toLowerCase().endsWith(".jar"))))
                            || skippedDependencies.contains(moduleName.toLowerCase())
                            || (finalFileName != null && skippedDependencies.contains(finalFileName.toLowerCase()));

                    if (isDependencyOrSkipped) {
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

                                return nameMatch || fileMatch || nameInside || fileInside || selectedInsideName
                                        || selectedInsideFile;
                            });

                    if (isAlreadySelected) {
                        debugLog("DEBUG: Skipping unselected module (Already Selected): " + moduleName);
                        continue;
                    }

                    String displayName = (finalFileName != null && !finalFileName.isEmpty()) ? finalFileName
                            : moduleName;

                    boolean isExplicitInclude = veracodeConfig.getIncludeModules() != null
                            && veracodeConfig.getIncludeModules().stream()
                                    .anyMatch(inc -> displayName.toLowerCase().contains(inc.toLowerCase()));

                    boolean hasSelectedMatch = dto.selectedModules.stream()
                            .anyMatch(selected -> {
                                String s = selected.toLowerCase();
                                String d = displayName.toLowerCase();
                                // Exact prefix/suffix match
                                if (d.startsWith(s) || d.endsWith(s))
                                    return true;

                                // Fuzzy prefix match: check if both start with the same 6 characters
                                if (s.length() >= 6 && d.length() >= 6) {
                                    String sPrefix = s.substring(0, 6);
                                    String dPrefix = d.substring(0, 6);
                                    if (sPrefix.equals(dPrefix))
                                        return true;
                                }
                                return false;
                            });

                    // Rule: Include only if explicitly in include-modules OR if prefix/suffix
                    // matches a selected module
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
                        .filter(s -> s.toLowerCase().startsWith("python files within")
                                || s.toLowerCase().startsWith("python files"))
                        .count();
                int missingPython = prescanPythonCount - (int) selectedPythonCount;
                for (int i = 0; i < missingPython; i++) {
                    if (!dto.unselectedModules.contains("Python Files")) {
                        dto.unselectedModules.add("Python Files");
                    }
                }
                if (missingPython > 0)
                    debugLog("DEBUG: Added " + missingPython + " unselected Python Files via balancing logic.");

                // Apply Balancing Logic for JS
                long selectedJsCount = dto.selectedModules.stream()
                        .filter(s -> s.toLowerCase().startsWith("js files within")
                                || s.toLowerCase().startsWith("javascript files within"))
                        .count();
                int missingJs = prescanJsCount - (int) selectedJsCount;
                for (int i = 0; i < missingJs; i++) {
                    if (!dto.unselectedModules.contains("JS Files")) {
                        dto.unselectedModules.add("JS Files");
                    }
                }
                if (missingJs > 0)
                    debugLog("DEBUG: Added " + missingJs + " unselected JS Files via balancing logic.");
            }
        } catch (Exception e) {
            System.err.println("Warning: Could not perform gap analysis: " + e.getMessage());
            e.printStackTrace();
        }

        // Ensure no duplicates in selected and unselected modules
        dto.selectedModules = dto.selectedModules.stream()
                .distinct()
                .collect(Collectors.toList());

        // Ensure unselected modules don't contain anything from selected modules, and
        // no duplicates
        dto.unselectedModules = dto.unselectedModules.stream()
                .distinct()
                .filter(m -> !dto.selectedModules.contains(m))
                .collect(Collectors.toList());

        // Mapping is now handled by generateDetailedBreakdown
        saveJsonToLog(dto.overview.applicationName, dto);
        return dto;
    }

    private void saveJsonToLog(String appName, Object dto) {
        if (!veracodeConfig.isSaveJsonHistory())
            return;
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
            java.nio.file.Path historyDir = java.nio.file.Paths.get("veracode", "history").toAbsolutePath().normalize();
            java.nio.file.Path targetFile = historyDir.resolve(fileName).toAbsolutePath().normalize();

            if (!targetFile.startsWith(historyDir)) {
                throw new IllegalArgumentException("Access Denied: Invalid history file path.");
            }

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
            if (!java.nio.file.Files.exists(dir))
                return 1;
            try (java.util.stream.Stream<java.nio.file.Path> stream = java.nio.file.Files.list(dir)) {
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
            debugLog("[" + java.time.LocalDateTime.now() + "] Raw Prescan Results: "
                    + (xml.length() > 500 ? xml.substring(0, 500) : xml));

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
            String xml = resultsWrapper.detailedReport(buildId);
            if (xml != null && xml.contains("<error>")) {
                if (xml.contains("No report available")) {
                    throw new RuntimeException(
                            "Veracode Error: No report available. There may be a scan in progress. Please check Veracode or try again later.");
                }
                throw new RuntimeException("Veracode API Error: " + xml);
            }
            return xml;
        } catch (Exception e) {
            throw new RuntimeException("Failed to get raw detailed report", e);
        }
    }

    private void populateModulesAndArchitectures(String xml, VeracodeReportDTO dto) {
        try {
            DocumentBuilderFactory factory = createSecureDocumentBuilderFactory();
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
                                        .anyMatch(ignore -> (!moduleName.isEmpty()
                                                && moduleName.toLowerCase().contains(ignore.toLowerCase())) ||
                                                (!fileName.isEmpty()
                                                        && fileName.toLowerCase().contains(ignore.toLowerCase())));

                                if (isIgnored) {
                                    debugLog("DEBUG: Skipping architecture/selection for ignored module: "
                                            + (moduleName.isEmpty() ? fileName : moduleName));
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

    public String getSastResult(String applicationName) {
        return "Use /getfinalreport for full data";
    }

    public String getBuildId(String appId) {
        return "Legacy - use /getfinalreport";
    }

    public String getDetailedReport(String buildId) {
        return "Legacy - use /getfinalreport";
    }

    private void generateDetailedBreakdown(String xml, VeracodeReport report, VeracodeReportDTO dto) {
        try {
            if (report == null || report.getSeverities() == null)
                return;

            // Map to hold counts: Severity -> CWE -> List of Flaws
            var severityMap = new java.util.TreeMap<Integer, java.util.Map<String, java.util.List<Flaw>>>(
                    java.util.Collections.reverseOrder());
            int totalSast = 0;
            List<VeracodeReportDTO.FindingDTO> findings = new java.util.ArrayList<>();

            for (Severity severity : report.getSeverities()) {
                int sev = severity.getLevel();
                if (severity.getCategories() == null)
                    continue;

                for (Category category : severity.getCategories()) {
                    if (category.getCwes() == null)
                        continue;

                    for (Cwe cweObj : category.getCwes()) {
                        if (cweObj.getStaticFlaws() == null || cweObj.getStaticFlaws().getFlaws() == null)
                            continue;

                        for (Flaw flaw : cweObj.getStaticFlaws().getFlaws()) {
                            String mitigationStatus = flaw.getMitigationStatus();
                            String remediationStatus = flaw.getRemediationStatus();

                            if (mitigationStatus != null)
                                mitigationStatus = mitigationStatus.trim();

                            // Logic: Exclude "accepted" or "Fixed" from breakdown and total
                            if ("accepted".equalsIgnoreCase(mitigationStatus)
                                    || "Fixed".equalsIgnoreCase(remediationStatus)) {
                                continue;
                            }

                            String cweId = String.valueOf(cweObj.getCweId());
                            String cwe = "CWE-" + cweId;

                            severityMap.putIfAbsent(sev, new java.util.TreeMap<>());
                            severityMap.get(sev).putIfAbsent(cwe, new java.util.ArrayList<>());
                            severityMap.get(sev).get(cwe).add(flaw);
                            totalSast++;

                            // Logic for findingsWithComments: Report ONLY mitigation_status="proposed" with
                            // actual comments
                            if ("proposed".equalsIgnoreCase(mitigationStatus)) {
                                List<String> comments = new ArrayList<>();
                                if (flaw.getMitigationList() != null
                                        && flaw.getMitigationList().getMitigations() != null) {
                                    var mitigations = flaw.getMitigationList().getMitigations();
                                    if (!mitigations.isEmpty()) {
                                        var mit = mitigations.get(mitigations.size() - 1);
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
                                    fDto.description = flaw.getDescription();
                                    fDto.userComments = comments;
                                    fDto.remediation_due_date = calculateDueDate(flaw.getDateFirstOccurrence(),
                                            dto.overview.tier, fDto.severity);
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
                    finding.remediation_due_date = calculateDueDate(oldestDate, dto.overview.tier,
                            getSeverityName(sev));
                    sevBreakdown.findings.add(finding);
                });
                dto.sastSummary.breakdown.put(sevName, sevBreakdown);
            });

            // Map SCA remediation data using GitHub GraphQL (Conditional)
            java.util.Map<String, String> pkgToFixedVersion = new java.util.HashMap<>();
            dto.scaSafeVersionEnabled = veracodeConfig.isScaSafeVersionEnabled();

            if (dto.scaSafeVersionEnabled && report.getSca() != null
                    && report.getSca().getVulnerableComponents() != null) {
                try {
                    for (var comp : report.getSca().getVulnerableComponents().getComponents()) {
                        // Only query for components that have active vulnerabilities
                        boolean hasActiveVulns = false;
                        if (comp.getVulnerabilityList() != null
                                && comp.getVulnerabilityList().getVulnerabilities() != null) {
                            for (var v : comp.getVulnerabilityList().getVulnerabilities()) {
                                if (!isScaVulnerabilityMitigated(v) && v.getFixedVersion() == null) {
                                    hasActiveVulns = true;
                                    break;
                                }
                            }
                        }

                        if (hasActiveVulns) {
                            String name = comp.getLibrary();
                            String libId = comp.getLibraryId();
                            if (libId != null && libId.contains(":")) {
                                String ecosystem = libId.split(":")[0];
                                String ghFixed = fetchFixedVersionFromGitHub(name, ecosystem);
                                if (ghFixed != null) {
                                    debugLog("DEBUG: GitHub found fix for " + name + ": " + ghFixed);
                                    pkgToFixedVersion.put(name, ghFixed);
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    System.err.println("Warning: Could not fetch SCA data from GitHub: " + e.getMessage());
                }
            }

            java.util.Map<String, String> scaCveToFindingId = fetchScaFindingIdsAndLog(dto.overview.appId);
            updateScaSummaryFromReport(report, dto, pkgToFixedVersion, scaCveToFindingId);
            populateScaDetailSectionFromReport(report, dto, pkgToFixedVersion);

            // Finalize Mitigation Breakdowns by looping over the populated lists
            populateMitigationBreakdowns(dto);

        } catch (Exception e) {
            System.err.println("Error generating detailed breakdown: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void updateScaSummaryFromReport(VeracodeReport report, VeracodeReportDTO dto,
            java.util.Map<String, String> cveToFixedVersion,
            java.util.Map<String, String> scaCveToFindingId) {
        if (report == null || report.getSca() == null || report.getSca().getVulnerableComponents() == null) {
            return;
        }

        var scaTotals = new java.util.HashMap<Integer, Integer>();
        for (int i = 0; i <= 5; i++)
            scaTotals.put(i, 0);

        int vulnerabilitiesSca = 0;
        int totalVulnerablePackages = 0;
        var comps = report.getSca().getVulnerableComponents().getComponents();
        if (comps == null)
            return;

        for (var comp : comps) {
            boolean hasOpenVulnerability = false;
            if (comp.getVulnerabilityList() == null || comp.getVulnerabilityList().getVulnerabilities() == null)
                continue;

            for (var vuln : comp.getVulnerabilityList().getVulnerabilities()) {
                if (isScaVulnerabilityMitigated(vuln))
                    continue;

                int sev = (vuln.getSeverity() != null) ? vuln.getSeverity() : 0;
                scaTotals.put(sev, scaTotals.get(sev) + 1);
                vulnerabilitiesSca++;
                hasOpenVulnerability = true;

                // Mitigation checks for SCA using JAXB (Proposed but not yet approved)
                boolean hasProposedAction = false;
                var scaComments = new java.util.ArrayList<String>();

                if (vuln.getMitigationList() != null && vuln.getMitigationList().getMitigations() != null) {
                    var mitigationsList = vuln.getMitigationList().getMitigations();
                    if (!mitigationsList.isEmpty()) {
                        String latestAction = mitigationsList.get(0).getAction();
                        if (!"Reject Mitigation".equalsIgnoreCase(latestAction) &&
                                !"Rejected Mitigation".equalsIgnoreCase(latestAction) &&
                                !"Rejected".equalsIgnoreCase(latestAction) &&
                                !"Rollback Mitigation".equalsIgnoreCase(latestAction)) {

                            for (var mit : mitigationsList) {
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
                                        break; // Only select the latest/newest proposal comment!
                                    }
                                }
                            }
                        }
                    }
                }

                if (hasProposedAction) {
                    var fDto = new VeracodeReportDTO.FindingDTO();
                    fDto.type = "SCA";

                    // Look up internal numerical finding ID from REST map, fall back to cveId
                    String cve = vuln.getCveId();
                    String internalFindingId = (cve != null && scaCveToFindingId.containsKey(cve.toUpperCase()))
                            ? scaCveToFindingId.get(cve.toUpperCase())
                            : cve;

                    fDto.id = (comp.getComponentId() != null && !comp.getComponentId().isEmpty())
                            ? comp.getComponentId()
                            : internalFindingId;
                    fDto.cweid = vuln.getCweId();
                    fDto.title = vuln.getCveId();
                    fDto.severity = getSeverityName(sev);
                    fDto.location = comp.getLibrary();
                    fDto.fileName = comp.getFileName();
                    fDto.cve_summary = vuln.getSummary();
                    fDto.userComments = scaComments;
                    fDto.remediation_due_date = calculateDueDate(vuln.getFirstFoundDate(), dto.overview.tier,
                            fDto.severity);

                    // Use REST-derived fixed version if XML is empty
                    String fixedVer = vuln.getFixedVersion();
                    if ((fixedVer == null || fixedVer.isEmpty() || "N/A".equals(fixedVer))
                            && cveToFixedVersion.containsKey(vuln.getCveId())) {
                        fixedVer = cveToFixedVersion.get(vuln.getCveId());
                    }
                    fDto.fixedVersion = fixedVer;

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

    private void populateScaDetailSectionFromReport(VeracodeReport report, VeracodeReportDTO dto,
            java.util.Map<String, String> cveToFixedVersion) {
        if (report == null || report.getSca() == null || report.getSca().getVulnerableComponents() == null) {
            return;
        }

        var ecosystems = new java.util.HashSet<String>();
        var comps = report.getSca().getVulnerableComponents().getComponents();
        if (comps == null)
            return;

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

            if (comp.getVulnerabilityList() == null || comp.getVulnerabilityList().getVulnerabilities() == null)
                continue;

            var componentVulns = new java.util.ArrayList<ScaVulnerability>();
            for (var vuln : comp.getVulnerabilityList().getVulnerabilities()) {
                if (!isScaVulnerabilityMitigated(vuln)) {
                    componentVulns.add(vuln);
                }
            }

            if (!componentVulns.isEmpty()) {
                var detail = new VeracodeReportDTO.ScaDetailDTO();
                detail.packageName = (comp.getFileName() != null && !comp.getFileName().isEmpty()) ? comp.getFileName()
                        : library;
                detail.version = comp.getVersion();

                // Get the safe version from GitHub/OSV fallback or XML
                String ghsaFix = componentVulns.stream()
                        .map(v -> {
                            String fv = v.getFixedVersion();
                            if ((fv == null || fv.isEmpty() || "N/A".equals(fv))
                                    && cveToFixedVersion.containsKey(library)) {
                                fv = cveToFixedVersion.get(library);
                            }
                            return fv;
                        })
                        .filter(v -> v != null && !v.isEmpty() && !"N/A".equals(v))
                        .sorted((v1, v2) -> v2.compareTo(v1))
                        .findFirst()
                        .orElse(null);

                if (ghsaFix == null) {
                    detail.safeVersion = veracodeConfig.getScaNoFixMessage();
                } else if (isVersionLower(ghsaFix, detail.version)) {
                    detail.safeVersion = veracodeConfig.getScaStaleFixMessage();
                } else {
                    detail.safeVersion = ghsaFix;
                }

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
                    if (sValue > maxSev)
                        maxSev = sValue;

                    String sDesc = v.getSeverityDesc();
                    if (sDesc == null || sDesc.isEmpty()) {
                        sDesc = getSeverityName(sValue);
                    }
                    counts.put(sDesc, counts.getOrDefault(sDesc, 0) + 1);
                }
                detail.remediation_due_date = calculateDueDate(detail.firstFoundDate, dto.overview.tier,
                        getSeverityName(maxSev));

                var severityList = new java.util.ArrayList<String>();
                counts.forEach((sev, count) -> severityList.add(sev + ": " + count));
                detail.severityCounts = String.join(", ", severityList);

                dto.scaDetails.add(detail);
            }
        }

        if (veracodeConfig.getNoSca() != null && dto.architectures != null) {
            for (String noScaArch : veracodeConfig.getNoSca()) {
                for (String arch : dto.architectures) {
                    if (noScaArch.equalsIgnoreCase(arch)) {
                        ecosystems.add(noScaArch);
                        break;
                    }
                }
            }
        }

        dto.scaEcosystems = ecosystems.toString();
        verifyPackaging(new java.util.HashSet<>(dto.architectures), ecosystems, dto);
    }

    private boolean isScaVulnerabilityMitigated(ScaVulnerability vuln) {
        if ("accepted".equalsIgnoreCase(vuln.getMitigationStatus()))
            return true;
        if ("true".equalsIgnoreCase(vuln.getMitigation())) {
            if (vuln.getMitigationList() != null && vuln.getMitigationList().getMitigations() != null) {
                for (var mit : vuln.getMitigationList().getMitigations()) {
                    if ("Approve Mitigation".equalsIgnoreCase(mit.getAction()))
                        return true;
                }
            }
            // If mitigation=true but no approval list found, Veracode usually implies it's
            // resolved in detailed reports
            return true;
        }
        return false;
    }

    private void verifyPackaging(java.util.Set<String> architectures, java.util.Set<String> ecosystems,
            VeracodeReportDTO dto) {
        var mappings = veracodeConfig.getArchitectureMappings();
        if (mappings == null || mappings.isEmpty())
            return;

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
                    if (arch.equalsIgnoreCase("JavaScript") && ecosystems.contains("JavaScript"))
                        continue; // Should be handled by loop but just in case
                    if (arch.equalsIgnoreCase("Java") && ecosystems.contains("Java"))
                        continue;

                    dto.packagingAnomalies
                            .add("Architecture " + arch + " detected in SAST but no corresponding SCA ecosystem ("
                                    + rawExpected + ") found. Packaging may be incomplete.");
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
                if (rawVal == null)
                    continue;

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
                        .filter(e -> e.getValue() != null
                                && java.util.Arrays.stream(e.getValue().split(",")).anyMatch(v -> {
                                    String t = v.trim();
                                    return t.equalsIgnoreCase(eco) || mapToPrettyName(t).equalsIgnoreCase(eco);
                                }))
                        .map(java.util.Map.Entry::getKey)
                        .distinct()
                        .collect(java.util.stream.Collectors.joining(" or "));

                dto.packagingAnomalies.add("Ecosystem " + eco + " detected in SCA but no corresponding architecture ("
                        + expectedArches + ") was scanned in SAST. Check module selection.");
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

    private java.util.Map<String, VeracodeReportDTO.SeverityBreakdownDTO> formatScaBreakdown(
            java.util.Map<Integer, Integer> map) {
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
        if (policyName == null || !policyName.startsWith("PwC"))
            return "N/A";

        // Remove 6 characters as requested
        if (policyName.length() <= 6)
            return "N/A";
        String trimmed = policyName.substring(6);
        if (!trimmed.contains("_"))
            return "N/A";

        String[] parts = trimmed.split("_", 2);
        // Remove leading digits (e.g., "3HighlyConfidential" -> "HighlyConfidential")
        String dataClassification = parts[0].replaceAll("^\\d+", "");
        // Only take the first part of the exposure (e.g., "External_something" ->
        // "External")
        String tierExposure = parts[1].split("_")[0];

        var tierMappings = veracodeConfig.getTierMappings();
        if (tierMappings.containsKey(tierExposure)) {
            return tierMappings.get(tierExposure).getOrDefault(dataClassification, "N/A");
        }

        return "N/A";
    }

    private String calculateDueDate(String dateStr, String tier, String severity) {
        if (dateStr == null || dateStr.isEmpty() || tier == null || "N/A".equals(tier))
            return null;

        var gracePeriods = veracodeConfig.getGracePeriods();
        if (!gracePeriods.containsKey(tier))
            return null;

        // Normalize severity name (e.g., "Very High" -> "VeryHigh") to match config
        // keys
        String normalizedSeverity = severity != null ? severity.replace(" ", "") : "";
        Integer days = gracePeriods.get(tier).get(normalizedSeverity);
        if (days == null)
            return null;

        try {
            java.time.LocalDateTime ldt;
            if (dateStr.length() > 10) {
                // SCA format "2026-03-24 18:11:44 UTC"
                String cleanDate = dateStr.replace(" UTC", "");
                ldt = java.time.LocalDateTime.parse(cleanDate,
                        java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            } else {
                // SAST format "2026-03-24"
                ldt = java.time.LocalDate.parse(dateStr, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"))
                        .atStartOfDay();
            }

            return ldt.plusDays(days).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        } catch (Exception e) {
            return null;
        }
    }

    private String mapToPrettyName(String technicalName) {
        var mappings = veracodeConfig.getArchitectureMappings();
        if (mappings == null || mappings.isEmpty())
            return technicalName;

        return mappings.entrySet().stream()
                .filter(e -> {
                    if (e.getKey().equalsIgnoreCase(technicalName))
                        return true;
                    String val = e.getValue();
                    if (val == null)
                        return false;
                    return java.util.Arrays.stream(val.split(","))
                            .anyMatch(v -> v.trim().equalsIgnoreCase(technicalName));
                })
                .map(java.util.Map.Entry::getKey)
                .findFirst()
                .orElse(technicalName);
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

    private java.util.Map<String, String> fetchScaFindingIdsAndLog(String appId) {
        java.util.Map<String, String> cveToFindingId = new java.util.HashMap<>();
        if (appId == null || !appId.matches("^[a-zA-Z0-9\\-]+$")) {
            throw new IllegalArgumentException("Invalid appId format");
        }
        try {
            String appGuid = getApplicationGuid(appId);
            if (appGuid == null || appGuid.isEmpty()) {
                return cveToFindingId;
            }
            if (!appGuid.matches("^[a-fA-F0-9\\-]+$")) {
                throw new IllegalArgumentException("Invalid appGuid format");
            }

            String[] creds = getCredentials();
            String id = creds[0];
            String secret = creds[1];

            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            java.net.URL url = new java.net.URL(
                    "https://api.veracode.com/appsec/v2/applications/" + appGuid + "/findings?scan_type=SCA");
            String auth = com.veracode.http.util.HmacAuthHeaderGenerator.getVeracodeAuthorizationHeader(id, secret, url,
                    "GET");

            java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url.toString()))
                    .header("Authorization", auth)
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            java.net.http.HttpResponse<String> res = client.send(req,
                    java.net.http.HttpResponse.BodyHandlers.ofString());

            // Save raw findings JSON to log folder
            try {
                String safeAppGuid = appGuid.replaceAll("[^a-zA-Z0-9\\-]", "");
                String timestamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
                java.nio.file.Path logDir = java.nio.file.Paths.get("veracode", "logs").toAbsolutePath().normalize();
                java.nio.file.Files.createDirectories(logDir);
                java.nio.file.Path targetFile = logDir.resolve("sca_findings_rest_" + safeAppGuid + "_" + timestamp + ".json").toAbsolutePath().normalize();
                if (!targetFile.startsWith(logDir)) {
                    throw new IllegalArgumentException("Access Denied: Invalid log file path.");
                }
                java.nio.file.Files.writeString(targetFile, res.body());
                debugLog("DEBUG: Saved raw REST SCA findings to log folder.");
            } catch (Exception logEx) {
                debugLog("DEBUG: Failed to save REST SCA findings to log: " + logEx.getMessage());
            }

            if (res.statusCode() == 200) {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                com.crs_reivew_api.dto.VeracodeScaFindingsRestDTO restDto = mapper.readValue(res.body(),
                        com.crs_reivew_api.dto.VeracodeScaFindingsRestDTO.class);
                if (restDto != null && restDto._embedded != null && restDto._embedded.findings != null) {
                    for (var finding : restDto._embedded.findings) {
                        if (finding.finding_details != null && finding.finding_details.cve != null) {
                            String cve = finding.finding_details.cve.name;
                            String internalId = finding.finding_details.component_id;
                            if (cve != null && !cve.isEmpty() && internalId != null && !internalId.isEmpty()) {
                                cveToFindingId.put(cve.toUpperCase(), internalId);
                            }
                        }
                    }
                }
            } else {
                debugLog("DEBUG: Failed to query SCA findings from REST API (" + res.statusCode() + "): " + res.body());
            }
        } catch (Exception e) {
            debugLog("DEBUG: Error querying SCA REST findings: " + e.getMessage());
        }
        return cveToFindingId;
    }

    private String resolveScaCveToFindingId(String appGuid, String cveId) throws Exception {
        String[] creds = getCredentials();
        String id = creds[0];
        String secret = creds[1];
        java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();

        java.net.URL url = new java.net.URL(
                "https://api.veracode.com/appsec/v2/applications/" + appGuid + "/findings?scan_type=SCA");
        String auth = com.veracode.http.util.HmacAuthHeaderGenerator.getVeracodeAuthorizationHeader(id, secret, url,
                "GET");

        java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(url.toString()))
                .header("Authorization", auth)
                .header("Accept", "application/json")
                .GET()
                .build();

        java.net.http.HttpResponse<String> res = client.send(req, java.net.http.HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() == 200) {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.crs_reivew_api.dto.VeracodeScaFindingsRestDTO restDto = mapper.readValue(res.body(),
                    com.crs_reivew_api.dto.VeracodeScaFindingsRestDTO.class);
            if (restDto != null && restDto._embedded != null && restDto._embedded.findings != null) {
                for (var finding : restDto._embedded.findings) {
                    if (finding.finding_details != null && finding.finding_details.cve != null) {
                        String cve = finding.finding_details.cve.name;
                        if (cveId.equalsIgnoreCase(cve)) {
                            String internalId = finding.finding_details.component_id;
                            if (internalId != null && !internalId.isEmpty()) {
                                debugLog("DEBUG: Resolved SCA CVE " + cveId + " to internal Finding ID: " + internalId);
                                return internalId;
                            }
                        }
                    }
                }
            }
        } else {
            debugLog("DEBUG: Failed to query SCA findings from REST API (" + res.statusCode() + "): " + res.body());
        }

        throw new RuntimeException("Could not find a matching internal Veracode Finding ID for SCA CVE: " + cveId);
    }
}
