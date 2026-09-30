package com.crs_reivew_api.model.veracode;
import jakarta.xml.bind.annotation.*;
import java.util.List;

@XmlAccessorType(XmlAccessType.FIELD)
public class ScaFilePathList {
    @XmlElement(name = "file_path", namespace = "https://www.veracode.com/schema/reports/export/1.0")
    private List<ScaFilePath> filePaths;
    public List<ScaFilePath> getFilePaths() { return filePaths; }
}
