package com.crs_reivew_api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;
import java.util.Properties;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.core.env.StandardEnvironment;

@Configuration
@ConfigurationProperties(prefix = "veracode.api")
public class VeracodeConfig {
    private static final Logger logger = LoggerFactory.getLogger(VeracodeConfig.class);


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
    private List<String> noSca = new ArrayList<>();
    private String sharedServiceEndpoint;
    private String sharedServiceKey;
    private String sharedServiceRole = "user";
    private int sharedServiceMaxTokens = 1000;
    private List<String> engineModels = new ArrayList<>();
    private String mitigationApiType = "XML";
    private String mitigationProposalEnabled = "true";
    private String githubToken;
    private boolean scaSafeVersionEnabled = true;
    private String scaNoFixMessage = "No safe version published in GHSA. Check manually.";
    private String scaStaleFixMessage = "No safe version found. Fix applies to a different major version. Check manually.";
    private boolean saveScaLog = false;
    private boolean secondaryAuditEnabled = false;
    private String auditorModelName = "gpt-4o-mini";
    private String sharedAuditorEndpoint;
    private int sharedAuditorMaxTokens = 1000;
    private String sharedAuditorRole = "user";
    private String auditorDisagreeFallbackText = "Proposal Rejected please perform a Manual Review as The Evaluator and Auditor model has contradiction!";
    private String auditorPrompt;
    private String gcastSecretKey;
    private String gcastRestEndpointIntake;
    private Key key = new Key();

    @PostConstruct
    public void loadExternalConfig() {
        String userHome = System.getProperty("user.home");
        File credentialsFile = new File(userHome, ".crs-tool/credentials");
        if (credentialsFile.exists()) {
            logger.info("Loading external credentials from {}", credentialsFile.getAbsolutePath());
            Properties props = new Properties();
            try (FileInputStream fis = new FileInputStream(credentialsFile)) {
                props.load(fis);
                this.geminiKey = getProp(props, "geminiKey", this.geminiKey);
                this.geminiModel = getProp(props, "geminiModel", this.geminiModel);
                this.azureKey = getProp(props, "azureKey", this.azureKey);
                this.azureEndpoint = getProp(props, "azureEndpoint", this.azureEndpoint);
                this.azureDeployment = getProp(props, "azureDeployment", this.azureDeployment);
                this.sharedServiceKey = getProp(props, "sharedServiceKey", this.sharedServiceKey);
                this.githubToken = getProp(props, "githubToken", this.githubToken);
                
                // CRITICAL: Load Veracode API Keys
                this.key.setId(getProp(props, "id", this.key.getId()));
                this.key.setSecret(getProp(props, "secret", this.key.getSecret()));
                
                // GCast API Keys
                this.gcastSecretKey = props.getProperty("gcast-secret-key");
                
                logger.info("Successfully loaded AI, GitHub, Veracode, and GCast credentials from {}", credentialsFile.getAbsolutePath());
            } catch (IOException e) {
                logger.error("Failed to load credentials file: {}", e.getMessage());
            }
        } else {
            logger.warn("Credentials file not found at {}. AI keys will be read from environment or application.properties if available.", credentialsFile.getAbsolutePath());
        }
        
        // Manually parse application.properties to populate configuration properties from the outside
        File appPropsFile = null;
        String[] candidatePaths = {
            "src/main/resources/application.properties",
            "../src/main/resources/application.properties",
            "application.properties",
            "config/application.properties",
            "target/classes/application.properties"
        };
        for (String path : candidatePaths) {
            File f = new File(path);
            if (f.exists()) {
                appPropsFile = f;
                break;
            }
        }

        if (appPropsFile != null) {
            logger.info("Found external properties file at: {}", appPropsFile.getAbsolutePath());
            Properties appProps = new Properties();
            try (FileInputStream fis = new FileInputStream(appPropsFile)) {
                appProps.load(fis);
                
                // Bind all veracode.api.* properties from the external file onto this instance
                PropertiesPropertySource propertySource = new PropertiesPropertySource("externalAppProps", appProps);
                StandardEnvironment env = new StandardEnvironment();
                env.getPropertySources().addFirst(propertySource);
                Binder.get(env).bind("veracode.api", Bindable.ofInstance(this));
                
                // GCast rest endpoint intake
                if (this.gcastRestEndpointIntake == null || this.gcastRestEndpointIntake.isEmpty()) {
                    this.gcastRestEndpointIntake = appProps.getProperty("gcast-rest-endpoint-intake");
                }
                if (this.gcastRestEndpointIntake == null || this.gcastRestEndpointIntake.isEmpty()) {
                    this.gcastRestEndpointIntake = appProps.getProperty("veracode.api.gcast-rest-endpoint-intake");
                }
                
                // Populate tierMappings
                if (this.tierMappings == null || this.tierMappings.isEmpty()) {
                    this.tierMappings = new HashMap<>();
                    for (String keyName : appProps.stringPropertyNames()) {
                        if (keyName.startsWith("veracode.api.tier-mappings.")) {
                            String suffix = keyName.substring("veracode.api.tier-mappings.".length());
                            int lastDot = suffix.lastIndexOf('.');
                            if (lastDot > 0) {
                                String group = suffix.substring(0, lastDot);
                                String subGroup = suffix.substring(lastDot + 1);
                                String value = appProps.getProperty(keyName);
                                this.tierMappings.computeIfAbsent(group, k -> new HashMap<>()).put(subGroup, value);
                            }
                        }
                    }
                }
                
                // Populate gracePeriods
                if (this.gracePeriods == null || this.gracePeriods.isEmpty()) {
                    this.gracePeriods = new HashMap<>();
                    for (String keyName : appProps.stringPropertyNames()) {
                        if (keyName.startsWith("veracode.api.grace-periods.")) {
                            String suffix = keyName.substring("veracode.api.grace-periods.".length());
                            int lastDot = suffix.lastIndexOf('.');
                            if (lastDot > 0) {
                                String tier = suffix.substring(0, lastDot);
                                String severity = suffix.substring(lastDot + 1);
                                try {
                                    Integer value = Integer.parseInt(appProps.getProperty(keyName));
                                    this.gracePeriods.computeIfAbsent(tier, k -> new HashMap<>()).put(severity, value);
                                } catch (NumberFormatException e) {
                                    // ignore
                                }
                            }
                        }
                    }
                }
            } catch (IOException e) {
                logger.error("Failed to manually load application.properties: {}", e.getMessage());
            }
        }
    }

    private String getProp(Properties props, String key, String defaultValue) {
        String val = props.getProperty("crs.api." + key);
        if (val == null) {
            val = props.getProperty("veracode.api." + key);
        }
        return val != null ? val : defaultValue;
    }

    public List<String> getNoSca() {
        return noSca;
    }

    public void setNoSca(List<String> noSca) {
        this.noSca = noSca;
    }

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

    public String getMitigationProposalEnabled() {
        return mitigationProposalEnabled;
    }

    public void setMitigationProposalEnabled(String mitigationProposalEnabled) {
        this.mitigationProposalEnabled = mitigationProposalEnabled;
    }

    public String getSharedServiceRole() {
        return sharedServiceRole;
    }

    public void setSharedServiceRole(String sharedServiceRole) {
        this.sharedServiceRole = sharedServiceRole;
    }

    public int getSharedServiceMaxTokens() {
        return sharedServiceMaxTokens;
    }

    public void setSharedServiceMaxTokens(int sharedServiceMaxTokens) {
        this.sharedServiceMaxTokens = sharedServiceMaxTokens;
    }

    public String getMitigationApiType() {
        return mitigationApiType;
    }

    public void setMitigationApiType(String mitigationApiType) {
        this.mitigationApiType = mitigationApiType;
    }

    public String getSharedServiceEndpoint() {
        return sharedServiceEndpoint;
    }

    public void setSharedServiceEndpoint(String sharedServiceEndpoint) {
        this.sharedServiceEndpoint = sharedServiceEndpoint;
    }

    public String getSharedServiceKey() {
        return sharedServiceKey;
    }

    public void setSharedServiceKey(String sharedServiceKey) {
        this.sharedServiceKey = sharedServiceKey;
    }

    public List<String> getEngineModels() {
        return engineModels;
    }

    public void setEngineModels(List<String> engineModels) {
        this.engineModels = engineModels;
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

    public String getGithubToken() {
        return githubToken;
    }
    
    public void setGithubToken(String githubToken) {
        this.githubToken = githubToken;
    }

    public boolean isScaSafeVersionEnabled() {
        return scaSafeVersionEnabled;
    }

    public void setScaSafeVersionEnabled(boolean scaSafeVersionEnabled) {
        this.scaSafeVersionEnabled = scaSafeVersionEnabled;
    }

    public String getScaNoFixMessage() {
        return scaNoFixMessage;
    }

    public void setScaNoFixMessage(String scaNoFixMessage) {
        this.scaNoFixMessage = scaNoFixMessage;
    }

    public String getScaStaleFixMessage() {
        return scaStaleFixMessage;
    }

    public void setScaStaleFixMessage(String scaStaleFixMessage) {
        this.scaStaleFixMessage = scaStaleFixMessage;
    }

    public boolean isSaveScaLog() {
        return saveScaLog;
    }

    public void setSaveScaLog(boolean saveScaLog) {
        this.saveScaLog = saveScaLog;
    }

    public boolean isSecondaryAuditEnabled() {
        return secondaryAuditEnabled;
    }

    public void setSecondaryAuditEnabled(boolean secondaryAuditEnabled) {
        this.secondaryAuditEnabled = secondaryAuditEnabled;
    }

    public String getAuditorModelName() {
        return auditorModelName;
    }

    public void setAuditorModelName(String auditorModelName) {
        this.auditorModelName = auditorModelName;
    }

    public String getSharedAuditorEndpoint() {
        return sharedAuditorEndpoint;
    }

    public void setSharedAuditorEndpoint(String sharedAuditorEndpoint) {
        this.sharedAuditorEndpoint = sharedAuditorEndpoint;
    }

    public int getSharedAuditorMaxTokens() {
        return sharedAuditorMaxTokens;
    }

    public void setSharedAuditorMaxTokens(int sharedAuditorMaxTokens) {
        this.sharedAuditorMaxTokens = sharedAuditorMaxTokens;
    }

    public String getSharedAuditorRole() {
        return sharedAuditorRole;
    }

    public void setSharedAuditorRole(String sharedAuditorRole) {
        this.sharedAuditorRole = sharedAuditorRole;
    }

    public String getAuditorDisagreeFallbackText() {
        return auditorDisagreeFallbackText;
    }

    public void setAuditorDisagreeFallbackText(String auditorDisagreeFallbackText) {
        this.auditorDisagreeFallbackText = auditorDisagreeFallbackText;
    }

    public String getAuditorPrompt() {
        if (auditorPrompt == null || auditorPrompt.isEmpty()) {
            return "You are a Senior Security QA Auditor acting as a secondary verification layer. Your job is to strictly review the output generated by a primary evaluation model against the original input data.\n\nYou will be provided with two sets of data:\n1. [Original Request Data]: The raw vulnerability JSON payload.\n2. [Phase 1 Output]: The text response generated by the primary model.\n\nYour task is to independently verify the quality, accuracy, and constraint compliance of the Phase 1 Output.\n\n### CRITERIA FOR EVALUATION\n1. Accuracy Check: Did Phase 1 correctly interpret the vulnerability description and user comments? (e.g., If the user comments proved the value is a non-secret UI lookup GUID, did Phase 1 correctly identify it as a false positive?)\n2. Constraint Compliance Check: Did Phase 1 strictly adhere to its formatting boundaries?\n   - Does it start exactly with \"Proposal Approved\" or \"Proposal Rejected\"?\n   - Is it written as exactly ONE paragraph?\n   - Is it under 120 words and free of bullet points or headings?\n\n### OUTPUT FORMAT\nYou must output your audit evaluation strictly using the following Markdown template. Do not add conversational intro text or metadata.\n\n### Second Look Assessment\n- **Validation Verdict:** [Agree / Disagree with Phase 1 Verdict]\n- **Rule Compliance:** [Pass / Fail - state if formatting limits were met]\n- **Critique:** [2-3 sentences explaining your reasoning regarding the technical accuracy and compliance of Phase 1]";
        }
        return auditorPrompt;
    }

    public void setAuditorPrompt(String auditorPrompt) {
        this.auditorPrompt = auditorPrompt;
    }

    public String getGcastSecretKey() {
        return gcastSecretKey;
    }

    public void setGcastSecretKey(String gcastSecretKey) {
        this.gcastSecretKey = gcastSecretKey;
    }

    public String getGcastRestEndpointIntake() {
        return gcastRestEndpointIntake;
    }

    public void setGcastRestEndpointIntake(String gcastRestEndpointIntake) {
        this.gcastRestEndpointIntake = gcastRestEndpointIntake;
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
