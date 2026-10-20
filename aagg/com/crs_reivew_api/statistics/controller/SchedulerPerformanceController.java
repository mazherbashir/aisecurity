package com.crs_reivew_api.statistics.controller;

import com.crs_reivew_api.statistics.dto.DailyKpiDTO;
import com.crs_reivew_api.statistics.dto.SchedulerStatusDTO;
import com.crs_reivew_api.statistics.entity.TicketExecutionEntity;
import com.crs_reivew_api.statistics.service.SchedulerMetricsService;
import com.crs_reivew_api.statistics.service.SchedulerSseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST and Server-Sent Events (SSE) controller for live scheduler performance,
 * working status, and daily statistics.
 */
@RestController
@RequestMapping("/api/scheduler")
@CrossOrigin(origins = "*")
public class SchedulerPerformanceController {

    private static final Logger logger = LoggerFactory.getLogger(SchedulerPerformanceController.class);

    private final SchedulerMetricsService metricsService;
    private final SchedulerSseService sseService;

    public SchedulerPerformanceController(SchedulerMetricsService metricsService, SchedulerSseService sseService) {
        this.metricsService = metricsService;
        this.sseService = sseService;
    }

    /**
     * Server-Sent Events (SSE) stream delivering real-time scheduler state transitions,
     * live execution heartbeats, daily KPI updates, and ticket completion events.
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamSchedulerPerformance() {
        SseEmitter emitter = sseService.registerClient();

        // Push immediate initial snapshot upon connection
        try {
            emitter.send(SseEmitter.event()
                    .name("scheduler-status")
                    .data(metricsService.getLiveStatus()));

            emitter.send(SseEmitter.event()
                    .name("kpi-update")
                    .data(metricsService.getTodayKpi()));

            emitter.send(SseEmitter.event()
                    .name("recent-tickets")
                    .data(metricsService.getRecentTickets(20)));
        } catch (IOException e) {
            logger.debug("Client disconnected immediately on initial SSE handshake: {}", e.getMessage());
        }

        return emitter;
    }

    /**
     * Snapshot endpoint returning current scheduler working status (IDLE/POLLING/PROCESSING, current ticket, countdown).
     */
    @GetMapping("/status")
    public ResponseEntity<SchedulerStatusDTO> getStatus() {
        return ResponseEntity.ok(metricsService.getLiveStatus());
    }

    /**
     * Snapshot endpoint returning today's performance and execution KPIs.
     */
    @GetMapping("/kpis")
    public ResponseEntity<DailyKpiDTO> getKpis() {
        return ResponseEntity.ok(metricsService.getTodayKpi());
    }

    /**
     * Snapshot endpoint returning the most recently executed tickets.
     */
    @GetMapping("/recent-tickets")
    public ResponseEntity<List<TicketExecutionEntity>> getRecentTickets(
            @RequestParam(value = "limit", defaultValue = "20") int limit) {
        return ResponseEntity.ok(metricsService.getRecentTickets(limit));
    }

    /**
     * Administrative endpoint to reset the statistics database back to blank.
     */
    @PostMapping("/reset")
    public ResponseEntity<Map<String, Object>> resetDatabase() {
        metricsService.resetDatabase();
        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "Scheduler statistics and ticket execution database successfully reset.");
        resp.put("timestamp", System.currentTimeMillis());
        return ResponseEntity.ok(resp);
    }
}
