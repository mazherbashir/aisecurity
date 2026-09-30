package com.crs_reivew_api.controller;

import com.crs_reivew_api.service.VeracodeService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
public class VeracodeController {

    private final VeracodeService veracodeService;

    public VeracodeController(VeracodeService veracodeService) {
        this.veracodeService = veracodeService;
    }

    @GetMapping({"/api/getfinalreport", "/getfinalreport"})
    public com.crs_reivew_api.dto.VeracodeReportDTO getFinalReport(
            @RequestParam(value = "application-name", required = false) String applicationName,
            @RequestParam(value = "app-id", required = false) String appId,
            @RequestParam(value = "build-id", required = false) String buildId,
            @RequestParam(value = "include-build-info", defaultValue = "false") boolean includeBuildInfo,
            @RequestParam(value = "needReviewComments", required = false) Boolean needReviewComments,
            @RequestParam(value = "need-review-comments", required = false) Boolean needReviewCommentsKebab,
            @RequestParam(value = "needreviewcomments", required = false) Boolean needReviewCommentsLower) {
        boolean fetchReviewComments = Boolean.TRUE.equals(needReviewComments)
                || Boolean.TRUE.equals(needReviewCommentsKebab)
                || Boolean.TRUE.equals(needReviewCommentsLower);
        System.out.println("Received final report request. AppName: " + applicationName + ", AppID: " + appId 
                + ", BuildID: " + buildId + ", needReviewComments: " + fetchReviewComments);
        return veracodeService.getFinalReport(applicationName, appId, buildId, includeBuildInfo, fetchReviewComments);
    }

    @GetMapping({"/api/getbuildinfo", "/getbuildinfo"})
    public com.crs_reivew_api.model.veracode.BuildInfo getBuildInfo(@RequestParam("build-id") String buildId) {
        System.out.println("Fetching build info for ID: " + buildId);
        return veracodeService.getBuildInfo(buildId);
    }

    @GetMapping(value = {"/api/getsastresults", "/getsastresults"}, produces = "application/json")
    public String getSastResult(@RequestParam("application-name") String applicationName) {
        System.out.println("Received request for application: " + applicationName);
        String result = veracodeService.getSastResult(applicationName);
        System.out.println("API Response: " + result);
        return result;
    }

    @GetMapping(value = {"/api/getbuildid", "/getbuildid"}, produces = "text/plain")
    public String getBuildId(@RequestParam("app-id") String appId) {
        System.out.println("Received build list request for App ID: " + appId);
        return veracodeService.getBuildId(appId);
    }

    @GetMapping(value = {"/api/getdetailedreport", "/getdetailedreport"}, produces = "application/xml")
    public String getDetailedReport(@RequestParam("build-id") String buildId) {
        System.out.println("Received detailed report request for Build ID: " + buildId);
        return veracodeService.getDetailedReport(buildId);
    }

    @PostMapping("/api/veracode/mitigation")
    public Map<String, Object> updateMitigation(@RequestBody Map<String, String> payload) {
        String buildId = payload.get("buildId");
        String appId = payload.get("appId");
        String flawIdList = payload.get("flawIdList");
        String action = payload.get("action");
        String comment = payload.get("comment");
        String cveId = payload.get("cveId");
        String type = payload.get("type");
        String apiDebug = payload.get("apiDebug");
        
        System.out.println("Received mitigation update request for Build ID: " + buildId + ", App ID: " + appId + ", Flaws: " + flawIdList + ", Action: " + action + ", Type: " + type + ", apiDebug: " + apiDebug);
        
        Map<String, Object> response = new HashMap<>();
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

    @PostMapping(value = "/report/pdf", consumes = "application/json", produces = "application/json")
    public ResponseEntity<?> generatePdfReport(@RequestBody Map<String, String> payload) {
        String applicationName = payload.get("applicationName");
        String appId = payload.get("appId");
        String buildId = payload.get("buildId");

        System.out.println("Received request to generate Veracode PDF Report. AppName: " + applicationName + ", AppID: " + appId + ", BuildID: " + buildId);

        try {
            String uuid = veracodeService.startPdfGeneration(applicationName, appId, buildId);
            Map<String, Object> response = new HashMap<>();
            response.put("uuid", uuid);
            response.put("status", "PENDING");
            return ResponseEntity.accepted().body(response);
        } catch (IllegalArgumentException e) {
            Map<String, Object> response = new HashMap<>();
            response.put("status", "error");
            response.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(response);
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("status", "error");
            response.put("message", "Failed to start PDF generation: " + e.getMessage());
            return ResponseEntity.internalServerError().body(response);
        }
    }

    @GetMapping("/report/pdf/{uuid}")
    public ResponseEntity<?> getPdfReport(@PathVariable("uuid") String uuid) {
        com.crs_reivew_api.service.VeracodeService.ReportStatus status = veracodeService.getPdfReportStatus(uuid);
        if (status == null) {
            Map<String, Object> response = new HashMap<>();
            response.put("status", "error");
            response.put("message", "Report not found for UUID: " + uuid);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }

        if ("COMPLETED".equals(status.status)) {
            byte[] pdfBytes = veracodeService.getPdfReportBytes(uuid);
            if (pdfBytes == null) {
                Map<String, Object> response = new HashMap<>();
                response.put("status", "error");
                response.put("message", "Failed to retrieve PDF file contents.");
                return ResponseEntity.internalServerError().body(response);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDisposition(ContentDisposition.builder("attachment")
                    .filename("veracode_report_" + status.buildId + ".pdf")
                    .build());
            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        }

        return ResponseEntity.ok(status);
    }

    /**
     * Download Veracode Customized PDF Report by Application Profile Name (or App ID).
     * Uses the Veracode Custom PDF REST API (POST /report/pdf -> GET /report/pdf/{uuid} -> GET signed downloadUrl).
     * 
     * Example requests:
     * - GET /api/veracode/custom-pdf?appName=USA-TAX-Tax Research Chatbot
     * - GET /api/veracode/custom-pdf?applicationName=USA-TAX-Tax Research Chatbot
     * - GET /api/veracode/custom-pdf?app-id=18011
     */
    @GetMapping(
            value = {"/api/veracode/custom-pdf", "/api/veracode/customPdf", "/api/veracode/pdf/custom"},
            produces = MediaType.APPLICATION_PDF_VALUE
    )
    public ResponseEntity<byte[]> getCustomPdfReport(
            @RequestParam(value = "appName", required = false) String appName,
            @RequestParam(value = "applicationName", required = false) String applicationName,
            @RequestParam(value = "application-name", required = false) String applicationNameKebab,
            @RequestParam(value = "app-id", required = false) String appId,
            @RequestParam(value = "appId", required = false) String appIdCamel,
            @RequestParam(value = "findings_severity_level", required = false) String severity) {

        String targetApp = (appName != null && !appName.trim().isEmpty()) ? appName
                : ((applicationName != null && !applicationName.trim().isEmpty()) ? applicationName
                : ((applicationNameKebab != null && !applicationNameKebab.trim().isEmpty()) ? applicationNameKebab
                : ((appId != null && !appId.trim().isEmpty()) ? appId : appIdCamel)));

        if (targetApp == null || targetApp.trim().isEmpty()) {
            throw new IllegalArgumentException("Application profile name (appName/applicationName) or app-id parameter is required.");
        }

        Map<String, Object> overrides = new HashMap<>();
        if (severity != null && !severity.trim().isEmpty()) {
            overrides.put("findings_severity_level", severity.trim());
        }

        byte[] pdfBytes = veracodeService.downloadCustomPdfReport(targetApp, overrides);

        String filename = "Veracode_Custom_Report_" + targetApp.replaceAll("[^a-zA-Z0-9._-]", "_") + ".pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(ContentDisposition.builder("attachment")
                .filename(filename)
                .build());

        return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
    }

    /**
     * Submit an asynchronous Custom PDF report generation request.
     * POST /api/veracode/custom-pdf
     * POST /api/veracode/custom-pdf/submit
     */
    @PostMapping(
            value = {"/api/veracode/custom-pdf", "/api/veracode/custom-pdf/submit", "/api/veracode/custom-pdf/request"},
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> submitCustomPdfReport(@RequestBody JsonNode payload) {
        String appName = payload.has("appName") ? payload.get("appName").asText()
                : (payload.has("applicationName") ? payload.get("applicationName").asText()
                : (payload.has("app_id") ? payload.get("app_id").asText()
                : (payload.has("appId") ? payload.get("appId").asText() : null)));

        if (appName == null || appName.trim().isEmpty()) {
            throw new IllegalArgumentException("appName, applicationName, or app_id is required in JSON body.");
        }

        Map<String, Object> overrides = new HashMap<>();
        payload.fields().forEachRemaining(entry -> {
            String key = entry.getKey();
            JsonNode val = entry.getValue();
            if (!key.equals("appName") && !key.equals("applicationName")) {
                if (val.isBoolean()) overrides.put(key, val.asBoolean());
                else if (val.isTextual()) overrides.put(key, val.asText());
                else if (val.isInt() || val.isLong()) overrides.put(key, val.asLong());
            }
        });

        JsonNode result = veracodeService.submitCustomPdfReportRequest(appName, overrides);
        return ResponseEntity.ok(result);
    }

    /**
     * Poll status of an asynchronous Custom PDF report generation request.
     * GET /api/veracode/custom-pdf/status/{requestId}
     */
    @GetMapping(
            value = "/api/veracode/custom-pdf/status/{requestId}",
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> getCustomPdfStatus(@PathVariable("requestId") String requestId) {
        JsonNode status = veracodeService.pollCustomPdfReportStatus(requestId);
        return ResponseEntity.ok(status);
    }
}

