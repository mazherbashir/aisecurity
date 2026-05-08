package com.crs_reivew_api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;

@Configuration
@ConfigurationProperties(prefix = "veracode.api")
public class VeracodeConfig {

    private String url;
    private boolean debug;
    private List<String> ignoreModules = new ArrayList<>();
    private List<String> includeModules = new ArrayList<>();
    private List<String> ignoreEcosystems = new ArrayList<>();
    private Map<String, String> architectureMappings = new HashMap<>();
    private Map<String, Map<String, String>> tierMappings = new HashMap<>();
    private Map<String, Map<String, Integer>> gracePeriods = new HashMap<>();
    private boolean saveXmlLogs;
    private boolean saveJsonHistory;
    private String geminiKey;
    private String geminiModel = "gemini-2.5-flash";
    private String azureKey;
    private String azureEndpoint;
    private String azureDeployment;
    private int historyLimit;
    private List<String> aiEngines = new ArrayList<>();
    private String sastPrompt;
    private String scaPrompt;
    private int scanValidityDays = 90;
    private Key key = new Key();

    public int getHistoryLimit() {
        return historyLimit;
    }

    public void setHistoryLimit(int historyLimit) {
        this.historyLimit = historyLimit;
    }

    public List<String> getAiEngines() {
        return aiEngines;
    }

    public void setAiEngines(List<String> aiEngines) {
        this.aiEngines = aiEngines;
    }

    public String getGeminiKey() {
        return geminiKey;
    }

    public void setGeminiKey(String geminiKey) {
        this.geminiKey = geminiKey;
    }

    public String getGeminiModel() {
        return geminiModel;
    }

    public void setGeminiModel(String geminiModel) {
        this.geminiModel = geminiModel;
    }

    public String getAzureKey() {
        return azureKey;
    }

    public void setAzureKey(String azureKey) {
        this.azureKey = azureKey;
    }

    public String getAzureEndpoint() {
        return azureEndpoint;
    }

    public void setAzureEndpoint(String azureEndpoint) {
        this.azureEndpoint = azureEndpoint;
    }

    public String getAzureDeployment() {
        return azureDeployment;
    }

    public void setAzureDeployment(String azureDeployment) {
        this.azureDeployment = azureDeployment;
    }

    public String getSastPrompt() {
        return sastPrompt;
    }

    public void setSastPrompt(String sastPrompt) {
        this.sastPrompt = sastPrompt;
    }

    public String getScaPrompt() {
        return scaPrompt;
    }

    public void setScaPrompt(String scaPrompt) {
        this.scaPrompt = scaPrompt;
    }

    public int getScanValidityDays() {
        return scanValidityDays;
    }

    public void setScanValidityDays(int scanValidityDays) {
        this.scanValidityDays = scanValidityDays;
    }

    public boolean isSaveXmlLogs() {
        return saveXmlLogs;
    }

    public void setSaveXmlLogs(boolean saveXmlLogs) {
        this.saveXmlLogs = saveXmlLogs;
    }

    public boolean isSaveJsonHistory() {
        return saveJsonHistory;
    }

    public void setSaveJsonHistory(boolean saveJsonHistory) {
        this.saveJsonHistory = saveJsonHistory;
    }

    public Map<String, Map<String, String>> getTierMappings() {
        return tierMappings;
    }

    public void setTierMappings(Map<String, Map<String, String>> tierMappings) {
        this.tierMappings = tierMappings;
    }

    public Map<String, Map<String, Integer>> getGracePeriods() {
        return gracePeriods;
    }

    public void setGracePeriods(Map<String, Map<String, Integer>> gracePeriods) {
        this.gracePeriods = gracePeriods;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public boolean isDebug() {
        return debug;
    }

    public void setDebug(boolean debug) {
        this.debug = debug;
    }

    public Key getKey() {
        return key;
    }

    public void setKey(Key key) {
        this.key = key;
    }

    public List<String> getIgnoreModules() {
        return ignoreModules;
    }

    public void setIgnoreModules(List<String> ignoreModules) {
        this.ignoreModules = ignoreModules;
    }

    public List<String> getIncludeModules() {
        return includeModules;
    }

    public void setIncludeModules(List<String> includeModules) {
        this.includeModules = includeModules;
    }
    
    public List<String> getIgnoreEcosystems() {
        return ignoreEcosystems;
    }

    public void setIgnoreEcosystems(List<String> ignoreEcosystems) {
        this.ignoreEcosystems = ignoreEcosystems;
    }

    public Map<String, String> getArchitectureMappings() {
        return architectureMappings;
    }

    public void setArchitectureMappings(Map<String, String> architectureMappings) {
        this.architectureMappings = architectureMappings;
    }

    public static class Key {
        private String id;
        private String secret;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }
    }
}
