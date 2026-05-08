package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;

@XmlRootElement(name = "detailedreport", namespace = "https://www.veracode.com/schema/reports/export/1.0")
@XmlAccessorType(XmlAccessType.FIELD)
public class VeracodeReport {
    @XmlAttribute(name = "app_name") private String appName;
    @XmlAttribute(name = "build_id") private String buildId;
    @XmlAttribute(name = "version") private String scanName;
    @XmlAttribute(name = "generation_date") private String generationDate;
    @XmlElement(name = "static-analysis", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private StaticAnalysis staticAnalysis;
    @XmlElement(name = "severity", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<Severity> severities;
    @XmlElement(name = "software_composition_analysis", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private SoftwareCompositionAnalysis sca;
    @XmlAttribute(name = "app_id") private String appId;
    @XmlAttribute(name = "policy_name") private String policyName;
    @XmlAttribute(name = "policy_compliance_status") private String policyComplianceStatus;
    @XmlAttribute(name = "account_id") private String accountId;
    @XmlAttribute(name = "analysis_id") private String analysisId;
    @XmlAttribute(name = "sandbox_id") private String sandboxId;

    public String getAppName() { return appName; }
    public String getAppId() { return appId; }
    public String getBuildId() { return buildId; }
    public String getScanName() { return scanName; }
    public String getGenerationDate() { return generationDate; }
    public String getPolicyName() { return policyName; }
    public String getPolicyComplianceStatus() { return policyComplianceStatus; }
    public String getAccountId() { return accountId; }
    public String getAnalysisId() { return analysisId; }
    public String getSandboxId() { return sandboxId; }
    public StaticAnalysis getStaticAnalysis() { return staticAnalysis; }
    public List<Severity> getSeverities() { return severities; }
    public SoftwareCompositionAnalysis getSca() { return sca; }
}
