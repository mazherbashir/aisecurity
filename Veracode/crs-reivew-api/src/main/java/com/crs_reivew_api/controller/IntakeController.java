package com.crs_reivew_api.controller;

import com.crs_reivew_api.config.VeracodeConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;

@RestController
public class IntakeController {

    private static final Logger logger = LoggerFactory.getLogger(IntakeController.class);
    private final VeracodeConfig veracodeConfig;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .proxy(java.net.ProxySelector.getDefault())
            .build();

    public IntakeController(VeracodeConfig veracodeConfig) {
        this.veracodeConfig = veracodeConfig;
    }

    @GetMapping(value = "/api/intake/requests", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getIntakeRequests() {
        String endpoint = veracodeConfig.getGcastRestEndpointIntake();
        String secretKey = veracodeConfig.getGcastSecretKey();

        if (endpoint == null || endpoint.isEmpty()) {
            logger.error("GCast Intake rest endpoint is not configured in credentials file.");
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Configuration Error");
            errorResponse.put("message", "gcast-rest-endpoint-intake is missing or empty in configuration.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }

        if (secretKey == null || secretKey.isEmpty()) {
            logger.error("GCast secret key is not configured in credentials file.");
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Configuration Error");
            errorResponse.put("message", "gcast-secret-key is missing or empty in configuration.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }

        logger.info("Fetching GCast intake requests from: {}", endpoint);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Authorization", secretKey)
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                logger.error("GCast Intake API returned error code: {}. Response: {}", response.statusCode(), response.body());
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("error", "API Error");
                errorResponse.put("status", response.statusCode());
                errorResponse.put("message", "GCast API returned status code " + response.statusCode());
                try {
                    JsonNode errorDetails = objectMapper.readTree(response.body());
                    errorResponse.put("details", errorDetails);
                } catch (Exception e) {
                    errorResponse.put("details", response.body());
                }
                return ResponseEntity.status(response.statusCode()).body(errorResponse);
            }

            JsonNode responseJson = objectMapper.readTree(response.body());
            return ResponseEntity.ok(responseJson);

        } catch (Exception e) {
            logger.error("Exception occurred while calling GCast Intake API", e);
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Connection Error");
            errorResponse.put("message", "Failed to retrieve intake requests: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
