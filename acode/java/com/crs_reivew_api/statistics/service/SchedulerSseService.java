package com.crs_reivew_api.statistics.service;

import com.crs_reivew_api.statistics.dto.DailyKpiDTO;
import com.crs_reivew_api.statistics.dto.SchedulerStatusDTO;
import com.crs_reivew_api.statistics.dto.TicketEventDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Manages active Server-Sent Events (SSE) connections and broadcasts live scheduler events.
 */
@Service
public class SchedulerSseService {

    private static final Logger logger = LoggerFactory.getLogger(SchedulerSseService.class);

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter registerClient() {
        // Set timeout to 30 minutes (1,800,000 ms)
        SseEmitter emitter = new SseEmitter(1800000L);

        this.emitters.add(emitter);
        logger.debug("New SSE client connected. Active clients: {}", emitters.size());

        emitter.onCompletion(() -> {
            emitters.remove(emitter);
            logger.debug("SSE client completed. Active clients: {}", emitters.size());
        });

        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            logger.debug("SSE client timed out. Active clients: {}", emitters.size());
        });

        emitter.onError((ex) -> {
            emitters.remove(emitter);
            logger.debug("SSE client connection error: {}. Active clients: {}", ex.getMessage(), emitters.size());
        });

        return emitter;
    }

    public void broadcastStatus(SchedulerStatusDTO status) {
        sendEvent("scheduler-status", status);
    }

    public void broadcastKpi(DailyKpiDTO kpi) {
        sendEvent("kpi-update", kpi);
    }

    public void broadcastTicket(TicketEventDTO ticket) {
        sendEvent("ticket-complete", ticket);
    }

    public void sendHeartbeat() {
        if (emitters.isEmpty()) {
            return;
        }

        List<SseEmitter> deadEmitters = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().comment("keep-alive"));
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }
        if (!deadEmitters.isEmpty()) {
            emitters.removeAll(deadEmitters);
            logger.debug("Removed {} disconnected SSE client(s) during heartbeat.", deadEmitters.size());
        }
    }

    private void sendEvent(String eventName, Object data) {
        if (emitters.isEmpty()) {
            return;
        }

        List<SseEmitter> deadEmitters = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(eventName)
                        .data(data));
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }

        if (!deadEmitters.isEmpty()) {
            emitters.removeAll(deadEmitters);
            logger.debug("Removed {} disconnected SSE client(s) during sendEvent({}).", deadEmitters.size(), eventName);
        }
    }

    public int getActiveClientCount() {
        return emitters.size();
    }
}
