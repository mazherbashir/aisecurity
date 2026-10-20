package com.crs_reivew_api.statistics.dto;

public class TicketEventDTO {

    private String sctask;
    private String ritm;
    private String scaTool;
    private String requestReason;
    private String action;
    private String status;
    private String errorType;
    private long durationMs;
    private String processedAt;

    public TicketEventDTO() {
    }

    public TicketEventDTO(String sctask, String ritm, String scaTool, String requestReason,
                          String action, String status, String errorType, long durationMs,
                          String processedAt) {
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

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public String getProcessedAt() {
        return processedAt;
    }

    public void setProcessedAt(String processedAt) {
        this.processedAt = processedAt;
    }
}
