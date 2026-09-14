package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;
@XmlAccessorType(XmlAccessType.FIELD)
public class AnnotationList {
    @XmlElement(name = "annotation", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<Annotation> annotations;
    public List<Annotation> getAnnotations() { return annotations; }
}
