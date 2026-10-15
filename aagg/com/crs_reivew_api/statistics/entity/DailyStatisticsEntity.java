package com.crs_reivew_api.statistics.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Daily rollup statistics table providing instant O(1) performance and metric counters.
 */
@Entity
@Table(name = "daily_statistics")
public class DailyStatisticsEntity {

    @Id
    @Column(name = "stat_date", nullable = false)
    private LocalDate statDate;

    @Column(name = "total_signoffs_today", nullable = false)
    private int totalSignoffsToday = 0;

    @Column(name = "clean_scan_signoffs_today", nullable = false)
    private int cleanScanSignoffsToday = 0;

    @Column(name = "signoffs_with_comments_today", nullable = false)
    private int signoffsWithCommentsToday = 0;

    @Column(name = "mitigation_tickets_today", nullable = false)
    private int mitigationTicketsToday = 0;

    @Column(name = "errors_scan_not_found", nullable = false)
    private int errorsScanNotFound = 0;

    @Column(name = "errors_profile_not_found", nullable = false)
    private int errorsProfileNotFound = 0;

    @Column(name = "errors_rescan_required", nullable = false)
    private int errorsRescanRequired = 0;

    @Column(name = "errors_other", nullable = false)
    private int errorsOther = 0;

    @Column(name = "total_tickets_today", nullable = false)
    private int totalTicketsToday = 0;

    @Column(name = "avg_duration_ms", nullable = false)
    private long avgDurationMs = 0L;

    @Column(name = "total_duration_sum_ms", nullable = false)
    private long totalDurationSumMs = 0L;

    @Column(name = "last_updated", nullable = false)
    private LocalDateTime lastUpdated;

    public DailyStatisticsEntity() {
        this.statDate = LocalDate.now();
        this.lastUpdated = LocalDateTime.now();
    }

    public DailyStatisticsEntity(LocalDate statDate) {
        this.statDate = statDate;
        this.lastUpdated = LocalDateTime.now();
    }

    public LocalDate getStatDate() {
        return statDate;
    }

    public void setStatDate(LocalDate statDate) {
        this.statDate = statDate;
    }

    public int getTotalSignoffsToday() {
        return totalSignoffsToday;
    }

    public void setTotalSignoffsToday(int totalSignoffsToday) {
        this.totalSignoffsToday = totalSignoffsToday;
    }

    public int getCleanScanSignoffsToday() {
        return cleanScanSignoffsToday;
    }

    public void setCleanScanSignoffsToday(int cleanScanSignoffsToday) {
        this.cleanScanSignoffsToday = cleanScanSignoffsToday;
    }

    public int getSignoffsWithCommentsToday() {
        return signoffsWithCommentsToday;
    }

    public void setSignoffsWithCommentsToday(int signoffsWithCommentsToday) {
        this.signoffsWithCommentsToday = signoffsWithCommentsToday;
    }

    public int getMitigationTicketsToday() {
        return mitigationTicketsToday;
    }

    public void setMitigationTicketsToday(int mitigationTicketsToday) {
        this.mitigationTicketsToday = mitigationTicketsToday;
    }

    public int getErrorsScanNotFound() {
        return errorsScanNotFound;
    }

    public void setErrorsScanNotFound(int errorsScanNotFound) {
        this.errorsScanNotFound = errorsScanNotFound;
    }

    public int getErrorsProfileNotFound() {
        return errorsProfileNotFound;
    }

    public void setErrorsProfileNotFound(int errorsProfileNotFound) {
        this.errorsProfileNotFound = errorsProfileNotFound;
    }

    public int getErrorsRescanRequired() {
        return errorsRescanRequired;
    }

    public void setErrorsRescanRequired(int errorsRescanRequired) {
        this.errorsRescanRequired = errorsRescanRequired;
    }

    public int getErrorsOther() {
        return errorsOther;
    }

    public void setErrorsOther(int errorsOther) {
        this.errorsOther = errorsOther;
    }

    public int getTotalTicketsToday() {
        return totalTicketsToday;
    }

    public void setTotalTicketsToday(int totalTicketsToday) {
        this.totalTicketsToday = totalTicketsToday;
    }

    public long getAvgDurationMs() {
        return avgDurationMs;
    }

    public void setAvgDurationMs(long avgDurationMs) {
        this.avgDurationMs = avgDurationMs;
    }

    public long getTotalDurationSumMs() {
        return totalDurationSumMs;
    }

    public void setTotalDurationSumMs(long totalDurationSumMs) {
        this.totalDurationSumMs = totalDurationSumMs;
    }

    public LocalDateTime getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(LocalDateTime lastUpdated) {
        this.lastUpdated = lastUpdated;
    }
}
