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
        String apiDebug = payload.get("apiDebug");
        
        System.out.println("Received mitigation update request for Build ID: " + buildId + ", App ID: " + appId + ", Flaws: " + flawIdList + ", Action: " + action + ", Type: " + type + ", apiDebug: " + apiDebug);
        
        java.util.Map<String, Object> response = new java.util.HashMap<>();
        try {
            String result = veracodeService.updateMitigation(buildId, appId, flawIdList, action, comment, cveId, type, apiDebug);
            response.put("status", "success");
            response.put("result", org.owasp.encoder.Encode.forJava(result));
        } catch (Exception e) {
            response.put("status", "error");
            response.put("message", "Failed to update mitigation. Please check the server logs.");
        }
        return response;
    }

    @org.springframework.web.bind.annotation.PostMapping(value = "/report/pdf", consumes = "application/json", produces = "application/json")
    public org.springframework.http.ResponseEntity<?> generatePdfReport(@org.springframework.web.bind.annotation.RequestBody java.util.Map<String, String> payload) {
        String applicationName = payload.get("applicationName");
        String appId = payload.get("appId");
        String buildId = payload.get("buildId");

        System.out.println("Received request to generate Veracode PDF Report. AppName: " + applicationName + ", AppID: " + appId + ", BuildID: " + buildId);

        try {
            String uuid = veracodeService.startPdfGeneration(applicationName, appId, buildId);
            java.util.Map<String, Object> response = new java.util.HashMap<>();
            response.put("uuid", uuid);
            response.put("status", "PENDING");
            return org.springframework.http.ResponseEntity.accepted().body(response);
        } catch (IllegalArgumentException e) {
            java.util.Map<String, Object> response = new java.util.HashMap<>();
            response.put("status", "error");
            response.put("message", e.getMessage());
            return org.springframework.http.ResponseEntity.badRequest().body(response);
        } catch (Exception e) {
            java.util.Map<String, Object> response = new java.util.HashMap<>();
            response.put("status", "error");
            response.put("message", "Failed to start PDF generation: " + e.getMessage());
            return org.springframework.http.ResponseEntity.internalServerError().body(response);
        }
    }

    @org.springframework.web.bind.annotation.GetMapping("/report/pdf/{uuid}")
    public org.springframework.http.ResponseEntity<?> getPdfReport(@org.springframework.web.bind.annotation.PathVariable("uuid") String uuid) {
        com.crs_reivew_api.service.VeracodeService.ReportStatus status = veracodeService.getPdfReportStatus(uuid);
        if (status == null) {
            java.util.Map<String, Object> response = new java.util.HashMap<>();
            response.put("status", "error");
            response.put("message", "Report not found for UUID: " + uuid);
            return org.springframework.http.ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND).body(response);
        }

        if ("COMPLETED".equals(status.status)) {
            byte[] pdfBytes = veracodeService.getPdfReportBytes(uuid);
            if (pdfBytes == null) {
                java.util.Map<String, Object> response = new java.util.HashMap<>();
                response.put("status", "error");
                response.put("message", "Failed to retrieve PDF file contents.");
                return org.springframework.http.ResponseEntity.internalServerError().body(response);
            }

            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_PDF);
            headers.setContentDisposition(org.springframework.http.ContentDisposition.builder("attachment")
                    .filename("veracode_report_" + status.buildId + ".pdf")
                    .build());
            return new org.springframework.http.ResponseEntity<>(pdfBytes, headers, org.springframework.http.HttpStatus.OK);
        }

        return org.springframework.http.ResponseEntity.ok(status);
    }
}
