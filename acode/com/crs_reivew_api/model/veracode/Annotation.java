package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
@XmlAccessorType(XmlAccessType.FIELD)
public class Annotation {
    @XmlAttribute private String user;
    @XmlAttribute private String description;
    @XmlAttribute private String date;
    public String getUser() { return user; }
    public String getDescription() { return description; }
}
