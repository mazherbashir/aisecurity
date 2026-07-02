package com.crs_reivew_api.controller;

import com.crs_reivew_api.service.VeracodeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class VeracodeController {

    private final VeracodeService veracodeService;

    public VeracodeController(VeracodeService veracodeService) {
        this.veracodeService = veracodeService;
    }

    @GetMapping("/getfinalreport")
    public com.crs_reivew_api.dto.VeracodeReportDTO getFinalReport(
            @RequestParam(value = "application-name", required = false) String applicationName,
            @RequestParam(value = "app-id", required = false) String appId,
            @RequestParam(value = "build-id", required = false) String buildId,
            @RequestParam(value = "include-build-info", defaultValue = "false") boolean includeBuildInfo) {
        System.out.println("Received final report request. AppName: " + applicationName + ", AppID: " + appId + ", BuildID: " + buildId);
        return veracodeService.getFinalReport(applicationName, appId, buildId, includeBuildInfo);
    }

    @GetMapping("/getbuildinfo")
    public com.crs_reivew_api.model.veracode.BuildInfo getBuildInfo(@RequestParam("build-id") String buildId) {
        System.out.println("Fetching build info for ID: " + buildId);
        return veracodeService.getBuildInfo(buildId);
    }

    @GetMapping(value = "/getsastresults", produces = "application/json")
    public String getSastResult(@RequestParam("application-name") String applicationName) {
        System.out.println("Received request for application: " + applicationName);
        String result = veracodeService.getSastResult(applicationName);
        System.out.println("API Response: " + result);
        return result;
    }

    @GetMapping(value = "/getbuildid", produces = "text/plain")
    public String getBuildId(@RequestParam("app-id") String appId) {
        System.out.println("Received build list request for App ID: " + appId);
        return veracodeService.getBuildId(appId);
    }

    @GetMapping(value = "/getdetailedreport", produces = "application/xml")
    public String getDetailedReport(@RequestParam("build-id") String buildId) {
        System.out.println("Received detailed report request for Build ID: " + buildId);
        return veracodeService.getDetailedReport(buildId);
    }

    @org.springframework.web.bind.annotation.PostMapping("/api/veracode/mitigation")
    public java.util.Map<String, Object> updateMitigation(@org.springframework.web.bind.annotation.RequestBody java.util.Map<String, String> payload) {
        String buildId = payload.get("buildId");
        String appId = payload.get("appId");
        String flawIdList = payload.get("flawIdList");
        String action = payload.get("action");
        String comment = payload.get("comment");
        String cveId = payload.get("cveId");
        String type = payload.get("type");
        
        System.out.println("Received mitigation update request for Build ID: " + buildId + ", App ID: " + appId + ", Flaws: " + flawIdList + ", Action: " + action + ", Type: " + type);
        
        java.util.Map<String, Object> response = new java.util.HashMap<>();
        try {
            String result = veracodeService.updateMitigation(buildId, appId, flawIdList, action, comment, cveId, type);
            response.put("status", "success");
            response.put("result", org.owasp.encoder.Encode.forJava(result));
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", "Failed to update mitigation. Please check the server logs.");
        }
        return response;
    }
}
