package com.crs_reivew_api.scheduler;

import com.crs_reivew_api.component.TaskFileStore;
import com.crs_reivew_api.component.TaskMemory;
import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.dto.SnowRitmDTO;
import com.crs_reivew_api.dto.SnowScTaskDTO;
import com.crs_reivew_api.dto.VeracodeReportDTO;
import com.crs_reivew_api.service.SnowService;
import com.crs_reivew_api.service.VeracodeService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Component
public class TicketScheduler {

    private static final Logger logger = LoggerFactory.getLogger(TicketScheduler.class);

    private final SnowService snowService;
    private final VeracodeService veracodeService;
    private final VeracodeConfig config;
    private final TaskMemory taskMemory;
    private final TaskFileStore taskFileStore;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TicketScheduler(
            SnowService snowService,
            VeracodeService veracodeService,
            VeracodeConfig config,
            TaskMemory taskMemory,
            TaskFileStore taskFileStore) {
        this.snowService = snowService;
        this.veracodeService = veracodeService;
        this.config = config;
        this.taskMemory = taskMemory;
        this.taskFileStore = taskFileStore;
    }

    /**
     * Scheduled job running inside the Spring Boot server process.
     * Repetition delay is controlled via crs.snow.scheduler.delay-ms (default 5 minutes / 300000ms).
     */
    @Scheduled(fixedDelayString = "${crs.snow.scheduler.delay-ms:300000}")
    public void scheduleSctaskProcessing() {
        if (!config.isSnowSchedulerEnabled()) {
            logger.debug("ServiceNow SCTASK Scheduler is currently disabled via crs.snow.scheduler.enabled=false. Skipping execution.");
            return;
        }

        logger.info("Starting ServiceNow SCTASK Scheduler run...");
        try {
            JsonNode rootNode = fetchOpenTicketsFromServiceNow();
            if (rootNode == null || !rootNode.has("result") || !rootNode.get("result").isArray()) {
                logger.info("No open remediation tickets found in ServiceNow.");
                return;
            }

            JsonNode tasksArray = rootNode.get("result");
            int totalCount = tasksArray.size();
            logger.info("Retrieved {} open catalog task(s) from ServiceNow.", totalCount);

            int processedCount = 0;
            int skippedCount = 0;

            for (JsonNode item : tasksArray) {
                SnowScTaskDTO scTaskDto = snowService.extractScTaskDto(item);
                if (scTaskDto == null || scTaskDto.getNumber() == null || scTaskDto.getNumber().trim().isEmpty()) {
                    continue;
                }

                String sctaskNumber = scTaskDto.getNumber().trim();
                String ritmNumber = scTaskDto.getRequestItemNumber();

                // Check in-memory LRU store to prevent re-processing
                if (taskMemory.contains(sctaskNumber)) {
                    logger.debug("SCTASK {} is already processed (in TaskMemory LRU). Skipping.", sctaskNumber);
                    skippedCount++;
                    continue;
                }

                logger.info("Processing new SCTASK: {} (Associated RITM: {})", sctaskNumber, ritmNumber);

                SnowRitmDTO ritmDto = null;
                if (ritmNumber != null && !ritmNumber.trim().isEmpty()) {
                    try {
                        ritmDto = snowService.getRitmDetails(ritmNumber);
                    } catch (Exception e) {
                        logger.warn("Failed to fetch RITM details for {}: {}", ritmNumber, e.getMessage());
                    }
                }

                String scaTool = (ritmDto != null) ? ritmDto.getScaTool() : null;
                String appProfileName = (ritmDto != null) ? ritmDto.getApplicationProfileName() : null;

                if (scaTool != null && scaTool.toLowerCase().contains("veracode")) {
                    logger.info("Detected Veracode SCA Tool for SCTASK {} (RITM: {}). Profile Name: {}", sctaskNumber, ritmNumber, appProfileName);
                    if (appProfileName != null && !appProfileName.trim().isEmpty()) {
                        processVeracodeTask(sctaskNumber, ritmNumber, appProfileName);
                    } else {
                        logger.warn("Application Profile Name is empty for Veracode RITM {}. Skipping Veracode report generation.", ritmNumber);
                    }
                }

                // Call generic placeholder processTicket method
                processTicket(sctaskNumber, ritmNumber, ritmDto);

                // Update LRU memory and append to history file
                String timestamp = Instant.now().toString();
                taskMemory.put(sctaskNumber, timestamp);
                taskFileStore.appendEntry(sctaskNumber, timestamp);

                processedCount++;
            }

            logger.info("ServiceNow SCTASK Scheduler run finished. Processed: {}, Skipped: {}, Total LRU memory size: {}",
                    processedCount, skippedCount, taskMemory.size());

        } catch (Exception e) {
            logger.error("Error occurred during ServiceNow SCTASK Scheduler run: {}", e.getMessage(), e);
        }
    }

    /**
     * Placeholder method to fetch open remediation catalog tasks from ServiceNow.
     */
    public JsonNode fetchOpenTicketsFromServiceNow() {
        return snowService.openRemediation(500, null, null);
    }

    /**
     * Placeholder method for custom ticket processing logic.
     */
    public void processTicket(String sctaskNumber, String ritmNumber, SnowRitmDTO ritmDto) {
        logger.info("Executed processTicket() for SCTASK: {} (RITM: {})", sctaskNumber, ritmNumber);
    }

    /**
     * Helper method to fetch Veracode report, save HTML log, and optionally post update back to ServiceNow.
     */
    private void processVeracodeTask(String sctaskNumber, String ritmNumber, String appProfileName) {
        try {
            VeracodeReportDTO report = veracodeService.getFinalReport(appProfileName, null, null, true, true);
            String reviewCommentsHtml = (report != null) ? report.reviewCommentsHtml : null;

            if (reviewCommentsHtml != null && !reviewCommentsHtml.trim().isEmpty()) {
                // 1. Save log record under logs/snow/auto/<RITM>_<DATE>.txt
                saveAutoLogFile(ritmNumber, reviewCommentsHtml);

                // 2. Post update back to ServiceNow if postSchedulerToSnow is enabled
                if (config.isPostSchedulerToSnow()) {
                    logger.info("Posting review comments to ServiceNow for SCTASK: {}...", sctaskNumber);
                    ObjectNode updatePayload = objectMapper.createObjectNode();
                    updatePayload.put("u_number", sctaskNumber);
                    updatePayload.put("u_action", "Add Comment");
                    updatePayload.put("u_additional_comments", reviewCommentsHtml);

                    JsonNode updateResponse = snowService.updateScTask(updatePayload);
                    logger.info("ServiceNow update response for {}: {}", sctaskNumber, updateResponse);
                } else {
                    logger.info("postSchedulerToSnow is false. Skipping ServiceNow comment post for {}.", sctaskNumber);
                }
            } else {
                logger.warn("Veracode reviewCommentsHtml is empty for profile: {}", appProfileName);
            }
        } catch (Exception e) {
            logger.error("Error processing Veracode report for SCTASK {} / App Profile {}: {}", sctaskNumber, appProfileName, e.getMessage(), e);
        }
    }

    /**
     * Creates a log record under logs/snow/auto/<RITM>_<DATE>.txt containing the reviewCommentsHtml.
     */
    public void saveAutoLogFile(String ritmNumber, String reviewCommentsHtml) {
        try {
            File dir = new File("logs/snow/auto");
            if (!dir.exists()) {
                boolean created = dir.mkdirs();
                if (created) {
                    logger.info("Created logs directory: {}", dir.getAbsolutePath());
                }
            }

            String safeRitm = (ritmNumber != null && !ritmNumber.trim().isEmpty()) ? ritmNumber.trim() : "UNKNOWN_RITM";
            String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            String fileName = safeRitm + "_" + dateStr + ".txt";

            File logFile = new File(dir, fileName);
            Files.writeString(logFile.toPath(), reviewCommentsHtml, StandardCharsets.UTF_8);
            logger.info("Saved auto review comments log record to {}", logFile.getAbsolutePath());

        } catch (Exception e) {
            logger.error("Failed to save auto log file for RITM {}: {}", ritmNumber, e.getMessage(), e);
        }
    }
}
