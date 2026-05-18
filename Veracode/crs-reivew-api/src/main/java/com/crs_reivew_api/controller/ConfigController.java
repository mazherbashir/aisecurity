package com.crs_reivew_api.controller;

import com.crs_reivew_api.service.ConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/config")
@CrossOrigin(origins = "*")
public class ConfigController {

    @Autowired
    private ConfigService configService;

    @GetMapping("/history")
    public java.util.List<String> getHistory() {
        return configService.getLatestHistoryFiles();
    }

    @GetMapping("/engines")
    public java.util.List<String> getEngines() {
        return configService.getAiEngines();
    }

    @GetMapping("/info")
    public java.util.Map<String, Object> getConfigInfo() {
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
        return info;
    }

    @GetMapping("/prompts")
    public com.crs_reivew_api.dto.GroupedSystemConfigDTO getPrompts() {
        return configService.getGroupedSystemConfigDTO();
    }

    @PostMapping("/prompts")
    public String updatePrompts(@RequestBody com.crs_reivew_api.dto.GroupedSystemConfigDTO payload) {
        try {
            String sastPrompt = null;
            String scaPrompt = null;
            if (payload != null && payload.getSastAndScaPrompts() != null) {
                sastPrompt = payload.getSastAndScaPrompts().getSastPrompt();
                scaPrompt = payload.getSastAndScaPrompts().getScaPrompt();
            }
            
            String auditorPrompt = null;
            String fallbackText = null;
            if (payload != null && payload.getSecondaryAudit() != null) {
                auditorPrompt = payload.getSecondaryAudit().getAuditorPrompt();
                fallbackText = payload.getSecondaryAudit().getFallbackText();
            }
            
            configService.updatePrompts(sastPrompt, scaPrompt, auditorPrompt, fallbackText);
            return "Prompts updated successfully";
        } catch (Exception e) {
            return "Error updating prompts: " + e.getMessage();
        }
    }
}
