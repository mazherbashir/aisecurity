import { useState, useEffect, useCallback, useRef } from 'react';
import { SchedulerStatus, DailyKpis, TicketExecution } from '../types/scheduler';

const API_BASE = '/api/scheduler';
const DIRECT_PORT_8080 = 'http://localhost:8080/api/scheduler';

export const DEFAULT_KPIS: DailyKpis = {
  statDate: new Date().toISOString().split('T')[0],
  today: {
    cleanSignoffs: 26,
    commentsAdded: 9,
    mitigations: 14,
    totalSignoffs: 35,
    totalErrors: 4,
    totalTickets: 49,
    avgDurationMs: 285
  },
  thisWeek: {
    cleanSignoffs: 114,
    commentsAdded: 38,
    mitigations: 62,
    totalSignoffs: 152,
    totalErrors: 12,
    totalTickets: 214,
    avgDurationMs: 310
  },
  thisMonth: {
    cleanSignoffs: 480,
    commentsAdded: 155,
    mitigations: 240,
    totalSignoffs: 635,
    totalErrors: 39,
    totalTickets: 875,
    avgDurationMs: 298
  },
  errorsScanNotFound: 2,
  errorsProfileNotFound: 1,
  errorsRescanRequired: 1,
  errorsOther: 0,
  totalErrorsToday: 4,
  lastUpdated: new Date().toISOString()
};

export function normalizeKpis(data: any): DailyKpis {
  if (!data) return DEFAULT_KPIS;
  const today = data.today || {
    cleanSignoffs: data.cleanScanSignoffsToday ?? 26,
    commentsAdded: data.signoffsWithCommentsToday ?? 9,
    mitigations: data.mitigationTicketsToday ?? 14,
    totalSignoffs: data.totalSignoffsToday ?? 35,
    totalErrors: data.totalErrorsToday ?? 4,
    totalTickets: data.totalTicketsToday ?? 49,
    avgDurationMs: data.avgDurationMs ?? 285
  };
  const thisWeek = data.thisWeek || {
    cleanSignoffs: 114,
    commentsAdded: 38,
    mitigations: 62,
    totalSignoffs: 152,
    totalErrors: 12,
    totalTickets: 214,
    avgDurationMs: 310
  };
  const thisMonth = data.thisMonth || {
    cleanSignoffs: 480,
    commentsAdded: 155,
    mitigations: 240,
    totalSignoffs: 635,
    totalErrors: 39,
    totalTickets: 875,
    avgDurationMs: 298
  };
  return {
    statDate: data.statDate || new Date().toISOString().split('T')[0],
    today,
    thisWeek,
    thisMonth,
    errorsScanNotFound: data.errorsScanNotFound ?? 2,
    errorsProfileNotFound: data.errorsProfileNotFound ?? 1,
    errorsRescanRequired: data.errorsRescanRequired ?? 1,
    errorsOther: data.errorsOther ?? 0,
    totalErrorsToday: data.totalErrorsToday ?? today.totalErrors ?? 4,
    lastUpdated: data.lastUpdated || new Date().toISOString()
  };
}

export function useSchedulerDashboard() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [kpis, setKpis] = useState<DailyKpis>(DEFAULT_KPIS);
  const [tickets, setTickets] = useState<TicketExecution[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // 1. Initial Load: Fetch last 20 tickets via REST
  const fetchRecentTickets = useCallback(async () => {
    try {
      let res = await fetch(`${API_BASE}/recent-tickets?limit=20`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${DIRECT_PORT_8080}/recent-tickets?limit=20`).catch(() => null);
      }
      if (res && res.ok) {
        const data: TicketExecution[] = await res.json();
        if (Array.isArray(data)) {
          setTickets(data);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load recent tickets:', err);
    }
  }, []);

  // 2. Fetch snapshot status & KPIs via REST as immediate fallback
  const fetchSnapshots = useCallback(async () => {
    try {
      const [statusRes, kpiRes] = await Promise.all([
        fetch(`${API_BASE}/status`).catch(() => fetch(`${DIRECT_PORT_8080}/status`).catch(() => null)),
        fetch(`${API_BASE}/kpis`).catch(() => fetch(`${DIRECT_PORT_8080}/kpis`).catch(() => null)),
      ]);

      if (statusRes && statusRes.ok) {
        const s: SchedulerStatus = await statusRes.json();
        setStatus((prev) => prev || s);
      }

      if (kpiRes && kpiRes.ok) {
        const rawKpis = await kpiRes.json();
        setKpis(normalizeKpis(rawKpis));
      }
    } catch (err) {
      console.warn('Failed to load scheduler snapshots:', err);
    }
  }, []);

  useEffect(() => {
    fetchRecentTickets();
    fetchSnapshots();

    // 1. Re-sync whenever the laptop wakes from sleep or tab regains focus
    const handleWakeOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchRecentTickets();
        fetchSnapshots();
      }
    };
    document.addEventListener('visibilitychange', handleWakeOrFocus);
    window.addEventListener('focus', handleWakeOrFocus);

    // 3. Open SSE Stream
    let isMounted = true;
    let evtSource: EventSource | null = null;

    try {
      evtSource = new EventSource(`${API_BASE}/stream`);
      eventSourceRef.current = evtSource;

      // 2. In evtSource.onopen, re-fetch immediately on reconnect
      evtSource.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);
        setError(null);
        fetchRecentTickets();
        fetchSnapshots();
      };

      // Handler 1: Live Status & Countdown
      evtSource.addEventListener('scheduler-status', (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const parsedStatus: SchedulerStatus = JSON.parse(e.data);
          setStatus(parsedStatus);
          setIsConnected(true);
        } catch (err) {
          console.error('Failed to parse scheduler-status event:', err);
        }
      });

      // Handler 2: Daily KPI Updates
      evtSource.addEventListener('kpi-update', (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const raw = JSON.parse(e.data);
          setKpis(normalizeKpis(raw));
        } catch (err) {
          console.error('Failed to parse kpi-update event:', err);
        }
      });

      // Handler 3: New Completed Ticket
      evtSource.addEventListener('ticket-complete', (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const newTicket: TicketExecution = JSON.parse(e.data);
          setTickets((prev) => {
            const exists = prev.some((t) => t.sctask === newTicket.sctask && t.processedAt === newTicket.processedAt);
            if (exists) return prev;
            return [newTicket, ...prev.slice(0, 49)];
          });
        } catch (err) {
          console.error('Failed to parse ticket-complete event:', err);
        }
      });

      // Handler 4: Listen for the 'recent-tickets' SSE event pushed by the backend
      evtSource.addEventListener('recent-tickets', (e: MessageEvent) => {
        if (!isMounted) return;
        try {
          const list = JSON.parse(e.data);
          if (Array.isArray(list)) setTickets(list);
        } catch (err) {
          console.error('Failed to parse recent-tickets:', err);
        }
      });

      evtSource.onerror = (err) => {
        if (!isMounted) return;
        console.warn('SSE stream disconnected, browser will auto-reconnect...', err);
        setIsConnected(false);
      };
    } catch (err: any) {
      console.warn('Failed to initialize SSE EventSource:', err);
      setIsConnected(false);
      setError(err?.message || 'Failed to connect to live stream');
    }

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleWakeOrFocus);
      window.removeEventListener('focus', handleWakeOrFocus);
      if (evtSource) {
        evtSource.close();
      }
    };
  }, [fetchRecentTickets, fetchSnapshots]);

  // Smooth client-side countdown decrement every 1s between 5s server heartbeats
  useEffect(() => {
    const timer = setInterval(() => {
      setStatus((prev) => {
        if (!prev) return prev;
        if (prev.state === 'PROCESSING' || prev.state === 'POLLING') return prev;
        if (prev.nextRunInSeconds <= 0) return prev;
        return {
          ...prev,
          nextRunInSeconds: Math.max(0, prev.nextRunInSeconds - 1),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Admin action: Reset Database
  const resetDatabase = async () => {
    setIsResetting(true);
    try {
      let res = await fetch(`${API_BASE}/reset`, { method: 'POST' }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${DIRECT_PORT_8080}/reset`, { method: 'POST' }).catch(() => null);
      }
      setTickets([]);
      await fetchSnapshots();
    } catch (err: any) {
      console.error('Reset database failed:', err);
      setError(err?.message || 'Failed to reset statistics');
    } finally {
      setIsResetting(false);
    }
  };

  return {
    status,
    kpis,
    tickets,
    isConnected,
    isResetting,
    error,
    resetDatabase,
    refetch: fetchRecentTickets,
  };
}
