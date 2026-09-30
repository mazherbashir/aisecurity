package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;

@XmlRootElement(name = "prescanresults", namespace = "https://analysiscenter.veracode.com/schema/2.0/prescanresults")
@XmlAccessorType(XmlAccessType.FIELD)
public class PrescanResults {
    @XmlElement(name = "module", namespace = "https://analysiscenter.veracode.com/schema/2.0/prescanresults")
    private List<PrescanModule> modules;

    public List<PrescanModule> getModules() { return modules; }
}
