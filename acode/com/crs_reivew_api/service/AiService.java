package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.util.List;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.owasp.encoder.Encode;

@Service
public class AiService {

    private static final Logger logger = LoggerFactory.getLogger(AiService.class);

    @Autowired
    private VeracodeConfig veracodeConfig;

    private HttpClient httpClient = HttpClient.newBuilder()
            .proxy(java.net.ProxySelector.getDefault())
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public void setHttpClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public static class AiResult {
        public String text;
        public int inTokens;
        public int outTokens;
        public AiResult(String text, int inTokens, int outTokens) {
            this.text = text;
            this.inTokens = inTokens;
            this.outTokens = outTokens;
        }
    }

    public static class AnalysisResult {
        public String result;
        public String auditVerdict;
        public int inTokens;
        public int outTokens;

        public AnalysisResult(String result, String auditVerdict, int inTokens, int outTokens) {
            this.result = result;
            this.auditVerdict = auditVerdict;
            this.inTokens = inTokens;
            this.outTokens = outTokens;
        }
    }

    public AnalysisResult analyzeFinding(String engine, String type, String flawId, String flawSummary, String userComment) {
        if (engine == null || engine.isEmpty()) {
            List<String> engines = veracodeConfig.getAiEngines();
            if (engines != null && !engines.isEmpty()) {
                engine = engines.get(0);
            } else {
                engine = "gemini";
            }
        }

        String prompt = (userComment != null) ? userComment : "";
        String fullPrompt = prompt;

        if ("SAST".equalsIgnoreCase(type)) {
            fullPrompt = veracodeConfig.getSastPrompt() + "\n\n" +
                         "this is the flaw id " + flawId + "\n" +
                         flawSummary + "\n\n" + prompt;
        } else if ("SCA".equalsIgnoreCase(type)) {
            fullPrompt = veracodeConfig.getScaPrompt() + "\n\n" +
                         "this is the flaw id " + flawId + "\n" +
                         flawSummary + "\n\n" + prompt;
        }

        try {
            logger.info("Analyzing finding id: {}, type: {}, engine: {}", flawId, type, engine);
            AiResult result = callAi(engine, fullPrompt);

            int totalInTokens = result.inTokens;
            int totalOutTokens = result.outTokens;
            String finalResultText = result.text;
            String auditVerdict = null;

            if (veracodeConfig.isSecondaryAuditEnabled()) {
                logger.info("Executing Secondary Audit Verification for flaw id: {}", flawId);
                try {
                    String auditorPromptSystem = veracodeConfig.getAuditorPrompt();
                    String auditorFullPrompt = auditorPromptSystem + "\n\n" +
                                               "[Original Request Data]:\n" + fullPrompt + "\n\n" +
                                               "[Phase 1 Output]:\n" + result.text;

                    AiResult auditResult = callAuditorService(veracodeConfig.getAuditorModelName(), auditorFullPrompt);
                    totalInTokens += auditResult.inTokens;
                    totalOutTokens += auditResult.outTokens;

                    boolean agrees = true;
                    String verdictText = auditResult.text.toLowerCase();
                    int verdictIndex = verdictText.indexOf("validation verdict");
                    if (verdictIndex != -1) {
                        int endOfLine = auditResult.text.indexOf("\n", verdictIndex);
                        String verdictLine = (endOfLine == -1) ? 
                            auditResult.text.substring(verdictIndex) : 
                            auditResult.text.substring(verdictIndex, endOfLine);
                        
                        if (verdictLine.toLowerCase().contains("disagree")) {
                            agrees = false;
                        }
                    }

                    if (!agrees) {
                        logger.warn("AUDIT CONTRADICTION DETECTED for flaw id {}: Secondary Auditor disagreed with Phase 1 Verdict.", flawId);
                        finalResultText = veracodeConfig.getAuditorDisagreeFallbackText();
                        saveAuditFailureLog(fullPrompt, result.text, auditResult.text);
                        auditVerdict = "Disagree";
                    } else {
                        logger.info("Secondary Auditor agreed with Phase 1 Verdict for flaw id {}.", flawId);
                        auditVerdict = "Agree";
                    }
                } catch (Exception auditEx) {
                    logger.error("Secondary Audit failed for flaw id {}, continuing with primary AI result. Error: {}", flawId, auditEx.getMessage(), auditEx);
                }
            }

            return new AnalysisResult(finalResultText, auditVerdict, totalInTokens, totalOutTokens);
        } catch (Exception e) {
            logger.error("Failed to analyze finding id {}: {}", flawId, e.getMessage(), e);
            return new AnalysisResult("Unable to generate review comment: " + e.getMessage(), null, 0, 0);
        }
    }

    public AiResult callAi(String engine, String prompt) throws Exception {
        logger.info("Calling AI engine: {}", engine);
        if ("gemini".equalsIgnoreCase(engine)) {
            return callGemini(prompt);
        } else if ("azure".equalsIgnoreCase(engine) || "azureopenai".equalsIgnoreCase(engine)) {
            return callAzure(prompt);
        }
        
        // 1. Check if engine is mapped to a model via the positional engine-models list
        List<String> allEngines = veracodeConfig.getAiEngines();
        List<String> sharedModels = veracodeConfig.getEngineModels();
        
        // Find non-native engines (exclude Gemini and Azure)
        List<String> customEngines = allEngines.stream()
            .filter(e -> !"gemini".equalsIgnoreCase(e) && !"azure".equalsIgnoreCase(e) && !"azure openai".equalsIgnoreCase(e))
            .collect(java.util.stream.Collectors.toList());
            
        int index = -1;
        for (int i = 0; i < customEngines.size(); i++) {
            if (customEngines.get(i).equalsIgnoreCase(engine)) {
                index = i;
                break;
            }
        }
        
        if (index != -1 && index < sharedModels.size()) {
            return callSharedService(sharedModels.get(index), prompt);
        }

        // 2. Check if engine matches any model directly in sharedModels
        if (sharedModels != null) {
            for (String m : sharedModels) {
                if (m != null && m.equalsIgnoreCase(engine)) {
                    return callSharedService(m, prompt);
                }
            }
        }

        // 3. Fallback: If engine name starts with common provider prefixes or contains '.' or '-', or if shared endpoint is present
        String lowerEngine = engine.toLowerCase();
        if (lowerEngine.startsWith("azure.") || lowerEngine.startsWith("bedrock.") || lowerEngine.startsWith("openai.") || lowerEngine.startsWith("vertex.") || lowerEngine.startsWith("aws.") || lowerEngine.startsWith("anthropic.") || lowerEngine.startsWith("claude.") || lowerEngine.startsWith("gpt.") || lowerEngine.startsWith("gemini.") || lowerEngine.contains(".") || lowerEngine.contains("-")) {
            return callSharedService(engine, prompt);
        }

        // 4. General Fallback: if sharedServiceEndpoint is configured, try calling shared service with engine as model
        String endpoint = veracodeConfig.getSharedServiceEndpoint();
        if (endpoint != null && !endpoint.trim().isEmpty()) {
            return callSharedService(engine, prompt);
        }

        throw new IllegalArgumentException("Unsupported AI engine: " + engine);
    }

    public AiResult callAuditorService(String model, String prompt) throws Exception {
        String url = veracodeConfig.getSharedAuditorEndpoint();
        String key = veracodeConfig.getSharedServiceKey();
        String role = veracodeConfig.getSharedAuditorRole();
        int maxTokens = veracodeConfig.getSharedAuditorMaxTokens();
        return executeSharedApiCall("Shared Auditor AI Service", url, key, model, role, prompt, maxTokens);
    }

    public void saveAuditFailureLog(String originalRequestData, String phase1Output, String auditorResponse) {
        try {
            String timestamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmss").format(new java.util.Date());
            java.nio.file.Path logDir = java.nio.file.Paths.get("veracode", "logs");
            java.nio.file.Files.createDirectories(logDir);
            
            ObjectNode logPayload = objectMapper.createObjectNode();
            logPayload.put("timestamp", timestamp);
            logPayload.put("originalRequestData", originalRequestData);
            logPayload.put("phase1Output", phase1Output);
            logPayload.put("auditorResponse", auditorResponse);
            
            String fileName = String.format("audit_fail_%s.json", timestamp);
            java.nio.file.Files.writeString(logDir.resolve(fileName), objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(logPayload));
            logger.info("Saved detailed auditor mismatch log to: {}", logDir.resolve(fileName).toAbsolutePath());
        } catch (Exception e) {
            logger.error("Warning: Could not save auditor failure log: {}", e.getMessage());
        }
    }

    private AiResult callSharedService(String model, String prompt) throws Exception {
        String url = veracodeConfig.getSharedServiceEndpoint();
        String key = veracodeConfig.getSharedServiceKey();
        String role = veracodeConfig.getSharedServiceRole();
        int maxTokens = veracodeConfig.getSharedServiceMaxTokens();
        return executeSharedApiCall("Shared AI Service", url, key, model, role, prompt, maxTokens);
    }

    private boolean shouldUseMaxCompletionTokens(String model) {
        if (model == null) return false;
        String lower = model.toLowerCase();
        return lower.contains("gpt-6") || lower.contains("o1") || lower.contains("o3") || lower.contains("o4")
                || lower.contains("sol") || lower.contains("reasoning")
                || (lower.startsWith("openai.") && !lower.contains("gpt-4") && !lower.contains("gpt-3"));
    }

    private AiResult executeSharedApiCall(String serviceName, String url, String key, String model, String role, String prompt, int maxTokens) throws Exception {
        if (url == null || url.trim().isEmpty()) {
            throw new RuntimeException(serviceName + " endpoint is not configured");
        }
        java.net.URI uri = URI.create(url);
        logger.info("{} Debug - URL: '{}', Host: '{}', Path: '{}'", serviceName, url, uri.getHost(), uri.getPath());
        if (uri.getHost() == null) {
            throw new RuntimeException("Invalid " + serviceName + " URL: Host is null. URL was: " + url);
        }

        boolean useCompletionTokens = shouldUseMaxCompletionTokens(model);
        String tokenParam = useCompletionTokens ? "max_completion_tokens" : "max_tokens";

        HttpResponse<String> response = sendSharedHttpRequest(url, key, model, role, prompt, maxTokens, tokenParam);

        // Handle 400 error where max_tokens is not supported vs max_completion_tokens is expected
        if (response.statusCode() == 400 && response.body() != null) {
            String body = response.body();
            if (body.contains("max_completion_tokens") || body.contains("max_tokens' is not supported") || body.contains("max_tokens")) {
                String fallbackParam = "max_tokens".equals(tokenParam) ? "max_completion_tokens" : "max_tokens";
                logger.warn("{} returned 400 with token param '{}'. Retrying with fallback token param '{}' for model '{}'", serviceName, tokenParam, fallbackParam, model);
                response = sendSharedHttpRequest(url, key, model, role, prompt, maxTokens, fallbackParam);
            }
        }

        if (response.statusCode() != 200) {
            String sanitizedBody = Encode.forJava(response.body());
            logger.error("{} error ({}): {}", serviceName, response.statusCode(), sanitizedBody);
            throw new RuntimeException(serviceName + " error (" + response.statusCode() + "): " + sanitizedBody);
        }

        JsonNode root = objectMapper.readTree(response.body());
        JsonNode contentNode = root.path("choices").path(0).path("message").path("content");
        String text = contentNode.isMissingNode() ? response.body() : contentNode.asText();

        int inTokens = root.path("usage").path("prompt_tokens").asInt(0);
        int outTokens = root.path("usage").path("completion_tokens").asInt(0);

        return new AiResult(text, inTokens, outTokens);
    }

    private HttpResponse<String> sendSharedHttpRequest(String url, String key, String model, String role, String prompt, int maxTokens, String tokenParam) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", model);
        payload.putArray("messages")
               .addObject()
               .put("role", role)
               .put("content", prompt);
        payload.put(tokenParam, maxTokens);
        payload.put("stream", false);

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload.toString()));
        
        if (key != null && !key.trim().isEmpty()) {
            builder.header("Authorization", "Bearer " + key);
        }

        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private AiResult callGemini(String prompt) throws Exception {
        String key = veracodeConfig.getGeminiKey();
        String model = veracodeConfig.getGeminiModel();
        if (key == null || key.isEmpty()) throw new RuntimeException("Gemini API key is missing");

        String url = String.format("https://generativelanguage.googleapis.com/v1/models/%s:generateContent?key=%s", model, key);
        logger.debug("Gemini request URL: https://generativelanguage.googleapis.com/v1/models/{}:generateContent", model);

        ObjectNode payload = objectMapper.createObjectNode();
        payload.putArray("contents")
               .addObject()
               .putArray("parts")
               .addObject()
               .put("text", prompt);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            String sanitizedBody = Encode.forJava(response.body());
            logger.error("Gemini API error ({}): {}", response.statusCode(), sanitizedBody);
            throw new RuntimeException("Gemini API error (" + response.statusCode() + "): " + sanitizedBody);
        }

        JsonNode root = objectMapper.readTree(response.body());
        JsonNode textNode = root.path("candidates").path(0).path("content").path("parts").path(0).path("text");
        String text = textNode.isMissingNode() ? response.body() : textNode.asText();

        int inTokens = root.path("usageMetadata").path("promptTokenCount").asInt(0);
        int outTokens = root.path("usageMetadata").path("candidatesTokenCount").asInt(0);

        return new AiResult(text, inTokens, outTokens);
    }

    private AiResult callAzure(String prompt) throws Exception {
        String key = veracodeConfig.getAzureKey();
        String endpoint = veracodeConfig.getAzureEndpoint();
        String deployment = veracodeConfig.getAzureDeployment();

        if (key == null || endpoint == null || deployment == null) {
            throw new RuntimeException("Azure OpenAI configuration is incomplete");
        }

        String url = String.format("%s/openai/deployments/%s/chat/completions?api-version=2024-02-15-preview", endpoint, deployment);

        ObjectNode payload = objectMapper.createObjectNode();
        payload.putArray("messages")
               .addObject()
               .put("role", "user")
               .put("content", prompt);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .header("api-key", key)
                .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            String sanitizedBody = Encode.forJava(response.body());
            throw new RuntimeException("Azure OpenAI API error (" + response.statusCode() + "): " + sanitizedBody);
        }

        JsonNode root = objectMapper.readTree(response.body());
        JsonNode contentNode = root.path("choices").path(0).path("message").path("content");
        String text = contentNode.isMissingNode() ? response.body() : contentNode.asText();

        int inTokens = root.path("usage").path("prompt_tokens").asInt(0);
        int outTokens = root.path("usage").path("completion_tokens").asInt(0);

        return new AiResult(text, inTokens, outTokens);
    }
}
