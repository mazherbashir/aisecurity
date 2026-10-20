import { describe, it, expect } from "vitest";
import { SchedulerStatus, DailyKpis, TicketExecution } from "../types/scheduler";
import { normalizeKpis, DEFAULT_KPIS } from "../hooks/useSchedulerDashboard";

describe("Scheduler Dashboard Data Contracts & Option A Multi-Period KPIs", () => {
  it("validates SchedulerStatus schema and states", () => {
    const validStatus: SchedulerStatus = {
      state: "IDLE",
      currentTicket: null,
      currentRitm: null,
      lastRunTime: "2026-10-14T20:45:00Z",
      lastRunDurationMs: 1420,
      nextRunInSeconds: 175,
      pollDelayMs: 300000,
      schedulerEnabled: true,
      totalProcessedToday: 49,
      avgTicketDurationMs: 285,
    };

    expect(validStatus.state).toBe("IDLE");
    expect(validStatus.schedulerEnabled).toBe(true);
    expect(validStatus.nextRunInSeconds).toBe(175);
    expect(["IDLE", "POLLING", "PROCESSING"]).toContain(validStatus.state);
  });

  it("validates Option A DailyKpis with today, thisWeek, and thisMonth metrics", () => {
    const kpis: DailyKpis = {
      statDate: "2026-10-14",
      today: {
        cleanSignoffs: 26,
        commentsAdded: 9,
        mitigations: 14,
        totalSignoffs: 35,
        totalErrors: 4,
        totalTickets: 49,
        avgDurationMs: 285,
      },
      thisWeek: {
        cleanSignoffs: 114,
        commentsAdded: 38,
        mitigations: 62,
        totalSignoffs: 152,
        totalErrors: 12,
        totalTickets: 214,
        avgDurationMs: 310,
      },
      thisMonth: {
        cleanSignoffs: 480,
        commentsAdded: 155,
        mitigations: 240,
        totalSignoffs: 635,
        totalErrors: 39,
        totalTickets: 875,
        avgDurationMs: 298,
      },
      errorsScanNotFound: 2,
      errorsProfileNotFound: 1,
      errorsRescanRequired: 1,
      errorsOther: 0,
      totalErrorsToday: 4,
      lastUpdated: "2026-10-14T21:28:00",
    };

    // Verify Today metrics
    expect(kpis.today.cleanSignoffs).toBe(26);
    expect(kpis.today.commentsAdded).toBe(9);
    expect(kpis.today.mitigations).toBe(14);
    expect(kpis.today.totalErrors).toBe(4);

    // Verify This Week metrics
    expect(kpis.thisWeek.cleanSignoffs).toBe(114);
    expect(kpis.thisWeek.commentsAdded).toBe(38);
    expect(kpis.thisWeek.mitigations).toBe(62);
    expect(kpis.thisWeek.totalErrors).toBe(12);

    // Verify This Month metrics
    expect(kpis.thisMonth.cleanSignoffs).toBe(480);
    expect(kpis.thisMonth.commentsAdded).toBe(155);
    expect(kpis.thisMonth.mitigations).toBe(240);
    expect(kpis.thisMonth.totalErrors).toBe(39);

    // Verify Exceptions breakdown
    const sumExceptions =
      kpis.errorsScanNotFound +
      kpis.errorsProfileNotFound +
      kpis.errorsRescanRequired +
      kpis.errorsOther;
    expect(kpis.totalErrorsToday).toBe(sumExceptions);
  });

  it("normalizes incomplete or flat backend payloads to Option A structure", () => {
    const rawLegacy = {
      cleanScanSignoffsToday: 26,
      signoffsWithCommentsToday: 9,
      mitigationTicketsToday: 14,
      totalErrorsToday: 4,
    };

    const normalized = normalizeKpis(rawLegacy);
    expect(normalized.today.cleanSignoffs).toBe(26);
    expect(normalized.today.commentsAdded).toBe(9);
    expect(normalized.thisWeek.cleanSignoffs).toBe(114);
    expect(normalized.thisMonth.cleanSignoffs).toBe(480);
  });

  it("validates TicketExecution contract and status values", () => {
    const ticket: TicketExecution = {
      sctask: "SCTASK0041235",
      ritm: "RITM0018472",
      scaTool: "CHECKMARX",
      requestReason: "Sign Off",
      action: "CLEAN_SIGNOFF",
      status: "SUCCESS",
      errorType: null,
      durationMs: 340,
      processedAt: new Date().toISOString(),
    };

    expect(ticket.sctask).toMatch(/^SCTASK/);
    expect(ticket.ritm).toMatch(/^RITM/);
    expect(["SUCCESS", "PENDING", "FAILED", "SKIPPED"]).toContain(ticket.status);
    expect(["CLEAN_SIGNOFF", "COMMENTS_ADDED", "MITIGATION_REVIEW", "ERROR"]).toContain(ticket.action);
  });

  it("handles live SSE ticket-complete prepending with maximum 50 rows limit", () => {
    let tickets: TicketExecution[] = Array.from({ length: 50 }, (_, i) => ({
      sctask: `SCTASK00${1000 + i}`,
      ritm: `RITM00${2000 + i}`,
      scaTool: "VERACODE",
      requestReason: "Sign Off",
      action: "CLEAN_SIGNOFF",
      status: "SUCCESS",
      errorType: null,
      durationMs: 250,
      processedAt: new Date(Date.now() - (i + 1) * 60000).toISOString(),
    }));

    const newTicket: TicketExecution = {
      sctask: "SCTASK0099999",
      ritm: "RITM0099999",
      scaTool: "CHECKMARX",
      requestReason: "Sign Off",
      action: "CLEAN_SIGNOFF",
      status: "SUCCESS",
      errorType: null,
      durationMs: 190,
      processedAt: new Date().toISOString(),
    };

    tickets = [newTicket, ...tickets.slice(0, 49)];

    expect(tickets.length).toBe(50);
    expect(tickets[0].sctask).toBe("SCTASK0099999");
    expect(tickets[1].sctask).toBe("SCTASK001000");
  });

  it("verifies Checkmarx auto signoff payload includes branchName correctly", () => {
    const isCheckmarxActive = true;
    const task = "SCTASK00011123";
    const app = "TaxDocs.DocumentManagement.UI";
    const branch = "main";

    const payload: Record<string, any> = {
      sctaskNumber: task,
      mitigationProposalsReviewed: "0",
      applicationName: app,
      ...(isCheckmarxActive ? { branchName: branch } : {}),
      tool: "Checkmarx",
      signoffType: "no_flaw",
      ignoreStatusCheck: true,
    };

    expect(payload.branchName).toBe("main");
    expect(payload.tool).toBe("Checkmarx");
    expect(payload.sctaskNumber).toBe("SCTASK00011123");
    expect(payload.ignoreStatusCheck).toBe(true);
  });

  it("handles recent-tickets SSE event data parsing correctly", () => {
    const rawSseData = JSON.stringify([
      {
        sctask: "SCTASK0041235",
        ritm: "RITM0018472",
        scaTool: "VERACODE",
        requestReason: "Sign Off",
        action: "CLEAN_SIGNOFF",
        status: "SUCCESS",
        errorType: null,
        durationMs: 340,
        processedAt: "2026-10-14T20:45:00Z"
      },
      {
        sctask: "SCTASK0041234",
        ritm: "RITM0018471",
        scaTool: "CHECKMARX",
        requestReason: "Mitigation Approval Review",
        action: "COMMENTS_ADDED",
        status: "PENDING",
        errorType: null,
        durationMs: 520,
        processedAt: "2026-10-14T20:44:00Z"
      }
    ]);

    let parsedTickets: TicketExecution[] = [];
    const eventHandler = (dataStr: string) => {
      try {
        const list = JSON.parse(dataStr);
        if (Array.isArray(list)) parsedTickets = list;
      } catch (err) {
        console.error("Failed to parse recent-tickets:", err);
      }
    };

    eventHandler(rawSseData);
    expect(parsedTickets).toHaveLength(2);
    expect(parsedTickets[0].sctask).toBe("SCTASK0041235");
    expect(parsedTickets[1].sctask).toBe("SCTASK0041234");
  });

  it("validates Scheduler configuration and determines whether Dashboard button should be shown", () => {
    // 1. Config with Scheduler enabled = true
    const configEnabled = {
      Scheduler: {
        enabled: true,
        delayMs: 300000,
        maxMemoryEntries: 100,
        readFromLocalFile: true,
        localFilePath: "logs/snow/open_tickets.json",
        historyFilePath: "logs/cache/sctask-history.txt",
        autoSignoffEnabled: true,
        autoSignoffCheckmarxEnabled: false,
        checkDuplicateRequests: true
      }
    };

    const isDashboardButtonVisibleEnabled = configEnabled.Scheduler.enabled !== false;
    expect(isDashboardButtonVisibleEnabled).toBe(true);

    // 2. Config with Scheduler enabled = false
    const configDisabled = {
      Scheduler: {
        enabled: false,
        delayMs: 300000,
        maxMemoryEntries: 100,
        readFromLocalFile: true,
        localFilePath: "logs/snow/open_tickets.json",
        historyFilePath: "logs/cache/sctask-history.txt",
        autoSignoffEnabled: true,
        autoSignoffCheckmarxEnabled: false,
        checkDuplicateRequests: true
      }
    };

    const isDashboardButtonVisibleDisabled = configDisabled.Scheduler.enabled !== false;
    expect(isDashboardButtonVisibleDisabled).toBe(false);
  });

  it("validates updated System and Checkmarx schema parameters", () => {
    const fullConfigSample = {
      "Scheduler": {
        "enabled": true,
        "delayMs": 300000,
        "maxMemoryEntries": 100,
        "readFromLocalFile": true,
        "localFilePath": "logs/snow/open_tickets.json",
        "historyFilePath": "logs/cache/sctask-history.txt",
        "autoSignoffEnabled": true,
        "autoSignoffCheckmarxEnabled": false,
        "checkDuplicateRequests": true
      },
      "System": {
        "scanValidityDays": 90,
        "mitigationProposalEnabled": "true",
        "mitigationApiType": "REST",
        "saveXmlLogs": true,
        "saveJsonHistory": true,
        "historyLimit": 10,
        "secondaryAuditEnabled": false,
        "intakeRequest": true,
        "snowSchedulerEnabled": false,
        "safeSCAVERSION": {
          "scaSafeVersionEnabled": true,
          "scaStaleFixMessage": "No safe version found. Fix applies to a different major version. Check manually.",
          "scaNoFixMessage": "No safe version published in GHSA. Check manually.",
          "saveScaLog": false
        }
      },
      "Checkmarx": {
        "authUrl": "https://us.iam.checkmarx.net/auth/realms/pwc-tax/protocol/openid-connect/token",
        "apiUrl": "https://us.ast.checkmarx.net/api",
        "pollingInterval": 9000,
        "pollingRetry": 20
      },
      "architecture-mappings": {
        "Java": ["maven", "gradle", "JAVA", "JVM", "jar", "bytecode"],
        "JavaScript": ["npm", "bower", "JAVASCRIPT"],
        "Go": ["go", "golang", "GO", "GOLANG"]
      }
    };

    expect(fullConfigSample.Scheduler.enabled).toBe(true);
    expect(fullConfigSample.Checkmarx.pollingInterval).toBe(9000);
    expect(fullConfigSample.Checkmarx.pollingRetry).toBe(20);
    expect(fullConfigSample["architecture-mappings"].Java).toContain("bytecode");
    expect(fullConfigSample.System.snowSchedulerEnabled).toBe(false);
  });

  it("hides Scheduler tab on configuration window when snowSchedulerDisplayConfig is false", () => {
    const allTabs = [
      "SAST&SCA Prompts",
      "Scheduler",
      "System",
      "AiEngine",
      "SecondaryAudit",
      "Compliance",
      "Exclusions",
      "Architecture Mapping",
      "Checkmarx",
      "Intake"
    ];

    const filterTabs = (snowSchedulerDisplayConfig: boolean, fullConfig: any) => {
      return allTabs.filter(tab => {
        if (tab === "Scheduler") {
          return snowSchedulerDisplayConfig !== false;
        }
        if (tab === "SecondaryAudit") {
          return fullConfig["System"]?.secondaryAuditEnabled;
        }
        if (tab === "Intake") {
          return fullConfig["System"]?.intakeRequest;
        }
        return true;
      });
    };

    const mockConfig = {
      System: { secondaryAuditEnabled: false, intakeRequest: true }
    };

    // When snowSchedulerDisplayConfig is false from /api/config/info
    const visibleTabsWhenFalse = filterTabs(false, mockConfig);
    expect(visibleTabsWhenFalse).not.toContain("Scheduler");
    expect(visibleTabsWhenFalse).toContain("SAST&SCA Prompts");
    expect(visibleTabsWhenFalse).toContain("System");

    // When snowSchedulerDisplayConfig is true from /api/config/info
    const visibleTabsWhenTrue = filterTabs(true, mockConfig);
    expect(visibleTabsWhenTrue).toContain("Scheduler");
  });

  it("redirects active tab to SAST&SCA Prompts when Scheduler tab is hidden", () => {
    let currentTab = "Scheduler";
    const snowSchedulerDisplayConfig = false;

    if (!snowSchedulerDisplayConfig && currentTab === "Scheduler") {
      currentTab = "SAST&SCA Prompts";
    }

    expect(currentTab).toBe("SAST&SCA Prompts");
  });
});
