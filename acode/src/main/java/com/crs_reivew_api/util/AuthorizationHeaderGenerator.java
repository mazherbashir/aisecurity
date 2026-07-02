package com.crs_reivew_api.util;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public class AuthorizationHeaderGenerator {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final String VERACODE_HMAC_SHA_256 = "VERACODE-HMAC-SHA-256";
    private static final String VERACODE_PREFIX = "vcode_hmac_sha256";

    private final String apiId;
    private final String apiKey;

    public AuthorizationHeaderGenerator(String apiId, String apiKey) {
        this.apiId = apiId;
        this.apiKey = apiKey;
    }

    public String generateAuthorizationHeader(String host, String url, String method) {
        try {
            // Ensure ID is lowercase for both message and header
            String cleanId = apiId.toLowerCase(Locale.US).trim();
            String timestamp = String.valueOf(System.currentTimeMillis());
            byte[] nonceBytes = new byte[16];
            new SecureRandom().nextBytes(nonceBytes);
            String nonce = HexFormat.of().formatHex(nonceBytes);
            
            String signature = calculateSignature(cleanId, apiKey.trim(), timestamp, nonce, host, url, method);

            return String.format("%s id=%s,ts=%s,nonce=%s,sig=%s", 
                    VERACODE_HMAC_SHA_256, cleanId, timestamp, nonce, signature);
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate Veracode authorization header", e);
        }
    }

    private String calculateSignature(String id, String key, String timestamp, String nonce, String host, String url, String method) 
            throws NoSuchAlgorithmException, InvalidKeyException {
        byte[] keyBytes = HexFormat.of().parseHex(key);
        byte[] nonceBytes = HexFormat.of().parseHex(nonce);
        
        byte[] kNonce = hmacSha256(nonceBytes, keyBytes);
        byte[] kDate = hmacSha256(timestamp.getBytes(StandardCharsets.UTF_8), kNonce);
        byte[] kPrefix = hmacSha256(VERACODE_PREFIX.getBytes(StandardCharsets.UTF_8), kDate);
        
        String msg = String.format("id=%s&host=%s&url=%s&method=%s", 
                id, host.toLowerCase(Locale.US), url, method.toUpperCase(Locale.US));
        
        byte[] signatureBytes = hmacSha256(msg.getBytes(StandardCharsets.UTF_8), kPrefix);
        return HexFormat.of().formatHex(signatureBytes);
    }

    private static byte[] hmacSha256(byte[] data, byte[] key) throws NoSuchAlgorithmException, InvalidKeyException {
        Mac mac = Mac.getInstance(HMAC_SHA256);
        mac.init(new SecretKeySpec(key, HMAC_SHA256));
        return mac.doFinal(data);
    }
}
