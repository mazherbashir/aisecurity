package com.crs_reivew_api.controller;

import com.crs_reivew_api.config.VeracodeConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.client5.http.io.HttpClientConnectionManager;
import org.apache.hc.client5.http.ssl.NoopHostnameVerifier;
import org.apache.hc.client5.http.ssl.SSLConnectionSocketFactoryBuilder;
import org.apache.hc.client5.http.ssl.TrustAllStrategy;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.ssl.SSLContexts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.net.ssl.SSLContext;
import java.util.HashMap;
import java.util.Map;

@RestController
public class IntakeController {

    private static final Logger logger = LoggerFactory.getLogger(IntakeController.class);
    private final VeracodeConfig veracodeConfig;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public IntakeController(VeracodeConfig veracodeConfig) {
        this.veracodeConfig = veracodeConfig;
    }

    private CloseableHttpClient createHttpClient() {
        try {
            SSLContext sslContext = SSLContexts.custom()
                    .loadTrustMaterial(TrustAllStrategy.INSTANCE)
                    .build();

            HttpClientConnectionManager cm = PoolingHttpClientConnectionManagerBuilder.create()
                    .setSSLSocketFactory(SSLConnectionSocketFactoryBuilder.create()
                            .setSslContext(sslContext)
                            .setHostnameVerifier(NoopHostnameVerifier.INSTANCE)
                            .build())
                    .build();

            return HttpClients.custom()
                    .setConnectionManager(cm)
                    .build();
        } catch (Exception e) {
            logger.error("Failed to create trust-all Apache HttpClient, falling back to default.", e);
            return HttpClients.createDefault();
        }
    }

    private JsonNode fetchEndpointData(CloseableHttpClient httpClient, String endpoint, String secretKey) throws Exception {
        String maskedKey = (secretKey != null && secretKey.length() > 8)
                ? secretKey.substring(0, 4) + "..." + secretKey.substring(secretKey.length() - 4)
                : (secretKey != null ? secretKey : "null");

        logger.info("Fetching GCaaS requests from: {}. Using Proxy-Authorization key: {} (length: {})", 
                endpoint, maskedKey, secretKey != null ? secretKey.length() : 0);

        HttpGet request = new HttpGet(endpoint);
        request.setHeader("Proxy-Authorization", secretKey);
        request.setHeader("Content-Type", "application/json");
        request.setHeader("Accept", "application/json");

        logger.info("Outgoing Request URI: {}", endpoint);
        logger.info("Outgoing Request Headers: Proxy-Authorization=[{}], Content-Type=[application/json], Accept=[application/json]", secretKey);

        try (CloseableHttpResponse response = httpClient.execute(request)) {
            int responseCode = response.getCode();
            String responseBody = response.getEntity() != null ? EntityUtils.toString(response.getEntity()) : "";

            if (responseCode != 200) {
                logger.error("GCaaS API returned error code: {}. Response: {}", responseCode, responseBody);
                throw new RuntimeException("GCaaS API returned status code " + responseCode + ": " + responseBody);
            }

            return objectMapper.readTree(responseBody);
        }
    }

    private String combineUrls(String baseUrl, String endpoint) {
        if (baseUrl == null || baseUrl.isEmpty()) {
            return endpoint;
        }
        if (endpoint == null || endpoint.isEmpty()) {
            return baseUrl;
        }
        boolean baseEnds = baseUrl.endsWith("/");
        boolean endStarts = endpoint.startsWith("/");
        if (baseEnds && endStarts) {
            return baseUrl + endpoint.substring(1);
        } else if (!baseEnds && !endStarts) {
            return baseUrl + "/" + endpoint;
        } else {
            return baseUrl + endpoint;
        }
    }

    @GetMapping(value = "/api/intake/requests", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getIntakeRequests() {
        String baseUrl = veracodeConfig.getGcaasRestBaseURL();
        String intakeEndpoint = combineUrls(baseUrl, veracodeConfig.getGcaasRestEndpointIntake());
        String remediationEndpoint = combineUrls(baseUrl, veracodeConfig.getGcaasRestEndpointRemediation());
        String secretKey = veracodeConfig.getGcaasSecretKey();

        if (intakeEndpoint == null || intakeEndpoint.isEmpty()) {
            logger.error("GCaaS Intake rest endpoint is not configured in credentials file.");
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Configuration Error");
            errorResponse.put("message", "gcaas-rest-endpoint-intake is missing or empty in configuration.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }

        if (secretKey == null || secretKey.isEmpty()) {
            logger.error("GCaaS secret key is not configured in credentials file.");
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Configuration Error");
            errorResponse.put("message", "gcaas-secret-key is missing or empty in configuration.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }

        com.fasterxml.jackson.databind.node.ArrayNode combinedArray = objectMapper.createArrayNode();

        try (CloseableHttpClient httpClient = createHttpClient()) {
            // 1. Fetch Intake
            try {
                JsonNode intakeJson = fetchEndpointData(httpClient, intakeEndpoint, secretKey);
                JsonNode intakeList = intakeJson.has("result") ? intakeJson.get("result") : intakeJson;
                if (intakeList.isArray()) {
                    for (JsonNode node : intakeList) {
                        combinedArray.add(node);
                    }
                } else {
                    combinedArray.add(intakeList);
                }
            } catch (Exception e) {
                logger.error("Error fetching intake requests from {}: {}", intakeEndpoint, e.getMessage());
            }

            // 2. Fetch Remediation (if configured)
            if (remediationEndpoint != null && !remediationEndpoint.isEmpty()) {
                try {
                    JsonNode remediationJson = fetchEndpointData(httpClient, remediationEndpoint, secretKey);
                    JsonNode remediationList = remediationJson.has("result") ? remediationJson.get("result") : remediationJson;
                    if (remediationList.isArray()) {
                        for (JsonNode node : remediationList) {
                            combinedArray.add(node);
                        }
                    } else {
                        combinedArray.add(remediationList);
                    }
                } catch (Exception e) {
                    logger.error("Error fetching remediation requests from {}: {}", remediationEndpoint, e.getMessage());
                }
            } else {
                logger.warn("GCaaS Remediation rest endpoint is not configured, skipping.");
            }

            // Wrap the combined array in a root object under the "result" key to maintain original structure
            com.fasterxml.jackson.databind.node.ObjectNode rootResponse = objectMapper.createObjectNode();
            rootResponse.set("result", combinedArray);

            return ResponseEntity.ok(rootResponse);
        } catch (Exception e) {
            logger.error("Exception occurred while calling GCaaS APIs", e);
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Connection Error");
            errorResponse.put("message", "Failed to retrieve requests: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
