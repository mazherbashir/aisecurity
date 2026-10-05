package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.SnowRitmDTO;
import com.crs_reivew_api.dto.SnowScTaskDTO;
import com.crs_reivew_api.dto.SnowScTaskUpdateRequestDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * <h1>ServiceNow Integration Service</h1>
 * <p>
 * This service provides a complete client interface for communicating with ServiceNow REST APIs.
 * Key capabilities include:
 * </p>
 * <ul>
 *   <li><b>Table Queries</b>: Fetching RITM ({@code sc_req_item}) and SCTASK ({@code sc_task}) records.</li>
 *   <li><b>Variable Parsing & Enrichment</b>: Extracting multiline {@code u_variables_string} key-value pairs
 *       and promoting core fields (Application Profile Name, SCA Tool, Application Version, Request Reason, etc.)
 *       directly to top-level attributes.</li>
 *   <li><b>Catalog Task Updates</b>: Posting updates to the catalog task import table ({@code /now/import/u_generic_catalog_task_update}).</li>
 *   <li><b>RITM Variable Updates</b>: Patching RITM variables via ({@code /api/ipwc/request_item/update/$RITM/variables/nv}).</li>
 *   <li><b>PDF Attachment Uploads</b>: Uploading binary PDF reports directly to RITM records via ({@code /api/now/attachment/file}).</li>
 * </ul>
 *
 * @see com.crs_reivew_api.controller.SnowController
 * @see com.crs_reivew_api.scheduler.TicketScheduler
 */
@Service
public class SnowService {

    private static final Logger logger = LoggerFactory.getLogger(SnowService.class);

    private final VeracodeConfig veracodeConfig;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;

    public SnowService(VeracodeConfig veracodeConfig) {
        this.veracodeConfig = veracodeConfig;
        this.httpClient = createSecureHttpClient();
    }

    private HttpClient createSecureHttpClient() {
        try {
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, new TrustManager[]{
                new X509TrustManager() {
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                    public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                    public void checkServerTrusted(X509Certificate[] certs, String authType) {}
                }
            }, new SecureRandom());

            return HttpClient.newBuilder()
                    .sslContext(sslContext)
                    .proxy(java.net.ProxySelector.getDefault())
                    .connectTimeout(Duration.ofSeconds(15))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
        } catch (Exception e) {
            logger.warn("Failed to initialize custom SSLContext for SnowService, falling back to default HttpClient: {}", e.getMessage());
            return HttpClient.newBuilder()
                    .proxy(java.net.ProxySelector.getDefault())
                    .connectTimeout(Duration.ofSeconds(15))
                    .build();
        }
    }

    /**
     * Resolves the ServiceNow Authorization header ("Basic <ApiKey>").
     */
    public String getAuthHeader() {
        String apiKey = veracodeConfig.getSnowApiKey();
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalStateException("ServiceNow API Key (crs.api.snowkey) is not configured in ~/.crs-tool/credentials or application.properties");
        }
        apiKey = apiKey.trim();
        if (apiKey.startsWith("Basic ") || apiKey.startsWith("Bearer ")) {
            return apiKey;
        }
        return "Basic " + apiKey;
    }

    /**
     * Generic, modular method to execute an HTTP GET request against a ServiceNow API URL/endpoint.
     *
     * @param targetUrl Full target URL or relative path under snowBaseUrl
     * @return JsonNode parsed JSON response from ServiceNow
     */
    public JsonNode callSnowApi(String targetUrl) {
        String baseUrl = veracodeConfig.getSnowBaseUrl();
        String fullUrl;

        if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
            fullUrl = targetUrl;
        } else {
            fullUrl = combineBaseAndPath(baseUrl, targetUrl);
        }

        logger.info("Calling ServiceNow API: {}", fullUrl);

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(fullUrl))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("username", veracodeConfig.getSnowUsername())
                    .header("Authorization", getAuthHeader())
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int statusCode = response.statusCode();
            logger.info("ServiceNow API response status: {}", statusCode);

            if (statusCode < 200 || statusCode >= 300) {
                logger.error("ServiceNow API Error ({}) for URL {}: {}", statusCode, fullUrl, response.body());
                throw new RuntimeException("ServiceNow API returned HTTP " + statusCode + ": " + response.body());
            }

            JsonNode root = objectMapper.readTree(response.body());
            return processAndEnrichResponse(root);

        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            logger.error("Failed to execute ServiceNow API call for {}: {}", fullUrl, e.getMessage(), e);
            throw new RuntimeException("ServiceNow API request failed: " + e.getMessage(), e);
        }
    }

    /**
     * Enriches ServiceNow response items by parsing u_variables_string and promoting key fields to top-level attributes.
     */
    public JsonNode processAndEnrichResponse(JsonNode root) {
        if (root == null || !root.has("result") || !root.get("result").isArray()) {
            return root;
        }

        for (JsonNode item : root.get("result")) {
            if (item.isObject()) {
                ObjectNode objNode = (ObjectNode) item;
                if (item.has("request_item.number")) {
                    String ritmNum = getNodeText(item, "request_item.number");
                    if (ritmNum != null) {
                        promoteTopLevelField(objNode, "requestItemNumber", "ritmNumber", ritmNum);
                        promoteTopLevelField(objNode, "request_item_number", "request_item_number", ritmNum);
                    }
                }
                if (item.has("u_variables_string")) {
                    String varStr = item.get("u_variables_string").asText("");
                    Map<String, String> parsedVars = parseVariablesString(varStr);
                    objNode.set("parsed_variables", objectMapper.valueToTree(parsedVars));

                    // Promote key extracted fields directly to top-level object (both camelCase and snake_case)
                    promoteTopLevelField(objNode, "applicationProfileName", "application_profile_name", getVar(parsedVars, "Application Profile Name"));
                    promoteTopLevelField(objNode, "scaTool", "sca_tool", getVar(parsedVars, "Scan Code Analysis (SCA) Tool", "SCA Tool"));
                    promoteTopLevelField(objNode, "applicationTechnology", "application_technology", getVar(parsedVars, "Application/technology to be reviewed"));
                    promoteTopLevelField(objNode, "applicationVersion", "application_version", getVar(parsedVars, "Application Version"));
                    promoteTopLevelField(objNode, "requestReason", "request_reason", getVar(parsedVars, "Request Reason"));
                    promoteTopLevelField(objNode, "plannedDeploymentDate", "planned_deployment_date", getVar(parsedVars, "Planned production deployment date"));
                    promoteTopLevelField(objNode, "fundingCode", "funding_code", getVar(parsedVars, "Funding Code"));
                    promoteTopLevelField(objNode, "fundingSource", "funding_source", getVar(parsedVars, "Funding Source"));
                    promoteTopLevelField(objNode, "owningPortfolio", "owning_portfolio", getVar(parsedVars, "Owning Portfolio"));
                    promoteTopLevelField(objNode, "managingTerritory", "managing_territory", getVar(parsedVars, "Managing territory"));
                    promoteTopLevelField(objNode, "lineOfService", "line_of_service", getVar(parsedVars, "Line of Service"));
                    promoteTopLevelField(objNode, "applicationProfileUrl", "application_profile_url", getVar(parsedVars, "Application Profile URL"));
                    promoteTopLevelField(objNode, "applicationSteward", "application_steward", getVar(parsedVars, "Application Steward / Primary Contact"));
                }
            }
        }

        return root;
    }

    private String getVar(Map<String, String> map, String... keys) {
        if (map == null) return null;
        for (String k : keys) {
            if (map.containsKey(k) && map.get(k) != null && !map.get(k).trim().isEmpty()) {
                return map.get(k).trim();
            }
        }
        return null;
    }

    private void promoteTopLevelField(ObjectNode node, String camelCaseKey, String snakeCaseKey, String value) {
        if (value != null) {
            node.put(camelCaseKey, value);
            node.put(snakeCaseKey, value);
        }
    }

    /**
     * Robustly parses multiline u_variables_string key-value pairs ("Key = Value") into a Map.
     */
    public Map<String, String> parseVariablesString(String varStr) {
        Map<String, String> map = new LinkedHashMap<>();
        if (varStr == null || varStr.trim().isEmpty()) {
            return map;
        }

        String[] lines = varStr.split("\n");
        String currentKey = null;
        StringBuilder currentValue = new StringBuilder();

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;

            int eqIndex = line.indexOf(" = ");
            if (eqIndex != -1) {
                if (currentKey != null) {
                    map.put(currentKey, currentValue.toString().trim());
                }

                String rawKey = line.substring(0, eqIndex).trim();
                String rawVal = line.substring(eqIndex + 3).trim();

                String cleanKey = stripHtmlTags(rawKey);
                if (cleanKey.isEmpty()) {
                    cleanKey = rawKey;
                }

                currentKey = cleanKey;
                currentValue = new StringBuilder(rawVal);
            } else if (currentKey != null) {
                if (currentValue.length() > 0) {
                    currentValue.append(" ");
                }
                currentValue.append(line);
            }
        }

        if (currentKey != null) {
            map.put(currentKey, currentValue.toString().trim());
        }

        return map;
    }

    private String stripHtmlTags(String input) {
        if (input == null) return "";
        return input.replaceAll("<[^>]*>", "")
                    .replaceAll("&amp;", "&")
                    .replaceAll("&lt;", "<")
                    .replaceAll("&gt;", ">")
                    .replaceAll("&#61;", "=")
                    .trim();
    }

    /**
     * Retrieves a single RITM record by RITM number (e.g. RITM0012345).
     *
     * @param ritmNumber The RITM number to query
     * @return JsonNode containing RITM record details with enriched top-level fields
     */
    public JsonNode getRitmByNumber(String ritmNumber) {
        if (ritmNumber == null || ritmNumber.trim().isEmpty()) {
            throw new IllegalArgumentException("RITM number cannot be null or empty");
        }

        String ritmEndpoint = veracodeConfig.getSnowRitmEndpoint();
        String query = "number=" + ritmNumber.trim();
        String fullUrl = buildTableUrl(ritmEndpoint, query, 1, true);

        return callSnowApi(fullUrl);
    }

    /**
     * Returns a strongly-typed SnowRitmDTO for a single RITM number.
     */
    public SnowRitmDTO getRitmDetails(String ritmNumber) {
        JsonNode root = getRitmByNumber(ritmNumber);
        if (root != null && root.has("result") && root.get("result").isArray() && root.get("result").size() > 0) {
            return extractRitmDto(root.get("result").get(0));
        }
        return null;
    }

    /**
     * Extracts a strongly-typed SnowRitmDTO from a single ServiceNow JSON item node.
     */
    public SnowRitmDTO extractRitmDto(JsonNode itemNode) {
        if (itemNode == null || itemNode.isMissingNode()) {
            return null;
        }

        SnowRitmDTO dto = new SnowRitmDTO();
        dto.ritmNumber = getNodeText(itemNode, "number");
        dto.sysId = getNodeText(itemNode, "sys_id");
        dto.state = getNodeText(itemNode, "state");
        dto.stage = getNodeText(itemNode, "stage");
        dto.priority = getNodeText(itemNode, "priority");
        dto.shortDescription = getNodeText(itemNode, "short_description");
        dto.sysCreatedOn = getNodeText(itemNode, "sys_created_on");
        dto.sysUpdatedOn = getNodeText(itemNode, "sys_updated_on");
        dto.openedAt = getNodeText(itemNode, "opened_at");
        dto.closedAt = getNodeText(itemNode, "closed_at");

        String varStr = getNodeText(itemNode, "u_variables_string");
        Map<String, String> vars = parseVariablesString(varStr);
        dto.variables = vars;

        dto.applicationProfileName = getVar(vars, "Application Profile Name", "applicationProfileName");
        dto.scaTool = getVar(vars, "Scan Code Analysis (SCA) Tool", "SCA Tool", "scaTool");
        dto.applicationTechnology = getVar(vars, "Application/technology to be reviewed", "applicationTechnology");
        dto.applicationVersion = getVar(vars, "Application Version", "applicationVersion");
        dto.requestReason = getVar(vars, "Request Reason", "requestReason");
        dto.plannedDeploymentDate = getVar(vars, "Planned production deployment date", "plannedDeploymentDate");
        dto.fundingCode = getVar(vars, "Funding Code", "fundingCode");
        dto.fundingSource = getVar(vars, "Funding Source", "fundingSource");
        dto.owningPortfolio = getVar(vars, "Owning Portfolio", "owningPortfolio");
        dto.managingTerritory = getVar(vars, "Managing territory", "managingTerritory");
        dto.lineOfService = getVar(vars, "Line of Service", "lineOfService");
        dto.applicationProfileUrl = getVar(vars, "Application Profile URL", "applicationProfileUrl");
        dto.applicationSteward = getVar(vars, "Application Steward / Primary Contact", "applicationSteward");

        return dto;
    }

    private String getNodeText(JsonNode node, String fieldName) {
        if (node == null || !node.hasNonNull(fieldName)) {
            return null;
        }
        JsonNode field = node.get(fieldName);
        if (field.isObject() && field.hasNonNull("display_value")) {
            return field.get("display_value").asText();
        }
        return field.asText(null);
    }

    /**
     * Modular method to query the RITM table (sc_req_item) with custom search parameters.
     *
     * @param sysparmQuery ServiceNow sysparm_query parameter (e.g. "number=RITM001^active=true")
     * @param limit Maximum number of records to return
     * @param displayValue Whether to format display values (default true)
     * @return JsonNode containing matching RITMs
     */
    public JsonNode queryRitms(String sysparmQuery, Integer limit, Boolean displayValue) {
        String ritmEndpoint = veracodeConfig.getSnowRitmEndpoint();
        String fullUrl = buildTableUrl(ritmEndpoint, sysparmQuery, limit != null ? limit : 10, displayValue != null ? displayValue : true);
        return callSnowApi(fullUrl);
    }

    /**
     * Generic, modular method to query any ServiceNow table (e.g., sc_req_item, incident, change_request).
     *
     * @param tableName Table name or path (e.g. "sc_req_item" or "/now/table/incident")
     * @param sysparmQuery ServiceNow query parameter
     * @param limit Max record count
     * @param displayValue Display value boolean flag
     * @return JsonNode parsed table result
     */
    public JsonNode queryTable(String tableName, String sysparmQuery, Integer limit, Boolean displayValue) {
        String path = tableName.startsWith("/") ? tableName : "/now/table/" + tableName;
        String fullUrl = buildTableUrl(path, sysparmQuery, limit != null ? limit : 10, displayValue != null ? displayValue : true);
        return callSnowApi(fullUrl);
    }

    /**
     * Executes the ServiceNow open remediation catalog task query.
     */
    public JsonNode openRemediation(Integer limit, String sysparmQuery, String sysparmFields) {
        return getOpenCatalogTasks(limit, sysparmQuery, sysparmFields);
    }

    /**
     * Retrieves ServiceNow Catalog Tasks (sc_task) for open CRS sign-off / review requests.
     */
    public JsonNode getOpenCatalogTasks(Integer limit, String sysparmQuery, String sysparmFields) {
        int maxLimit = limit != null ? limit : 500;
        String query = (sysparmQuery != null && !sysparmQuery.trim().isEmpty())
                ? sysparmQuery.trim()
                : veracodeConfig.getSnowSctaskDefaultQuery();
        String fields = (sysparmFields != null && !sysparmFields.trim().isEmpty())
                ? sysparmFields.trim()
                : veracodeConfig.getSnowSctaskDefaultFields();

        String endpoint = veracodeConfig.getSnowSctaskEndpoint();
        String fullUrl = buildTableUrlWithFields(endpoint, query, maxLimit, true, fields);
        return callSnowApi(fullUrl);
    }

    /**
     * Retrieves a single Catalog Task record by task number (e.g. SCTASK30824068).
     */
    public JsonNode getScTaskByNumber(String taskNumber) {
        if (taskNumber == null || taskNumber.trim().isEmpty()) {
            throw new IllegalArgumentException("Task number cannot be null or empty");
        }
        String endpoint = veracodeConfig.getSnowSctaskEndpoint();
        String query = "number=" + taskNumber.trim();
        String fields = veracodeConfig.getSnowSctaskDefaultFields();
        String fullUrl = buildTableUrlWithFields(endpoint, query, 1, true, fields);
        return callSnowApi(fullUrl);
    }

    /**
     * Returns a strongly-typed SnowScTaskDTO for a single task number.
     */
    public SnowScTaskDTO getScTaskDetails(String taskNumber) {
        JsonNode root = getScTaskByNumber(taskNumber);
        if (root != null && root.has("result") && root.get("result").isArray() && root.get("result").size() > 0) {
            return extractScTaskDto(root.get("result").get(0));
        }
        return null;
    }

    /**
     * Returns a List of SnowScTaskDTO for open catalog tasks.
     */
    public List<SnowScTaskDTO> getOpenCatalogTaskDetails(Integer limit, String sysparmQuery, String sysparmFields) {
        JsonNode root = getOpenCatalogTasks(limit, sysparmQuery, sysparmFields);
        List<SnowScTaskDTO> list = new ArrayList<>();
        if (root != null && root.has("result") && root.get("result").isArray()) {
            for (JsonNode item : root.get("result")) {
                SnowScTaskDTO dto = extractScTaskDto(item);
                if (dto != null) {
                    list.add(dto);
                }
            }
        }
        return list;
    }

    /**
     * Extracts a strongly-typed SnowScTaskDTO from a single ServiceNow sc_task JSON item node.
     */
    public SnowScTaskDTO extractScTaskDto(JsonNode itemNode) {
        if (itemNode == null || itemNode.isMissingNode()) {
            return null;
        }

        SnowScTaskDTO dto = new SnowScTaskDTO();
        dto.number = getNodeText(itemNode, "number");
        dto.state = getNodeText(itemNode, "state");
        dto.shortDescription = getNodeText(itemNode, "short_description");
        dto.assignedTo = getNodeText(itemNode, "assigned_to");
        dto.sysCreatedOn = getNodeText(itemNode, "sys_created_on");
        dto.sysUpdatedOn = getNodeText(itemNode, "sys_updated_on");
        dto.openedAt = getNodeText(itemNode, "opened_at");
        dto.sysId = getNodeText(itemNode, "sys_id");

        String ritmNum = getNodeText(itemNode, "request_item.number");
        if (ritmNum == null) {
            ritmNum = getNodeText(itemNode, "requestItemNumber");
        }
        if (ritmNum == null) {
            ritmNum = getNodeText(itemNode, "ritmNumber");
        }
        if (ritmNum == null) {
            ritmNum = getNodeText(itemNode, "request_item");
        }
        if (ritmNum == null && itemNode.has("request_item") && itemNode.get("request_item").isObject()) {
            ritmNum = getNodeText(itemNode.get("request_item"), "number");
        }
        if (ritmNum == null) {
            String parentStr = getNodeText(itemNode, "parent");
            if (parentStr != null && parentStr.toUpperCase().startsWith("RITM")) {
                ritmNum = parentStr;
            }
        }
        dto.requestItemNumber = ritmNum;

        return dto;
    }

    private String buildTableUrlWithFields(String path, String sysparmQuery, int limit, boolean displayValue, String sysparmFields) {
        StringBuilder url = new StringBuilder(buildTableUrl(path, sysparmQuery, limit, displayValue));
        if (sysparmFields != null && !sysparmFields.trim().isEmpty()) {
            url.append("&sysparm_fields=").append(URLEncoder.encode(sysparmFields.trim(), StandardCharsets.UTF_8));
        }
        return url.toString();
    }

    private String combineBaseAndPath(String baseUrl, String path) {
        if (baseUrl == null) baseUrl = "";
        if (path == null) path = "";
        String cleanBase = baseUrl.trim();
        String cleanPath = path.trim();

        if (cleanBase.endsWith("/") && cleanPath.startsWith("/")) {
            return cleanBase + cleanPath.substring(1);
        } else if (!cleanBase.endsWith("/") && !cleanPath.startsWith("/")) {
            return cleanBase + "/" + cleanPath;
        } else {
            return cleanBase + cleanPath;
        }
    }

    /**
     * Executes HTTP POST request against ServiceNow API.
     */
    public JsonNode postSnowApi(String targetUrl, JsonNode bodyNode) {
        String baseUrl = veracodeConfig.getSnowBaseUrl();
        String fullUrl;

        if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
            fullUrl = targetUrl;
        } else {
            fullUrl = combineBaseAndPath(baseUrl, targetUrl);
        }

        logger.info("Calling ServiceNow POST API: {}", fullUrl);

        try {
            String jsonBody = objectMapper.writeValueAsString(bodyNode != null ? bodyNode : objectMapper.createObjectNode());
            logger.info("ServiceNow POST Payload: {}", jsonBody);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(fullUrl))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("username", veracodeConfig.getSnowUsername())
                    .header("Authorization", getAuthHeader())
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int statusCode = response.statusCode();
            logger.info("ServiceNow API POST response status: {}", statusCode);

            if (statusCode < 200 || statusCode >= 300) {
                logger.error("ServiceNow API POST Error ({}) for URL {}: {}", statusCode, fullUrl, response.body());
                throw new RuntimeException("ServiceNow API returned HTTP " + statusCode + ": " + response.body());
            }

            return objectMapper.readTree(response.body());

        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            logger.error("Failed to execute ServiceNow API POST call for {}: {}", fullUrl, e.getMessage(), e);
            throw new RuntimeException("ServiceNow API POST request failed: " + e.getMessage(), e);
        }
    }

    /**
     * Dynamically builds the update payload for ServiceNow sc_task import table.
     * Only fields that are non-null and present in the input JSON are included.
     */
    public ObjectNode buildSctaskUpdatePayload(JsonNode input) {
        if (input == null || !input.isObject()) {
            throw new IllegalArgumentException("Payload must be a JSON object");
        }

        ObjectNode outNode = objectMapper.createObjectNode();

        // 1. Task Number (Required)
        String number = getFirstNonEmptyText(input, "u_number", "number", "task_number", "taskNumber", "u_task_number");
        if (number == null) {
            throw new IllegalArgumentException("u_number (or number/task_number) is required for updating catalog task");
        }
        outNode.put("u_number", number);

        // Optional u_action / action field (strips spaces so "set ReviewComments" -> "setReviewComments")
        String rawAction = getFirstNonEmptyText(input, "u_action", "action", "action_name", "u_action_name");
        if (rawAction != null) {
            outNode.put("u_action", rawAction.replaceAll("\\s+", ""));
        }

        // 2. u_state (Resolved to ServiceNow integer state code: 1, 2, 3, 4, -5, 7, 8, 9, 54)
        String rawState = getFirstNonEmptyText(input, "u_state", "state", "status", "u_status");
        if (rawState != null) {
            String resolvedStateCode = com.crs_reivew_api.util.SnowSctaskStatusMap.resolveStatusToStateCode(rawState);
            if (resolvedStateCode != null) {
                try {
                    outNode.put("u_state", Integer.parseInt(resolvedStateCode));
                } catch (NumberFormatException e) {
                    outNode.put("u_state", resolvedStateCode);
                }
            }
        }

        // 3. u_additional_comments
        putIfPresent(input, outNode, "u_additional_comments", "u_additional_comments", "additional_comments", "comments", "additionalComments", "comment", "reviewComments");

        // 4. u_work_notes
        putIfPresent(input, outNode, "u_work_notes", "u_work_notes", "work_notes", "workNotes", "notes");

        // 5. u_assigned_to
        putIfPresent(input, outNode, "u_assigned_to", "u_assigned_to", "assigned_to", "assignedTo", "assignee", "user", "snow_user");

        // 6. u_closure_message
        putIfPresent(input, outNode, "u_closure_message", "u_closure_message", "closure_message", "closureMessage", "close_message");

        // 7. u_end_pending
        putIfPresent(input, outNode, "u_end_pending", "u_end_pending", "end_pending", "endPending", "end_pending_date");

        // 8. u_pending_reason
        putIfPresent(input, outNode, "u_pending_reason", "u_pending_reason", "pending_reason", "pendingReason", "reason");

        return outNode;
    }

    private void putIfPresent(JsonNode input, ObjectNode outNode, String targetKey, String... candidateKeys) {
        for (String key : candidateKeys) {
            if (input.has(key) && !input.get(key).isNull()) {
                JsonNode valNode = input.get(key);
                String valText = valNode.asText();
                if (valText != null) {
                    outNode.put(targetKey, valText);
                    return;
                }
            }
        }
    }

    private String getFirstNonEmptyText(JsonNode input, String... candidateKeys) {
        if (input == null) {
            return null;
        }
        for (String key : candidateKeys) {
            if (input.hasNonNull(key)) {
                String txt = input.get(key).asText("").trim();
                if (!txt.isEmpty()) {
                    return txt;
                }
            }
        }
        return null;
    }

    /**
     * Updates ServiceNow catalog task via POST /now/import/u_generic_catalog_task_update
     */
    public JsonNode update_sctask_vars(JsonNode inputPayload) {
        return updateScTask(inputPayload);
    }

    /**
     * Updates ServiceNow catalog task via POST /now/import/u_generic_catalog_task_update
     */
    public JsonNode updateScTask(JsonNode inputPayload) {
        return updateScTask(inputPayload, null);
    }

    /**
     * Updates ServiceNow catalog task with optional URL query action.
     */
    public JsonNode updateScTask(JsonNode inputPayload, String queryAction) {
        ObjectNode finalBody = buildSctaskUpdatePayload(inputPayload);
        if (queryAction != null && !queryAction.trim().isEmpty() && !finalBody.has("u_action")) {
            finalBody.put("u_action", queryAction.replaceAll("\\s+", ""));
        }
        String endpoint = veracodeConfig.getSnowSctaskUpdateEndpoint();
        return postSnowApi(endpoint, finalBody);
    }

    /**
     * Updates ServiceNow catalog task using strongly-typed DTO.
     */
    public JsonNode updateScTask(SnowScTaskUpdateRequestDTO dto) {
        JsonNode payloadNode = objectMapper.valueToTree(dto);
        return updateScTask(payloadNode);
    }

    private String buildTableUrl(String path, String sysparmQuery, int limit, boolean displayValue) {
        String baseUrl = veracodeConfig.getSnowBaseUrl();
        StringBuilder url = new StringBuilder(combineBaseAndPath(baseUrl, path));

        url.append("?sysparm_limit=").append(limit);
        url.append("&sysparm_display_value=").append(displayValue ? "True" : "False");
        if (sysparmQuery != null && !sysparmQuery.trim().isEmpty()) {
            url.append("&sysparm_query=").append(URLEncoder.encode(sysparmQuery.trim(), StandardCharsets.UTF_8));
        }

        return url.toString();
    }

    /**
     * Gets the ServiceNow sys_id for a given RITM number.
     * GET https://pwcnetwork.service-now.com/api/now/table/sc_req_item?sysparm_query=number=$RITM&sysparm_fields=sys_id,number
     */
    public String getSysIdByRitmNumber(String ritmNumber) {
        if (ritmNumber == null || ritmNumber.trim().isEmpty()) {
            throw new IllegalArgumentException("RITM number is required");
        }
        String cleanRitm = ritmNumber.trim();
        String query = "sysparm_query=number=" + URLEncoder.encode(cleanRitm, StandardCharsets.UTF_8) + "&sysparm_fields=sys_id,number";
        String targetUrl = "/api/now/table/sc_req_item?" + query;

        JsonNode response = callSnowApi(targetUrl);
        if (response != null && response.has("result") && response.get("result").isArray()) {
            JsonNode resultList = response.get("result");
            if (resultList.size() > 0 && resultList.get(0).hasNonNull("sys_id")) {
                return resultList.get(0).get("sys_id").asText();
            }
        }
        throw new RuntimeException("RITM record not found in ServiceNow: " + cleanRitm);
    }

    /**
     * Uploads a PDF file attachment to ServiceNow table sc_req_item.
     * If ritmOrSysId is a RITM number, it first retrieves the sys_id using getSysIdByRitmNumber.
     *
     * URL: POST https://pwcnetwork.service-now.com/api/now/attachment/file?table_name=sc_req_item&table_sys_id=$sysId&file_name=$fileName
     * Headers:
     *   Authorization: Basic $APIKEY
     *   Content-Type: application/pdf
     *   Accept: application/json
     */
    public JsonNode uploadPdfAttachment(byte[] pdfBytes, String fileName, String ritmOrSysId) {
        if (pdfBytes == null || pdfBytes.length == 0) {
            throw new IllegalArgumentException("PDF content byte array is empty");
        }
        if (fileName == null || fileName.trim().isEmpty()) {
            fileName = "report.pdf";
        }
        String cleanFileName = fileName.trim();

        if (ritmOrSysId == null || ritmOrSysId.trim().isEmpty()) {
            throw new IllegalArgumentException("RITM number or sys_id is required for attachment upload");
        }

        String targetSysId = ritmOrSysId.trim();
        if (targetSysId.toUpperCase().startsWith("RITM") || targetSysId.length() != 32) {
            targetSysId = getSysIdByRitmNumber(targetSysId);
        }

        String baseUrl = veracodeConfig.getSnowBaseUrl();
        String hostUrl = "https://pwcnetwork.service-now.com";
        try {
            if (baseUrl != null && baseUrl.startsWith("http")) {
                URI uri = URI.create(baseUrl);
                hostUrl = uri.getScheme() + "://" + uri.getHost();
                if (uri.getPort() > 0 && uri.getPort() != 80 && uri.getPort() != 443) {
                    hostUrl += ":" + uri.getPort();
                }
            }
        } catch (Exception ignored) {}

        String path = String.format("/api/now/attachment/file?table_name=sc_req_item&table_sys_id=%s&file_name=%s",
                targetSysId, URLEncoder.encode(cleanFileName, StandardCharsets.UTF_8));

        String fullUrl = combineBaseAndPath(hostUrl, path);

        logger.info("Uploading PDF attachment '{}' (size: {} bytes) to ServiceNow table sc_req_item, sys_id: {}", cleanFileName, pdfBytes.length, targetSysId);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(fullUrl))
                .header("Authorization", getAuthHeader())
                .header("Content-Type", "application/pdf")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(pdfBytes))
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new RuntimeException("ServiceNow attachment upload failed. Status: " + response.statusCode() + ", details: " + response.body());
            }

            JsonNode rootNode = objectMapper.readTree(response.body());
            if (rootNode.has("result") && rootNode.get("result").isObject()) {
                ObjectNode resultObj = (ObjectNode) rootNode.get("result");
                String attachmentSysId = resultObj.hasNonNull("sys_id") ? resultObj.get("sys_id").asText() : "";
                String tableSysId = resultObj.hasNonNull("table_sys_id") ? resultObj.get("table_sys_id").asText() : targetSysId;

                String thisUrl = "sc_req_item.do%3Fsys_id%3D" + tableSysId + "%26sysparm_view%3D";
                String attachmentLink = hostUrl + "/sys_attachment.do?sys_id=" + attachmentSysId + "&sysparm_this_url=" + thisUrl;

                resultObj.put("attachment_url", thisUrl);
                resultObj.put("attachment_link", attachmentLink);
                resultObj.put("this_url", thisUrl);
            }

            return rootNode;

        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new RuntimeException("Failed to upload PDF attachment to ServiceNow: " + e.getMessage(), e);
        }
    }

    /**
     * Overload to upload a PDF file from a local file path.
     */
    public JsonNode uploadPdfAttachment(String filePath, String ritmOrSysId) {
        if (filePath == null || filePath.trim().isEmpty()) {
            throw new IllegalArgumentException("File path is required");
        }
        java.nio.file.Path path = java.nio.file.Paths.get(filePath.trim());
        if (!java.nio.file.Files.exists(path)) {
            throw new IllegalArgumentException("File not found: " + filePath);
        }
        try {
            byte[] fileBytes = java.nio.file.Files.readAllBytes(path);
            String fileName = path.getFileName().toString();
            return uploadPdfAttachment(fileBytes, fileName, ritmOrSysId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to read PDF file at " + filePath + ": " + e.getMessage(), e);
        }
    }

    /**
     * Generic method to execute HTTP PATCH request against ServiceNow API.
     */
    public JsonNode patchSnowApi(String targetUrl, JsonNode bodyNode) {
        String baseUrl = veracodeConfig.getSnowBaseUrl();
        String fullUrl;

        if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
            fullUrl = targetUrl;
        } else {
            fullUrl = combineBaseAndPath(baseUrl, targetUrl);
        }

        logger.info("Calling ServiceNow API PATCH: {}", fullUrl);

        try {
            String jsonBody = objectMapper.writeValueAsString(bodyNode != null ? bodyNode : objectMapper.createObjectNode());
            logger.info("ServiceNow PATCH Payload: {}", jsonBody);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(fullUrl))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("username", veracodeConfig.getSnowUsername())
                    .header("Authorization", getAuthHeader())
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int statusCode = response.statusCode();
            logger.info("ServiceNow API PATCH response status: {}", statusCode);

            if (statusCode < 200 || statusCode >= 300) {
                logger.error("ServiceNow API PATCH Error ({}) for URL {}: {}", statusCode, fullUrl, response.body());
                throw new RuntimeException("ServiceNow API returned HTTP " + statusCode + ": " + response.body());
            }

            return objectMapper.readTree(response.body());

        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            logger.error("Failed to execute ServiceNow API PATCH call for {}: {}", fullUrl, e.getMessage(), e);
            throw new RuntimeException("ServiceNow API PATCH request failed: " + e.getMessage(), e);
        }
    }

    /**
     * Dynamically maps JSON body for updating ServiceNow RITM variables.
     * Only fields with non-null, non-empty values are mapped to the payload.
     * Integrates fields from VeracodeReportDTO report DTO if provided.
     */
    public ObjectNode buildRitmVariablesPayload(JsonNode input, com.crs_reivew_api.dto.VeracodeReportDTO reportDto, String ritmNumber) {
        ObjectNode body = objectMapper.createObjectNode();

        // 1. assessment_findings
        String findings = getFirstNonEmptyText(input, "assessment_findings", "assessmentFindings", "findings");
        if (findings == null && reportDto != null && reportDto.assessmentFindings != null) {
            findings = reportDto.assessmentFindings;
        }
        if (findings != null && !findings.trim().isEmpty()) {
            body.put("assessment_findings", findings.trim());
        }

        // 2. date_of_assessed_scan
        String scanDate = getFirstNonEmptyText(input, "date_of_assessed_scan", "dateOfAssessedScan", "scanDate");
        if (scanDate == null && reportDto != null && reportDto.overview != null) {
            scanDate = reportDto.overview.submittedDate != null ? reportDto.overview.submittedDate : reportDto.overview.generationDate;
        }
        if (scanDate != null && !scanDate.trim().isEmpty()) {
            body.put("date_of_assessed_scan", scanDate.trim());
        }

        // 3. application_version
        String appVersion = getFirstNonEmptyText(input, "application_version", "applicationVersion", "version", "buildId");
        if (appVersion == null && reportDto != null && reportDto.overview != null) {
            appVersion = reportDto.overview.buildId;
        }
        if (appVersion != null && !appVersion.trim().isEmpty()) {
            body.put("application_version", appVersion.trim());
        }

        // 4. scan_name
        String scanName = getFirstNonEmptyText(input, "scan_name", "scanName");
        if (scanName == null && reportDto != null && reportDto.overview != null) {
            scanName = reportDto.overview.scanName;
        }
        if (scanName != null && !scanName.trim().isEmpty()) {
            body.put("scan_name", scanName.trim());
        }

        // 5. scan_tool_profile_url
        String profileUrl = getFirstNonEmptyText(input, "scan_tool_profile_url", "scanToolProfileUrl", "profileUrl");
        if (profileUrl == null && reportDto != null) {
            profileUrl = reportDto.scanToolProfileUrl;
        }
        if (profileUrl != null && !profileUrl.trim().isEmpty()) {
            body.put("scan_tool_profile_url", profileUrl.trim());
        }

        // 6. scan_url
        String scanUrl = getFirstNonEmptyText(input, "scan_url", "scanUrl");
        if (scanUrl == null && reportDto != null) {
            scanUrl = reportDto.scanUrl;
        }
        if (scanUrl != null && !scanUrl.trim().isEmpty()) {
            body.put("scan_url", scanUrl.trim());
        }

        // 7. sign_off_reason
        String reason = getFirstNonEmptyText(input, "sign_off_reason", "signOffReason", "reason");
        if (reason != null && !reason.trim().isEmpty()) {
            body.put("sign_off_reason", reason.trim());
        }

        // 8. mitigation_proposals_reviewed
        String mitigations = getFirstNonEmptyText(input, "mitigation_proposals_reviewed", "mitigationProposalsReviewed", "mitigationsReviewed");
        if (mitigations != null && !mitigations.trim().isEmpty()) {
            body.put("mitigation_proposals_reviewed", mitigations.trim());
        }

        // 9. data_classification
        String dataClass = getFirstNonEmptyText(input, "data_classification", "dataClassification");
        if (dataClass != null && !dataClass.trim().isEmpty()) {
            body.put("data_classification", dataClass.trim());
        }

        // 10. exposure
        String exposure = getFirstNonEmptyText(input, "exposure");
        if (exposure != null && !exposure.trim().isEmpty()) {
            body.put("exposure", exposure.trim());
        }

        // Include any additional custom keys from input JSON if present and non-null/non-empty
        if (input != null && input.isObject()) {
            input.fields().forEachRemaining(entry -> {
                if (!body.has(entry.getKey()) && entry.getValue() != null && !entry.getValue().isNull()) {
                    String textVal = entry.getValue().asText("").trim();
                    if (!textVal.isEmpty()) {
                        body.set(entry.getKey(), entry.getValue());
                    }
                }
            });
        }

        return body;
    }

    /**
     * Updates ServiceNow RITM variables via PATCH /api/ipwc/request_item/update/$RITM/variables/nv
     */
    public JsonNode updateRitmVariables(String ritmNumber, JsonNode inputPayload, com.crs_reivew_api.dto.VeracodeReportDTO reportDto) {
        if (ritmNumber == null || ritmNumber.trim().isEmpty()) {
            throw new IllegalArgumentException("RITM number is required");
        }
        String cleanRitm = ritmNumber.trim();
        ObjectNode bodyPayload = buildRitmVariablesPayload(inputPayload, reportDto, cleanRitm);

        String path = String.format("/api/ipwc/request_item/update/%s/variables/nv", cleanRitm);
        logger.info("Updating RITM variables for RITM: {} at endpoint: {}", cleanRitm, path);

        return patchSnowApi(path, bodyPayload);
    }

    /**
     * Updates ServiceNow RITM variables via PATCH /api/ipwc/request_item/update/$RITM/variables/nv
     */
    public JsonNode updateRitmVariables(String ritmNumber, JsonNode inputPayload) {
        return updateRitmVariables(ritmNumber, inputPayload, null);
    }
}
