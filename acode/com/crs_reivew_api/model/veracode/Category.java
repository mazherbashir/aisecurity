package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;
@XmlAccessorType(XmlAccessType.FIELD)
public class Category {
    @XmlAttribute(name = "categoryname") private String categoryName;
    @XmlElement(name = "cwe", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<Cwe> cwes;
    public String getCategoryName() { return categoryName; }
    public List<Cwe> getCwes() { return cwes; }
}
