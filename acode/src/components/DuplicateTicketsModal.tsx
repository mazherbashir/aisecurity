import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  CopyCheck,
  Loader2,
  Layers,
  User,
  Tag,
  Clock,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DuplicateTicketsResponse, DuplicateTicketItem } from '../types';

interface DuplicateTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSctask?: string;
  applicationProfileName?: string;
}

export const DuplicateTicketsModal: React.FC<DuplicateTicketsModalProps> = ({
  isOpen,
  onClose,
  initialSctask = '',
  applicationProfileName = '',
}) => {
  const [sctaskInput, setSctaskInput] = useState<string>(initialSctask || 'SCTASK30824068');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DuplicateTicketsResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sync initial SCTASK if changed
  useEffect(() => {
    if (initialSctask) {
      setSctaskInput(initialSctask);
    }
  }, [initialSctask]);

  // Handle copying with animated feedback
  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, []);

  // Fetch duplicates from backend /api/snow/duplicates
  const fetchDuplicates = useCallback(async (taskToSearch: string) => {
    const trimmed = taskToSearch.trim();
    if (!trimmed) {
      setError('Please enter a valid SCTASK number (e.g. SCTASK30824068).');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/snow/duplicates?sctask=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }
      const data: DuplicateTicketsResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to check duplicate tickets from ServiceNow.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Automatically fetch on open if we have a default task and no result yet
  useEffect(() => {
    if (isOpen && !result && !isLoading) {
      const task = sctaskInput || initialSctask || 'SCTASK30824068';
      fetchDuplicates(task);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Generate ServiceNow links
  const getRitmUrl = (ritm: string) =>
    `https://pwcnetwork.service-now.com/sc_req_item.do?sysparm_query=number=${encodeURIComponent(ritm)}`;

  const getSctaskUrl = (sctask: string) =>
    `https://pwcnetwork.service-now.com/nav_to.do?uri=sc_task.do?sysparm_query=number=${encodeURIComponent(sctask)}`;

  // Copy full duplicate summary
  const copyAllSummary = () => {
    if (!result) return;
    if (result.duplicateCount === 0) {
      handleCopy(`ServiceNow Duplicate Check for ${result.sctask}: NO DUPLICATES FOUND.`, 'all-summary');
      return;
    }

    const lines = [
      `ServiceNow Duplicate Check for ${result.sctask} (${result.applicationProfileName || applicationProfileName}):`,
      `DUPLICATE FOUND: ${result.duplicateCount} duplicate ticket(s) identified.`,
      '',
      ...result.duplicates.map(
        (d, idx) =>
          `[#${idx + 1}] SCTASK: ${d.sctask} | RITM: ${d.ritm} | State: ${d.state} | Title: ${d.title} | Owner: ${d.owner} (URL: ${getRitmUrl(d.ritm)})`
      )
    ];
    handleCopy(lines.join('\n'), 'all-summary');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-left max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <CopyCheck size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-100 flex items-center gap-2">
                Check Duplicate Tickets
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">
                  ServiceNow API
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Identify existing open or in-progress ServiceNow requests for this application
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* SCTASK Input Search Bar */}
        <div className="p-4 sm:px-6 bg-slate-950/30 border-b border-slate-800/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchDuplicates(sctaskInput);
            }}
            className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center"
          >
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={sctaskInput}
                onChange={(e) => {
                  setSctaskInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter SCTASK number (e.g. SCTASK30824068)..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500/60 uppercase placeholder:normal-case transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !sctaskInput.trim()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-slate-950" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>Check Duplicates</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Preset Chips */}
          <div className="mt-2.5 flex items-center gap-2 text-[10px] text-slate-500 font-sans">
            <span className="font-semibold uppercase tracking-wider text-slate-500">Quick Test:</span>
            <button
              type="button"
              onClick={() => {
                setSctaskInput('SCTASK30824068');
                fetchDuplicates('SCTASK30824068');
              }}
              className="px-2 py-0.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded font-mono border border-slate-700/60 cursor-pointer transition-colors"
            >
              SCTASK30824068 (2 Duplicates)
            </button>
            <button
              type="button"
              onClick={() => {
                setSctaskInput('SCTASK00000000');
                fetchDuplicates('SCTASK00000000');
              }}
              className="px-2 py-0.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded font-mono border border-slate-700/60 cursor-pointer transition-colors"
            >
              SCTASK00000000 (0 Duplicates)
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchDuplicates(sctaskInput)}
                className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={32} className="animate-spin text-amber-400" />
              <p className="text-xs font-mono">Querying ServiceNow GET /api/snow/duplicates...</p>
              <p className="text-[11px] text-slate-500">Scanning for active requests matching application profile</p>
            </div>
          )}

          {/* Results View */}
          {!isLoading && result && (
            <div className="space-y-4">
              {/* Target Ticket Overview Card */}
              <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-sans font-bold">
                      Target Task:
                    </span>
                    <a
                      href={getSctaskUrl(result.sctask)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-slate-200 hover:text-amber-300 hover:underline inline-flex items-center gap-1"
                      title="Open SCTASK in ServiceNow"
                    >
                      {result.sctask}
                      <ExternalLink size={11} className="text-slate-500" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(result.sctask, `target-${result.sctask}`)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      title="Copy Target SCTASK"
                    >
                      {copiedKey === `target-${result.sctask}` ? (
                        <Check size={11} className="text-emerald-400" />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  </div>
                  {result.applicationProfileName && (
                    <div className="text-[11px] text-slate-400 font-sans truncate">
                      <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Profile:</span>{' '}
                      <span className="font-mono text-slate-300">{result.applicationProfileName}</span>
                    </div>
                  )}
                </div>

                {/* Target RITM with link & copy */}
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-sans font-bold">
                    Target RITM:
                  </span>
                  <a
                    href={getRitmUrl(result.ritm)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-sky-400 hover:text-sky-300 hover:underline inline-flex items-center gap-1"
                    title="Open RITM in ServiceNow"
                  >
                    {result.ritm}
                    <ExternalLink size={11} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(result.ritm, `target-ritm-${result.ritm}`)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title="Copy Target RITM"
                  >
                    {copiedKey === `target-ritm-${result.ritm}` ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              {result.duplicateCount > 0 ? (
                <div className="p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-rose-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                          DUPLICATE FOUND
                        </span>
                        <span className="text-xs font-black text-amber-300">
                          {result.duplicateCount} Duplicate Request{result.duplicateCount > 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Existing ServiceNow tasks were identified for this application profile. Review before proceeding.
                      </p>
                    </div>
                  </div>

                  {/* Copy All Info Button */}
                  <button
                    type="button"
                    onClick={copyAllSummary}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0 cursor-pointer shadow-md"
                    title="Copy formatted summary of all duplicate tickets"
                  >
                    {copiedKey === 'all-summary' ? (
                      <>
                        <Check size={13} className="text-emerald-400" />
                        <span className="text-emerald-400">COPIED INFO!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copy All Details</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                        NO DUPLICATES FOUND
                      </span>
                      <span className="text-xs font-bold text-emerald-300">
                        Zero Duplicate Tickets
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      No matching open or in-progress ServiceNow tickets were found for this application.
                    </p>
                  </div>
                </div>
              )}

              {/* Duplicates List */}
              {result.duplicateCount > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider px-1">
                    <span>Identified Duplicates ({result.duplicates.length})</span>
                    <span className="text-[10px] text-slate-500 lowercase font-normal">
                      Click RITM to open or copy info
                    </span>
                  </div>

                  <div className="space-y-2">
                    {result.duplicates.map((dup, idx) => {
                      const ritmUrl = getRitmUrl(dup.ritm);
                      const sctaskUrl = getSctaskUrl(dup.sctask);
                      const rowText = `SCTASK: ${dup.sctask} | RITM: ${dup.ritm} | State: ${dup.state} | Title: ${dup.title} | Owner: ${dup.owner} | URL: ${ritmUrl}`;
                      const ritmCopyKey = `ritm-${dup.ritm}-${idx}`;
                      const sctaskCopyKey = `sctask-${dup.sctask}-${idx}`;
                      const rowCopyKey = `row-${idx}`;

                      // State badge style
                      const isWip = dup.state.toLowerCase().includes('progress');
                      const isOpenState = dup.state.toLowerCase() === 'open';

                      return (
                        <div
                          key={`${dup.sctask}-${idx}`}
                          className="p-3.5 bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-slate-700/80 rounded-xl transition-all flex flex-col gap-2.5 group"
                        >
                          {/* Top Row: SCTASK, RITM (with copy button), State */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                            <div className="flex flex-wrap items-center gap-3">
                              {/* SCTASK */}
                              <div className="flex items-center gap-1 font-mono text-xs">
                                <span className="text-slate-500 text-[10px] uppercase font-sans font-bold">TASK:</span>
                                <a
                                  href={sctaskUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-slate-200 hover:text-amber-300 hover:underline inline-flex items-center gap-1"
                                  title="Open SCTASK in ServiceNow"
                                >
                                  {dup.sctask}
                                  <ExternalLink size={10} className="text-slate-500" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(dup.sctask, sctaskCopyKey)}
                                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                  title="Copy SCTASK Number"
                                >
                                  {copiedKey === sctaskCopyKey ? (
                                    <Check size={11} className="text-emerald-400" />
                                  ) : (
                                    <Copy size={11} />
                                  )}
                                </button>
                              </div>

                              <span className="text-slate-700">|</span>

                              {/* RITM with REQUIRED COPY BUTTON BESIDE IT & GENERATED URL */}
                              <div className="flex items-center gap-1.5 font-mono text-xs bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-500/20">
                                <span className="text-sky-400 text-[10px] uppercase font-sans font-bold">RITM:</span>
                                <a
                                  href={ritmUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-sky-300 hover:text-sky-100 hover:underline inline-flex items-center gap-1"
                                  title={`Open ${dup.ritm} in ServiceNow`}
                                >
                                  {dup.ritm}
                                  <ExternalLink size={11} className="text-sky-400" />
                                </a>

                                {/* COPY BUTTON BESIDE RITM NUMBER */}
                                <button
                                  type="button"
                                  onClick={() => handleCopy(dup.ritm, ritmCopyKey)}
                                  className={`p-1 rounded transition-all cursor-pointer flex items-center gap-1 ${
                                    copiedKey === ritmCopyKey
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : 'hover:bg-slate-800 text-sky-300 hover:text-white'
                                  }`}
                                  title="Copy RITM Number"
                                  aria-label={`Copy RITM ${dup.ritm}`}
                                >
                                  {copiedKey === ritmCopyKey ? (
                                    <>
                                      <Check size={12} className="text-emerald-400" />
                                      <span className="text-[10px] font-bold">COPIED</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} />
                                      <span className="text-[10px] font-bold">COPY</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* State Badge */}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                isWip
                                  ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                                  : isOpenState
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {dup.state}
                            </span>
                          </div>

                          {/* Middle: Title & Owner */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="text-slate-200 font-medium">
                              {dup.title}
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                              <User size={12} className="text-slate-500" />
                              <span>Owner:</span>
                              <span className="font-semibold text-slate-300">
                                {dup.owner || 'Unassigned'}
                              </span>
                            </div>
                          </div>

                          {/* Bottom Action: Copy All Details for this Duplicate */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[11px] text-slate-500 font-sans">
                            <a
                              href={ritmUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-sky-300 inline-flex items-center gap-1 text-[11px]"
                            >
                              <span>Open Request in ServiceNow</span>
                              <ArrowRight size={11} />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopy(rowText, rowCopyKey)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Copy full ticket details"
                            >
                              {copiedKey === rowCopyKey ? (
                                <>
                                  <Check size={10} className="text-emerald-400" />
                                  <span className="text-emerald-400">Copied Line</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={10} />
                                  <span>Copy Line</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono">
            GET /api/snow/duplicates?sctask={sctaskInput}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
