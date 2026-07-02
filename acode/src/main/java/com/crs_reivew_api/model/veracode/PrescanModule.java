package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;

@XmlAccessorType(XmlAccessType.FIELD)
public class PrescanModule {
    @XmlAttribute(name = "name") private String name;
    @XmlAttribute(name = "file_name") private String fileName;
    @XmlAttribute(name = "is_dependency") private boolean isDependency;
    @XmlAttribute(name = "is_third_party") private boolean isThirdParty;
    @XmlAttribute(name = "has_fatal_errors") private boolean hasFatalErrors;
    @XmlAttribute(name = "status") private String status;
    @XmlAttribute(name = "platform") private String platform;

    @XmlElement(name = "issue", namespace = "https://analysiscenter.veracode.com/schema/2.0/prescanresults")
    private java.util.List<PrescanIssue> issues;

    public String getName() { return name; }
    public String getFileName() { return fileName; }
    public boolean isDependency() { return isDependency; }
    public boolean isThirdParty() { return isThirdParty; }
    public boolean hasFatalErrors() { return hasFatalErrors; }
    public String getStatus() { return status; }
    public String getPlatform() { return platform; }
    public java.util.List<PrescanIssue> getIssues() { return issues; }
}
