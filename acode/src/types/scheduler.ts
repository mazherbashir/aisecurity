// 1. Live Scheduler Health & Countdown
export interface SchedulerStatus {
  state: 'IDLE' | 'POLLING' | 'PROCESSING'; // Current worker status
  currentTicket: string | null;            // e.g. "SCTASK0041235" (null if idle)
  currentRitm: string | null;              // e.g. "RITM0018472"
  lastRunTime: string | null;              // ISO String: "2026-10-14T20:45:00"
  lastRunDurationMs: number;               // Milliseconds taken by the last cycle
  nextRunInSeconds: number;                // Live countdown to next run (e.g. 175)
  pollDelayMs: number;                     // Polling interval (e.g. 300000 = 5 min)
  schedulerEnabled: boolean;               // Master toggle in config
  totalProcessedToday: number;             // Total tickets evaluated today
  avgTicketDurationMs: number;             // Overall average processing time
}

// 2. High-Impact Daily KPIs with Today, This Week, and This Month (Option A)
export interface PeriodKpi {
  cleanSignoffs: number;
  commentsAdded: number;
  mitigations: number;
  totalSignoffs: number;
  totalErrors: number;
  totalTickets: number;
  avgDurationMs: number;
}

export interface DailyKpis {
  statDate: string;
  today: PeriodKpi;
  thisWeek: PeriodKpi;
  thisMonth: PeriodKpi;

  // Breakdown for the Exception Card
  errorsScanNotFound: number;
  errorsProfileNotFound: number;
  errorsRescanRequired: number;
  errorsOther: number;
  totalErrorsToday: number;
  lastUpdated: string;

  // Compatibility helpers
  totalSignoffsToday?: number;
  cleanScanSignoffsToday?: number;
  signoffsWithCommentsToday?: number;
  mitigationTicketsToday?: number;
  totalTicketsToday?: number;
  avgDurationMs?: number;
}

// 3. Individual Ticket Execution Event
export interface TicketExecution {
  id?: number;
  sctask: string;                          // "SCTASK0041235"
  ritm: string;                            // "RITM0018472"
  scaTool: 'VERACODE' | 'CHECKMARX' | string;
  requestReason: string;                   // "Sign Off", "Mitigation Approval Review", etc.
  action: 'CLEAN_SIGNOFF' | 'COMMENTS_ADDED' | 'MITIGATION_REVIEW' | 'ERROR';
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'SKIPPED';
  errorType: 'SCAN_NOT_FOUND' | 'PROFILE_NOT_FOUND' | 'RESCAN_REQUIRED' | null;
  durationMs: number;                      // Time taken to process this ticket (ms)
  processedAt: string;                     // ISO timestamp: "2026-10-14T20:45:25"
}
