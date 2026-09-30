package com.crs_reivew_api.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.crs_reivew_api.util.VeracodeException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

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
        
        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAllExceptions(Exception ex) {
        logger.error("Unhandled exception occurred: {}", ex.getMessage(), ex);
        
        Map<String, Object> response = new HashMap<>();
        response.put("status", "error");
        response.put("type", "INTERNAL_ERROR");
        response.put("message", ex.getMessage());
        
        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
