package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;

@XmlAccessorType(XmlAccessType.FIELD)
public class PrescanIssue {
    @XmlAttribute(name = "details")
    private String details;

    public String getDetails() { return details; }
}
