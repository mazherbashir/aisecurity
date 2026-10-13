package com.crs_reivew_api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.HashMap;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class SnowRitmDTO {

    public String ritmNumber;
    public String sysId;
    public String state;
    public String stage;
    public String priority;
    public String shortDescription;
    public String sysCreatedOn;
    public String sysUpdatedOn;
    public String openedAt;
    public String closedAt;

    // Key fields extracted from u_variables_string
    public String applicationProfileName;
    public String scaTool;
    public String applicationTechnology;
    public String applicationVersion;
    public String requestReason;
    public String plannedDeploymentDate;
    public String fundingCode;
    public String fundingSource;
    public String owningPortfolio;
    public String managingTerritory;
    public String lineOfService;
    public String applicationProfileUrl;
    public String applicationSteward;

    // Full map of all parsed variables from u_variables_string
    public Map<String, String> variables = new HashMap<>();

    public SnowRitmDTO() {}

    public String getRitmNumber() {
        return ritmNumber;
    }

    public String getSysId() {
        return sysId;
    }

    public String getState() {
        return state;
    }

    public String getStage() {
        return stage;
    }

    public String getPriority() {
        return priority;
    }

    public String getShortDescription() {
        return shortDescription;
    }

    public String getSysCreatedOn() {
        return sysCreatedOn;
    }

    public String getSysUpdatedOn() {
        return sysUpdatedOn;
    }

    public String getOpenedAt() {
        return openedAt;
    }

    public String getClosedAt() {
        return closedAt;
    }

    public String getApplicationProfileName() {
        return applicationProfileName;
    }

    public String getScaTool() {
        return scaTool;
    }

    public String getApplicationTechnology() {
        return applicationTechnology;
    }

    public String getApplicationVersion() {
        return applicationVersion;
    }

    public String getRequestReason() {
        return requestReason;
    }

    public String getPlannedDeploymentDate() {
        return plannedDeploymentDate;
    }

    public String getFundingCode() {
        return fundingCode;
    }

    public String getFundingSource() {
        return fundingSource;
    }

    public String getOwningPortfolio() {
        return owningPortfolio;
    }

    public String getManagingTerritory() {
        return managingTerritory;
    }

    public String getLineOfService() {
        return lineOfService;
    }

    public String getApplicationProfileUrl() {
        return applicationProfileUrl;
    }

    public String getApplicationSteward() {
        return applicationSteward;
    }

    public Map<String, String> getVariables() {
        return variables;
    }
}
