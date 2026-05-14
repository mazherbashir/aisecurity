package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.Properties;
import java.io.File;

@Service
public class ConfigService {

    @Autowired
    private VeracodeConfig veracodeConfig;

    private static final String CONFIG_FILE = "src/main/resources/application.properties";

    public java.util.List<String> getAiEngines() {
        java.util.List<String> combined = new java.util.ArrayList<>(veracodeConfig.getAiEngines());
        combined.addAll(veracodeConfig.getEngineModels());
        return combined;
    }

    public java.util.List<String> getEngineModels() {
        return veracodeConfig.getEngineModels();
    }

    public int getScanValidityDays() {
        return veracodeConfig.getScanValidityDays();
    }

    public java.util.List<String> getNoSca() {
        return veracodeConfig.getNoSca();
    }

    public java.util.List<String> getLatestHistoryFiles() {
        int limit = veracodeConfig.getHistoryLimit();
        if (limit <= 0) limit = 10;
        
        java.nio.file.Path historyDir = java.nio.file.Paths.get("veracode", "history");
        
        try {
            if (!java.nio.file.Files.exists(historyDir)) return java.util.Collections.emptyList();
            
            try (java.util.stream.Stream<java.nio.file.Path> stream = java.nio.file.Files.list(historyDir)) {
                return stream
                    .filter(p -> java.nio.file.Files.isRegularFile(p) && !p.getFileName().toString().equalsIgnoreCase("applications.json"))
                    .sorted((p1, p2) -> {
                        try {
                            return java.nio.file.Files.getLastModifiedTime(p2)
                                .compareTo(java.nio.file.Files.getLastModifiedTime(p1));
                        } catch (Exception e) { return 0; }
                    })
                    .limit(limit)
                    .map(p -> p.getFileName().toString())
                    .collect(java.util.stream.Collectors.toList());
            }
        } catch (Exception e) {
            System.err.println("Error listing history files: " + e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    public java.util.Map<String, String> getPrompts() {
        java.util.Map<String, String> prompts = new java.util.HashMap<>();
        prompts.put("sastPrompt", veracodeConfig.getSastPrompt());
        prompts.put("scaPrompt", veracodeConfig.getScaPrompt());
        return prompts;
    }

    public void updatePrompts(String sastPrompt, String scaPrompt) throws Exception {
        // Update in-memory config
        if (sastPrompt != null) veracodeConfig.setSastPrompt(sastPrompt);
        if (scaPrompt != null) veracodeConfig.setScaPrompt(scaPrompt);

        // Persist to file
        File file = new File(CONFIG_FILE);
        Properties props = new Properties();
        try (FileInputStream in = new FileInputStream(file)) {
            props.load(in);
        }

        if (sastPrompt != null) props.setProperty("veracode.api.sastPrompt", sastPrompt);
        if (scaPrompt != null) props.setProperty("veracode.api.scaPrompt", scaPrompt);

        try (FileOutputStream out = new FileOutputStream(file)) {
            props.store(out, "Updated via API");
        }
    }
}
