package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;

@XmlRootElement(name = "buildinfo", namespace = "https://analysiscenter.veracode.com/schema/buildinfo/5.0")
@XmlAccessorType(XmlAccessType.FIELD)
public class BuildInfo {
    @XmlAttribute(name = "build_id") private String buildId;
    @XmlElement(name = "build", namespace = "https://analysiscenter.veracode.com/schema/buildinfo/5.0")
    private BuildDetails build;

    public String getBuildId() { return buildId; }
    public BuildDetails getBuild() { return build; }

    @XmlAccessorType(XmlAccessType.FIELD)
    public static class BuildDetails {
        @XmlAttribute private String version;
        @XmlElement(name = "analysis_unit", namespace = "https://analysiscenter.veracode.com/schema/buildinfo/5.0")
        private AnalysisUnit analysisUnit;
        public String getVersion() { return version; }
        public AnalysisUnit getAnalysisUnit() { return analysisUnit; }
    }

    @XmlAccessorType(XmlAccessType.FIELD)
    public static class AnalysisUnit {
        @XmlAttribute private String status;
        public String getStatus() { return status; }
    }
}
