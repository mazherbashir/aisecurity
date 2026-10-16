package com.crs_reivew_api.statistics.service;

import com.crs_reivew_api.config.VeracodeConfig;
import com.crs_reivew_api.statistics.dto.DailyKpiDTO;
import com.crs_reivew_api.statistics.dto.SchedulerStatusDTO;
import com.crs_reivew_api.statistics.dto.TicketEventDTO;
import com.crs_reivew_api.statistics.entity.DailyStatisticsEntity;
import com.crs_reivew_api.statistics.entity.TicketExecutionEntity;
import com.crs_reivew_api.statistics.repository.DailyStatisticsRepository;
import com.crs_reivew_api.statistics.repository.TicketExecutionRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.crs_reivew_api.statistics.dto.PeriodKpiDTO;
import java.io.File;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Core statistics and performance tracking service for the ServiceNow scheduler.
 * Persists ticket executions and daily KPIs in H2 (./logs/db) and broadcasts live updates via SSE.
 */
@Service
public class SchedulerMetricsService {

    private static final Logger logger = LoggerFactory.getLogger(SchedulerMetricsService.class);
    private static final DateTimeFormatter ISO_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final TicketExecutionRepository ticketRepo;
    private final DailyStatisticsRepository dailyStatsRepo;
    private final SchedulerSseService sseService;
    private final VeracodeConfig config;

    private final AtomicReference<String> state = new AtomicReference<>("IDLE");
    private final AtomicReference<String> currentTicket = new AtomicReference<>(null);
    private final AtomicReference<String> currentRitm = new AtomicReference<>(null);

    private volatile long lastRunStartMs = 0L;
    private volatile long lastRunEndMs = 0L;
    private volatile long lastRunDurationMs = 0L;
    private volatile long nextRunEstimatedMs = 0L;

    public SchedulerMetricsService(TicketExecutionRepository ticketRepo,
                                   DailyStatisticsRepository dailyStatsRepo,
                                   SchedulerSseService sseService,
                                   VeracodeConfig config) {
        this.ticketRepo = ticketRepo;
        this.dailyStatsRepo = dailyStatsRepo;
        this.sseService = sseService;
        this.config = config;
    }

    @PostConstruct
    public void init() {
        File dbDir = new File("logs/db");
        if (!dbDir.exists()) {
            boolean created = dbDir.mkdirs();
            if (created) {
                logger.info("Initialized scheduler database directory: {}", dbDir.getAbsolutePath());
            }
        // Fail-safe auto-recovery: if H2 database is empty, restore from backup log
        restoreFromBackupIfEmpty();

        // Initialize estimated next run if scheduler is enabled
        long delay = config.getSnowSchedulerDelayMs() > 0 ? config.getSnowSchedulerDelayMs() : 300000L;
        this.nextRunEstimatedMs = System.currentTimeMillis() + delay;
    }

    /**
     * Mark scheduler status as POLLING when checking ServiceNow for open tasks.
     */
    public void startPolling() {
        this.state.set("POLLING");
        this.lastRunStartMs = System.currentTimeMillis();
        sseService.broadcastStatus(getLiveStatus());
    }

    /**
     * Mark scheduler status as PROCESSING when evaluating an active ticket.
     */
    public void startProcessingTicket(String sctask, String ritm) {
        this.state.set("PROCESSING");
        this.currentTicket.set(sctask);
        this.currentRitm.set(ritm);
        sseService.broadcastStatus(getLiveStatus());
    }

    public void clearCurrentTicket() {
        this.currentTicket.set(null);
        this.currentRitm.set(null);
    }

    /**
     * Records a completed ticket execution in H2, updates today's KPI rollup, and pushes SSE events.
     */
    @Transactional
    public void recordTicketResult(String sctask, String ritm, String scaTool, String requestReason,
                                   String action, String status, String errorType, long durationMs) {
        LocalDateTime now = LocalDateTime.now();

        // 1. Save minimal ticket execution entity
        TicketExecutionEntity execution = new TicketExecutionEntity(
                sctask,
                ritm,
                scaTool,
                requestReason,
                action,
                status,
                errorType,
                Math.max(0, durationMs),
                now
        );
        ticketRepo.saveAndFlush(execution);
        appendTicketExecutionBackup(execution);

        // 2. Update daily statistics rollup
        LocalDate today = now.toLocalDate();
        DailyStatisticsEntity dailyStats = dailyStatsRepo.findById(today)
                .orElseGet(() -> new DailyStatisticsEntity(today));

        dailyStats.setTotalTicketsToday(dailyStats.getTotalTicketsToday() + 1);
        long newTotalDuration = dailyStats.getTotalDurationSumMs() + Math.max(0, durationMs);
        dailyStats.setTotalDurationSumMs(newTotalDuration);
        dailyStats.setAvgDurationMs(newTotalDuration / dailyStats.getTotalTicketsToday());
        dailyStats.setLastUpdated(now);

        boolean isSignoff = (requestReason != null && requestReason.trim().toLowerCase().contains("sign"))
                || (action != null && action.contains("SIGNOFF"));
        boolean isMitigation = (requestReason != null && requestReason.trim().toLowerCase().contains("mitigat"))
                || "MITIGATION_REVIEW".equals(action);

        if (isSignoff) {
            dailyStats.setTotalSignoffsToday(dailyStats.getTotalSignoffsToday() + 1);
        }

        if ("CLEAN_SIGNOFF".equals(action) || "CLEAN_SCAN_SIGNOFF".equals(action)) {
            dailyStats.setCleanScanSignoffsToday(dailyStats.getCleanScanSignoffsToday() + 1);
        } else if ("COMMENTS_ADDED".equals(action) || "SIGNOFF_COMMENTS_ADDED".equals(action)) {
            dailyStats.setSignoffsWithCommentsToday(dailyStats.getSignoffsWithCommentsToday() + 1);
        } else if (isMitigation) {
            dailyStats.setMitigationTicketsToday(dailyStats.getMitigationTicketsToday() + 1);
        }

        // Categorize errors
        if (errorType != null && !errorType.trim().isEmpty()) {
            switch (errorType.trim().toUpperCase()) {
                case "SCAN_NOT_FOUND" -> dailyStats.setErrorsScanNotFound(dailyStats.getErrorsScanNotFound() + 1);
                case "PROFILE_NOT_FOUND" -> dailyStats.setErrorsProfileNotFound(dailyStats.getErrorsProfileNotFound() + 1);
                case "RESCAN_REQUIRED" -> dailyStats.setErrorsRescanRequired(dailyStats.getErrorsRescanRequired() + 1);
                default -> dailyStats.setErrorsOther(dailyStats.getErrorsOther() + 1);
            }
        }

        dailyStatsRepo.saveAndFlush(dailyStats);

        // 3. Broadcast real-time SSE ticket completion
        TicketEventDTO eventDTO = new TicketEventDTO(
                sctask,
                ritm,
                scaTool,
                requestReason,
                action,
                status,
                errorType,
                durationMs,
                now.format(ISO_FORMATTER)
        );
        sseService.broadcastTicket(eventDTO);

        // 4. Broadcast updated KPIs
        sseService.broadcastKpi(toDailyKpiDto(dailyStats));
    }

    /**
     * Mark scheduler status as IDLE after completing a cycle.
     */
    public void finishPolling(int processedCount, int skippedCount) {
        long now = System.currentTimeMillis();
        this.lastRunEndMs = now;
        this.lastRunDurationMs = (lastRunStartMs > 0) ? (now - lastRunStartMs) : 0L;
        this.state.set("IDLE");
        this.currentTicket.set(null);
        this.currentRitm.set(null);

        long delay = config.getSnowSchedulerDelayMs() > 0 ? config.getSnowSchedulerDelayMs() : 300000L;
        this.nextRunEstimatedMs = now + delay;

        sseService.broadcastStatus(getLiveStatus());
    }

    /**
     * Heartbeat pulse running every 5 seconds to update the live countdown in connected UIs
     * and maintain keep-alive signals on SSE streams.
     */
    @Scheduled(fixedRate = 5000)
    public void pulseHeartbeat() {
        if (sseService.getActiveClientCount() > 0) {
            sseService.sendHeartbeat();
            sseService.broadcastStatus(getLiveStatus());
        }
    }

    public SchedulerStatusDTO getLiveStatus() {
        SchedulerStatusDTO dto = new SchedulerStatusDTO();
        dto.setState(state.get());
        dto.setCurrentTicket(currentTicket.get());
        dto.setCurrentRitm(currentRitm.get());
        dto.setLastRunDurationMs(lastRunDurationMs);

        if (lastRunEndMs > 0) {
            dto.setLastRunTime(LocalDateTime.ofInstant(
                    java.time.Instant.ofEpochMilli(lastRunEndMs),
                    java.time.ZoneId.systemDefault()
            ).format(ISO_FORMATTER));
        } else {
            dto.setLastRunTime(null);
        }

        long delay = config.getSnowSchedulerDelayMs() > 0 ? config.getSnowSchedulerDelayMs() : 300000L;
        dto.setPollDelayMs(delay);
        dto.setSchedulerEnabled(config.isSnowSchedulerEnabled());

        long remainingSec = Math.max(0, (nextRunEstimatedMs - System.currentTimeMillis()) / 1000);
        dto.setNextRunInSeconds("IDLE".equals(state.get()) ? remainingSec : 0);

        DailyStatisticsEntity todayStats = dailyStatsRepo.findById(LocalDate.now()).orElse(null);
        if (todayStats != null) {
            dto.setTotalProcessedToday(todayStats.getTotalTicketsToday());
            dto.setAvgTicketDurationMs(todayStats.getAvgDurationMs());
        } else {
            dto.setTotalProcessedToday(0);
            dto.setAvgTicketDurationMs(0L);
        }

        return dto;
    }

    public DailyKpiDTO getTodayKpi() {
        LocalDate today = LocalDate.now();
        DailyStatisticsEntity entity = dailyStatsRepo.findById(today)
                .orElseGet(() -> new DailyStatisticsEntity(today));
        return toDailyKpiDto(entity);
    }

    public List<TicketExecutionEntity> getRecentTickets(int limit) {
        return ticketRepo.findTop20ByOrderByProcessedAtDesc();
    }

    /**
     * Resets local H2 statistics database to start fresh.
     */
    @Transactional
    public void resetDatabase() {
        ticketRepo.deleteAll();
        dailyStatsRepo.deleteAll();
        lastRunDurationMs = 0L;
        lastRunStartMs = 0L;
        lastRunEndMs = 0L;
        currentTicket.set(null);
        currentRitm.set(null);
        state.set("IDLE");

        logger.info("Scheduler performance and statistics database reset successfully.");

        sseService.broadcastStatus(getLiveStatus());
        sseService.broadcastKpi(getTodayKpi());
    }

    private DailyKpiDTO toDailyKpiDto(DailyStatisticsEntity todayEntity) {
        DailyKpiDTO dto = new DailyKpiDTO();
        dto.setStatDate(todayEntity.getStatDate().toString());
        dto.setTotalSignoffsToday(todayEntity.getTotalSignoffsToday());
        dto.setCleanScanSignoffsToday(todayEntity.getCleanScanSignoffsToday());
        dto.setSignoffsWithCommentsToday(todayEntity.getSignoffsWithCommentsToday());
        dto.setMitigationTicketsToday(todayEntity.getMitigationTicketsToday());
        dto.setErrorsScanNotFound(todayEntity.getErrorsScanNotFound());
        dto.setErrorsProfileNotFound(todayEntity.getErrorsProfileNotFound());
        dto.setErrorsRescanRequired(todayEntity.getErrorsRescanRequired());
        dto.setErrorsOther(todayEntity.getErrorsOther());
        int totalErrors = todayEntity.getErrorsScanNotFound() + todayEntity.getErrorsProfileNotFound()
                + todayEntity.getErrorsRescanRequired() + todayEntity.getErrorsOther();
        dto.setTotalErrorsToday(totalErrors);
        dto.setTotalTicketsToday(todayEntity.getTotalTicketsToday());
        dto.setAvgDurationMs(todayEntity.getAvgDurationMs());
        dto.setLastUpdated(todayEntity.getLastUpdated() != null ? todayEntity.getLastUpdated().format(ISO_FORMATTER) : null);

        LocalDate today = todayEntity.getStatDate();
        LocalDate startOfWeek = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate startOfMonth = today.with(TemporalAdjusters.firstDayOfMonth());

        // 1. Today Period
        PeriodKpiDTO todayPeriod = toPeriodDto(todayEntity);
        dto.setToday(todayPeriod);

        // 2. This Week Period (Monday through today)
        List<DailyStatisticsEntity> weekEntries = dailyStatsRepo.findByStatDateBetween(startOfWeek, today);
        dto.setThisWeek(aggregateEntries(weekEntries));

        // 3. This Month Period (1st of month through today)
        List<DailyStatisticsEntity> monthEntries = dailyStatsRepo.findByStatDateBetween(startOfMonth, today);
        dto.setThisMonth(aggregateEntries(monthEntries));

        return dto;
    }

    private PeriodKpiDTO toPeriodDto(DailyStatisticsEntity e) {
        int errors = e.getErrorsScanNotFound() + e.getErrorsProfileNotFound() + e.getErrorsRescanRequired() + e.getErrorsOther();
        return new PeriodKpiDTO(
                e.getCleanScanSignoffsToday(),
                e.getSignoffsWithCommentsToday(),
                e.getMitigationTicketsToday(),
                e.getTotalSignoffsToday(),
                errors,
                e.getTotalTicketsToday(),
                e.getAvgDurationMs()
        );
    }

    private PeriodKpiDTO aggregateEntries(List<DailyStatisticsEntity> entries) {
        if (entries == null || entries.isEmpty()) {
            return new PeriodKpiDTO(0, 0, 0, 0, 0, 0, 0L);
        }
        int clean = 0;
        int comments = 0;
        int mitigations = 0;
        int signoffs = 0;
        int errors = 0;
        int totalTickets = 0;
        long durationSum = 0L;

        for (DailyStatisticsEntity e : entries) {
            clean += e.getCleanScanSignoffsToday();
            comments += e.getSignoffsWithCommentsToday();
            mitigations += e.getMitigationTicketsToday();
            signoffs += e.getTotalSignoffsToday();
            errors += (e.getErrorsScanNotFound() + e.getErrorsProfileNotFound() + e.getErrorsRescanRequired() + e.getErrorsOther());
            totalTickets += e.getTotalTicketsToday();
            durationSum += e.getTotalDurationSumMs();
        }

        long avgDuration = totalTickets > 0 ? (durationSum / totalTickets) : 0L;
        return new PeriodKpiDTO(clean, comments, mitigations, signoffs, errors, totalTickets, avgDuration);
    }

    /**
     * Appends a newly recorded ticket execution to an immutable JSONL backup file.
     * Ensures data is never lost even if H2 MVStore crashes or restarts abruptly.
     */
    private synchronized void appendTicketExecutionBackup(TicketExecutionEntity execution) {
        try {
            File dbDir = new File("logs/db");
            if (!dbDir.exists()) dbDir.mkdirs();
            File backupFile = new File("logs/db/ticket_executions_backup.jsonl");

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
            String json = mapper.writeValueAsString(execution);

            java.nio.file.Files.writeString(
                    backupFile.toPath(),
                    json + System.lineSeparator(),
                    java.nio.charset.StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE,
                    java.nio.file.StandardOpenOption.APPEND
            );
        } catch (Exception e) {
            logger.warn("Failed to append ticket execution to backup file: {}", e.getMessage());
        }
    }

    /**
     * Auto-restores ticket executions and daily statistics rollup if H2 tables are empty
     * but historical backup data exists on disk.
     */
    public synchronized void restoreFromBackupIfEmpty() {
        try {
            long count = ticketRepo.count();
            File backupFile = new File("logs/db/ticket_executions_backup.jsonl");
            if (count == 0 && backupFile.exists() && backupFile.length() > 0) {
                logger.info("H2 database is empty. Found backup file at {}. Restoring historical tickets...", backupFile.getAbsolutePath());
                List<String> lines = java.nio.file.Files.readAllLines(backupFile.toPath(), java.nio.charset.StandardCharsets.UTF_8);
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                mapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());

                for (String line : lines) {
                    if (line == null || line.trim().isEmpty()) continue;
                    try {
                        TicketExecutionEntity entity = mapper.readValue(line.trim(), TicketExecutionEntity.class);
                        entity.setId(null); // allow auto-generation of ID
                        ticketRepo.save(entity);

                        // Reconstruct DailyStatistics rollup
                        LocalDate statDate = entity.getProcessedAt() != null ? entity.getProcessedAt().toLocalDate() : LocalDate.now();
                        DailyStatisticsEntity dailyStats = dailyStatsRepo.findById(statDate)
                                .orElseGet(() -> new DailyStatisticsEntity(statDate));

                        dailyStats.setTotalTicketsToday(dailyStats.getTotalTicketsToday() + 1);
                        long newTotalDuration = dailyStats.getTotalDurationSumMs() + Math.max(0, entity.getDurationMs());
                        dailyStats.setTotalDurationSumMs(newTotalDuration);
                        dailyStats.setAvgDurationMs(newTotalDuration / dailyStats.getTotalTicketsToday());
                        dailyStats.setLastUpdated(entity.getProcessedAt());

                        boolean isSignoff = (entity.getRequestReason() != null && entity.getRequestReason().trim().toLowerCase().contains("sign"))
                                || (entity.getAction() != null && entity.getAction().contains("SIGNOFF"));
                        boolean isMitigation = (entity.getRequestReason() != null && entity.getRequestReason().trim().toLowerCase().contains("mitigat"))
                                || "MITIGATION_REVIEW".equals(entity.getAction());

                        if (isSignoff) {
                            dailyStats.setTotalSignoffsToday(dailyStats.getTotalSignoffsToday() + 1);
                        }

                        if ("CLEAN_SIGNOFF".equals(entity.getAction()) || "CLEAN_SCAN_SIGNOFF".equals(entity.getAction())) {
                            dailyStats.setCleanScanSignoffsToday(dailyStats.getCleanScanSignoffsToday() + 1);
                        } else if ("COMMENTS_ADDED".equals(entity.getAction()) || "SIGNOFF_COMMENTS_ADDED".equals(entity.getAction())) {
                            dailyStats.setSignoffsWithCommentsToday(dailyStats.getSignoffsWithCommentsToday() + 1);
                        } else if (isMitigation) {
                            dailyStats.setMitigationTicketsToday(dailyStats.getMitigationTicketsToday() + 1);
                        }

                        if (entity.getErrorType() != null && !entity.getErrorType().trim().isEmpty()) {
                            switch (entity.getErrorType().trim().toUpperCase()) {
                                case "SCAN_NOT_FOUND" -> dailyStats.setErrorsScanNotFound(dailyStats.getErrorsScanNotFound() + 1);
                                case "PROFILE_NOT_FOUND" -> dailyStats.setErrorsProfileNotFound(dailyStats.getErrorsProfileNotFound() + 1);
                                case "RESCAN_REQUIRED" -> dailyStats.setErrorsRescanRequired(dailyStats.getErrorsRescanRequired() + 1);
                                default -> dailyStats.setErrorsOther(dailyStats.getErrorsOther() + 1);
                            }
                        }
                        dailyStatsRepo.save(dailyStats);
                    } catch (Exception ex) {
                        logger.warn("Skipping unparseable backup line: {}", ex.getMessage());
                    }
                }
                ticketRepo.flush();
                dailyStatsRepo.flush();
                logger.info("Successfully restored {} historical ticket executions into H2 database.", ticketRepo.count());
            }
        } catch (Exception e) {
            logger.error("Failed to restore tickets from backup: {}", e.getMessage(), e);
        }
    }
}
