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

    @GetMapping(value = "/api/intake/requests", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getIntakeRequests() {
        String endpoint = veracodeConfig.getGcaasRestEndpointIntake();
        String secretKey = veracodeConfig.getGcaasSecretKey();

        if (endpoint == null || endpoint.isEmpty()) {
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

        String maskedKey = (secretKey != null && secretKey.length() > 8)
                ? secretKey.substring(0, 4) + "..." + secretKey.substring(secretKey.length() - 4)
                : (secretKey != null ? secretKey : "null");

        logger.info("Fetching GCaaS intake requests from: {}. Using Proxy-Authorization key: {} (length: {})", 
                endpoint, maskedKey, secretKey != null ? secretKey.length() : 0);

        try (CloseableHttpClient httpClient = createHttpClient()) {
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
                    logger.error("GCaaS Intake API returned error code: {}. Response: {}", responseCode, responseBody);
                    Map<String, Object> errorResponse = new HashMap<>();
                    errorResponse.put("error", "API Error");
                    errorResponse.put("status", responseCode);
                    errorResponse.put("message", "GCaaS API returned status code " + responseCode);
                    try {
                        JsonNode errorDetails = objectMapper.readTree(responseBody);
                        errorResponse.put("details", errorDetails);
                    } catch (Exception e) {
                        errorResponse.put("details", responseBody);
                    }
                    return ResponseEntity.status(responseCode).body(errorResponse);
                }

                JsonNode responseJson = objectMapper.readTree(responseBody);
                return ResponseEntity.ok(responseJson);
            }
        } catch (Exception e) {
            logger.error("Exception occurred while calling GCaaS Intake API", e);
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Connection Error");
            errorResponse.put("message", "Failed to retrieve intake requests: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
