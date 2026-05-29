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

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.cert.X509Certificate;
import java.util.HashMap;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

@RestController
public class IntakeController {

    private static final Logger logger = LoggerFactory.getLogger(IntakeController.class);
    private final VeracodeConfig veracodeConfig;
    private final ObjectMapper objectMapper = new ObjectMapper();

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

        String maskedKey = (secretKey != null && secretKey.length() > 8)
                ? secretKey.substring(0, 4) + "..." + secretKey.substring(secretKey.length() - 4)
                : (secretKey != null ? secretKey : "null");

        logger.info("Fetching GCast intake requests from: {}. Using Proxy-Authorization key: {} (length: {})", 
                endpoint, maskedKey, secretKey != null ? secretKey.length() : 0);

        try {
            URL url = new URI(endpoint).toURL();
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();

            // Set SSL Context if HttpsURLConnection to bypass validation
            if (conn instanceof HttpsURLConnection) {
                HttpsURLConnection httpsConn = (HttpsURLConnection) conn;

                TrustManager[] trustAllCerts = new TrustManager[]{
                    new X509TrustManager() {
                        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                        public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                        public void checkServerTrusted(X509Certificate[] certs, String authType) {}
                    }
                };

                SSLContext sslContext = SSLContext.getInstance("TLS");
                sslContext.init(null, trustAllCerts, new java.security.SecureRandom());
                httpsConn.setSSLSocketFactory(sslContext.getSocketFactory());
                httpsConn.setHostnameVerifier((hostname, session) -> true);
            }

            conn.setRequestMethod("GET");
            conn.setRequestProperty("Proxy-Authorization", secretKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");

            // Log outgoing request headers for verification
            logger.info("Outgoing Request: URI={}, Headers: Proxy-Authorization={}, Content-Type={}, Accept={}",
                    endpoint, maskedKey, conn.getRequestProperty("Content-Type"), conn.getRequestProperty("Accept"));

            int responseCode = conn.getResponseCode();

            BufferedReader in;
            if (responseCode >= 200 && responseCode < 300) {
                in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            } else {
                in = new BufferedReader(new InputStreamReader(conn.getErrorStream() != null ? conn.getErrorStream() : conn.getInputStream()));
            }

            String inputLine;
            StringBuilder content = new StringBuilder();
            while ((inputLine = in.readLine()) != null) {
                content.append(inputLine);
            }
            in.close();
            conn.disconnect();

            String responseBody = content.toString();

            if (responseCode != 200) {
                logger.error("GCast Intake API returned error code: {}. Response: {}", responseCode, responseBody);
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("error", "API Error");
                errorResponse.put("status", responseCode);
                errorResponse.put("message", "GCast API returned status code " + responseCode);
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

        } catch (Exception e) {
            logger.error("Exception occurred while calling GCast Intake API", e);
            Map<String, String> errorResponse = new HashMap<>();
            errorResponse.put("error", "Connection Error");
            errorResponse.put("message", "Failed to retrieve intake requests: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
