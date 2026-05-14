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

@Service
public class AiService {

    private static final Logger logger = LoggerFactory.getLogger(AiService.class);

    @Autowired
    private VeracodeConfig veracodeConfig;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .proxy(java.net.ProxySelector.getDefault())
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

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

        // 2. Fallback: If engine name starts with 'azure.', treat it as the model name directly
        if (engine.toLowerCase().startsWith("azure.")) {
            return callSharedService(engine, prompt);
        }
        
        throw new IllegalArgumentException("Unsupported AI engine: " + engine);
    }

    private AiResult callSharedService(String model, String prompt) throws Exception {
        String url = veracodeConfig.getSharedServiceEndpoint();
        String key = veracodeConfig.getSharedServiceKey();

        if (url == null || url.isEmpty()) {
            throw new RuntimeException("Shared AI Service endpoint is not configured");
        }
        java.net.URI uri = URI.create(url);
        logger.info("Shared Service Debug - URL: '{}', Host: '{}', Path: '{}'", url, uri.getHost(), uri.getPath());
        if (uri.getHost() == null) {
            throw new RuntimeException("Invalid Shared Service URL: Host is null. URL was: " + url);
        }

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", model);
        payload.putArray("messages")
               .addObject()
               .put("role", veracodeConfig.getSharedServiceRole())
               .put("content", prompt);

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload.toString()));
        
        if (key != null && !key.isEmpty()) {
            builder.header("Authorization", "Bearer " + key);
        }

        HttpRequest request = builder.build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            logger.error("Shared AI Service error ({}): {}", response.statusCode(), response.body());
            throw new RuntimeException("Shared AI Service error (" + response.statusCode() + "): " + response.body());
        }

        JsonNode root = objectMapper.readTree(response.body());
        JsonNode contentNode = root.path("choices").path(0).path("message").path("content");
        String text = contentNode.isMissingNode() ? response.body() : contentNode.asText();

        // Standard OpenAI-compatible usage tracking
        int inTokens = root.path("usage").path("prompt_tokens").asInt(0);
        int outTokens = root.path("usage").path("completion_tokens").asInt(0);

        return new AiResult(text, inTokens, outTokens);
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
            logger.error("Gemini API error ({}): {}", response.statusCode(), response.body());
            throw new RuntimeException("Gemini API error (" + response.statusCode() + "): " + response.body());
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
            throw new RuntimeException("Azure OpenAI API error (" + response.statusCode() + "): " + response.body());
        }

        JsonNode root = objectMapper.readTree(response.body());
        JsonNode contentNode = root.path("choices").path(0).path("message").path("content");
        String text = contentNode.isMissingNode() ? response.body() : contentNode.asText();

        int inTokens = root.path("usage").path("prompt_tokens").asInt(0);
        int outTokens = root.path("usage").path("completion_tokens").asInt(0);

        return new AiResult(text, inTokens, outTokens);
    }
}
