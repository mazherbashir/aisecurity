package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;
@XmlAccessorType(XmlAccessType.FIELD)
public class FlawList {
    @XmlElement(name = "flaw", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<Flaw> flaws;
    public List<Flaw> getFlaws() { return flaws; }
}
