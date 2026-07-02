package com.crs_reivew_api.controller;

import com.crs_reivew_api.dto.VeracodeReportDTO;
import com.crs_reivew_api.service.CheckmarxService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CheckmarxController {

    private final CheckmarxService checkmarxService;

    public CheckmarxController(CheckmarxService checkmarxService) {
        this.checkmarxService = checkmarxService;
    }

    @GetMapping(value = "/api/checkmarx/getreport", produces = "application/json")
    public VeracodeReportDTO getCheckmarxReport(
            @RequestParam("application-name") String applicationName,
            @RequestParam(value = "branch-name", required = false) String branchName,
            @RequestParam(value = "tierValue", required = false) String tierValue) {
        
        System.out.println("Received request for Checkmarx Report. App: " + applicationName + ", Branch: " + branchName + ", Tier: " + tierValue);
        return checkmarxService.getReport(applicationName, branchName, tierValue);
    }

    @org.springframework.web.bind.annotation.PostMapping(value = "/api/checkmarx/mitigation", consumes = "application/json", produces = "application/json")
    public java.util.Map<String, Object> updateMitigation(@org.springframework.web.bind.annotation.RequestBody String requestBody) {
        java.util.Map<String, Object> response = new java.util.HashMap<>();
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode rootNode = mapper.readTree(requestBody);
            
            String result;
            if (rootNode.isArray()) {
                System.out.println("Received Checkmarx mitigation update request as JSON Array (batch predicates update).");
                result = checkmarxService.updatePredicatesList(rootNode);
            } else {
                String projectId = rootNode.hasNonNull("projectId") ? rootNode.get("projectId").asText() : rootNode.path("appId").asText(null);
                String scanId = rootNode.hasNonNull("scanId") ? rootNode.get("scanId").asText() : rootNode.path("buildId").asText(null);
                String similarityIdList = rootNode.hasNonNull("similarityId") ? rootNode.get("similarityId").asText() : rootNode.path("flawIdList").asText(null);
                String state = rootNode.path("state").isMissingNode() ? rootNode.path("action").asText(null) : rootNode.path("state").asText(null);
                String comment = rootNode.path("comment").asText("");
                String severity = rootNode.path("severity").asText(null);
                
                System.out.println("Received Checkmarx mitigation update request. Project: " + projectId + ", Scan: " + scanId + ", Similarities: " + similarityIdList + ", State: " + state + ", Severity: " + severity);
                result = checkmarxService.updatePredicate(projectId, scanId, similarityIdList, state, comment, severity);
            }
            
            response.put("status", "success");
            response.put("result", org.owasp.encoder.Encode.forJava(result));
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", "Failed to update Checkmarx predicate. Please check server logs: " + e.getMessage());
        }
        return response;
    }
}
