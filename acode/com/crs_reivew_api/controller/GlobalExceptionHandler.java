package com.crs_reivew_api.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.crs_reivew_api.util.VeracodeException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Handles client connection aborts (e.g., browser timeout or user closing tab while PDF is generating).
     * Silently swallows or logs at DEBUG level without attempting to write to a closed socket.
     */
    @ExceptionHandler({
        org.apache.catalina.connector.ClientAbortException.class,
        org.springframework.web.context.request.async.AsyncRequestNotUsableException.class
    })
    public void handleClientAbortException(Exception ex) {
        logger.debug("Client connection was closed/aborted before response completed: {}", ex.getMessage());
    }

    /**
     * Handles missing static resources (e.g. Chrome extension requesting .map files).
     */
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNoResourceFound(org.springframework.web.servlet.resource.NoResourceFoundException ex) {
        logger.debug("Static resource not found: {}", ex.getResourcePath());

        Map<String, Object> response = new HashMap<>();
        response.put("status", "error");
        response.put("type", "NOT_FOUND");
        response.put("message", "Resource not found: " + ex.getResourcePath());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        return new ResponseEntity<>(response, headers, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(VeracodeException.class)
    public ResponseEntity<Map<String, Object>> handleVeracodeException(VeracodeException ex) {
        logger.error("Veracode error [{}]: {}", ex.getType(), ex.getMessage());

        Map<String, Object> response = new HashMap<>();
        response.put("status", "error");
        response.put("type", ex.getType());
        response.put("message", ex.getMessage());
        if (ex.getSuggestions() != null) {
            response.put("suggestions", ex.getSuggestions());
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        return new ResponseEntity<>(response, headers, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAllExceptions(Exception ex) {
        if (isClientAbort(ex)) {
            logger.debug("Client connection aborted during request processing: {}", ex.getMessage());
            return null;
        }

        logger.error("Unhandled exception occurred: {}", ex.getMessage(), ex);

        Map<String, Object> response = new HashMap<>();
        response.put("status", "error");
        response.put("type", "INTERNAL_ERROR");
        response.put("message", ex.getMessage());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        return new ResponseEntity<>(response, headers, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private boolean isClientAbort(Throwable t) {
        while (t != null) {
            String name = t.getClass().getName();
            if (name.contains("ClientAbortException") || name.contains("AsyncRequestNotUsableException")) {
                return true;
            }
            if (t instanceof IOException) {
                String msg = t.getMessage();
                if (msg != null && (msg.contains("aborted") || msg.contains("Broken pipe") || msg.contains("connection was reset"))) {
                    return true;
                }
            }
            t = t.getCause();
        }
        return false;
    }
}
