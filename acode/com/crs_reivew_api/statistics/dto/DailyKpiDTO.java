package com.crs_reivew_api.statistics.dto;

public class DailyKpiDTO {

    private String statDate;
    private int totalSignoffsToday;
    private int cleanScanSignoffsToday;
    private int signoffsWithCommentsToday;
    private int mitigationTicketsToday;
    private int errorsScanNotFound;
    private int errorsProfileNotFound;
    private int errorsRescanRequired;
    private int errorsOther;
    private int totalErrorsToday;
    private int totalTicketsToday;
    private long avgDurationMs;
    private String lastUpdated;

    private PeriodKpiDTO today;
    private PeriodKpiDTO thisWeek;
    private PeriodKpiDTO thisMonth;

    public DailyKpiDTO() {
    }

    public String getStatDate() {
        return statDate;
    }

    public void setStatDate(String statDate) {
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

    public int getTotalErrorsToday() {
        return totalErrorsToday;
    }

    public void setTotalErrorsToday(int totalErrorsToday) {
        this.totalErrorsToday = totalErrorsToday;
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

    public String getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(String lastUpdated) {
        this.lastUpdated = lastUpdated;
    }

    public PeriodKpiDTO getToday() {
        return today;
    }

    public void setToday(PeriodKpiDTO today) {
        this.today = today;
    }

    public PeriodKpiDTO getThisWeek() {
        return thisWeek;
    }

    public void setThisWeek(PeriodKpiDTO thisWeek) {
        this.thisWeek = thisWeek;
    }

    public PeriodKpiDTO getThisMonth() {
        return thisMonth;
    }

    public void setThisMonth(PeriodKpiDTO thisMonth) {
        this.thisMonth = thisMonth;
    }
}
