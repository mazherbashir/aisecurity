package com.crs_reivew_api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class VeracodeScaFindingsRestDTO {

    @JsonProperty("_embedded")
    public Embedded _embedded;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Embedded {
        public List<Finding> findings;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Finding {
        public String scan_type;
        public String description;
        public int count;
        public String context_type;
        public String context_guid;
        public boolean violates_policy;
        
        public FindingStatus finding_status;
        public FindingDetails finding_details;
        public List<Annotation> annotations;

        // Root level id and finding_id in case the REST API returns them there
        public String id;
        public String finding_id;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FindingStatus {
        public String first_found_date;
        public String status;
        public String resolution;
        
        @JsonProperty("new")
        public boolean new_finding;
        
        public String resolution_status;
        public String last_seen_date;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FindingDetails {
        public int severity;
        public Cwe cwe;
        public String component_id;
        public List<License> licenses;
        public Metadata metadata;
        public Cve cve;
        public String product_id;
        public String component_filename;
        public String language;
        public List<ComponentPath> component_path;
        public String version;
        
        // Add a flexible id property in case Veracode or the payload has/adds an explicit 'id'
        public String id;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Cwe {
        public int id;
        public String name;
        public String href;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class License {
        public String license_id;
        public String risk_rating;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Metadata {
        public String sca_scan_mode;
        public String sca_dep_mode;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Cve {
        public String name;
        public double cvss;
        public String href;
        public String severity;
        public String vector;
        public Cvss3 cvss3;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Cvss3 {
        public double score;
        public String severity;
        public String vector;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ComponentPath {
        public String path;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Annotation {
        public String comment;
        public String action;
        public String created;
        public String technique;
        public String specifics;
        public String remaining_risk;
        public String verification;
        public String user_name;
    }
}
