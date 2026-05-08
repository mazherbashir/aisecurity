package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.net.URI;
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

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String callAi(String engine, String prompt) throws Exception {
        logger.info("Calling AI engine: {}", engine);
        if ("gemini".equalsIgnoreCase(engine)) {
            return callGemini(prompt);
        } else if ("azure".equalsIgnoreCase(engine) || "azureopenai".equalsIgnoreCase(engine)) {
            return callAzure(prompt);
        }
        throw new IllegalArgumentException("Unsupported AI engine: " + engine);
    }

    private String callGemini(String prompt) throws Exception {
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
        
        return textNode.isMissingNode() ? response.body() : textNode.asText();
    }

    private String callAzure(String prompt) throws Exception {
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

        return contentNode.isMissingNode() ? response.body() : contentNode.asText();
    }
}
