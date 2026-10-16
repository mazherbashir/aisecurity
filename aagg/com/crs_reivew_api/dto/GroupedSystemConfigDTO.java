package com.crs_reivew_api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public class GroupedSystemConfigDTO {

    @JsonProperty("SAST&SCA Prompts")
    private SastAndScaPrompts sastAndScaPrompts;

    @JsonProperty("System")
    private SystemSettings system;

    @JsonProperty("Checkmarx")
    private CheckmarxSettings checkmarx;

    @JsonProperty("AiEngine")
    private AiEngineSettings aiEngine;

    @JsonProperty("SecondaryAudit")
    private SecondaryAuditSettings secondaryAudit;

    @JsonProperty("Exclusions")
    private ExclusionsSettings exclusions;

    @JsonProperty("Compliance")
    private ComplianceSettings compliance;
    
    @JsonProperty("Intake")
    private IntakeSettings intake;

    @JsonProperty("Scheduler")
    private SchedulerSettings scheduler;

    @JsonProperty("architecture-mappings")
    private Map<String, List<String>> architectureMappings;

    // Getters and Setters
    public Map<String, List<String>> getArchitectureMappings() { return architectureMappings; }
    public void setArchitectureMappings(Map<String, List<String>> architectureMappings) { this.architectureMappings = architectureMappings; }
    public SastAndScaPrompts getSastAndScaPrompts() { return sastAndScaPrompts; }
    public void setSastAndScaPrompts(SastAndScaPrompts sastAndScaPrompts) { this.sastAndScaPrompts = sastAndScaPrompts; }

    public SystemSettings getSystem() { return system; }
    public void setSystem(SystemSettings system) { this.system = system; }

    public AiEngineSettings getAiEngine() { return aiEngine; }
    public void setAiEngine(AiEngineSettings aiEngine) { this.aiEngine = aiEngine; }

    public SecondaryAuditSettings getSecondaryAudit() { return secondaryAudit; }
    public void setSecondaryAudit(SecondaryAuditSettings secondaryAudit) { this.secondaryAudit = secondaryAudit; }

    public ExclusionsSettings getExclusions() { return exclusions; }
    public void setExclusions(ExclusionsSettings exclusions) { this.exclusions = exclusions; }

    public ComplianceSettings getCompliance() { return compliance; }
    public void setCompliance(ComplianceSettings compliance) { this.compliance = compliance; }

    public CheckmarxSettings getCheckmarx() { return checkmarx; }
    public void setCheckmarx(CheckmarxSettings checkmarx) { this.checkmarx = checkmarx; }

    public IntakeSettings getIntake() { return intake; }
    public void setIntake(IntakeSettings intake) { this.intake = intake; }

    public SchedulerSettings getScheduler() { return scheduler; }
    public void setScheduler(SchedulerSettings scheduler) { this.scheduler = scheduler; }

    // Nested Classes
    public static class SastAndScaPrompts {
        private String sastPrompt;
        private String scaPrompt;

        public String getSastPrompt() { return sastPrompt; }
        public void setSastPrompt(String sastPrompt) { this.sastPrompt = sastPrompt; }

        public String getScaPrompt() { return scaPrompt; }
        public void setScaPrompt(String scaPrompt) { this.scaPrompt = scaPrompt; }
    }

    public static class SystemSettings {
        private Integer scanValidityDays;
        private String mitigationProposalEnabled;
        private String mitigationApiType;
        private Boolean saveXmlLogs;
        private Boolean saveJsonHistory;
        private Integer historyLimit;
        private Boolean secondaryAuditEnabled;
        private Boolean intakeRequest;
        private Boolean snowSchedulerEnabled;

        @JsonProperty("safeSCAVERSION")
        private SafeScaVersionSettings safeScaVersion;

        public Integer getScanValidityDays() { return scanValidityDays; }
        public void setScanValidityDays(Integer scanValidityDays) { this.scanValidityDays = scanValidityDays; }

        public String getMitigationProposalEnabled() { return mitigationProposalEnabled; }
        public void setMitigationProposalEnabled(String mitigationProposalEnabled) { this.mitigationProposalEnabled = mitigationProposalEnabled; }

        public String getMitigationApiType() { return mitigationApiType; }
        public void setMitigationApiType(String mitigationApiType) { this.mitigationApiType = mitigationApiType; }

        public Boolean getSaveXmlLogs() { return saveXmlLogs; }
        public void setSaveXmlLogs(Boolean saveXmlLogs) { this.saveXmlLogs = saveXmlLogs; }

        public Boolean getSaveJsonHistory() { return saveJsonHistory; }
        public void setSaveJsonHistory(Boolean saveJsonHistory) { this.saveJsonHistory = saveJsonHistory; }

        public Integer getHistoryLimit() { return historyLimit; }
        public void setHistoryLimit(Integer historyLimit) { this.historyLimit = historyLimit; }

        public Boolean getSecondaryAuditEnabled() { return secondaryAuditEnabled; }
        public void setSecondaryAuditEnabled(Boolean secondaryAuditEnabled) { this.secondaryAuditEnabled = secondaryAuditEnabled; }

        public Boolean getIntakeRequest() { return intakeRequest; }
        public void setIntakeRequest(Boolean intakeRequest) { this.intakeRequest = intakeRequest; }

        public Boolean getSnowSchedulerEnabled() { return snowSchedulerEnabled; }
        public void setSnowSchedulerEnabled(Boolean snowSchedulerEnabled) { this.snowSchedulerEnabled = snowSchedulerEnabled; }

        public SafeScaVersionSettings getSafeScaVersion() { return safeScaVersion; }
        public void setSafeScaVersion(SafeScaVersionSettings safeScaVersion) { this.safeScaVersion = safeScaVersion; }
    }

    public static class SafeScaVersionSettings {
        private Boolean scaSafeVersionEnabled;
        private String scaStaleFixMessage;
        private String scaNoFixMessage;
        private Boolean saveScaLog;

        public Boolean getScaSafeVersionEnabled() { return scaSafeVersionEnabled; }
        public void setScaSafeVersionEnabled(Boolean scaSafeVersionEnabled) { this.scaSafeVersionEnabled = scaSafeVersionEnabled; }

        public String getScaStaleFixMessage() { return scaStaleFixMessage; }
        public void setScaStaleFixMessage(String scaStaleFixMessage) { this.scaStaleFixMessage = scaStaleFixMessage; }

        public String getScaNoFixMessage() { return scaNoFixMessage; }
        public void setScaNoFixMessage(String scaNoFixMessage) { this.scaNoFixMessage = scaNoFixMessage; }

        public Boolean getSaveScaLog() { return saveScaLog; }
        public void setSaveScaLog(Boolean saveScaLog) { this.saveScaLog = saveScaLog; }
    }

    public static class AiEngineSettings {
        private List<String> aiEngines;
        private List<String> engineModels;
        private String sharedServiceEndpoint;
        private String sharedServiceRole;
        private Integer sharedServiceMaxTokens;

        public List<String> getAiEngines() { return aiEngines; }
        public void setAiEngines(List<String> aiEngines) { this.aiEngines = aiEngines; }

        public List<String> getEngineModels() { return engineModels; }
        public void setEngineModels(List<String> engineModels) { this.engineModels = engineModels; }

        public String getSharedServiceEndpoint() { return sharedServiceEndpoint; }
        public void setSharedServiceEndpoint(String sharedServiceEndpoint) { this.sharedServiceEndpoint = sharedServiceEndpoint; }

        public String getSharedServiceRole() { return sharedServiceRole; }
        public void setSharedServiceRole(String sharedServiceRole) { this.sharedServiceRole = sharedServiceRole; }

        public Integer getSharedServiceMaxTokens() { return sharedServiceMaxTokens; }
        public void setSharedServiceMaxTokens(Integer sharedServiceMaxTokens) { this.sharedServiceMaxTokens = sharedServiceMaxTokens; }
    }

    public static class SecondaryAuditSettings {
        private String auditorModel;
        private String sharedAuditorEndpoint;
        private Integer sharedAuditorMaxTokens;
        private String sharedAuditorRole;
        private String auditorPrompt;
        private String fallbackText;

        public String getAuditorModel() { return auditorModel; }
        public void setAuditorModel(String auditorModel) { this.auditorModel = auditorModel; }

        public String getSharedAuditorEndpoint() { return sharedAuditorEndpoint; }
        public void setSharedAuditorEndpoint(String sharedAuditorEndpoint) { this.sharedAuditorEndpoint = sharedAuditorEndpoint; }

        public Integer getSharedAuditorMaxTokens() { return sharedAuditorMaxTokens; }
        public void setSharedAuditorMaxTokens(Integer sharedAuditorMaxTokens) { this.sharedAuditorMaxTokens = sharedAuditorMaxTokens; }

        public String getSharedAuditorRole() { return sharedAuditorRole; }
        public void setSharedAuditorRole(String sharedAuditorRole) { this.sharedAuditorRole = sharedAuditorRole; }

        public String getAuditorPrompt() { return auditorPrompt; }
        public void setAuditorPrompt(String auditorPrompt) { this.auditorPrompt = auditorPrompt; }

        public String getFallbackText() { return fallbackText; }
        public void setFallbackText(String fallbackText) { this.fallbackText = fallbackText; }
    }

    public static class ExclusionsSettings {
        private List<String> ignoredModules;
        private List<String> includedModules;
        private List<String> ignoredEcosystems;
        private List<String> noScaArchitectures;

        public List<String> getIgnoredModules() { return ignoredModules; }
        public void setIgnoredModules(List<String> ignoredModules) { this.ignoredModules = ignoredModules; }

        public List<String> getIncludedModules() { return includedModules; }
        public void setIncludedModules(List<String> includedModules) { this.includedModules = includedModules; }

        public List<String> getIgnoredEcosystems() { return ignoredEcosystems; }
        public void setIgnoredEcosystems(List<String> ignoredEcosystems) { this.ignoredEcosystems = ignoredEcosystems; }

        public List<String> getNoScaArchitectures() { return noScaArchitectures; }
        public void setNoScaArchitectures(List<String> noScaArchitectures) { this.noScaArchitectures = noScaArchitectures; }
    }

    public static class ComplianceSettings {
        private Map<String, Map<String, String>> tierMappings;
        private Map<String, Map<String, Integer>> gracePeriods;
        private List<String> tierDropDown;

        public Map<String, Map<String, String>> getTierMappings() { return tierMappings; }
        public void setTierMappings(Map<String, Map<String, String>> tierMappings) { this.tierMappings = tierMappings; }

        public Map<String, Map<String, Integer>> getGracePeriods() { return gracePeriods; }
        public void setGracePeriods(Map<String, Map<String, Integer>> gracePeriods) { this.gracePeriods = gracePeriods; }

        public List<String> getTierDropDown() { return tierDropDown; }
        public void setTierDropDown(List<String> tierDropDown) { this.tierDropDown = tierDropDown; }
    }

    public static class CheckmarxSettings {
        private String authUrl;
        private String apiUrl;
        private Long pollingInterval;
        private Integer pollingRetry;

        public String getAuthUrl() { return authUrl; }
        public void setAuthUrl(String authUrl) { this.authUrl = authUrl; }

        public String getApiUrl() { return apiUrl; }
        public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }

        public Long getPollingInterval() { return pollingInterval; }
        public void setPollingInterval(Long pollingInterval) { this.pollingInterval = pollingInterval; }

        public Integer getPollingRetry() { return pollingRetry; }
        public void setPollingRetry(Integer pollingRetry) { this.pollingRetry = pollingRetry; }
    }

    public static class IntakeSettings {
        private String gcaasRestEndpointRemediation;
        private String gcaasRestEndpointIntake;
        private String gcaasRestBaseURL;

        public String getGcaasRestEndpointRemediation() { return gcaasRestEndpointRemediation; }
        public void setGcaasRestEndpointRemediation(String gcaasRestEndpointRemediation) { this.gcaasRestEndpointRemediation = gcaasRestEndpointRemediation; }

        public String getGcaasRestEndpointIntake() { return gcaasRestEndpointIntake; }
        public void setGcaasRestEndpointIntake(String gcaasRestEndpointIntake) { this.gcaasRestEndpointIntake = gcaasRestEndpointIntake; }

        public String getGcaasRestBaseURL() { return gcaasRestBaseURL; }
        public void setGcaasRestBaseURL(String gcaasRestBaseURL) { this.gcaasRestBaseURL = gcaasRestBaseURL; }
    }

    public static class SchedulerSettings {
        private Boolean enabled;
        private Long delayMs;
        private Integer maxMemoryEntries;
        private Boolean readFromLocalFile;
        private String localFilePath;
        private String historyFilePath;
        private Boolean autoSignoffEnabled;
        private Boolean autoSignoffCheckmarxEnabled;
        private Boolean checkDuplicateRequests;

        public Boolean getEnabled() { return enabled; }
        public void setEnabled(Boolean enabled) { this.enabled = enabled; }

        public Long getDelayMs() { return delayMs; }
        public void setDelayMs(Long delayMs) { this.delayMs = delayMs; }

        public Integer getMaxMemoryEntries() { return maxMemoryEntries; }
        public void setMaxMemoryEntries(Integer maxMemoryEntries) { this.maxMemoryEntries = maxMemoryEntries; }

        public Boolean getReadFromLocalFile() { return readFromLocalFile; }
        public void setReadFromLocalFile(Boolean readFromLocalFile) { this.readFromLocalFile = readFromLocalFile; }

        public String getLocalFilePath() { return localFilePath; }
        public void setLocalFilePath(String localFilePath) { this.localFilePath = localFilePath; }

        public String getHistoryFilePath() { return historyFilePath; }
        public void setHistoryFilePath(String historyFilePath) { this.historyFilePath = historyFilePath; }

        public Boolean getAutoSignoffEnabled() { return autoSignoffEnabled; }
        public void setAutoSignoffEnabled(Boolean autoSignoffEnabled) { this.autoSignoffEnabled = autoSignoffEnabled; }

        public Boolean getAutoSignoffCheckmarxEnabled() { return autoSignoffCheckmarxEnabled; }
        public void setAutoSignoffCheckmarxEnabled(Boolean autoSignoffCheckmarxEnabled) { this.autoSignoffCheckmarxEnabled = autoSignoffCheckmarxEnabled; }

        public Boolean getCheckDuplicateRequests() { return checkDuplicateRequests; }
        public void setCheckDuplicateRequests(Boolean checkDuplicateRequests) { this.checkDuplicateRequests = checkDuplicateRequests; }
    }
}
