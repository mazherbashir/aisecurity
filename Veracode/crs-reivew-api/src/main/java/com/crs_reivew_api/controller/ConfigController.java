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
        info.put("engines", configService.getAiEngines());
        info.put("scanValidityDays", configService.getScanValidityDays());
        return info;
    }

    @GetMapping("/prompts")
    public Map<String, String> getPrompts() {
        return configService.getPrompts();
    }

    @PostMapping("/prompts")
    public String updatePrompts(@RequestBody Map<String, String> payload) {
        try {
            String sastPrompt = payload.get("sastPrompt");
            String scaPrompt = payload.get("scaPrompt");
            configService.updatePrompts(sastPrompt, scaPrompt);
            return "Prompts updated successfully";
        } catch (Exception e) {
            return "Error updating prompts: " + e.getMessage();
        }
    }
}
