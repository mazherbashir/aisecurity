package com.crs_reivew_api.statistics.dto;

public class SchedulerStatusDTO {

    private String state; // IDLE, POLLING, PROCESSING
    private String currentTicket;
    private String currentRitm;
    private String lastRunTime;
    private long lastRunDurationMs;
    private long nextRunInSeconds;
    private long pollDelayMs;
    private boolean schedulerEnabled;
    private int totalProcessedToday;
    private long avgTicketDurationMs;

    public SchedulerStatusDTO() {
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getCurrentTicket() {
        return currentTicket;
    }

    public void setCurrentTicket(String currentTicket) {
        this.currentTicket = currentTicket;
    }

    public String getCurrentRitm() {
        return currentRitm;
    }

    public void setCurrentRitm(String currentRitm) {
        this.currentRitm = currentRitm;
    }

    public String getLastRunTime() {
        return lastRunTime;
    }

    public void setLastRunTime(String lastRunTime) {
        this.lastRunTime = lastRunTime;
    }

    public long getLastRunDurationMs() {
        return lastRunDurationMs;
    }

    public void setLastRunDurationMs(long lastRunDurationMs) {
        this.lastRunDurationMs = lastRunDurationMs;
    }

    public long getNextRunInSeconds() {
        return nextRunInSeconds;
    }

    public void setNextRunInSeconds(long nextRunInSeconds) {
        this.nextRunInSeconds = nextRunInSeconds;
    }

    public long getPollDelayMs() {
        return pollDelayMs;
    }

    public void setPollDelayMs(long pollDelayMs) {
        this.pollDelayMs = pollDelayMs;
    }

    public boolean isSchedulerEnabled() {
        return schedulerEnabled;
    }

    public void setSchedulerEnabled(boolean schedulerEnabled) {
        this.schedulerEnabled = schedulerEnabled;
    }

    public int getTotalProcessedToday() {
        return totalProcessedToday;
    }

    public void setTotalProcessedToday(int totalProcessedToday) {
        this.totalProcessedToday = totalProcessedToday;
    }

    public long getAvgTicketDurationMs() {
        return avgTicketDurationMs;
    }

    public void setAvgTicketDurationMs(long avgTicketDurationMs) {
        this.avgTicketDurationMs = avgTicketDurationMs;
    }
}
