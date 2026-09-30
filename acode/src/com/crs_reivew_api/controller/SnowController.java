package com.crs_reivew_api.controller;

import com.crs_reivew_api.dto.SnowRitmDTO;
import com.crs_reivew_api.dto.SnowScTaskDTO;
import com.crs_reivew_api.service.SnowService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/snow")
public class SnowController {

    private final SnowService snowService;

    public SnowController(SnowService snowService) {
        this.snowService = snowService;
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
}
