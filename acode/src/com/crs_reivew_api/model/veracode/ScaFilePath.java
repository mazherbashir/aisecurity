package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;

@XmlAccessorType(XmlAccessType.FIELD)
public class ScaFilePath {
    @XmlAttribute(name = "value")
    private String value;
    public String getValue() { return value; }
}
