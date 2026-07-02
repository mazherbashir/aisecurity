package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
@XmlAccessorType(XmlAccessType.FIELD)
public class Flaw {
    @XmlAttribute(name = "issueid") private Integer issueId;
    @XmlAttribute private String description;
    @XmlAttribute private Integer line;
    @XmlAttribute(name = "sourcefile") private String sourceFile;
    @XmlElement(name = "annotations", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private AnnotationList annotationList;
    @XmlElement(name = "mitigations", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private ScaMitigationList mitigationList;
    @XmlAttribute(name = "mitigation_status")
    private String mitigationStatus;
    @XmlAttribute(name = "remediation_status")
    private String remediationStatus;
    @XmlAttribute(name = "categoryname")
    private String categoryName;
    @XmlAttribute(name = "date_first_occurrence")
    private String dateFirstOccurrence;

    public Integer getIssueId() { return issueId; }
    public String getDescription() { return description; }
    public Integer getLine() { return line; }
    public String getSourceFile() { return sourceFile; }
    public String getMitigationStatus() { return mitigationStatus; }
    public String getRemediationStatus() { return remediationStatus; }
    public String getCategoryName() { return categoryName; }
    public String getDateFirstOccurrence() { return dateFirstOccurrence; }
    public AnnotationList getAnnotationList() { return annotationList; }
    public ScaMitigationList getMitigationList() { return mitigationList; }
}
