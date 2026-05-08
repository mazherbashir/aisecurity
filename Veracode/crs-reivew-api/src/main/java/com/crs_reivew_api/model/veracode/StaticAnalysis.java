package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;

@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(namespace = "https://www.veracode.com/schema/reports/export/1.0")
public class StaticAnalysis {
    @XmlAttribute private Integer score;
    @XmlAttribute private String rating;
    @XmlAttribute(name = "static_analysis_unit_id") private String staticAnalysisUnitId;
    @XmlElementWrapper(name = "modules")
    @XmlElement(name = "module")
    private List<VeracodeModule> modules;

    public Integer getScore() { return score; }
    public String getRating() { return rating; }
    public String getStaticAnalysisUnitId() { return staticAnalysisUnitId; }
    public List<VeracodeModule> getModules() { return modules; }
}
