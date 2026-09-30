package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;
@XmlAccessorType(XmlAccessType.FIELD)
public class Severity {
    @XmlAttribute private Integer level;
    @XmlElement(name = "category", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<Category> categories;
    public Integer getLevel() { return level; }
    public List<Category> getCategories() { return categories; }
}
