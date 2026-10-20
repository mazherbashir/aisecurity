package com.crs_reivew_api.statistics.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Minimalist entity recording scheduler execution outcomes and performance per ticket.
 */
@Entity
@Table(name = "ticket_execution", indexes = {
        @Index(name = "idx_ticket_processed_at", columnList = "processed_at"),
        @Index(name = "idx_ticket_sctask", columnList = "sctask")
})
public class TicketExecutionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sctask", length = 32, nullable = false)
    private String sctask;

    @Column(name = "ritm", length = 32)
    private String ritm;

    @Column(name = "sca_tool", length = 32)
    private String scaTool;

    @Column(name = "request_reason", length = 64)
    private String requestReason;

    @Column(name = "action", length = 64, nullable = false)
    private String action;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "error_type", length = 64)
    private String errorType;

    @Column(name = "duration_ms", nullable = false)
    private Long durationMs;

    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt;

    public TicketExecutionEntity() {
    }

    public TicketExecutionEntity(String sctask, String ritm, String scaTool, String requestReason,
                                 String action, String status, String errorType, Long durationMs,
                                 LocalDateTime processedAt) {
        this.sctask = sctask;
        this.ritm = ritm;
        this.scaTool = scaTool;
        this.requestReason = requestReason;
        this.action = action;
        this.status = status;
        this.errorType = errorType;
        this.durationMs = durationMs;
        this.processedAt = processedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSctask() {
        return sctask;
    }

    public void setSctask(String sctask) {
        this.sctask = sctask;
    }

    public String getRitm() {
        return ritm;
    }

    public void setRitm(String ritm) {
        this.ritm = ritm;
    }

    public String getScaTool() {
        return scaTool;
    }

    public void setScaTool(String scaTool) {
        this.scaTool = scaTool;
    }

    public String getRequestReason() {
        return requestReason;
    }

    public void setRequestReason(String requestReason) {
        this.requestReason = requestReason;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getErrorType() {
        return errorType;
    }

    public void setErrorType(String errorType) {
        this.errorType = errorType;
    }

    public Long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(Long durationMs) {
        this.durationMs = durationMs;
    }

    public LocalDateTime getProcessedAt() {
        return processedAt;
    }

    public void setProcessedAt(LocalDateTime processedAt) {
        this.processedAt = processedAt;
    }
}
