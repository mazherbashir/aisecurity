package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;

@XmlRootElement(name = "error")
@XmlAccessorType(XmlAccessType.FIELD)
public class VeracodeError {
    @XmlValue private String message;
    public String getMessage() { return message; }
}
