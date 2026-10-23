import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Search,
  Filter,
  Clock,
  Zap,
  Server,
  Layers,
  Shield,
  FileText,
  AlertCircle,
  HelpCircle,
  X,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSchedulerDashboard } from '../hooks/useSchedulerDashboard';
import { TicketExecution } from '../types/scheduler';
import {
  formatDurationInMinutes,
  formatTicketSpeed,
  formatCountdown,
  formatTimestamp,
} from '../lib/schedulerUtils';

interface SchedulerDashboardScreenProps {
  onClose: () => void;
}

export const SchedulerDashboardScreen: React.FC<SchedulerDashboardScreenProps> = ({ onClose }) => {
  const {
    status,
    kpis,
    tickets,
    isConnected,
    error,
    refetch,
  } = useSchedulerDashboard();

  const [searchTerm, setSearchTerm] = useState('');
  const [toolFilter, setToolFilter] = useState<'ALL' | 'VERACODE' | 'CHECKMARX'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'PENDING' | 'FAILED' | 'SKIPPED'>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | 'CLEAN_SIGNOFF' | 'COMMENTS_ADDED' | 'MITIGATION_REVIEW' | 'ERROR'>('ALL');

  // Calculate Last Run Cycle duration in minutes with seconds subtext
  const lastRunCycle = useMemo(() => {
    return formatDurationInMinutes(status?.lastRunDurationMs ?? 1420, false);
  }, [status?.lastRunDurationMs]);

  // Calculate Processing Speed per ticket in minutes with seconds subtext
  const processingSpeed = useMemo(() => {
    const rawMs = status?.avgTicketDurationMs ?? kpis?.today?.avgDurationMs ?? 285;
    return formatDurationInMinutes(rawMs, true);
  }, [status?.avgTicketDurationMs, kpis?.today?.avgDurationMs]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const q = searchTerm.trim().toLowerCase();
      if (q) {
        const matchTask = t.sctask?.toLowerCase().includes(q);
        const matchRitm = t.ritm?.toLowerCase().includes(q);
        const matchReason = t.requestReason?.toLowerCase().includes(q);
        const matchAction = t.action?.toLowerCase().includes(q);
        const matchTool = t.scaTool?.toLowerCase().includes(q);
        if (!matchTask && !matchRitm && !matchReason && !matchAction && !matchTool) {
          return false;
        }
      }

      if (toolFilter !== 'ALL') {
        if (t.scaTool?.toUpperCase() !== toolFilter) return false;
      }

      if (statusFilter !== 'ALL') {
        if (t.status?.toUpperCase() !== statusFilter) return false;
      }

      if (actionFilter !== 'ALL') {
        if (t.action?.toUpperCase() !== actionFilter) return false;
      }

      return true;
    });
  }, [tickets, searchTerm, toolFilter, statusFilter, actionFilter]);

  // State styling helper
  const stateColor = (state: string | undefined) => {
    switch (state) {
      case 'POLLING':
        return {
          bg: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
          dot: 'bg-sky-400',
          label: 'POLLING',
        };
      case 'PROCESSING':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          dot: 'bg-amber-400 animate-spin',
          label: 'PROCESSING',
        };
      case 'IDLE':
      default:
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-400',
          label: 'IDLE',
        };
    }
  };

  const statusStyle = stateColor(status?.state);

  return (
    <div className="col-span-12 flex flex-col gap-5 min-h-0 min-w-0 h-full overflow-y-auto pr-1.5 pb-10">
      {/* 1. TOP HEADER & WORKER HEALTH BANNER */}
      <div className="bento-card p-5 bg-slate-900 border-slate-800 flex flex-col gap-4 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-xl text-slate-200 hover:text-white transition-all active:scale-95 shadow-md flex items-center gap-2 shrink-0 cursor-pointer text-xs font-bold"
              title="Return to Security Findings"
              aria-label="Back to Security Findings"
            >
              <ArrowLeft size={15} />
              <span>Back to Scanner</span>
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  <Activity size={18} />
                </div>
                <h1 className="text-base font-black uppercase tracking-[0.2em] text-slate-100 flex items-center gap-2">
                  CRS Scheduler Live Dashboard
                  <span className="text-[10px] font-mono tracking-normal text-slate-500 font-normal px-2 py-0.5 bg-slate-950 rounded border border-slate-800">
                    Spring Boot Real-Time Feed
                  </span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Automated ServiceNow task evaluation, zero-touch sign-offs, and live SSE event stream
              </p>
            </div>
          </div>

          {/* Status Indicators & Countdown */}
          <div className="flex items-center flex-wrap gap-3">
            {/* Connection Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px]">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                    : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                }`}
              />
              <span className={isConnected ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {isConnected ? 'LIVE STREAM CONNECTED' : 'STREAM RECONNECTING...'}
              </span>
            </div>

            {/* Next Run Countdown */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px]">
              <Clock size={13} className="text-sky-400 shrink-0" />
              <span className="text-slate-500 uppercase font-bold text-[10px]">NEXT RUN:</span>
              <span className="text-sky-300 font-black tracking-wider">
                {formatCountdown(status?.nextRunInSeconds)}
              </span>
              <span className="text-slate-600 text-[9px]">
                ({status?.nextRunInSeconds ?? 0}s)
              </span>
            </div>

            {/* Reload button */}
            <button
              onClick={() => refetch()}
              className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg transition-all active:scale-95 cursor-pointer"
              title="Refresh tickets from backend"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Worker State Grid Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Worker State */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              WORKER STATE
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-black border ${statusStyle.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                {status?.state || 'IDLE'}
              </span>
            </div>
          </div>

          {/* Active Ticket */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              ACTIVE TICKET
            </span>
            <span className="mt-1 font-mono text-xs font-bold text-slate-200 truncate">
              {status?.currentTicket ? (
                <a
                  href={`https://pwcnetwork.service-now.com/nav_to.do?uri=sc_task.do?sysparm_query=number=${status.currentTicket}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline inline-flex items-center gap-1"
                >
                  {status.currentTicket}
                  <ExternalLink size={10} />
                </a>
              ) : (
                <span className="text-slate-500">None (Idle)</span>
              )}
            </span>
          </div>

          {/* Active RITM */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              ACTIVE RITM
            </span>
            <span className="mt-1 font-mono text-xs font-bold text-slate-200 truncate">
              {status?.currentRitm ? (
                <a
                  href={`https://pwcnetwork.service-now.com/sc_req_item.do?sysparm_query=number=${status.currentRitm}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  {status.currentRitm}
                  <ExternalLink size={10} />
                </a>
              ) : (
                <span className="text-slate-500">None</span>
              )}
            </span>
          </div>

          {/* Last Run Duration (Calculated in Minutes) */}
          <div
            className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col justify-between"
            title={`Raw: ${(status?.lastRunDurationMs ?? 1420).toLocaleString()} ms (${((status?.lastRunDurationMs ?? 1420) / 60000).toFixed(4)} min)`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                LAST RUN CYCLE
              </span>
              <span className="text-[8px] font-mono text-emerald-400/80 font-bold uppercase tracking-wider">
                MIN
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-bold text-emerald-400">
                {lastRunCycle.minutesValue}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                ({lastRunCycle.subtext})
              </span>
            </div>
          </div>

          {/* Speed / Ticket (Calculated in Minutes) */}
          <div
            className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col justify-between"
            title={`Raw: ${(status?.avgTicketDurationMs ?? kpis?.today?.avgDurationMs ?? 285).toLocaleString()} ms/ticket (${((status?.avgTicketDurationMs ?? kpis?.today?.avgDurationMs ?? 285) / 60000).toFixed(4)} min/ticket)`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                PROCESSING SPEED
              </span>
              <span className="text-[8px] font-mono text-purple-400/80 font-bold uppercase tracking-wider">
                MIN
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-bold text-purple-400">
                {processingSpeed.minutesValue}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                ({processingSpeed.subtext})
              </span>
            </div>
          </div>

          {/* Scheduler Master Toggle */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col justify-between">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              SCHEDULER STATUS
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={13} />
                {status?.schedulerEnabled ?? true ? 'ACTIVE (5m poll)' : 'DISABLED'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TODAY, THIS WEEK & THIS MONTH KPI CARDS (OPTION A) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Clean Sign-Offs */}
        <div className="bento-card p-5 bg-gradient-to-br from-slate-900 to-emerald-950/30 border-emerald-500/25 shadow-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-emerald-500/15 group-hover:text-emerald-500/25 transition-colors pointer-events-none">
            <CheckCircle2 size={64} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-wider">
              <CheckCircle2 size={16} />
              <span>Clean Sign-Offs</span>
            </div>
            {/* Main Number: Today */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-100 font-mono tracking-tight">
                {kpis.today.cleanSignoffs}
              </span>
              <span className="text-xs text-emerald-400 font-bold">tickets</span>
            </div>
            {/* Sleek Sub-Pills: Today, This Week, This Month */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 border border-emerald-500/35 text-emerald-300">
                Today: {kpis.today.cleanSignoffs}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300">
                This Week: {kpis.thisWeek.cleanSignoffs}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-400">
                This Month: {kpis.thisMonth.cleanSignoffs}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-500/15 flex items-center justify-between text-[11px] text-slate-400">
            <span>0 Open Flaws Found</span>
            <span className="text-emerald-400 font-semibold font-mono">CLOSED COMPLETE</span>
          </div>
        </div>

        {/* Card 2: Comments Added */}
        <div className="bento-card p-5 bg-gradient-to-br from-slate-900 to-sky-950/30 border-sky-500/25 shadow-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-sky-500/15 group-hover:text-sky-500/25 transition-colors pointer-events-none">
            <FileText size={64} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sky-400 text-xs font-black uppercase tracking-wider">
              <FileText size={16} />
              <span>Comments Added</span>
            </div>
            {/* Main Number: Today */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-100 font-mono tracking-tight">
                {kpis.today.commentsAdded}
              </span>
              <span className="text-xs text-sky-400 font-bold">tickets</span>
            </div>
            {/* Sleek Sub-Pills: Today, This Week, This Month */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-500/20 border border-sky-500/35 text-sky-300">
                Today: {kpis.today.commentsAdded}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300">
                This Week: {kpis.thisWeek.commentsAdded}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-400">
                This Month: {kpis.thisMonth.commentsAdded}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-sky-500/15 flex items-center justify-between text-[11px] text-slate-400">
            <span>Customer Review Note Added</span>
            <span className="text-sky-400 font-semibold font-mono">MOVED TO PENDING</span>
          </div>
        </div>

        {/* Card 3: Mitigations Reviewed */}
        <div className="bento-card p-5 bg-gradient-to-br from-slate-900 to-indigo-950/30 border-indigo-500/25 shadow-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-indigo-500/15 group-hover:text-indigo-500/25 transition-colors pointer-events-none">
            <Shield size={64} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-wider">
              <Shield size={16} />
              <span>Mitigations Reviewed</span>
            </div>
            {/* Main Number: Today */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-100 font-mono tracking-tight">
                {kpis.today.mitigations}
              </span>
              <span className="text-xs text-indigo-400 font-bold">MAR tickets</span>
            </div>
            {/* Sleek Sub-Pills: Today, This Week, This Month */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/20 border border-indigo-500/35 text-indigo-300">
                Today: {kpis.today.mitigations}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300">
                This Week: {kpis.thisWeek.mitigations}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-400">
                This Month: {kpis.thisMonth.mitigations}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-indigo-500/15 flex items-center justify-between text-[11px] text-slate-400">
            <span>Mitigation Approval Tasks</span>
            <span className="text-indigo-400 font-semibold font-mono">AI PROCESSED</span>
          </div>
        </div>

        {/* Card 4: Total Exceptions */}
        <div className="bento-card p-5 bg-gradient-to-br from-slate-900 to-rose-950/30 border-rose-500/25 shadow-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-rose-500/15 group-hover:text-rose-500/25 transition-colors pointer-events-none">
            <AlertTriangle size={64} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-rose-400 text-xs font-black uppercase tracking-wider">
              <AlertTriangle size={16} />
              <span>Total Exceptions</span>
            </div>
            {/* Main Number: Today */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-100 font-mono tracking-tight">
                {kpis.today.totalErrors}
              </span>
              <span className="text-xs text-rose-400 font-bold">failures</span>
            </div>
            {/* Sleek Sub-Pills: Today, This Week, This Month */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/20 border border-rose-500/35 text-rose-300">
                Today: {kpis.today.totalErrors}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300">
                This Week: {kpis.thisWeek.totalErrors}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-slate-800/80 border border-slate-700/60 text-slate-400">
                This Month: {kpis.thisMonth.totalErrors}
              </span>
            </div>
          </div>
          {/* Breakdown for the Exception Card */}
          <div className="mt-3 pt-2.5 border-t border-rose-500/15 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono">
            <div className="flex items-center justify-between px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Scan:</span>
              <span className="font-bold text-rose-300">{kpis.errorsScanNotFound}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Profile:</span>
              <span className="font-bold text-amber-300">{kpis.errorsProfileNotFound}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Rescan:</span>
              <span className="font-bold text-sky-300">{kpis.errorsRescanRequired}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-400">Other:</span>
              <span className="font-bold text-slate-300">{kpis.errorsOther}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. LIVE EXECUTION FEED TABLE */}
      <div className="bento-card bg-slate-900 border-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-0 flex-1">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              LIVE EXECUTION FEED
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              {filteredTickets.length} of {tickets.length} tickets
            </span>
          </div>

          {/* Controls: Search, Filters, Reset */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative min-w-[180px] flex-1 sm:flex-initial">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search SCTASK / RITM..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700 font-mono"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Tool Filter */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-bold">
              {(['ALL', 'VERACODE', 'CHECKMARX'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setToolFilter(t)}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    toolFilter === t
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t === 'ALL' ? 'ALL TOOLS' : t}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-bold text-slate-300 uppercase tracking-wider focus:outline-none focus:border-slate-700 cursor-pointer"
            >
              <option value="ALL">ALL STATUSES</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
              <option value="SKIPPED">SKIPPED</option>
            </select>

            {/* Action Filter */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-bold text-slate-300 uppercase tracking-wider focus:outline-none focus:border-slate-700 cursor-pointer"
            >
              <option value="ALL">ALL ACTIONS</option>
              <option value="CLEAN_SIGNOFF">CLEAN SIGNOFF</option>
              <option value="COMMENTS_ADDED">COMMENTS ADDED</option>
              <option value="MITIGATION_REVIEW">MITIGATION REVIEW</option>
              <option value="ERROR">ERRORS</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto min-h-[340px] max-h-[560px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 text-slate-500 font-bold uppercase text-[9px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4">SCTASK</th>
                <th className="py-3 px-4">RITM</th>
                <th className="py-3 px-3">TOOL</th>
                <th className="py-3 px-4">REQUEST TYPE</th>
                <th className="py-3 px-4">ACTION TAKEN</th>
                <th className="py-3 px-3 text-center">STATUS</th>
                <th className="py-3 px-3 text-right">SPEED</th>
                <th className="py-3 px-4 text-right">TIMESTAMP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              <AnimatePresence initial={false}>
                {filteredTickets.map((ticket, index) => {
                  const sctaskLink = `https://pwcnetwork.service-now.com/nav_to.do?uri=sc_task.do?sysparm_query=number=${ticket.sctask}`;
                  const ritmLink = `https://pwcnetwork.service-now.com/sc_req_item.do?sysparm_query=number=${ticket.ritm}`;
                  const isCheckmarx = ticket.scaTool?.toUpperCase() === 'CHECKMARX';

                  return (
                    <motion.tr
                      key={`${ticket.sctask}-${ticket.processedAt}-${index}`}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* SCTASK */}
                      <td className="py-3 px-4 font-mono font-bold">
                        <a
                          href={sctaskLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:text-sky-300 hover:underline inline-flex items-center gap-1.5"
                          title="Open SCTASK in ServiceNow"
                        >
                          <span>{ticket.sctask}</span>
                          <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </td>

                      {/* RITM */}
                      <td className="py-3 px-4 font-mono font-bold">
                        <a
                          href={ritmLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 hover:underline inline-flex items-center gap-1.5"
                          title="Open RITM in ServiceNow"
                        >
                          <span>{ticket.ritm}</span>
                          <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </td>

                      {/* TOOL */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider font-mono border ${
                            isCheckmarx
                              ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          }`}
                        >
                          {ticket.scaTool}
                        </span>
                      </td>

                      {/* REQUEST TYPE */}
                      <td className="py-3 px-4 text-slate-300 font-medium text-[11px]">
                        {ticket.requestReason}
                      </td>

                      {/* ACTION TAKEN */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {ticket.action === 'CLEAN_SIGNOFF' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                              <CheckCircle2 size={11} />
                              CLEAN_SIGNOFF
                            </span>
                          )}
                          {ticket.action === 'COMMENTS_ADDED' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black font-mono text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded">
                              <FileText size={11} />
                              COMMENTS_ADDED
                            </span>
                          )}
                          {ticket.action === 'MITIGATION_REVIEW' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black font-mono text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded">
                              <Shield size={11} />
                              MITIGATION_REVIEW
                            </span>
                          )}
                          {ticket.action === 'ERROR' && (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black font-mono text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded">
                                <AlertTriangle size={11} />
                                {ticket.errorType || 'ERROR'}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono border ${
                            ticket.status === 'SUCCESS'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : ticket.status === 'PENDING'
                              ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                              : ticket.status === 'FAILED'
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              : 'bg-slate-700/20 border-slate-700 text-slate-400'
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </td>

                      {/* DURATION */}
                      <td
                        className="py-3 px-3 text-right font-mono text-slate-400 text-[11px]"
                        title={`Raw: ${ticket.durationMs} ms (${(ticket.durationMs / 60000).toFixed(3)} min)`}
                      >
                        {formatTicketSpeed(ticket.durationMs)}
                      </td>

                      {/* TIMESTAMP */}
                      <td className="py-3 px-4 text-right font-mono text-slate-500 text-[11px]">
                        {formatTimestamp(ticket.processedAt)}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>

              {filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono text-xs">
                    {tickets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Clock size={24} className="text-slate-600 mb-1" />
                        <span className="text-slate-400 font-bold">No tickets executed yet today</span>
                        <span className="text-slate-600 text-[10px]">
                          As the scheduler polls and processes tickets, completed executions will appear here in real time.
                        </span>
                      </div>
                    ) : (
                      <span>No tickets match the selected filters.</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
