package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;
@XmlAccessorType(XmlAccessType.FIELD)
public class ScaMitigationList {
    @XmlElement(name = "mitigation", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<ScaMitigation> mitigations;
    public List<ScaMitigation> getMitigations() { return mitigations; }
}
