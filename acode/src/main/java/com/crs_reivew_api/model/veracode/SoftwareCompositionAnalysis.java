package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
@XmlAccessorType(XmlAccessType.FIELD)
public class SoftwareCompositionAnalysis {
    @XmlElement(name = "vulnerable_components", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private VulnerableComponentList vulnerableComponents;
    public VulnerableComponentList getVulnerableComponents() { return vulnerableComponents; }
}
