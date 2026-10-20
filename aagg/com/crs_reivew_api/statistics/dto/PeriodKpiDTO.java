package com.crs_reivew_api.statistics.dto;

/**
 * Metric summary for a specific time window (Today, This Week, This Month).
 */
public class PeriodKpiDTO {

    private int cleanSignoffs;
    private int commentsAdded;
    private int mitigations;
    private int totalSignoffs;
    private int totalErrors;
    private int totalTickets;
    private long avgDurationMs;

    public PeriodKpiDTO() {
    }

    public PeriodKpiDTO(int cleanSignoffs, int commentsAdded, int mitigations, int totalSignoffs,
                        int totalErrors, int totalTickets, long avgDurationMs) {
        this.cleanSignoffs = cleanSignoffs;
        this.commentsAdded = commentsAdded;
        this.mitigations = mitigations;
        this.totalSignoffs = totalSignoffs;
        this.totalErrors = totalErrors;
        this.totalTickets = totalTickets;
        this.avgDurationMs = avgDurationMs;
    }

    public int getCleanSignoffs() {
        return cleanSignoffs;
    }

    public void setCleanSignoffs(int cleanSignoffs) {
        this.cleanSignoffs = cleanSignoffs;
    }

    public int getCommentsAdded() {
        return commentsAdded;
    }

    public void setCommentsAdded(int commentsAdded) {
        this.commentsAdded = commentsAdded;
    }

    public int getMitigations() {
        return mitigations;
    }

    public void setMitigations(int mitigations) {
        this.mitigations = mitigations;
    }

    public int getTotalSignoffs() {
        return totalSignoffs;
    }

    public void setTotalSignoffs(int totalSignoffs) {
        this.totalSignoffs = totalSignoffs;
    }

    public int getTotalErrors() {
        return totalErrors;
    }

    public void setTotalErrors(int totalErrors) {
        this.totalErrors = totalErrors;
    }

    public int getTotalTickets() {
        return totalTickets;
    }

    public void setTotalTickets(int totalTickets) {
        this.totalTickets = totalTickets;
    }

    public long getAvgDurationMs() {
        return avgDurationMs;
    }

    public void setAvgDurationMs(long avgDurationMs) {
        this.avgDurationMs = avgDurationMs;
    }
}
