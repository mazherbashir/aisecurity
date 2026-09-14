package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;

@XmlAccessorType(XmlAccessType.FIELD)
@XmlType(namespace = "https://www.veracode.com/schema/reports/export/1.0")
public class VeracodeModule {
    @XmlAttribute(name = "name") private String name;
    public String getName() { return name; }
}
