package com.crs_reivew_api.dto;

import java.util.List;
import java.util.ArrayList;
import com.crs_reivew_api.model.veracode.BuildInfo;

public class VeracodeReportDTO {
    public ScanOverviewDTO overview = new ScanOverviewDTO();
    public SeveritySummaryDTO sastSummary = new SeveritySummaryDTO();
    public ScaSummaryDTO scaSummary = new ScaSummaryDTO();
    public List<ScaDetailDTO> scaDetails = new ArrayList<>();
    public List<FindingDTO> findingsWithCommentsSAST = new ArrayList<>();
    public List<FindingDTO> findingsWithCommentsSCA = new ArrayList<>();

    @com.fasterxml.jackson.annotation.JsonProperty("sastMitigationProposal")
    public java.util.Map<String, Integer> mitigationBreakdownSAST = new java.util.LinkedHashMap<>();
    
    @com.fasterxml.jackson.annotation.JsonProperty("scaMitigationProposal")
    public java.util.Map<String, Integer> mitigationBreakdownSCA = new java.util.LinkedHashMap<>();

    public List<String> unselectedModules = new ArrayList<>();
    public List<String> selectedModules = new ArrayList<>();
    public List<String> architectures = new ArrayList<>();
    public List<String> noPrecompile = new ArrayList<>();
    public List<String> minifedFiles = new ArrayList<>();
    public String scaEcosystems;
    public boolean scaSafeVersionEnabled;
    public List<String> packagingAnomalies = new ArrayList<>();
    
    @com.fasterxml.jackson.annotation.JsonProperty("missingSCAForSelectedModules")
    public List<String> missingSCAForSelectedModules = new ArrayList<>();

    public static class ScanOverviewDTO {
        public String applicationName;
        public String appId;
        public String accountId;
        public String buildId;
        public String analysisId;
        public String scanName;
        public String generationDate;
        public String policyName;
        public String policyComplianceStatus;
        public Integer sastScore;
        public String sastRating;
        public String staticAnalysisUnitId;
        public String sandboxId;
        public String tier;
        public String gracePeriod;
        
        @com.fasterxml.jackson.annotation.JsonProperty("submitted_date")
        public String submittedDate;
    }

    public static class SeveritySummaryDTO {
        public int vulnerabilities;
        public java.util.Map<String, SeverityBreakdownDTO> breakdown = new java.util.LinkedHashMap<>();
    }

    public static class SeverityBreakdownDTO {
        public int total;
        public List<CweFindingDTO> findings = new ArrayList<>();
    }

    public static class CweFindingDTO {
        public String cwe;
        public int count;
        public String date_first_occurrence;
        public String remediation_due_date;
    }

    public static class ScaSummaryDTO extends SeveritySummaryDTO {
        public int totalPackages;
        public int totalVulnerablePackages;
    }

    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public static class FindingDTO {
        public String type; // SAST or SCA
        public String id;
        public String cweid;
        public String title;
        public String severity; // High, Medium, etc.
        public String location;
        public String fileName;
        public String description;
        public String cve_summary;
        public List<String> userComments;
        public String remediation_due_date;
        public String fixedVersion;
    }

    public static class ScaDetailDTO {
        public String packageName;
        public String version;
        public String safeVersion;
        public String firstFoundDate;
        public String remediation_due_date;
        public String severityCounts; // e.g., "VeryHigh: 1 Medium: 2"
        public String cveList; // e.g., "CVE-2026-4800,CVE-2026-2950"
    }
}
