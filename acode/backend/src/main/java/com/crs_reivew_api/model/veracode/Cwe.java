package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
@XmlAccessorType(XmlAccessType.FIELD)
public class Cwe {
    @XmlAttribute(name = "cweid") private Integer cweId;
    @XmlElement(name = "staticflaws", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private FlawList staticFlaws;
    public Integer getCweId() { return cweId; }
    public FlawList getStaticFlaws() { return staticFlaws; }
}
