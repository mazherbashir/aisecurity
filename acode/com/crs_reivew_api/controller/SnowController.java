package com.crs_reivew_api.controller;

import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.SnowRitmDTO;
import com.crs_reivew_api.dto.SnowScTaskDTO;
import com.crs_reivew_api.dto.VeracodeReportDTO;
import com.crs_reivew_api.scheduler.TicketScheduler;
import com.crs_reivew_api.service.CheckmarxService;
import com.crs_reivew_api.service.SnowService;
import com.crs_reivew_api.service.VeracodeService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * <h1>ServiceNow REST API Controller</h1>
 * <p>
 * Exposes Web API endpoints for interacting with ServiceNow RITM ({@code sc_req_item}) and
 * SCTASK ({@code sc_task}) catalog task records.
 * </p>
 * <h3>Key Endpoints:</h3>
 * <ul>
 *   <li><b>GET /api/snow/ritm/{ritmNumber}</b>: Retrieves enriched RITM details (top-level profile name, SCA tool, request reason).</li>
 *   <li><b>GET /api/snow/sctask/open</b>: Retrieves open catalog tasks for CRS security reviews.</li>
 *   <li><b>POST /api/snow/sctaskUpdate</b>: Dynamic updates to catalog tasks via import table.</li>
 *   <li><b>POST /api/snow/attachment/upload</b>: Uploads PDF report attachments to RITM.</li>
 *   <li><b>POST /api/snow/processSignoff</b>: Process Sign-Off request (supports {@code "no_flaw"} and {@code "with_plan"} / RP).</li>
 *   <li><b>POST /api/snow/closeMar</b>: Closes Mitigation Approval Review (MAR Closed) task and updates RITM variables.</li>
 * </ul>
 *
 * @see com.crs_reivew_api.service.SnowService
 * @see com.crs_reivew_api.scheduler.TicketScheduler
 */
@RestController
@RequestMapping("/api/snow")
public class SnowController {

    private final SnowService snowService;
    private final VeracodeService veracodeService;
    private final TicketScheduler ticketScheduler;
    private final VeracodeConfig veracodeConfig;

    @Autowired(required = false)
    private CheckmarxService checkmarxService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public SnowController(
            SnowService snowService,
            VeracodeService veracodeService,
            TicketScheduler ticketScheduler,
            VeracodeConfig veracodeConfig) {
        this.snowService = snowService;
        this.veracodeService = veracodeService;
        this.ticketScheduler = ticketScheduler;
        this.veracodeConfig = veracodeConfig;
    }

    /**
     * Get RITM info by RITM number in path (e.g., GET /api/snow/ritm/RITM0012345).
     * Returns enriched JSON payload with top-level fields (applicationProfileName, scaTool, etc.)
     */
    @GetMapping(value = "/ritm/{ritmNumber}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> getRitmByPathVariable(@PathVariable("ritmNumber") String ritmNumber) {
        JsonNode result = snowService.getRitmByNumber(ritmNumber);
        return ResponseEntity.ok(result);
    }

    /**
     * Get strongly typed SnowRitmDTO for a specific RITM number (e.g., GET /api/snow/ritm/RITM0012345/details).
     */
    @GetMapping(value = "/ritm/{ritmNumber}/details", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<SnowRitmDTO> getRitmDetailsByPathVariable(@PathVariable("ritmNumber") String ritmNumber) {
        SnowRitmDTO dto = snowService.getRitmDetails(ritmNumber);
        if (dto == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dto);
    }

    /**
     * Query RITM numbers or custom sysparm queries.
     * Examples:
     * - GET /api/snow/ritm?number=RITM0012345
     * - GET /api/snow/ritm?query=short_descriptionLIKECode&limit=5
     */
    @GetMapping(value = "/ritm", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> getRitm(
            @RequestParam(value = "number", required = false) String number,
            @RequestParam(value = "ritm", required = false) String ritmParam,
            @RequestParam(value = "query", required = false) String query,
            @RequestParam(value = "limit", required = false, defaultValue = "10") Integer limit,
            @RequestParam(value = "displayValue", required = false, defaultValue = "true") Boolean displayValue) {

        String targetNumber = (number != null && !number.trim().isEmpty()) ? number
                : ((ritmParam != null && !ritmParam.trim().isEmpty()) ? ritmParam : null);

        if (targetNumber != null) {
            JsonNode result = snowService.getRitmByNumber(targetNumber);
            return ResponseEntity.ok(result);
        }

        JsonNode result = snowService.queryRitms(query, limit, displayValue);
        return ResponseEntity.ok(result);
    }

    /**
     * Call ServiceNow sc_task table for open CRS catalog tasks / remediation items.
     * Direct URL: https://pwcnetwork.service-now.com/api/now/table/sc_task?sysparm_limit=500&sysparm_display_value=True&sysparm_query=...&sysparm_fields=...
     * 
     * Endpoint: GET /api/snow/openRemediation (also mapped to /openRemediaton, /open_remediation, /sctask)
     */
    @GetMapping(value = {"/openRemediation", "/openRemediaton", "/open_remediation", "/sctask"}, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> openRemediation(
            @RequestParam(value = "limit", required = false, defaultValue = "500") Integer limit,
            @RequestParam(value = "sysparm_query", required = false) String sysparmQuery,
            @RequestParam(value = "query", required = false) String queryParam,
            @RequestParam(value = "sysparm_fields", required = false) String sysparmFields,
            @RequestParam(value = "fields", required = false) String fieldsParam) {

        String query = (sysparmQuery != null && !sysparmQuery.trim().isEmpty()) ? sysparmQuery : queryParam;
        String fields = (sysparmFields != null && !sysparmFields.trim().isEmpty()) ? sysparmFields : fieldsParam;

        JsonNode result = snowService.openRemediation(limit, query, fields);
        return ResponseEntity.ok(result);
    }

    /**
     * Alias endpoint specifically for open catalog tasks.
     * GET /api/snow/sctask/open
     */
    @GetMapping(value = "/sctask/open", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> getOpenCatalogTasksAlias(
            @RequestParam(value = "limit", required = false, defaultValue = "500") Integer limit,
            @RequestParam(value = "query", required = false) String query,
            @RequestParam(value = "fields", required = false) String fields) {

        JsonNode result = snowService.getOpenCatalogTasks(limit, query, fields);
        return ResponseEntity.ok(result);
    }

    /**
     * Strongly-typed DTO list endpoint for open catalog tasks.
     * GET /api/snow/sctask/open/details
     */
    @GetMapping(value = "/sctask/open/details", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<SnowScTaskDTO>> getOpenCatalogTasksDetails(
            @RequestParam(value = "limit", required = false, defaultValue = "500") Integer limit,
            @RequestParam(value = "query", required = false) String query,
            @RequestParam(value = "fields", required = false) String fields) {

        List<SnowScTaskDTO> list = snowService.getOpenCatalogTaskDetails(limit, query, fields);
        return ResponseEntity.ok(list);
    }

    /**
     * Get a single catalog task by task number in path (e.g. GET /api/snow/sctask/SCTASK30824068).
     */
    @GetMapping(value = "/sctask/{taskNumber}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> getScTaskByPathVariable(@PathVariable("taskNumber") String taskNumber) {
        JsonNode result = snowService.getScTaskByNumber(taskNumber);
        return ResponseEntity.ok(result);
    }

    /**
     * Get strongly-typed SnowScTaskDTO for a single catalog task (e.g. GET /api/snow/sctask/SCTASK30824068/details).
     */
    @GetMapping(value = "/sctask/{taskNumber}/details", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<SnowScTaskDTO> getScTaskDetailsByPathVariable(@PathVariable("taskNumber") String taskNumber) {
        SnowScTaskDTO dto = snowService.getScTaskDetails(taskNumber);
        if (dto == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dto);
    }

    /**
     * Update ServiceNow SCTASK variables / fields via POST /now/import/u_generic_catalog_task_update
     * Accepts dynamic JSON payloads (Add Comment, Add Work Note, Set Status, Assign Task, Close Task, Set Pending, set ReviewComments).
     * 
     * Endpoints:
     * - POST /api/snow/sctaskUpdate
     * - POST /api/snow/sctask_update
     * - POST /api/snow/update_sctask_vars
     * - POST /api/snow/updateSctask
     */
    @PostMapping(
            value = {"/sctaskUpdate", "/sctask_update", "/update_sctask_vars", "/updateSctask"},
            produces = MediaType.APPLICATION_JSON_VALUE,
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> sctaskUpdate(
            @RequestBody JsonNode payload,
            @RequestParam(value = "action", required = false) String actionParam,
            @RequestParam(value = "u_action", required = false) String uActionParam) {

        String queryAction = (uActionParam != null && !uActionParam.trim().isEmpty()) ? uActionParam : actionParam;
        JsonNode response = snowService.updateScTask(payload, queryAction);
        return ResponseEntity.ok(response);
    }

    /**
     * Modular endpoint to query any ServiceNow table.
     * Examples:
     * - GET /api/snow/table/sc_req_item?query=number=RITM0012345
     * - GET /api/snow/table/sc_task?limit=5
     */
    @GetMapping(value = "/table/{tableName}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> queryTable(
            @PathVariable("tableName") String tableName,
            @RequestParam(value = "query", required = false) String query,
            @RequestParam(value = "limit", required = false, defaultValue = "10") Integer limit,
            @RequestParam(value = "displayValue", required = false, defaultValue = "true") Boolean displayValue) {

        JsonNode result = snowService.queryTable(tableName, query, limit, displayValue);
        return ResponseEntity.ok(result);
    }

    /**
     * Get ServiceNow sys_id by RITM number.
     * GET /api/snow/sysid/{ritmNumber}
     * GET /api/snow/ritm/{ritmNumber}/sysid
     */
    @GetMapping(value = {"/sysid/{ritmNumber}", "/ritm/{ritmNumber}/sysid"}, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<java.util.Map<String, String>> getSysIdByRitmNumber(@PathVariable("ritmNumber") String ritmNumber) {
        String sysId = snowService.getSysIdByRitmNumber(ritmNumber);
        java.util.Map<String, String> response = new java.util.HashMap<>();
        response.put("ritm", ritmNumber);
        response.put("sys_id", sysId);
        return ResponseEntity.ok(response);
    }

    /**
     * Upload a PDF file attachment to ServiceNow sc_req_item table by RITM number or sys_id.
     * POST /api/snow/attachment/upload
     * POST /api/snow/uploadAttachment
     */
    @PostMapping(
            value = {"/attachment/upload", "/uploadAttachment", "/attachment/file"},
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> uploadAttachment(
            @RequestParam(value = "file", required = false) org.springframework.web.multipart.MultipartFile file,
            @RequestParam(value = "filePath", required = false) String filePath,
            @RequestParam(value = "file_path", required = false) String filePathSnake,
            @RequestParam(value = "fileName", required = false) String fileNameParam,
            @RequestParam(value = "file_name", required = false) String fileNameSnake,
            @RequestParam(value = "ritm", required = false) String ritmParam,
            @RequestParam(value = "ritmNumber", required = false) String ritmNumberParam,
            @RequestParam(value = "sysId", required = false) String sysIdParam,
            @RequestParam(value = "table_sys_id", required = false) String tableSysIdParam,
            @RequestBody(required = false) java.util.Map<String, String> body) {

        String targetRitmOrSysId = (ritmParam != null && !ritmParam.trim().isEmpty()) ? ritmParam
                : ((ritmNumberParam != null && !ritmNumberParam.trim().isEmpty()) ? ritmNumberParam
                : ((sysIdParam != null && !sysIdParam.trim().isEmpty()) ? sysIdParam
                : ((tableSysIdParam != null && !tableSysIdParam.trim().isEmpty()) ? tableSysIdParam
                : (body != null ? (body.get("ritm") != null ? body.get("ritm") : body.get("sys_id")) : null))));

        String pathStr = (filePath != null && !filePath.trim().isEmpty()) ? filePath
                : ((filePathSnake != null && !filePathSnake.trim().isEmpty()) ? filePathSnake
                : (body != null ? (body.get("filePath") != null ? body.get("filePath") : body.get("file_path")) : null));

        String fileName = (fileNameParam != null && !fileNameParam.trim().isEmpty()) ? fileNameParam
                : ((fileNameSnake != null && !fileNameSnake.trim().isEmpty()) ? fileNameSnake
                : (body != null ? (body.get("fileName") != null ? body.get("fileName") : body.get("file_name")) : null));

        if (file != null && !file.isEmpty()) {
            try {
                byte[] bytes = file.getBytes();
                String name = (fileName != null && !fileName.trim().isEmpty()) ? fileName : file.getOriginalFilename();
                JsonNode result = snowService.uploadPdfAttachment(bytes, name, targetRitmOrSysId);
                return ResponseEntity.ok(result);
            } catch (Exception e) {
                throw new RuntimeException("Failed to process uploaded file: " + e.getMessage(), e);
            }
        } else if (pathStr != null && !pathStr.trim().isEmpty()) {
            JsonNode result = snowService.uploadPdfAttachment(pathStr, targetRitmOrSysId);
            return ResponseEntity.ok(result);
        } else {
            throw new IllegalArgumentException("Either a multipart file ('file') or a local file path ('filePath') must be provided.");
        }
    }

    /**
     * Update ServiceNow RITM variables via PATCH /api/ipwc/request_item/update/$RITM/variables/nv
     *
     * Endpoints:
     * - PATCH /api/snow/ritm/{ritmNumber}/variables
     * - PATCH /api/snow/updateRitmVariables/{ritmNumber}
     * - POST /api/snow/updateRitmVariables
     */
    @PatchMapping(
            value = {"/ritm/{ritmNumber}/variables", "/updateRitmVariables/{ritmNumber}"},
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> updateRitmVariablesByPathVariable(
            @PathVariable("ritmNumber") String ritmNumber,
            @RequestBody(required = false) JsonNode payload) {

        JsonNode response = snowService.updateRitmVariables(ritmNumber, payload);
        return ResponseEntity.ok(response);
    }

    @PostMapping(
            value = {"/updateRitmVariables", "/ritm/variables/update"},
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<JsonNode> updateRitmVariablesByPostBody(
            @RequestParam(value = "ritm", required = false) String ritmParam,
            @RequestParam(value = "ritmNumber", required = false) String ritmNumberParam,
            @RequestBody(required = false) JsonNode payload) {

        String ritmNumber = (ritmParam != null && !ritmParam.trim().isEmpty()) ? ritmParam
                : ((ritmNumberParam != null && !ritmNumberParam.trim().isEmpty()) ? ritmNumberParam
                : (payload != null ? (payload.hasNonNull("ritm") ? payload.get("ritm").asText()
                : (payload.hasNonNull("ritmNumber") ? payload.get("ritmNumber").asText()
                : (payload.hasNonNull("ritm_number") ? payload.get("ritm_number").asText() : null))) : null));

        if (ritmNumber == null || ritmNumber.trim().isEmpty()) {
            throw new IllegalArgumentException("RITM number is required (via path variable, query parameter 'ritm', or JSON body key 'ritm')");
        }

        JsonNode response = snowService.updateRitmVariables(ritmNumber, payload);
        return ResponseEntity.ok(response);
    }

    /**
     * Dedicated API endpoint to process Sign-Off requests triggered manually from UI / API.
     * 
     * Requirements:
     * 1. Validates that Request Reason is "Sign Off" (throws 400 error if not Sign Off).
     * 2. Accepts:
     *    - sctaskNumber (SCTASK number)
     *    - applicationName (Profile / Project name)
     *    - tool ("Veracode" or "Checkmarx", default "Veracode")
     *    - mitigationProposalsReviewed (default "0", or user supplied value)
     *    - signoffType ("no_flaw" default, or "RP")
     * 3. For signoffType == "no_flaw":
     *    - Checks if sastSummary.vulnerabilities != 0 or scaSummary.vulnerabilities != 0.
     *    - If open vulnerabilities exist, pulls a NEW report.
     *    - If new report STILL has open vulnerabilities, throws a 400 error showing assessmentFindings!
     * 4. For signoffType == "RP":
     *    - Pulls a NEW report and processes sign-off with sign_off_reason = "RP".
     * 5. Updates scan name, PDF attachment, RITM variables, and closes SCTASK (state = 3).
     */
    @PostMapping(
            value = {"/processSignoff", "/process_signoff", "/signoff"},
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> processSignoff(@RequestBody JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Request payload must be a JSON object"));
        }

        String sctaskNumber = getFirstNonEmptyText(payload, "sctaskNumber", "sctask", "u_number", "number");
        String applicationName = getFirstNonEmptyText(payload, "applicationName", "application_name", "profileName", "appName");
        String tool = getFirstNonEmptyText(payload, "tool", "scaTool", "sca_tool");
        if (tool == null || tool.trim().isEmpty()) {
            tool = "Veracode";
        }

        String mitigationProposalsReviewed = getFirstNonEmptyText(payload, "mitigationProposalsReviewed", "mitigation_proposals_reviewed", "mitigationProposals");
        if (mitigationProposalsReviewed == null || mitigationProposalsReviewed.trim().isEmpty()) {
            mitigationProposalsReviewed = "0";
        }

        String rawSignoffType = getFirstNonEmptyText(payload, "signoffType", "signoff_type", "signoff-type", "signOffType");
        String signoffType = "no_flaw";
        if (rawSignoffType != null && !rawSignoffType.trim().isEmpty()) {
            String clean = rawSignoffType.trim().toLowerCase().replace("-", "_").replace(" ", "");
            if ("with_plan".equals(clean) || "withplan".equals(clean) || "rp".equals(clean) || "remediation_plan".equals(clean) || "remediationplan".equals(clean)) {
                signoffType = "with_plan";
            } else {
                signoffType = "no_flaw";
            }
        }

        if (sctaskNumber == null || sctaskNumber.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "sctaskNumber is required"));
        }
        if (applicationName == null || applicationName.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "applicationName is required"));
        }

        sctaskNumber = sctaskNumber.trim();
        applicationName = applicationName.trim();

        // Parameters for RP Signoff
        String remediationPlanId = null;
        String estimatedCompletionDate = null;
        boolean rpWithinGracePeriod = true;

        boolean isRp = isRpSignoff(signoffType);

        if (isRp) {
            String rawRpId = getFirstNonEmptyText(payload, "remediationPlanId", "remediation_plan_id", "rpNumber", "rp_number", "remediationPlanNumber");
            try {
                remediationPlanId = validateRemediationPlanId(rawRpId);
            } catch (IllegalArgumentException ex) {
                return ResponseEntity.badRequest().body(Map.of("status", "error", "message", ex.getMessage()));
            }

            String rawDate = getFirstNonEmptyText(payload, "estimatedCompletionDate", "estimated_completion_date", "rpEstimatedCompletionDate", "completionDate");
            try {
                estimatedCompletionDate = parseAndValidateEstimatedCompletionDate(rawDate);
            } catch (IllegalArgumentException ex) {
                return ResponseEntity.badRequest().body(Map.of("status", "error", "message", ex.getMessage()));
            }

            if (payload.hasNonNull("rpWithinGracePeriod")) {
                JsonNode node = payload.get("rpWithinGracePeriod");
                if (node.isBoolean()) rpWithinGracePeriod = node.asBoolean();
                else rpWithinGracePeriod = !"false".equalsIgnoreCase(node.asText()) && !"no".equalsIgnoreCase(node.asText());
            } else if (payload.hasNonNull("rp_within_grace_period")) {
                JsonNode node = payload.get("rp_within_grace_period");
                if (node.isBoolean()) rpWithinGracePeriod = node.asBoolean();
                else rpWithinGracePeriod = !"false".equalsIgnoreCase(node.asText()) && !"no".equalsIgnoreCase(node.asText());
            } else if (payload.hasNonNull("withinGracePeriod")) {
                JsonNode node = payload.get("withinGracePeriod");
                if (node.isBoolean()) rpWithinGracePeriod = node.asBoolean();
                else rpWithinGracePeriod = !"false".equalsIgnoreCase(node.asText()) && !"no".equalsIgnoreCase(node.asText());
            } else if (payload.hasNonNull("rpDoesMeet")) {
                JsonNode node = payload.get("rpDoesMeet");
                rpWithinGracePeriod = "yes".equalsIgnoreCase(node.asText()) || "true".equalsIgnoreCase(node.asText());
            }
        }

        // 1. Query SCTASK & RITM details
        SnowScTaskDTO scTaskDto = snowService.getScTaskDetails(sctaskNumber);
        if (scTaskDto == null) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Catalog task " + sctaskNumber + " not found in ServiceNow"));
        }
        String ritmNumber = scTaskDto.getRequestItemNumber();
        SnowRitmDTO ritmDto = (ritmNumber != null) ? snowService.getRitmDetails(ritmNumber) : null;
        String requestReason = (ritmDto != null) ? ritmDto.getRequestReason() : null;

        // 2. Validate Request Reason == Sign Off (Throw error if not Sign Off)
        if (!ticketScheduler.isSignoffRequestReason(requestReason)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error",
                    "message", "Cannot process Sign-Off: Request Reason for RITM " + (ritmNumber != null ? ritmNumber : "") + " is '" + (requestReason != null ? requestReason : "UNKNOWN") + "', but this API only processes Sign-Off requests."
            ));
        }

        // 3. Validate Application Profile Name (Compare API applicationName with RITM Application Profile Name case-insensitively)
        String ritmAppProfileName = (ritmDto != null) ? ritmDto.getApplicationProfileName() : null;
        if (ritmAppProfileName != null && !ritmAppProfileName.trim().isEmpty() && applicationName != null && !applicationName.trim().isEmpty()) {
            String ritmClean = ritmAppProfileName.trim();
            String apiClean = applicationName.trim();
            boolean matches = ritmClean.equalsIgnoreCase(apiClean);
            if (!matches && ticketScheduler != null) {
                String cRitm = ticketScheduler.cleanVeracodeProfileName(ritmClean);
                String cApi = ticketScheduler.cleanVeracodeProfileName(apiClean);
                if (cRitm != null && cApi != null && cRitm.equalsIgnoreCase(cApi)) {
                    matches = true;
                }
            }
            if (!matches) {
                return ResponseEntity.badRequest().body(Map.of(
                        "status", "error",
                        "message", "Application Profile Name mismatch: RITM application profile name: '" + ritmAppProfileName + "' and Veracode scan profile name: '" + applicationName + "' doesn't match"
                ));
            }
        }

        // Extract ignoreStatusCheck flag (defaults to true for manual UI API calls)
        boolean ignoreStatusCheck = true;
        if (payload.hasNonNull("ignoreStatusCheck")) {
            ignoreStatusCheck = payload.get("ignoreStatusCheck").asBoolean(true);
        } else if (payload.hasNonNull("ignore_status_check")) {
            ignoreStatusCheck = payload.get("ignore_status_check").asBoolean(true);
        } else if (payload.hasNonNull("overrideStatusCheck")) {
            ignoreStatusCheck = payload.get("overrideStatusCheck").asBoolean(true);
        } else if (payload.hasNonNull("override_status_check")) {
            ignoreStatusCheck = payload.get("override_status_check").asBoolean(true);
        }

        // 3. Process according to tool & signoffType
        boolean isVeracode = tool.toLowerCase().contains("veracode");
        VeracodeReportDTO report = null;

        if (isVeracode) {
            String cleanProfile = ticketScheduler.cleanVeracodeProfileName(applicationName);
            report = veracodeService.getFinalReport(cleanProfile, null, null, true, true);

            if (isRp) {
                // Force fresh fetch for RP / with_plan
                report = veracodeService.getFinalReport(cleanProfile, null, null, true, true);
            } else {
                boolean isBlockedByStatus = !ignoreStatusCheck && (report != null && "Pending".equalsIgnoreCase(report.status));
                if (hasMediumOrAboveVulnerabilities(report) || isBlockedByStatus) {
                    // Pull a fresh report to verify
                    report = veracodeService.getFinalReport(cleanProfile, null, null, true, true);
                    isBlockedByStatus = !ignoreStatusCheck && (report != null && "Pending".equalsIgnoreCase(report.status));
                    if (hasMediumOrAboveVulnerabilities(report) || isBlockedByStatus) {
                        int sastVulns = (report != null && report.sastSummary != null) ? report.sastSummary.vulnerabilities : 0;
                        int scaVulns = (report != null && report.scaSummary != null) ? report.scaSummary.vulnerabilities : 0;

                        Map<String, Object> errResp = new LinkedHashMap<>();
                        errResp.put("status", "error");
                        errResp.put("message", "Scan is not clear for Veracode profile '" + cleanProfile + "'. Open Medium or higher severity vulnerabilities remain.");
                        errResp.put("sastVulnerabilities", sastVulns);
                        errResp.put("scaVulnerabilities", scaVulns);
                        errResp.put("assessmentFindings", (report != null && report.assessmentFindings != null) ? report.assessmentFindings : "Open Medium or higher severity vulnerabilities remaining in scan.");
                        return ResponseEntity.badRequest().body(errResp);
                    }
                }
            }

            if (report == null) {
                return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Failed to retrieve Veracode report for profile: " + cleanProfile));
            }

            // Execute Veracode Sign-Off Block
            String formattedAppVersion = ticketScheduler.sanitizeApplicationVersion(ritmDto != null ? ritmDto.getApplicationVersion() : null);
            String rawSubmittedDate = (report.overview != null && report.overview.submittedDate != null) ? report.overview.submittedDate : LocalDate.now().toString();
            String submittedDate = ticketScheduler.extractDateOnly(rawSubmittedDate);
            String newScanName = submittedDate + " " + formattedAppVersion + " APR " + (ritmNumber != null ? ritmNumber : "");

            if (report.overview != null && report.overview.buildId != null) {
                try {
                    veracodeService.updateScanName(cleanProfile, report.overview.buildId, newScanName);
                } catch (Exception ex) {
                    // Log warning
                }
            }

            String attachmentUrl = "";
            String pdfFileName = ticketScheduler.buildPdfFilename(cleanProfile);
            try {
                byte[] pdfBytes = veracodeService.downloadCustomPdfReport(cleanProfile);
                if (pdfBytes != null && pdfBytes.length > 0) {
                    JsonNode uploadResp = snowService.uploadPdfAttachment(pdfBytes, pdfFileName, ritmNumber);
                    if (uploadResp != null && uploadResp.has("result") && uploadResp.get("result").isObject()) {
                        JsonNode resObj = uploadResp.get("result");
                        attachmentUrl = resObj.hasNonNull("attachment_link") ? resObj.get("attachment_link").asText()
                                : (resObj.hasNonNull("attachment_url") ? resObj.get("attachment_url").asText() : "");
                    }
                }
            } catch (Exception e) {
                // Log warning
            }

            // Update RITM Variables
            ObjectNode ritmVarsNode = objectMapper.createObjectNode();
            if (report.assessmentFindings != null) ritmVarsNode.put("assessment_findings", report.assessmentFindings);
            ritmVarsNode.put("date_of_assessed_scan", submittedDate);
            ritmVarsNode.put("application_version", formattedAppVersion);
            ritmVarsNode.put("scan_name", newScanName);
            if (report.scanToolProfileUrl != null) {
                ritmVarsNode.put("scan_tool_profile_url", report.scanToolProfileUrl);
                ritmVarsNode.put("application_profile_url", report.scanToolProfileUrl);
            }
            if (report.scanUrl != null) ritmVarsNode.put("scan_url", report.scanUrl);
            ritmVarsNode.put("sign_off_reason", isRp ? "with_plan" : "no_flaw");
            ritmVarsNode.put("mitigation_proposals_reviewed", mitigationProposalsReviewed);

            String policyName = (report.overview != null && report.overview.policyName != null) ? report.overview.policyName : "";
            ritmVarsNode.put("data_classification", ticketScheduler.parseDataClassification(policyName));
            ritmVarsNode.put("exposure", ticketScheduler.parseExposure(policyName));

            snowService.updateRitmVariables(ritmNumber, ritmVarsNode, report);

            // Close SCTASK
            String additionMessage;
            if (isRp) {
                String accountId = (report.overview != null && report.overview.accountId != null) ? report.overview.accountId : "";
                String appId = (report.overview != null && report.overview.appId != null) ? report.overview.appId : "";
                String buildId = (report.overview != null && report.overview.buildId != null) ? report.overview.buildId : "";
                String analysisId = (report.overview != null && report.overview.analysisId != null) ? report.overview.analysisId : "";
                String staticAnalysisUnitId = (report.overview != null && report.overview.staticAnalysisUnitId != null) ? report.overview.staticAnalysisUnitId : "";
                String sandboxId = (report.overview != null && report.overview.sandboxId != null) ? report.overview.sandboxId : "";
                String gracePeriodStr = (report.overview != null && report.overview.gracePeriod != null) ? report.overview.gracePeriod : "";

                additionMessage = ticketScheduler.buildVeracodeRpSignOffAdditionMessage(
                        report.scanUrl, newScanName, report.scanToolProfileUrl, cleanProfile,
                        attachmentUrl, pdfFileName, remediationPlanId, estimatedCompletionDate,
                        rpWithinGracePeriod, gracePeriodStr, accountId, appId, buildId,
                        analysisId, staticAnalysisUnitId, sandboxId);

                if (additionMessage != null && report.reviewCommentsHtml != null && !report.reviewCommentsHtml.trim().isEmpty()) {
                    String cleanComments = report.reviewCommentsHtml.trim();
                    if (additionMessage.contains("[/code]")) {
                        additionMessage = additionMessage.replace("[/code]", cleanComments + "\n[/code]");
                    } else {
                        additionMessage = additionMessage + "\n" + cleanComments;
                    }
                }
            } else {
                additionMessage = ticketScheduler.buildSignOffAdditionMessage(
                        report.scanUrl, newScanName, report.scanToolProfileUrl, cleanProfile, attachmentUrl, pdfFileName);
            }

            if (additionMessage == null) {
                additionMessage = "";
            }
            String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

            ObjectNode closePayload = objectMapper.createObjectNode();
            closePayload.put("u_number", sctaskNumber);
            closePayload.put("u_action", "closeSctask");
            closePayload.put("u_additional_comments", additionMessage);
            closePayload.put("u_closure_message", closureMessage);
            closePayload.put("u_state", 3); // CLOSED_COMPLETE
            closePayload.put("u_work_notes", "This request has been processed by Automation API");

            JsonNode closeResp = snowService.updateScTask(closePayload);

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "message", "Veracode " + (isRp ? "Remediation Plan " : "") + "Sign-Off completed successfully.",
                    "sctaskNumber", sctaskNumber,
                    "ritmNumber", (ritmNumber != null ? ritmNumber : ""),
                    "signoffType", (isRp ? "with_plan" : "no_flaw"),
                    "mitigationProposalsReviewed", mitigationProposalsReviewed,
                    "snowResponse", closeResp
            ));

        } else {
            // Checkmarx / Non-Veracode tool
            String[] profileAndBranch = ticketScheduler.parseNonVeracodeProfileAndBranch(applicationName);
            String profileName = profileAndBranch[0];
            String branchName = (profileAndBranch[1] != null && !profileAndBranch[1].trim().isEmpty()) ? profileAndBranch[1].trim() : "";

            if (checkmarxService != null) {
                report = checkmarxService.getReport(profileName, branchName, null, true);
                if (isRp) {
                    report = checkmarxService.getReport(profileName, branchName, null, true);
                } else {
                    if (hasMediumOrAboveVulnerabilities(report)) {
                        report = checkmarxService.getReport(profileName, branchName, null, true);
                        if (hasMediumOrAboveVulnerabilities(report)) {
                            int sastVulns = (report != null && report.sastSummary != null) ? report.sastSummary.vulnerabilities : 0;
                            int scaVulns = (report != null && report.scaSummary != null) ? report.scaSummary.vulnerabilities : 0;

                            Map<String, Object> errResp = new LinkedHashMap<>();
                            errResp.put("status", "error");
                            errResp.put("message", "Scan is not clear for Checkmarx profile '" + profileName + "'. Open Medium or higher severity vulnerabilities remain.");
                            errResp.put("sastVulnerabilities", sastVulns);
                            errResp.put("scaVulnerabilities", scaVulns);
                            errResp.put("assessmentFindings", (report != null && report.assessmentFindings != null) ? report.assessmentFindings : "Open Medium or higher severity vulnerabilities remaining in scan.");
                            return ResponseEntity.badRequest().body(errResp);
                        }
                    }
                }

                // Update RITM Variables & Close SCTASK
                ObjectNode ritmVarsNode = objectMapper.createObjectNode();
                if (report != null && report.assessmentFindings != null) ritmVarsNode.put("assessment_findings", report.assessmentFindings);
                ritmVarsNode.put("sign_off_reason", isRp ? "with_plan" : "no_flaw");
                ritmVarsNode.put("mitigation_proposals_reviewed", mitigationProposalsReviewed);

                snowService.updateRitmVariables(ritmNumber, ritmVarsNode, report);

                String additionMessage;
                if (isRp) {
                    String gracePeriodStr = (report != null && report.overview != null && report.overview.gracePeriod != null) ? report.overview.gracePeriod : "";
                    additionMessage = ticketScheduler.buildCheckmarxRpSignOffAdditionMessage(
                            profileName, branchName, ritmNumber, remediationPlanId, estimatedCompletionDate,
                            rpWithinGracePeriod, gracePeriodStr);

                    if (report != null && report.reviewCommentsHtml != null && !report.reviewCommentsHtml.trim().isEmpty()) {
                        String cleanComments = report.reviewCommentsHtml.trim();
                        additionMessage = additionMessage.replace("[/code]", cleanComments + "\n[/code]");
                    }
                } else {
                    additionMessage = ticketScheduler.buildCheckmarxSignOffAdditionMessage(profileName, branchName, ritmNumber);
                }

                String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

                ObjectNode closePayload = objectMapper.createObjectNode();
                closePayload.put("u_number", sctaskNumber);
                closePayload.put("u_action", "closeSctask");
                closePayload.put("u_additional_comments", additionMessage);
                closePayload.put("u_closure_message", closureMessage);
                closePayload.put("u_state", 3); // CLOSED_COMPLETE
                closePayload.put("u_work_notes", "This Checkmarx request has been processed by Automation API");

                JsonNode closeResp = snowService.updateScTask(closePayload);

                return ResponseEntity.ok(Map.of(
                        "status", "success",
                        "message", "Checkmarx " + (isRp ? "Remediation Plan " : "") + "Sign-Off completed successfully.",
                        "sctaskNumber", sctaskNumber,
                        "ritmNumber", (ritmNumber != null ? ritmNumber : ""),
                        "signoffType", (isRp ? "with_plan" : "no_flaw"),
                        "mitigationProposalsReviewed", mitigationProposalsReviewed,
                        "snowResponse", closeResp
                ));
            }

            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Checkmarx service is not available"));
        }
    }

    /**
     * Endpoint to close Mitigation Approval Review (MAR Closed).
     * Mappings:
     * - POST /api/snow/closeMar
     * - POST /api/snow/close_mar
     * - POST /api/snow/processMar
     * - POST /api/snow/mar/close
     */
    @PostMapping(
            value = {"/closeMar", "/close_mar", "/processMar", "/mar/close"},
            produces = MediaType.APPLICATION_JSON_VALUE,
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> closeMar(@RequestBody JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Request payload must be a JSON object"));
        }

        String sctaskNumber = getFirstNonEmptyText(payload, "sctaskNumber", "sctask", "u_number", "number");
        if (sctaskNumber == null || sctaskNumber.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "sctaskNumber is required"));
        }
        sctaskNumber = sctaskNumber.trim();

        String applicationName = getFirstNonEmptyText(payload, "applicationName", "application_name", "profileName", "appName");
        String tool = getFirstNonEmptyText(payload, "tool", "scaTool", "sca_tool");
        if (tool == null || tool.trim().isEmpty()) {
            tool = "Veracode";
        }

        String mitigationProposalsReviewed = getFirstNonEmptyText(payload, "mitigationProposalsReviewed", "mitigation_proposals_reviewed", "mitigationProposals");
        if (mitigationProposalsReviewed == null || mitigationProposalsReviewed.trim().isEmpty()) {
            mitigationProposalsReviewed = "0";
        }

        String scanUrl = getFirstNonEmptyText(payload, "scanToolProfileUrl", "scan_tool_profile_url", "scanUrl", "scan_url", "profileUrl");
        String reviewCommentsHtml = getFirstNonEmptyText(payload, "reviewCommentsHtml", "reviewCommentHtml", "review_comments_html", "review_comment_html", "u_additional_comments", "additionalComments");

        // 1. Query SCTASK & get RITM details
        SnowScTaskDTO scTaskDto = snowService.getScTaskDetails(sctaskNumber);
        if (scTaskDto == null) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Catalog task " + sctaskNumber + " not found in ServiceNow"));
        }

        String ritmNumber = scTaskDto.getRequestItemNumber();
        SnowRitmDTO ritmDto = (ritmNumber != null) ? snowService.getRitmDetails(ritmNumber) : null;
        String requestReason = (ritmDto != null) ? ritmDto.getRequestReason() : null;

        // 2. Validate Request Reason == Mitigation Approval Review (Throw error if not MAR)
        if (!ticketScheduler.isMarRequestReason(requestReason)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error",
                    "message", "Cannot process MAR Close: Request Reason for RITM " + (ritmNumber != null ? ritmNumber : "") + " is '" + (requestReason != null ? requestReason : "UNKNOWN") + "', but this API only processes Mitigation Approval Review requests."
            ));
        }

        // 3. Validate Application Profile Name if provided
        String ritmAppProfileName = (ritmDto != null) ? ritmDto.getApplicationProfileName() : null;
        if (ritmAppProfileName != null && !ritmAppProfileName.trim().isEmpty() && applicationName != null && !applicationName.trim().isEmpty()) {
            String ritmClean = ritmAppProfileName.trim();
            String apiClean = applicationName.trim();
            boolean matches = ritmClean.equalsIgnoreCase(apiClean);
            if (!matches && ticketScheduler != null) {
                String cRitm = ticketScheduler.cleanVeracodeProfileName(ritmClean);
                String cApi = ticketScheduler.cleanVeracodeProfileName(apiClean);
                if (cRitm != null && cApi != null && cRitm.equalsIgnoreCase(cApi)) {
                    matches = true;
                }
            }
            if (!matches) {
                return ResponseEntity.badRequest().body(Map.of(
                        "status", "error",
                        "message", "Application Profile Name mismatch: RITM application profile name: '" + ritmAppProfileName + "' and Veracode scan profile name: '" + applicationName + "' doesn't match"
                ));
            }
        } else if ((applicationName == null || applicationName.trim().isEmpty()) && ritmAppProfileName != null && !ritmAppProfileName.trim().isEmpty()) {
            applicationName = ritmAppProfileName;
        }

        VeracodeReportDTO report = null;

        // Try pulling report if applicationName is available to complement scanUrl / reviewCommentsHtml
        if (applicationName != null && !applicationName.trim().isEmpty()) {
            String cleanProfile = ticketScheduler.cleanVeracodeProfileName(applicationName);
            try {
                if (tool.toLowerCase().contains("veracode")) {
                    report = veracodeService.getFinalReport(cleanProfile, null, null, true, true);
                } else if (checkmarxService != null) {
                    String[] profileAndBranch = ticketScheduler.parseNonVeracodeProfileAndBranch(applicationName);
                    report = checkmarxService.getReport(profileAndBranch[0], profileAndBranch[1], null, true);
                }
            } catch (Exception ex) {
                // Proceed with provided payload values
            }
        }

        if ((scanUrl == null || scanUrl.isEmpty()) && report != null) {
            scanUrl = (report.scanToolProfileUrl != null && !report.scanToolProfileUrl.isEmpty()) ? report.scanToolProfileUrl : report.scanUrl;
        }

        if ((reviewCommentsHtml == null || reviewCommentsHtml.isEmpty()) && report != null && report.reviewCommentsHtml != null) {
            reviewCommentsHtml = report.reviewCommentsHtml;
        }

        // 2. UPDATE RITM Variables
        ObjectNode ritmVarsNode = objectMapper.createObjectNode();
        ritmVarsNode.put("scan_tool_profile_url", (scanUrl != null ? scanUrl : ""));
        ritmVarsNode.put("application_profile_url", (scanUrl != null ? scanUrl : ""));
        ritmVarsNode.put("mitigation_proposals_reviewed", mitigationProposalsReviewed);

        snowService.updateRitmVariables(ritmNumber, ritmVarsNode, report);

        // 3. UPDATE SCTASK
        String additionMessage;
        if (reviewCommentsHtml != null && !reviewCommentsHtml.trim().isEmpty()) {
            String cleanComments = reviewCommentsHtml.trim();
            if (cleanComments.startsWith("[code]") && cleanComments.endsWith("[/code]")) {
                additionMessage = cleanComments;
            } else {
                additionMessage = "[code]\n" + cleanComments + "\n[/code]";
            }
        } else {
            additionMessage = "[code]\n<p>The Mitigation Approval Review (MAR) has been completed and closed by automation.</p>\n[/code]";
        }

        String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

        ObjectNode closePayload = objectMapper.createObjectNode();
        closePayload.put("u_number", sctaskNumber);
        closePayload.put("u_action", "closeSctask");
        closePayload.put("u_additional_comments", additionMessage);
        closePayload.put("u_closure_message", closureMessage);
        closePayload.put("u_state", 3); // CLOSED_COMPLETE
        closePayload.put("u_work_notes", "MAR Review closed by Automation API");

        JsonNode closeResp = snowService.updateScTask(closePayload);

        Map<String, Object> respMap = new LinkedHashMap<>();
        respMap.put("status", "success");
        respMap.put("message", "Mitigation Approval Review (MAR) closed successfully.");
        respMap.put("sctaskNumber", sctaskNumber);
        respMap.put("ritmNumber", (ritmNumber != null ? ritmNumber : ""));
        respMap.put("mitigationProposalsReviewed", mitigationProposalsReviewed);
        respMap.put("scanToolProfileUrl", (scanUrl != null ? scanUrl : ""));
        respMap.put("snowResponse", closeResp);

        return ResponseEntity.ok(respMap);
    }

    /**
     * Dedicated API endpoint to close a catalog task with state CLOSED_INCOMPLETE (4) or CLOSED_SKIPPED (7).
     *
     * Endpoints:
     * - POST /api/snow/closeTicket
     * - POST /api/snow/close_ticket
     * - POST /api/snow/ticket/close
     *
     * Requirements:
     * 1. Body MUST contain "u_number" (sctaskNumber).
     * 2. Body MUST contain "u_state" which must be either CLOSED_INCOMPLETE (4) or CLOSED_SKIPPED (7).
     * 3. Body MUST contain "u_additional_comments".
     * 4. "u_work_notes" is optional.
     * 5. Checks if task status is already CLOSED_COMPLETE (3), CLOSED_INCOMPLETE (4), or CLOSED_SKIPPED (7) -> throws error.
     * 6. Pulls RITM number and verifies that "Request Reason" is either "Sign Off" or "Mitigation Approval Review".
     * 7. Builds u_closure_message by stripping [code] and [/code] tags.
     */
    @PostMapping(
            value = {"/closeTicket", "/close_ticket", "/ticket/close"},
            produces = MediaType.APPLICATION_JSON_VALUE,
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> closeTicket(@RequestBody JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Request payload must be a JSON object"));
        }

        // 1. Mandatory parameter: u_number (sctaskNumber)
        String sctaskNumber = getFirstNonEmptyText(payload, "u_number", "sctaskNumber", "sctask", "number", "task_number");
        if (sctaskNumber == null || sctaskNumber.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "u_number (sctaskNumber) is required"));
        }
        sctaskNumber = sctaskNumber.trim();

        // 2. Mandatory parameter: u_state (must be CLOSED_INCOMPLETE '4' or CLOSED_SKIPPED '7')
        String rawState = getFirstNonEmptyText(payload, "u_state", "state", "uState");
        Integer targetState = null;
        if (rawState != null && !rawState.trim().isEmpty()) {
            String cleanState = rawState.trim().toLowerCase().replace("-", "_").replace(" ", "");
            if ("4".equals(cleanState) || "closed_incomplete".equals(cleanState) || "closedincomplete".equals(cleanState)) {
                targetState = 4; // CLOSED_INCOMPLETE
            } else if ("7".equals(cleanState) || "closed_skipped".equals(cleanState) || "closedskipped".equals(cleanState)) {
                targetState = 7; // CLOSED_SKIPPED
            }
        }

        if (targetState == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error",
                    "message", "u_state is required and must be either CLOSED_INCOMPLETE ('4') or CLOSED_SKIPPED ('7')"
            ));
        }

        // 3. Mandatory parameter: u_additional_comments
        String additionalComments = getFirstNonEmptyText(payload, "u_additional_comments", "additionalComments", "additional_comments", "uAdditionalComments");
        if (additionalComments == null || additionalComments.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "u_additional_comments is required"));
        }
        additionalComments = additionalComments.trim();

        // 4. Optional parameter: u_work_notes
        String workNotes = getFirstNonEmptyText(payload, "u_work_notes", "workNotes", "work_notes", "uWorkNotes");
        if (workNotes == null || workNotes.trim().isEmpty()) {
            workNotes = "Ticket closed by Automation API";
        } else {
            workNotes = workNotes.trim();
        }

        // 5. Query SCTASK details in ServiceNow
        SnowScTaskDTO scTaskDto = snowService.getScTaskDetails(sctaskNumber);
        if (scTaskDto == null) {
            return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Catalog task " + sctaskNumber + " not found in ServiceNow"));
        }

        // Check if task status is ALREADY CLOSED (3 = CLOSED_COMPLETE, 4 = CLOSED_INCOMPLETE, 7 = CLOSED_SKIPPED)
        String currentState = scTaskDto.getState();
        if (ticketScheduler.isClosedState(currentState)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error",
                    "message", "Cannot close ticket: Catalog task " + sctaskNumber + " is already closed with state '" + (currentState != null ? currentState : "UNKNOWN") + "'."
            ));
        }

        // 6. Pull RITM number & validate Request Reason (Sign Off OR Mitigation Approval Review)
        String ritmNumber = scTaskDto.getRequestItemNumber();
        SnowRitmDTO ritmDto = (ritmNumber != null) ? snowService.getRitmDetails(ritmNumber) : null;
        String requestReason = (ritmDto != null) ? ritmDto.getRequestReason() : null;

        boolean isSignoff = ticketScheduler.isSignoffRequestReason(requestReason);
        boolean isMar = ticketScheduler.isMarRequestReason(requestReason);

        if (!isSignoff && !isMar) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error",
                    "message", "Cannot close ticket: Request Reason for RITM " + (ritmNumber != null ? ritmNumber : "") + " is '" + (requestReason != null ? requestReason : "UNKNOWN") + "', but this API only processes Sign Off or Mitigation Approval Review requests."
            ));
        }

        // 7. Format u_additional_comments & build u_closure_message (strip [code] and [/code])
        String additionMessage;
        if (additionalComments.startsWith("[code]") && additionalComments.endsWith("[/code]")) {
            additionMessage = additionalComments;
        } else {
            additionMessage = "[code]\n" + additionalComments + "\n[/code]";
        }

        String closureMessage = additionMessage.replace("[code]", "").replace("[/code]", "").trim();

        // 8. Post update to ServiceNow
        ObjectNode closePayload = objectMapper.createObjectNode();
        closePayload.put("u_number", sctaskNumber);
        closePayload.put("u_action", "closeSctask");
        closePayload.put("u_additional_comments", additionMessage);
        closePayload.put("u_closure_message", closureMessage);
        closePayload.put("u_state", targetState);
        closePayload.put("u_work_notes", workNotes);

        JsonNode closeResp = snowService.updateScTask(closePayload);

        Map<String, Object> respMap = new LinkedHashMap<>();
        respMap.put("status", "success");
        respMap.put("message", "Catalog task " + sctaskNumber + " closed successfully.");
        respMap.put("sctaskNumber", sctaskNumber);
        respMap.put("ritmNumber", (ritmNumber != null ? ritmNumber : ""));
        respMap.put("u_state", targetState);
        respMap.put("requestReason", (requestReason != null ? requestReason : ""));
        respMap.put("snowResponse", closeResp);

        return ResponseEntity.ok(respMap);
    }

    /**
     * Get ServiceNow Auto Scheduler configuration and status.
     * GET /api/snow/scheduler/status
     */
    @GetMapping(value = "/scheduler/status", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> getSchedulerStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("schedulerEnabled", veracodeConfig.isSnowSchedulerEnabled());
        status.put("delayMs", veracodeConfig.getSnowSchedulerDelayMs());
        status.put("readFromLocalFile", veracodeConfig.isSnowSchedulerReadFromLocalFile());
        status.put("localFilePath", veracodeConfig.getSnowSchedulerLocalFilePath());
        status.put("maxMemoryEntries", veracodeConfig.getSnowSchedulerMaxMemoryEntries());
        status.put("postSchedulerToSnow", veracodeConfig.isPostSchedulerToSnow());
        status.put("autoSignoffEnabled", veracodeConfig.isAutoSignoffEnabled());
        return ResponseEntity.ok(status);
    }

    /**
     * Dynamically enable or disable ServiceNow Auto Scheduler live at runtime without restarting the server.
     * Endpoints:
     * - POST /api/snow/scheduler/toggle?enabled=false
     * - POST /api/snow/scheduler/enable
     * - POST /api/snow/scheduler/disable
     */
    @PostMapping(
            value = {"/scheduler/toggle", "/scheduler/enable", "/scheduler/disable"},
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Map<String, Object>> toggleScheduler(
            @RequestParam(value = "enabled", required = false) Boolean enabled,
            jakarta.servlet.http.HttpServletRequest request) {

        boolean newStatus;
        String path = request.getRequestURI();
        if (path.endsWith("/enable")) {
            newStatus = true;
        } else if (path.endsWith("/disable")) {
            newStatus = false;
        } else if (enabled != null) {
            newStatus = enabled;
        } else {
            newStatus = !veracodeConfig.isSnowSchedulerEnabled();
        }

        veracodeConfig.setSnowSchedulerEnabled(newStatus);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("status", "success");
        resp.put("schedulerEnabled", veracodeConfig.isSnowSchedulerEnabled());
        resp.put("message", "ServiceNow Auto Scheduler is now " + (newStatus ? "ENABLED" : "DISABLED") + " (live runtime update).");
        return ResponseEntity.ok(resp);
    }

    /**
     * Evaluates whether a report contains open vulnerabilities of Medium or higher severity
     * (CRITICAL, VERY HIGH, VERYHIGH, HIGH, MEDIUM). Low, Very Low, and Informational
     * severities do not block standard no-flaw sign-off.
     */
    public boolean hasMediumOrAboveVulnerabilities(VeracodeReportDTO report) {
        if (report == null) {
            return false;
        }

        List<String> mediumOrAboveSevs = List.of("CRITICAL", "VERY HIGH", "VERYHIGH", "HIGH", "MEDIUM");

        // Check SAST summary breakdown
        if (report.sastSummary != null && report.sastSummary.breakdown != null) {
            for (Map.Entry<String, VeracodeReportDTO.SeverityBreakdownDTO> entry : report.sastSummary.breakdown.entrySet()) {
                String sevKey = entry.getKey() != null ? entry.getKey().trim().toUpperCase() : "";
                if (mediumOrAboveSevs.contains(sevKey)) {
                    VeracodeReportDTO.SeverityBreakdownDTO breakdown = entry.getValue();
                    if (breakdown != null && (breakdown.total > 0 || (breakdown.findings != null && !breakdown.findings.isEmpty()))) {
                        return true;
                    }
                }
            }
        }

        // Check SCA summary breakdown
        if (report.scaSummary != null && report.scaSummary.breakdown != null) {
            for (Map.Entry<String, VeracodeReportDTO.SeverityBreakdownDTO> entry : report.scaSummary.breakdown.entrySet()) {
                String sevKey = entry.getKey() != null ? entry.getKey().trim().toUpperCase() : "";
                if (mediumOrAboveSevs.contains(sevKey)) {
                    VeracodeReportDTO.SeverityBreakdownDTO breakdown = entry.getValue();
                    if (breakdown != null && breakdown.total > 0) {
                        return true;
                    }
                }
            }
        }

        // Fallback: If breakdown maps are empty/null, check if total vulnerabilities exist and status is not "Sign-Off"
        if ((report.sastSummary == null || report.sastSummary.breakdown == null || report.sastSummary.breakdown.isEmpty())
         && (report.scaSummary == null || report.scaSummary.breakdown == null || report.scaSummary.breakdown.isEmpty())) {
            int sastTotal = (report.sastSummary != null) ? report.sastSummary.vulnerabilities : 0;
            int scaTotal = (report.scaSummary != null) ? report.scaSummary.vulnerabilities : 0;
            if ((sastTotal > 0 || scaTotal > 0) && !"Sign-Off".equalsIgnoreCase(report.status)) {
                return true;
            }
        }

        return false;
    }

    private String validateRemediationPlanId(String rpId) {
        if (rpId == null || rpId.trim().isEmpty()) {
            throw new IllegalArgumentException("REMEDIATION PLAN ID: Remediation plan ID is required for RP sign-off.");
        }
        String clean = rpId.trim();
        String upper = clean.toUpperCase();
        if (!upper.startsWith("RITM") && !upper.startsWith("IPT") && !upper.startsWith("PER")) {
            throw new IllegalArgumentException("REMEDIATION PLAN ID: Should start either with RITM, IPT or PER. Other formats are not allowed.");
        }
        return clean;
    }

    private String parseAndValidateEstimatedCompletionDate(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            throw new IllegalArgumentException("ESTIMATED COMPLETION DATE: Date is required for RP sign-off.");
        }
        String clean = dateStr.trim();
        LocalDate parsed = null;

        if (clean.matches("\\d{1,2}/\\d{1,2}/\\d{4}")) {
            String[] parts = clean.split("/");
            int month = Integer.parseInt(parts[0]);
            int day = Integer.parseInt(parts[1]);
            int year = Integer.parseInt(parts[2]);
            try {
                parsed = LocalDate.of(year, month, day);
            } catch (Exception e) {
                throw new IllegalArgumentException("ESTIMATED COMPLETION DATE: Date format must be a valid calendar date MM/DD/YYYY.");
            }
        } else if (clean.matches("\\d{4}-\\d{2}-\\d{2}")) {
            try {
                parsed = LocalDate.parse(clean);
            } catch (Exception e) {
                throw new IllegalArgumentException("ESTIMATED COMPLETION DATE: Invalid date format YYYY-MM-DD.");
            }
        } else {
            throw new IllegalArgumentException("ESTIMATED COMPLETION DATE: Invalid format. Please use MM/DD/YYYY or YYYY-MM-DD format.");
        }

        LocalDate today = LocalDate.now();
        if (parsed.isBefore(today)) {
            throw new IllegalArgumentException("ESTIMATED COMPLETION DATE: Date should not be from the past.");
        }

        return clean;
    }

    private boolean isRpSignoff(String signoffType) {
        if (signoffType == null || signoffType.trim().isEmpty()) return false;
        String clean = signoffType.trim().toLowerCase().replace("-", "_");
        return "with_plan".equals(clean) || "rp".equals(clean);
    }

    private String getFirstNonEmptyText(JsonNode node, String... keys) {
        if (node == null || !node.isObject()) return null;
        for (String k : keys) {
            if (node.hasNonNull(k)) {
                String val = node.get(k).asText("").trim();
                if (!val.isEmpty()) {
                    return val;
                }
            }
        }
        return null;
    }
}
