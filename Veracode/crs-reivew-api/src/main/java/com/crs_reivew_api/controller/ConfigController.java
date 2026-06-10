package com.crs_reivew_api.controller;
 
import com.crs_reivew_api.service.ConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;
 
@RestController
@RequestMapping("/api/config")
public class ConfigController {
 
    private static final Logger logger = LoggerFactory.getLogger(ConfigController.class);
 
    @Autowired
    private ConfigService configService;
 
    @GetMapping("/history")
    public java.util.List<String> getHistory() {
        try {
            return configService.getLatestHistoryFiles();
        } catch (Exception e) {
            logger.error("Error retrieving history files: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }
 
    @GetMapping("/engines")
    public java.util.List<String> getEngines() {
        try {
            return configService.getAiEngines();
        } catch (Exception e) {
            logger.error("Error retrieving AI engines: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }
 
    @GetMapping("/info")
    public java.util.Map<String, Object> getConfigInfo() {
        try {
            java.util.Map<String, Object> info = new java.util.HashMap<>();
            info.put("history", configService.getLatestHistoryFiles());
            
            java.util.List<String> combinedEngines = new java.util.ArrayList<>();
            if (configService.getAiEngines() != null) {
                combinedEngines.addAll(configService.getAiEngines());
            }
            if (configService.getEngineModels() != null) {
                combinedEngines.addAll(configService.getEngineModels());
            }
            info.put("engines", combinedEngines);
            
            info.put("scanValidityDays", configService.getScanValidityDays());
            info.put("noSca", configService.getNoSca());
            info.put("scaSafeVersionEnabled", configService.isScaSafeVersionEnabled());
            info.put("intakeRequest", configService.isIntakeRequest());
            return info;
        } catch (Exception e) {
            logger.error("Error retrieving config info: {}", e.getMessage());
            return java.util.Collections.emptyMap();
        }
    }
 
    @GetMapping("/prompts")
    public com.crs_reivew_api.dto.GroupedSystemConfigDTO getPrompts() {
        try {
            return configService.getGroupedSystemConfigDTO();
        } catch (Exception e) {
            logger.error("Error retrieving prompts: {}", e.getMessage());
            return new com.crs_reivew_api.dto.GroupedSystemConfigDTO();
        }
    }
 
    @PostMapping("/prompts")
    public String updatePrompts(@RequestBody com.crs_reivew_api.dto.GroupedSystemConfigDTO payload) {
        try {
            configService.updateConfig(payload);
            return "Configuration updated successfully";
        } catch (Exception e) {
            logger.error("Error updating configuration", e);
            return "Error updating configuration. Please check the server logs.";
        }
    }
}
