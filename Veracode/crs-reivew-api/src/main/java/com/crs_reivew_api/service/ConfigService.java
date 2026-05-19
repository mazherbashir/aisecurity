package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.GroupedSystemConfigDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.File;
import java.util.Properties;

@Service
public class ConfigService {

    @Autowired
    private VeracodeConfig veracodeConfig;

    private String getConfigFilePath() {
        // If there's an external config file in the current working directory, prioritize it!
        // This handles cases where the user runs the jar directly and has an external properties file.
        java.io.File externalFile = new java.io.File("application.properties");
        if (externalFile.exists()) {
            return "application.properties";
        }

        // Next, check if the local development path exists
        java.io.File devFile = new java.io.File("src/main/resources/application.properties");
        if (devFile.exists()) {
            return "src/main/resources/application.properties";
        }
        
        // Otherwise, fallback to the external application.properties
        return "application.properties";
    }

    public java.util.List<String> getAiEngines() {
        return veracodeConfig.getAiEngines();
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

    public boolean isScaSafeVersionEnabled() {
        return veracodeConfig.isScaSafeVersionEnabled();
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

    public void updateConfig(GroupedSystemConfigDTO payload) throws Exception {
        java.util.Map<String, String> updates = new java.util.HashMap<>();
        
        if (payload != null) {
            if (payload.getSastAndScaPrompts() != null) {
                if (payload.getSastAndScaPrompts().getSastPrompt() != null) {
                    veracodeConfig.setSastPrompt(payload.getSastAndScaPrompts().getSastPrompt());
                    updates.put("veracode.api.sastPrompt", payload.getSastAndScaPrompts().getSastPrompt());
                }
                if (payload.getSastAndScaPrompts().getScaPrompt() != null) {
                    veracodeConfig.setScaPrompt(payload.getSastAndScaPrompts().getScaPrompt());
                    updates.put("veracode.api.scaPrompt", payload.getSastAndScaPrompts().getScaPrompt());
                }
            }
            if (payload.getSecondaryAudit() != null) {
                if (payload.getSecondaryAudit().getAuditorPrompt() != null) {
                    veracodeConfig.setAuditorPrompt(payload.getSecondaryAudit().getAuditorPrompt());
                    updates.put("veracode.api.auditorPrompt", payload.getSecondaryAudit().getAuditorPrompt());
                }
                if (payload.getSecondaryAudit().getFallbackText() != null) {
                    veracodeConfig.setAuditorDisagreeFallbackText(payload.getSecondaryAudit().getFallbackText());
                    updates.put("veracode.api.auditor-disagree-fallback-text", payload.getSecondaryAudit().getFallbackText());
                }
                if (payload.getSecondaryAudit().getAuditorModel() != null) {
                    veracodeConfig.setAuditorModelName(payload.getSecondaryAudit().getAuditorModel());
                    updates.put("veracode.api.auditor-model-name", payload.getSecondaryAudit().getAuditorModel());
                }
                if (payload.getSecondaryAudit().getSharedAuditorEndpoint() != null) {
                    veracodeConfig.setSharedAuditorEndpoint(payload.getSecondaryAudit().getSharedAuditorEndpoint());
                    updates.put("veracode.api.shared-auditor-endpoint", payload.getSecondaryAudit().getSharedAuditorEndpoint());
                }
                if (payload.getSecondaryAudit().getSharedAuditorMaxTokens() != null) {
                    veracodeConfig.setSharedAuditorMaxTokens(payload.getSecondaryAudit().getSharedAuditorMaxTokens());
                    updates.put("veracode.api.shared-auditor-max-tokens", String.valueOf(payload.getSecondaryAudit().getSharedAuditorMaxTokens()));
                }
                if (payload.getSecondaryAudit().getSharedAuditorRole() != null) {
                    veracodeConfig.setSharedAuditorRole(payload.getSecondaryAudit().getSharedAuditorRole());
                    updates.put("veracode.api.shared-auditor-role", payload.getSecondaryAudit().getSharedAuditorRole());
                }
            }
            if (payload.getAiEngine() != null) {
                if (payload.getAiEngine().getAiEngines() != null) {
                    veracodeConfig.setAiEngines(payload.getAiEngine().getAiEngines());
                    updates.put("veracode.api.ai-engines", String.join(",", payload.getAiEngine().getAiEngines()));
                }
                if (payload.getAiEngine().getEngineModels() != null) {
                    veracodeConfig.setEngineModels(payload.getAiEngine().getEngineModels());
                    updates.put("veracode.api.engine-models", String.join(",", payload.getAiEngine().getEngineModels()));
                }
                if (payload.getAiEngine().getSharedServiceEndpoint() != null) {
                    veracodeConfig.setSharedServiceEndpoint(payload.getAiEngine().getSharedServiceEndpoint());
                    updates.put("veracode.api.shared-service-endpoint", payload.getAiEngine().getSharedServiceEndpoint());
                }
                if (payload.getAiEngine().getSharedServiceRole() != null) {
                    veracodeConfig.setSharedServiceRole(payload.getAiEngine().getSharedServiceRole());
                    updates.put("veracode.api.shared-service-role", payload.getAiEngine().getSharedServiceRole());
                }
                if (payload.getAiEngine().getSharedServiceMaxTokens() != null) {
                    veracodeConfig.setSharedServiceMaxTokens(payload.getAiEngine().getSharedServiceMaxTokens());
                    updates.put("veracode.api.shared-service-max-tokens", String.valueOf(payload.getAiEngine().getSharedServiceMaxTokens()));
                }
            }
            if (payload.getSystem() != null) {
                if (payload.getSystem().getScanValidityDays() != null) {
                    veracodeConfig.setScanValidityDays(payload.getSystem().getScanValidityDays());
                    updates.put("veracode.api.scan-validity-days", String.valueOf(payload.getSystem().getScanValidityDays()));
                }
                if (payload.getSystem().getMitigationProposalEnabled() != null) {
                    veracodeConfig.setMitigationProposalEnabled(String.valueOf(payload.getSystem().getMitigationProposalEnabled()));
                    updates.put("veracode.api.mitigation-proposal-enabled", String.valueOf(payload.getSystem().getMitigationProposalEnabled()));
                }
                if (payload.getSystem().getMitigationApiType() != null) {
                    veracodeConfig.setMitigationApiType(payload.getSystem().getMitigationApiType());
                    updates.put("veracode.api.mitigation-api-type", payload.getSystem().getMitigationApiType());
                }
                if (payload.getSystem().getSaveXmlLogs() != null) {
                    veracodeConfig.setSaveXmlLogs(payload.getSystem().getSaveXmlLogs());
                    updates.put("veracode.api.save-xml-logs", String.valueOf(payload.getSystem().getSaveXmlLogs()));
                }
                if (payload.getSystem().getSaveJsonHistory() != null) {
                    veracodeConfig.setSaveJsonHistory(payload.getSystem().getSaveJsonHistory());
                    updates.put("veracode.api.save-json-history", String.valueOf(payload.getSystem().getSaveJsonHistory()));
                }
                if (payload.getSystem().getHistoryLimit() != null) {
                    veracodeConfig.setHistoryLimit(payload.getSystem().getHistoryLimit());
                    updates.put("veracode.api.history-limit", String.valueOf(payload.getSystem().getHistoryLimit()));
                }
                if (payload.getSystem().getSecondaryAuditEnabled() != null) {
                    veracodeConfig.setSecondaryAuditEnabled(payload.getSystem().getSecondaryAuditEnabled());
                    updates.put("veracode.api.secondary-audit-enabled", String.valueOf(payload.getSystem().getSecondaryAuditEnabled()));
                }
                if (payload.getSystem().getSafeScaVersion() != null) {
                    if (payload.getSystem().getSafeScaVersion().getScaSafeVersionEnabled() != null) {
                        veracodeConfig.setScaSafeVersionEnabled(payload.getSystem().getSafeScaVersion().getScaSafeVersionEnabled());
                        updates.put("veracode.api.scaSafeVersionEnabled", String.valueOf(payload.getSystem().getSafeScaVersion().getScaSafeVersionEnabled()));
                    }
                    if (payload.getSystem().getSafeScaVersion().getScaStaleFixMessage() != null) {
                        veracodeConfig.setScaStaleFixMessage(payload.getSystem().getSafeScaVersion().getScaStaleFixMessage());
                        updates.put("veracode.api.sca-stale-fix-message", payload.getSystem().getSafeScaVersion().getScaStaleFixMessage());
                    }
                    if (payload.getSystem().getSafeScaVersion().getScaNoFixMessage() != null) {
                        veracodeConfig.setScaNoFixMessage(payload.getSystem().getSafeScaVersion().getScaNoFixMessage());
                        updates.put("veracode.api.sca-no-fix-message", payload.getSystem().getSafeScaVersion().getScaNoFixMessage());
                    }
                    if (payload.getSystem().getSafeScaVersion().getSaveScaLog() != null) {
                        veracodeConfig.setSaveScaLog(payload.getSystem().getSafeScaVersion().getSaveScaLog());
                        updates.put("veracode.api.save-sca-log", String.valueOf(payload.getSystem().getSafeScaVersion().getSaveScaLog()));
                    }
                }
            }
            if (payload.getExclusions() != null) {
                if (payload.getExclusions().getIgnoredModules() != null) {
                    veracodeConfig.setIgnoreModules(payload.getExclusions().getIgnoredModules());
                    updates.put("veracode.api.ignore-modules", String.join(",", payload.getExclusions().getIgnoredModules()));
                }
                if (payload.getExclusions().getIncludedModules() != null) {
                    veracodeConfig.setIncludeModules(payload.getExclusions().getIncludedModules());
                    updates.put("veracode.api.include-modules", String.join(",", payload.getExclusions().getIncludedModules()));
                }
                if (payload.getExclusions().getIgnoredEcosystems() != null) {
                    veracodeConfig.setIgnoreEcosystems(payload.getExclusions().getIgnoredEcosystems());
                    updates.put("veracode.api.ignore-ecosystems", String.join(",", payload.getExclusions().getIgnoredEcosystems()));
                }
                if (payload.getExclusions().getNoScaArchitectures() != null) {
                    veracodeConfig.setNoSca(payload.getExclusions().getNoScaArchitectures());
                    updates.put("veracode.api.no-sca", String.join(",", payload.getExclusions().getNoScaArchitectures()));
                }
            }
            if (payload.getCompliance() != null) {
                if (payload.getCompliance().getTierMappings() != null) {
                    veracodeConfig.setTierMappings(payload.getCompliance().getTierMappings());
                    for (java.util.Map.Entry<String, java.util.Map<String, String>> exposureEntry : payload.getCompliance().getTierMappings().entrySet()) {
                        for (java.util.Map.Entry<String, String> classEntry : exposureEntry.getValue().entrySet()) {
                            updates.put("veracode.api.tier-mappings." + exposureEntry.getKey() + "." + classEntry.getKey(), classEntry.getValue());
                        }
                    }
                }
                if (payload.getCompliance().getGracePeriods() != null) {
                    veracodeConfig.setGracePeriods(payload.getCompliance().getGracePeriods());
                    for (java.util.Map.Entry<String, java.util.Map<String, Integer>> tierEntry : payload.getCompliance().getGracePeriods().entrySet()) {
                        for (java.util.Map.Entry<String, Integer> sevEntry : tierEntry.getValue().entrySet()) {
                            updates.put("veracode.api.grace-periods." + tierEntry.getKey() + "." + sevEntry.getKey(), String.valueOf(sevEntry.getValue()));
                        }
                    }
                }
            }
        }

        if (updates.isEmpty()) return;

        // Persist to file while preserving all comments, grouping, and line formatting!
        File file = new File(getConfigFilePath());
        if (!file.exists()) {
            return;
        }

        java.util.List<String> lines = java.nio.file.Files.readAllLines(file.toPath(), java.nio.charset.StandardCharsets.UTF_8);

        java.util.Set<String> processedKeys = new java.util.HashSet<>();

        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i).trim();
            // Check if it's a property line and not a comment
            if (!line.startsWith("#") && !line.startsWith("!") && line.contains("=")) {
                int eqIdx = line.indexOf("=");
                String key = line.substring(0, eqIdx).trim();
                if (updates.containsKey(key)) {
                    String escapedVal = escapePropertyValue(updates.get(key));
                    lines.set(i, key + "=" + escapedVal);
                    processedKeys.add(key);
                }
            }
        }

        // For any keys that didn't exist in the file, append them to the end
        for (java.util.Map.Entry<String, String> entry : updates.entrySet()) {
            if (!processedKeys.contains(entry.getKey())) {
                String escapedVal = escapePropertyValue(entry.getValue());
                lines.add(entry.getKey() + "=" + escapedVal);
            }
        }

        // Write the lines back to the file
        java.nio.file.Files.write(file.toPath(), lines, java.nio.charset.StandardCharsets.UTF_8);
    }

    private String escapePropertyValue(String value) {
        if (value == null) return "";
        String res = value;
        res = res.replace("\\", "\\\\");
        res = res.replace("\n", "\\n");
        res = res.replace("\r", "\\r");
        res = res.replace(":", "\\:");
        res = res.replace("=", "\\=");
        res = res.replace("#", "\\#");
        res = res.replace("!", "\\!");
        return res;
    }

    public java.util.Map<String, Object> getGroupedSystemConfig() {
        java.util.Map<String, Object> config = new java.util.HashMap<>();

        // Group 0: SAST&SCA Prompts
        java.util.Map<String, Object> sastAndScaPrompts = new java.util.HashMap<>();
        sastAndScaPrompts.put("sastPrompt", veracodeConfig.getSastPrompt());
        sastAndScaPrompts.put("scaPrompt", veracodeConfig.getScaPrompt());
        config.put("SAST&SCA Prompts", sastAndScaPrompts);

        // Group 1: System Settings
        java.util.Map<String, Object> system = new java.util.HashMap<>();
        system.put("scanValidityDays", veracodeConfig.getScanValidityDays());
        system.put("mitigationProposalEnabled", "true".equalsIgnoreCase(veracodeConfig.getMitigationProposalEnabled()));
        system.put("mitigationApiType", veracodeConfig.getMitigationApiType());
        system.put("saveXmlLogs", veracodeConfig.isSaveXmlLogs());
        system.put("saveJsonHistory", veracodeConfig.isSaveJsonHistory());
        system.put("historyLimit", veracodeConfig.getHistoryLimit());
        system.put("secondaryAuditEnabled", veracodeConfig.isSecondaryAuditEnabled());

        // Nested safeSCAVERSION under System
        java.util.Map<String, Object> safeScaVersion = new java.util.HashMap<>();
        safeScaVersion.put("scaSafeVersionEnabled", veracodeConfig.isScaSafeVersionEnabled());
        safeScaVersion.put("scaStaleFixMessage", veracodeConfig.getScaStaleFixMessage());
        safeScaVersion.put("scaNoFixMessage", veracodeConfig.getScaNoFixMessage());
        safeScaVersion.put("saveScaLog", veracodeConfig.isSaveScaLog());
        system.put("safeSCAVERSION", safeScaVersion);

        config.put("System", system);

        // Group 2: AI Engine Settings
        java.util.Map<String, Object> aiEngine = new java.util.HashMap<>();
        aiEngine.put("aiEngines", veracodeConfig.getAiEngines());
        aiEngine.put("engineModels", veracodeConfig.getEngineModels());
        aiEngine.put("sharedServiceEndpoint", veracodeConfig.getSharedServiceEndpoint());
        aiEngine.put("sharedServiceRole", veracodeConfig.getSharedServiceRole());
        aiEngine.put("sharedServiceMaxTokens", veracodeConfig.getSharedServiceMaxTokens());
        config.put("AiEngine", aiEngine);

        // Group 3: Secondary Audit Layer
        java.util.Map<String, Object> secondaryAudit = new java.util.HashMap<>();
        secondaryAudit.put("auditorModel", veracodeConfig.getAuditorModelName());
        secondaryAudit.put("sharedAuditorEndpoint", veracodeConfig.getSharedAuditorEndpoint());
        secondaryAudit.put("sharedAuditorMaxTokens", veracodeConfig.getSharedAuditorMaxTokens());
        secondaryAudit.put("sharedAuditorRole", veracodeConfig.getSharedAuditorRole());
        secondaryAudit.put("auditorPrompt", veracodeConfig.getAuditorPrompt());
        secondaryAudit.put("fallbackText", veracodeConfig.getAuditorDisagreeFallbackText());
        config.put("SecondaryAudit", secondaryAudit);

        // Group 4: Exclusions
        java.util.Map<String, Object> exclusions = new java.util.HashMap<>();
        exclusions.put("ignoredModules", veracodeConfig.getIgnoreModules());
        exclusions.put("includedModules", veracodeConfig.getIncludeModules());
        exclusions.put("ignoredEcosystems", veracodeConfig.getIgnoreEcosystems());
        exclusions.put("noScaArchitectures", veracodeConfig.getNoSca());
        config.put("Exclusions", exclusions);

        // Group 5: Compliance Tiers & Grace Periods
        java.util.Map<String, Object> compliance = new java.util.HashMap<>();
        compliance.put("tierMappings", veracodeConfig.getTierMappings());
        compliance.put("gracePeriods", veracodeConfig.getGracePeriods());
        java.util.List<String> tiers = new java.util.ArrayList<>(veracodeConfig.getGracePeriods().keySet());
        java.util.Collections.sort(tiers);
        compliance.put("tierDropDown", tiers);
        config.put("Compliance", compliance);

        return config;
    }

    public GroupedSystemConfigDTO getGroupedSystemConfigDTO() {
        GroupedSystemConfigDTO dto = new GroupedSystemConfigDTO();

        // SAST&SCA Prompts
        GroupedSystemConfigDTO.SastAndScaPrompts prompts = new GroupedSystemConfigDTO.SastAndScaPrompts();
        prompts.setSastPrompt(veracodeConfig.getSastPrompt());
        prompts.setScaPrompt(veracodeConfig.getScaPrompt());
        dto.setSastAndScaPrompts(prompts);

        // System Settings
        GroupedSystemConfigDTO.SystemSettings system = new GroupedSystemConfigDTO.SystemSettings();
        system.setScanValidityDays(veracodeConfig.getScanValidityDays());
        system.setMitigationProposalEnabled("true".equalsIgnoreCase(veracodeConfig.getMitigationProposalEnabled()));
        system.setMitigationApiType(veracodeConfig.getMitigationApiType());
        system.setSaveXmlLogs(veracodeConfig.isSaveXmlLogs());
        system.setSaveJsonHistory(veracodeConfig.isSaveJsonHistory());
        system.setHistoryLimit(veracodeConfig.getHistoryLimit());
        system.setSecondaryAuditEnabled(veracodeConfig.isSecondaryAuditEnabled());

        // safeSCAVERSION under System
        GroupedSystemConfigDTO.SafeScaVersionSettings safeSca = new GroupedSystemConfigDTO.SafeScaVersionSettings();
        safeSca.setScaSafeVersionEnabled(veracodeConfig.isScaSafeVersionEnabled());
        safeSca.setScaStaleFixMessage(veracodeConfig.getScaStaleFixMessage());
        safeSca.setScaNoFixMessage(veracodeConfig.getScaNoFixMessage());
        safeSca.setSaveScaLog(veracodeConfig.isSaveScaLog());
        system.setSafeScaVersion(safeSca);
        dto.setSystem(system);

        // AI Engine Settings
        GroupedSystemConfigDTO.AiEngineSettings aiEngine = new GroupedSystemConfigDTO.AiEngineSettings();
        aiEngine.setAiEngines(veracodeConfig.getAiEngines());
        aiEngine.setEngineModels(veracodeConfig.getEngineModels());
        aiEngine.setSharedServiceEndpoint(veracodeConfig.getSharedServiceEndpoint());
        aiEngine.setSharedServiceRole(veracodeConfig.getSharedServiceRole());
        aiEngine.setSharedServiceMaxTokens(veracodeConfig.getSharedServiceMaxTokens());
        dto.setAiEngine(aiEngine);

        // Secondary Audit Layer
        GroupedSystemConfigDTO.SecondaryAuditSettings secondaryAudit = new GroupedSystemConfigDTO.SecondaryAuditSettings();
        secondaryAudit.setAuditorModel(veracodeConfig.getAuditorModelName());
        secondaryAudit.setSharedAuditorEndpoint(veracodeConfig.getSharedAuditorEndpoint());
        secondaryAudit.setSharedAuditorMaxTokens(veracodeConfig.getSharedAuditorMaxTokens());
        secondaryAudit.setSharedAuditorRole(veracodeConfig.getSharedAuditorRole());
        secondaryAudit.setAuditorPrompt(veracodeConfig.getAuditorPrompt());
        secondaryAudit.setFallbackText(veracodeConfig.getAuditorDisagreeFallbackText());
        dto.setSecondaryAudit(secondaryAudit);

        // Exclusions
        GroupedSystemConfigDTO.ExclusionsSettings exclusions = new GroupedSystemConfigDTO.ExclusionsSettings();
        exclusions.setIgnoredModules(veracodeConfig.getIgnoreModules());
        exclusions.setIncludedModules(veracodeConfig.getIncludeModules());
        exclusions.setIgnoredEcosystems(veracodeConfig.getIgnoreEcosystems());
        exclusions.setNoScaArchitectures(veracodeConfig.getNoSca());
        dto.setExclusions(exclusions);

        // Compliance Tiers & Grace Periods
        GroupedSystemConfigDTO.ComplianceSettings compliance = new GroupedSystemConfigDTO.ComplianceSettings();
        compliance.setTierMappings(veracodeConfig.getTierMappings());
        compliance.setGracePeriods(veracodeConfig.getGracePeriods());
        java.util.List<String> tiers = new java.util.ArrayList<>(veracodeConfig.getGracePeriods().keySet());
        java.util.Collections.sort(tiers);
        compliance.setTierDropDown(tiers);
        dto.setCompliance(compliance);

        return dto;
    }
}
