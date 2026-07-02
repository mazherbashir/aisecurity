package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;
@XmlAccessorType(XmlAccessType.FIELD)
public class VulnerableComponentList {
    @XmlElement(name = "component", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<ScaComponent> components;
    public List<ScaComponent> getComponents() { return components; }
}
