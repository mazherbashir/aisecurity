/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import snippetsData from "./data/snippets.json";
import {
  Shield,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCcw,
  ExternalLink,
  ChevronRight,
  Database,
  Code,
  Code2,
  AlertCircle,
  Settings,
  X,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit2,
  HelpCircle,
  DollarSign,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  SastFinding,
  ScaFinding,
  AggregatedGroup,
  ToolName,
  AIProvider,
  Finding,
} from "./types";
import {
  mockSastFindings,
  mockScaFindings,
  mockOverview,
  mockSastSummary,
  mockScaSummary,
  dryRunJson,
} from "./mockData";
import { sampleReportData } from "./data";
import { getAIResponseForComment } from "./services/aiService";
import { GroupRow } from "./components/GroupRow";
import { SnowIntakeScreen } from "./components/SnowIntakeScreen";
import { CWE_BASE_URL } from "./constants";
import { getEndpoint } from "./config";
import { calculateIsScanTooOld, updateBackendSummary, updateMitigationProposal } from "./lib/state-update-utils";
import { generateReviewSummary } from "./lib/summary-logic";
import { StaticContent } from "./staticContent";

// --- Error Boundary and Debug Logger Support ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props!: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("UI Render Crash:", error, errorInfo);
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (e) {
        console.error("Failed to report error:", e);
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050608] flex items-center justify-center p-6 text-white font-sans">
          <div className="max-w-2xl w-full bento-card p-8 border-red-500/30 bg-red-500/5 space-y-6 shadow-2xl">
            <div className="flex items-center gap-4 text-red-500">
              <div className="p-3 bg-red-500/20 rounded-xl">
                <AlertCircle size={32} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">
                  System Halted
                </h2>
                <p className="text-[10px] text-red-400/60 font-mono">
                  ERROR_CORE_RECOVERY
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-black/60 rounded-xl border border-red-500/20 font-mono text-[10px] text-red-400/80 leading-relaxed overflow-auto max-h-48 whitespace-pre">
                {this.state.error?.stack || this.state.error?.message}
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl transition-all shadow-xl shadow-blue-900/40 text-xs tracking-widest uppercase flex items-center justify-center gap-2"
            >
              <RefreshCcw size={16} />
              Re-initialize Session
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function aggregateFindings(
  findings: Finding[],
  type: "SAST" | "SCA",
): AggregatedGroup[] {
  if (!findings || !Array.isArray(findings)) return [];

  const groups: Record<string, AggregatedGroup> = {};

  findings.forEach((finding) => {
    if (!finding) return;

    const cweId = finding.cweid || "N/A";
    const commentsArr = Array.isArray(finding.userComments)
      ? finding.userComments
      : [];
    const comments = commentsArr.join("\n\n");
    const title = finding.title || "Unknown Finding";
    let severity = finding.severity || "Information";

    // Normalize severity for consistency with dashboard breakdown
    if (severity === "VeryHigh" || severity === "Critical") severity = "Very High";
    if (severity === "Info") severity = "Information";

    const location = finding.location || "Unknown Location";
    const fileName = finding.fileName || "";
    const description = `${title} | ${severity} | ${fileName || location}`;

    // For SCA rely on title and id for identifier 
    let identifier: string | undefined = undefined;
    if (type === "SCA") {
      const parts: string[] = [];
      if (finding.title && finding.title !== "Unknown Product" && finding.title !== "Unknown Finding") {
        parts.push(finding.title);
      }
      if (finding.id && finding.id !== "N/A" && finding.id !== "0" && !finding.id.startsWith("sca-") && finding.id !== finding.title) {
        parts.push(finding.id);
      }
      identifier = parts.length > 0 ? parts.join(" - ") : `CWE-${cweId}`;
    }

    // Create a stable group ID - include fileName for SCA to keep files separate
    const groupId = (type === "SCA" && fileName)
      ? `${type}-${identifier || cweId}-${fileName}-${comments}`.substring(0, 500)
      : `${type}-${identifier || cweId}-${comments}`.substring(0, 500);

    if (!groups[groupId]) {
      groups[groupId] = {
        groupId,
        type,
        cweId,
        identifier,
        comments,
        description,
        records: [],
        status: undefined, // Explicitly undefined is fine
        severity,
        aiComment: "",
      };
    }
    groups[groupId].records.push({
      ...finding,
      title,
      severity,
      location,
      userComments: commentsArr,
    });
  });

  const severityOrder: Record<string, number> = {
    "Very High": 1,
    High: 2,
    Medium: 3,
    Low: 4,
    Information: 5,
    Info: 5,
  };

  const result = Object.values(groups);

  result.sort((a, b) => {
    const orderA = severityOrder[a.severity] || 99;
    const orderB = severityOrder[b.severity] || 99;
    return orderA - orderB;
  });

  return result;
}

function adaptBreakdown(breakdownObj: any): {
  "Very High": number;
  High: number;
  Medium: number;
  Low: number;
  Information: number;
} {
  const result = { "Very High": 0, High: 0, Medium: 0, Low: 0, Information: 0 };

  if (!breakdownObj || typeof breakdownObj !== "object") return result;

  Object.entries(breakdownObj).forEach(([sev, data]: [string, any]) => {
    let normalizedSev = sev;
    if (sev === "VeryHigh" || sev === "Very High" || sev === "Critical") normalizedSev = "Very High";
    if (sev === "Information" || sev === "Info") normalizedSev = "Information";

    if (normalizedSev in result) {
      const value = typeof data === "number" 
        ? data 
        : typeof data?.total === "number" 
          ? data.total 
          : parseInt(data?.total) || 0;
      result[normalizedSev as keyof typeof result] += value;
    }
  });

  return result;
}

/**
 * Build a sanitized PDF filename from a title and today's date.
 * Example:
 *   "DEU-xLOS-PwC Products Platform on SAP Cloud Platform"
 * → "CustomizedReport_DEU_xLOS_PwC_Products_Platform_on_SAP_Cloud_Platform_06_Mar_2026.pdf"
 */
function buildPdfFilename(
  title: string,
  options: {
    useFullMonth?: boolean;
    prefix?: string;
    date?: Date;
  } = {}
) {
  const {
    useFullMonth = false,    // true → "March", false → "Mar"
    prefix = "CustomizedReport", // change if needed
    date = new Date()        // allow override for testing
  } = options;

  // Format date → DD_Mon_YYYY or DD_March_YYYY
  const day = String(date.getDate()).padStart(2, '0');
  const monthsShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthsLong  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthStr = useFullMonth ? monthsLong[date.getMonth()] : monthsShort[date.getMonth()];
  const year = date.getFullYear();
  const datePart = `${day}_${monthStr}_${year}`;

  // Normalize and sanitize the title → keep letters/numbers/underscore
  // 1) Remove accents/diacritics
  let sanitized = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // 2) Replace any sequence of non-alphanumeric characters with underscore
  sanitized = sanitized.replace(/[^A-Za-z0-9]+/g, '_');

  // 3) Collapse multiple underscores and trim from ends
  sanitized = sanitized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');

  // Ensure we have something sensible
  if (!sanitized) sanitized = 'Report';

  // Build final filename
  return `${prefix}_${sanitized}_${datePart}.pdf`;
}

function ReviewTabContent({
  overview,
  backendSastSummary,
  backendScaSummary,
  scaDetails = [],
  sastSummary,
  scaSummary,
  configNoSca = [],
  configScanValidityDays = 90,
  scaSafeVersionEnabled = false,
  aggregatedData,
  selectedTools,
}: {
  overview: any;
  backendSastSummary: any;
  backendScaSummary: any;
  scaDetails: any[];
  sastSummary: any;
  scaSummary: any;
  configNoSca?: string[];
  configScanValidityDays?: number;
  scaSafeVersionEnabled?: boolean;
  aggregatedData: { sast: AggregatedGroup[]; sca: AggregatedGroup[] };
  selectedTools?: string[];
}) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Determine if SCA missing is "NORMAL"
  const isScaMissingNormal = React.useMemo(() => {
    const archs = overview?.architectures || [];
    const ecoObj = overview?.scaEcosystems || "";
    let ecos: string[] = [];
    if (typeof ecoObj === "string") {
      ecos = ecoObj
        .replace(/[\[\]]/g, "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(ecoObj)) {
      ecos = ecoObj;
    }
    const missing = archs.filter(
      (a: string) =>
        !ecos.some(
          (e: string) =>
            e.toLowerCase() === a.toLowerCase(),
        ),
    );
    return missing.length === 0;
  }, [overview]);

  // Determine if sastSummary AND scaSummary have only LOW findings or less (i.e. zero Very High, High, Medium)
  const hasOnlyLowFindings = React.useMemo(() => {
    const sast_very_high = sastSummary?.breakdown?.["Very High"] || 0;
    const sast_high = sastSummary?.breakdown?.["High"] || 0;
    const sast_medium = sastSummary?.breakdown?.["Medium"] || 0;

    const sca_very_high = scaSummary?.breakdown?.["Very High"] || 0;
    const sca_high = scaSummary?.breakdown?.["High"] || 0;
    const sca_medium = scaSummary?.breakdown?.["Medium"] || 0;

    return (
      Number(sast_very_high) === 0 &&
      Number(sast_high) === 0 &&
      Number(sast_medium) === 0 &&
      Number(sca_very_high) === 0 &&
      Number(sca_high) === 0 &&
      Number(sca_medium) === 0
    );
  }, [sastSummary, scaSummary]);

  const showSignOffButton = isScaMissingNormal && hasOnlyLowFindings;

  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState(false);
  const [scanNameInput, setScanNameInput] = useState("");
  const [reportUrlInput, setReportUrlInput] = useState("");
  const [overrideHtml, setOverrideHtml] = useState<string | null>(null);

  // Sync scan name default when modal opens or overview loads
  useEffect(() => {
    if (isSignOffModalOpen && !scanNameInput && overview?.scanName) {
      setScanNameInput(overview.scanName);
    }
  }, [isSignOffModalOpen, overview?.scanName, scanNameInput]);

  const [isRpSignOffModalOpen, setIsRpSignOffModalOpen] = useState(false);
  const [rpScanNameInput, setRpScanNameInput] = useState("");
  const [rpReportUrlInput, setRpReportUrlInput] = useState("");
  const [rpEstimatedCompletionDate, setRpEstimatedCompletionDate] = useState("");
  const [rpDoesMeet, setRpDoesMeet] = useState<"YES" | "NO">("YES");
  const [rpNumber, setRpNumber] = useState("");
  const [rpError, setRpError] = useState<string | null>(null);

  // Sync scan name default when RP modal opens or overview loads
  useEffect(() => {
    if (isRpSignOffModalOpen && !rpScanNameInput && overview?.scanName) {
      setRpScanNameInput(overview.scanName);
    }
  }, [isRpSignOffModalOpen, overview?.scanName, rpScanNameInput]);

  // TEMPORARY TOGGLE for Scan Too Old
  const [isScanTooOld, setIsScanTooOld] = useState(false);

  const formattedHeader = React.useMemo(() => {
    let header = "";
    if (overview.scanType === "checkmarx") {
      const buildId = overview.buildId || "---";
      const scanId = overview.scanId || overview.analysisId || "---";
      const scanName = overview.scanName || "---";
      const applicationName = overview.applicationName || "---";
      const viewerLink = overview.viewerLink || `https://us.ast.checkmarx.net/projects/${buildId}/overview?branch=${scanName}`;

      header = `\nCode Review Services (CRS) has assessed your latest scan <code><a target="_blank" href="${viewerLink}">${buildId}</a></code> (SAST) and <code><a target="_blank" href="https://us.ast.checkmarx.net/results/${buildId}/${scanId}/sca?internalPath=%2Fpackages">${scanId}</a></code> (SCA) of the <code><a target="_blank" href="https://us.ast.checkmarx.net/projects/${buildId}/overview?branch=${scanName}">${applicationName}</a></code> application from branch <code class="rounded bg-gray">${scanName}</code> for quality and completeness and reviewed the open findings and available mitigation proposals. Please take a look at those findings in the comments below. If more assistance is needed, please schedule a consultation call by selecting the <i><b>Remediation Consultation</b></i> option from the appointment calendar. For more help, refer to the <i><b>Scheduling Consultations</b></i> section, as detailed in the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%20Documents/Client-Facing%20Documentation/CRS%20Process%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.\n<br/>\n<hr/>\n`;
    } else {
      let main_header = StaticContent.main_header;
      main_header = main_header.replace(/\{\$accountId\}/g, overview.accountId || "---");
      main_header = main_header.replace(/\{\$appId\}/g, overview.appId || "---");
      main_header = main_header.replace(/\{\$buildId\}/g, overview.buildId || "---");
      main_header = main_header.replace(/\{\$analysisId\}/g, overview.analysisId || "---");
      main_header = main_header.replace(
        /\{\$static_analysis_unit_id\}/g,
        overview.staticAnalysisUnitId || "---",
      );
      main_header = main_header.replace(/\{\$sandbox_id\}/g, overview.sandboxId || "---");
      main_header = main_header.replace(/\{\$scanName\}/g, overview.scanName || "---");
      main_header = main_header.replace(
        /\{\$profile_name\}/g,
        overview.applicationName || "---",
      );
      header = main_header;
    }

    const getEffectiveScanDate = (ovw: any) => {
      if (ovw?.scanName) {
        const match = ovw.scanName.match(/^\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
      }
      return ovw?.submitted_date || ovw?.generationDate || null;
    };
    const effectiveDate = getEffectiveScanDate(overview);
    const isActuallyTooOld = calculateIsScanTooOld(effectiveDate, configScanValidityDays);

    // If scan is too old, ONLY display the scan too old message between header and footer
    if (isScanTooOld || isActuallyTooOld) {
      return (
        StaticContent.header_style +
        header +
        StaticContent.scanTooOldMsg(overview) +
        StaticContent.footerMsg
      );
    }

    const { sastSection, scaSection, missingScaMessages } = generateReviewSummary({
      backendSastSummary,
      backendScaSummary,
      aggregatedData,
      overview,
      configNoSca,
      scaDetails,
      scaSafeVersionEnabled,
      selectedTools
    });

    let moduleSelectionSection = "";
    if (
      overview.unselectedModules &&
      Array.isArray(overview.unselectedModules) &&
      overview.unselectedModules.length > 0
    ) {
      moduleSelectionSection = StaticContent.moduleSelectionMsg(
        overview,
        overview.selectedModules || [],
        overview.unselectedModules,
      );
    }

    let noPrecompileSection = "";
    if (
      overview.noPrecompile &&
      Array.isArray(overview.noPrecompile) &&
      overview.noPrecompile.length > 0
    ) {
      noPrecompileSection = StaticContent.noPrecompileMsg();
    }

    let minifiedFilesSection = "";
    if (
      overview.minifedFiles &&
      Array.isArray(overview.minifedFiles) &&
      overview.minifedFiles.length > 0
    ) {
      minifiedFilesSection = StaticContent.minifiedFilesMsg(overview.minifedFiles);
    }

    return (
      StaticContent.header_style +
      header +
      sastSection +
      scaSection +
      missingScaMessages +
      moduleSelectionSection +
      noPrecompileSection +
      minifiedFilesSection +
      StaticContent.footerMsg
    );
  }, [
    overview,
    backendSastSummary,
    backendScaSummary,
    scaDetails,
    isScanTooOld,
    aggregatedData,
    configNoSca,
    configScanValidityDays,
    selectedTools,
    scaSafeVersionEnabled
  ]);


  const [rawHtml, setRawHtml] = useState(formattedHeader);
  const [copied, setCopied] = useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleInsertSnippet = (snippetHtml: string) => {
    if (isEditMode && textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const beforeStr = text.substring(0, start);
      const afterStr = text.substring(end, text.length);
      const newText = beforeStr + snippetHtml + afterStr;
      
      setRawHtml(newText);
      setOverrideHtml(newText);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + snippetHtml.length, start + snippetHtml.length);
      }, 0);
    } else {
      const footerSig = StaticContent.footerMsg.trim();
      let newText = rawHtml;
      
      if (rawHtml.includes(StaticContent.footerMsg)) {
        newText = rawHtml.replace(StaticContent.footerMsg, snippetHtml + StaticContent.footerMsg);
      } else if (rawHtml.includes(footerSig)) {
        newText = rawHtml.replace(footerSig, snippetHtml + footerSig);
      } else {
        newText = rawHtml + "\n" + snippetHtml;
      }
      
      setRawHtml(newText);
      setOverrideHtml(newText);
    }
  };

  useEffect(() => {
    if (overrideHtml !== null) {
      setRawHtml(overrideHtml);
    } else {
      setRawHtml(formattedHeader);
    }
  }, [formattedHeader, overrideHtml]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div
      className={`p-4 ${isMaximized ? "fixed inset-0 z-50 bg-slate-950" : "flex-1 min-h-0 min-w-0"} flex flex-col gap-4`}
    >
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-black uppercase text-slate-400">
          Review Comments Editor
        </h2>
        <div className="flex items-center gap-4">
          {showSignOffButton ? (
            <button
              type="button"
              onClick={() => setIsSignOffModalOpen(true)}
              className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-all bg-emerald-950/40 hover:bg-emerald-900/50 px-3 py-1.5 rounded-md border border-emerald-800/50"
              title="Sign-off scan"
            >
              <Check size={14} />
              <span className="text-[10px] font-bold uppercase">
                Sign-off
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setRpError(null);
                setIsRpSignOffModalOpen(true);
              }}
              className="flex items-center gap-2 text-sky-400 hover:text-sky-300 transition-all bg-sky-950/40 hover:bg-sky-900/50 px-3 py-1.5 rounded-md border border-sky-800/50"
              title="RP Sign-off scan"
            >
              <CheckCircle2 size={14} />
              <span className="text-[10px] font-bold uppercase">
                RP Sign-off
              </span>
            </button>
          )}

          {overrideHtml !== null && (
            <button
              type="button"
              onClick={() => setOverrideHtml(null)}
              className="flex items-center gap-2 text-rose-400 hover:text-rose-300 transition-all bg-rose-950/40 hover:bg-rose-900/50 px-3 py-1.5 rounded-md border border-rose-800/50"
              title="Reset Sign-off"
            >
              <X size={14} />
              <span className="text-[10px] font-bold uppercase">
                Reset
              </span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-all bg-slate-800/50 hover:bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700/50"
            title="Copy Raw HTML"
          >
            {copied ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} />
            )}
            <span className="text-[10px] font-bold uppercase">
              {copied ? "Copied!" : "Copy HTML"}
            </span>
          </button>

          {/* HTML Snippet Insertion Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900/60 pl-2.5 pr-1.5 py-1 rounded-md border border-slate-800">
            <span className="text-[9px] font-black uppercase text-slate-500 whitespace-nowrap tracking-wider">
              Snippets:
            </span>
            <select
              className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[150px] font-medium"
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  handleInsertSnippet(val);
                  e.target.value = ""; // Reset after selection
                }
              }}
              defaultValue=""
            >
              <option value="" disabled className="text-slate-500 bg-slate-950 font-sans">-- Select Key --</option>
              {Object.entries(snippetsData).map(([key, value]) => (
                <option key={key} value={value} className="text-slate-300 bg-slate-950 font-sans text-xs">
                  {key}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="text-slate-500 hover:text-white transition-all"
            title={isMaximized ? "Minimize" : "Maximize"}
          >
            {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] font-bold uppercase text-slate-500">
              Edit Raw HTML
            </span>
            <input
              type="checkbox"
              checked={isEditMode}
              onChange={() => setIsEditMode(!isEditMode)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0"
            />
          </label>
        </div>
      </div>

      {isEditMode ? (
        <textarea
          ref={textareaRef}
          className="w-full flex-1 p-4 bg-slate-950 text-slate-200 font-mono text-[11px] rounded-lg border border-slate-800 resize-none font-mono"
          value={rawHtml}
          onChange={(e) => {
            setRawHtml(e.target.value);
            if (overrideHtml !== null) {
              setOverrideHtml(e.target.value);
            }
          }}
        />
      ) : (
        <div
          className="w-full flex-1 p-4 bg-white text-black rounded-lg overflow-auto"
          dangerouslySetInnerHTML={{ __html: rawHtml }}
        />
      )}

      {/* Sign-off Modal */}
      <AnimatePresence>
        {isSignOffModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-transparent pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSignOffModalOpen(false)}
              className="absolute inset-0 bg-black/75 pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-[#0a0c10] border border-emerald-500/30 rounded-xl flex flex-col shadow-2xl overflow-hidden relative z-10 pointer-events-auto"
            >
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check size={18} />
                  <h2 className="text-sm font-black uppercase tracking-widest text-emerald-400">
                    Veracode SAST Sign-off
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSignOffModalOpen(false)}
                  className="text-slate-500 hover:text-slate-300 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  
                  const accountId = overview.accountId || "---";
                  const appId = overview.appId || "---";
                  const buildId = overview.buildId || "---";
                  const analysisId = overview.analysisId || "---";
                  const staticAnalysisUnitId = overview.staticAnalysisUnitId || "---";
                  const sandboxId = overview.sandboxId || "---";
                  const profileName = overview.applicationName || "---";
                  const reportFilename = buildPdfFilename(profileName);

                  const veracodeSignUp = `The SAST assessment has been completed successfully with no remaining open findings in 
  adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%20Documents/Standards/PwC%20NIS%20Application%20Readiness%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for this assessed version,
scan <code><a target="_blank" href="https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:${accountId}:${appId}:${buildId}:${analysisId}:${staticAnalysisUnitId}::::${sandboxId}">${scanNameInput}</a></code>, of the <code>, 
of the <code><a target="_blank" href="https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:${accountId}:${appId}:${buildId}">${profileName}</a></code>  application. For more details, please see the Veracode report <code><a target="_blank" href="${reportUrlInput}">${reportFilename}</a></code> attached to this request. Please note that after this sign off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!`;

                  const finalHtml = StaticContent.header_style + veracodeSignUp + StaticContent.footerMsg;
                  setOverrideHtml(finalHtml);
                  setIsSignOffModalOpen(false);
                }}
                className="flex flex-col"
              >
                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">
                    Generate the final sign-off HTML message. Provide the scan name and the Veracode report PDF URL.
                  </p>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
                      Scan Name (scan_Name)
                    </label>
                    <input
                      type="text"
                      required
                      value={scanNameInput}
                      onChange={(e) => setScanNameInput(e.target.value)}
                      placeholder="e.g. 2026-05-23-Scan"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
                      Report URL (report_url)
                    </label>
                    <input
                      type="url"
                      required
                      value={reportUrlInput}
                      onChange={(e) => setReportUrlInput(e.target.value)}
                      placeholder="https://analysiscenter.veracode.com/..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-900/40 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSignOffModalOpen(false)}
                    className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all font-sans"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all font-sans"
                  >
                    Generate Sign-off
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RP Sign-off Modal */}
      <AnimatePresence>
        {isRpSignOffModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-transparent pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRpSignOffModalOpen(false)}
              className="absolute inset-0 bg-black/75 pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-[#0a0c10] border border-sky-500/30 rounded-xl flex flex-col shadow-2xl overflow-hidden relative z-10 pointer-events-auto"
            >
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-2 text-sky-400">
                  <CheckCircle2 size={18} />
                  <h2 className="text-sm font-black uppercase tracking-widest text-sky-400 font-sans">
                    Veracode RP Sign-off
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRpSignOffModalOpen(false)}
                  className="text-slate-500 hover:text-slate-300 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setRpError(null);

                  // 1. REPORT URL VALIDATION: should start with https: http is not allowed
                  const urlTrimmed = (rpReportUrlInput || "").trim();
                  if (!urlTrimmed.toLowerCase().startsWith("https://")) {
                    setRpError("REPORT URL: Should start with https. http is not allowed.");
                    return;
                  }

                  // 2. REMEDIATION PLAN ID VALIDATION: should start either with RITM, IPT or PER
                  const rpNumberTrimmed = (rpNumber || "").trim();
                  const rpUpper = rpNumberTrimmed.toUpperCase();
                  if (!rpUpper.startsWith("RITM") && !rpUpper.startsWith("IPT") && !rpUpper.startsWith("PER")) {
                    setRpError("REMEDIATION PLAN ID: Should start either with RITM, IPT or PER. Other formats are not allowed.");
                    return;
                  }

                  // 3. ESTIMATED COMPLETION DATE VALIDATION: should not be from the past
                  const dateParts = rpEstimatedCompletionDate.trim().split("/");
                  if (dateParts.length !== 3) {
                    setRpError("ESTIMATED COMPLETION DATE: Invalid format. Please use MM/DD/YYYY format.");
                    return;
                  }
                  const month = parseInt(dateParts[0], 10) - 1;
                  const day = parseInt(dateParts[1], 10);
                  const year = parseInt(dateParts[2], 10);

                  // Quick valid checking
                  if (isNaN(month) || isNaN(day) || isNaN(year) || month < 0 || month > 11 || day < 1 || day > 31 || year < 1000) {
                    setRpError("ESTIMATED COMPLETION DATE: Date format must be a valid calendar date MM/DD/YYYY.");
                    return;
                  }

                  const inputDate = new Date(year, month, day);
                  if (isNaN(inputDate.getTime())) {
                    setRpError("ESTIMATED COMPLETION DATE: Invalid date.");
                    return;
                  }

                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (inputDate < today) {
                    setRpError("ESTIMATED COMPLETION DATE: Date should not be from the past.");
                    return;
                  }
                  
                  const accountId = overview.accountId || "---";
                  const appId = overview.appId || "---";
                  const buildId = overview.buildId || "---";
                  const analysisId = overview.analysisId || "---";
                  const staticAnalysisUnitId = overview.staticAnalysisUnitId || "---";
                  const sandboxId = overview.sandboxId || "---";
                  const profileName = overview.applicationName || "---";
                  const reportFilename = buildPdfFilename(profileName);

                  let veryHighHighDays = "60";
                  let mediumDays = "90";
                  if (overview?.gracePeriod && typeof overview.gracePeriod === "string") {
                    const vhMatch = overview.gracePeriod.match(/veryhigh\/high:\s*(\d+)/i);
                    if (vhMatch) veryHighHighDays = vhMatch[1];
                    const mMatch = overview.gracePeriod.match(/Medium:\s*(\d+)/i);
                    if (mMatch) mediumDays = mMatch[1];
                  }

                  const isCheckmarxActive = selectedTools.includes("Checkmarx") || overview?.scanType === "checkmarx";
                  const meetText = rpDoesMeet === "YES" ? "does" : "does not";

                  const veracodeRp = `The SAST assessment has been completed successfully with open findings. The remediation plan <code><a target="_blank" href="https://eu.workbench.pwc.com/home/my-reports/IRM-ARR-Dashboard">${rpNumber}</a></code> is in place for the open findings in adherence to the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%20Documents/Standards/PwC%20NIS%20Application%20Readiness%20Standard.pdf">Application Readiness Standard</a>.<br/>
<br/>
This can be considered a <b>final</b> sign-off for the static code analysis for this assessed version, scan <code><a target="_blank" href="https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:${accountId}:${appId}:${buildId}:${analysisId}:${staticAnalysisUnitId}::::${sandboxId}">${rpScanNameInput}</a></code>, of the <code><a target="_blank" href="https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:${accountId}:${appId}:${buildId}">${profileName}</a></code> application. For more details, please see the Veracode report <code><a target="_blank" href="${rpReportUrlInput}">${reportFilename}</a></code> attached to this request. Please note that after this sign off, this request will be closed and will not be tracked anymore.<br/>
<br/>
Thank you!
<hr/>
<p><b><u>Remediation Plan ${rpNumber} Risk Review</u></b><br/>
The estimated completion date of ${rpEstimatedCompletionDate} <u>${meetText} meet</u> the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%20Documents/Standards/PwC%20NIS%20Application%20Readiness%20Standard.pdf">Application Readiness Standard</a> Vulnerability Remediation Timeframe for ${isCheckmarxActive ? `<span class="rounded critical">Critical</span>` : `<span class="rounded veryhigh">Very High</span>`} and <span class="rounded high">High</span> findings (within ${veryHighHighDays} days) and <span class="rounded medium">Medium</span> findings (within ${mediumDays} days).</p>`;

                  const hasSastVulnerabilities = (sastSummary?.vulnerabilities || 0) > 0;
                  const hasScaVulnerabilities = (backendScaSummary?.vulnerabilities || 0) > 0;

                  let sastBlock = "";
                  let scaBlock = "";

                  if (hasSastVulnerabilities || hasScaVulnerabilities) {
                    const summaryResult = generateReviewSummary({
                      backendSastSummary,
                      backendScaSummary,
                      aggregatedData,
                      overview,
                      configNoSca,
                      scaDetails,
                      scaSafeVersionEnabled,
                      selectedTools
                    });

                    if (hasSastVulnerabilities) {
                      let sastTablePart = "";
                      if (summaryResult.sastSection) {
                        const styleIndex = summaryResult.sastSection.indexOf("<style>");
                        const pIndex = summaryResult.sastSection.indexOf("<p><b>Open Flaw");
                        const startIndex = styleIndex !== -1 ? styleIndex : (pIndex !== -1 ? pIndex : summaryResult.sastSection.indexOf("<table"));
                        if (startIndex !== -1) {
                          sastTablePart = summaryResult.sastSection.substring(startIndex);
                        }
                      }
                      sastBlock = `<p><b><u>Risk Statement for Flaws</u></b><br/>
The CWE findings identified in the Veracode scan are potentially serious security flaws that can allow an attacker to access and/or tamper with data. There is a lower risk that attackers can affect system reliability resulting in denial of service. In addition, the combination of flaws represented here include vulnerabilities in the logging mechanisms that can allow attackers to destroy evidence of their exploitation and remain undetected.</p>
${sastTablePart}`;
                    }

                    if (hasScaVulnerabilities) {
                      let scaSec = summaryResult.scaSection || "";
                      scaSec = scaSec.replace(/Please\s+be\s+advised,\s+the[\s\S]*?<\/ol>\s*<br\/?>\s*/gi, "");
                      scaBlock = `<p><b><u>Risk Statement for Software Composition Analysis Vulnerabilities</u></b><br/></p>
${scaSec}`;
                    }
                  }

                  const finalHtml = StaticContent.header_style + veracodeRp + sastBlock + scaBlock + StaticContent.footerMsg;
                  setOverrideHtml(finalHtml);
                  setIsRpSignOffModalOpen(false);
                }}
                className="flex flex-col"
              >
                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">
                    Generate the Remediation Plan (RP) sign-off HTML message. Provide the scan name, Remediation Plan number (rp_number), Report URL and estimated completion date.
                  </p>

                  {rpError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 font-bold flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      <span>{rpError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
                        Scan Name
                      </label>
                      <input
                        type="text"
                        required
                        value={rpScanNameInput}
                        onChange={(e) => setRpScanNameInput(e.target.value)}
                        placeholder="e.g. 2026-05-23-Scan"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
                        Remediation Plan ID (rp_number)
                      </label>
                      <input
                        type="text"
                        required
                        value={rpNumber}
                        onChange={(e) => setRpNumber(e.target.value)}
                        placeholder="e.g. IRM-RP-001"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
                      Report URL (report_url)
                    </label>
                    <input
                      type="url"
                      required
                      value={rpReportUrlInput}
                      onChange={(e) => setRpReportUrlInput(e.target.value)}
                      placeholder="https://analysiscenter.veracode.com/..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
                        Estimated Completion Date
                      </label>
                      <input
                        type="text"
                        required
                        value={rpEstimatedCompletionDate}
                        onChange={(e) => setRpEstimatedCompletionDate(e.target.value)}
                        placeholder="MM/DD/YYYY"
                        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
                        title="Date format: MM/DD/YYYY"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
                        RP within grace period
                      </label>
                      <select
                        value={rpDoesMeet}
                        onChange={(e) => setRpDoesMeet(e.target.value as "YES" | "NO")}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-sans"
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/40 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRpSignOffModalOpen(false)}
                    className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all font-sans"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-black uppercase tracking-widest bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-all font-sans"
                  >
                    Generate RP Sign-off
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [selectedTools, setSelectedTools] = useState<ToolName[]>(["Veracode"]);
  const [appProfile, setAppProfile] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"SAST" | "SCA" | "Review">("SAST");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [aggregatedData, setAggregatedData] = useState<{
    sast: AggregatedGroup[];
    sca: AggregatedGroup[];
  }>({ sast: [], sca: [] });
  const [backendSastSummary, setBackendSastSummary] = useState<any>(null);
  const [backendScaSummary, setBackendScaSummary] = useState<any>(null);
  const [scaDetails, setScaDetails] = useState<any[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [suggestedApps, setSuggestedApps] = useState<string[]>([]);
  const [lastRawResponse, setLastRawResponse] = useState<any>(null);
  const [debugPastedJson, setDebugPastedJson] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [overview, setOverview] = useState(mockOverview);
  const [batchModalConfig, setBatchModalConfig] = useState<{
    isOpen: boolean;
    actionType: "approved" | "rejected";
    selectedItems: AggregatedGroup[];
  } | null>(null);
  const [sastMitigationProposal, setSastMitigationProposal] = useState<any>(null);
  const [scaMitigationProposal, setScaMitigationProposal] = useState<any>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [aiProvider, setAiProvider] = useState<AIProvider>(() => {
    const saved = localStorage.getItem("preferred_ai_provider");
    return (saved as AIProvider) || "Gemini";
  });

  // Persist user preferences
  useEffect(() => {
    localStorage.setItem("preferred_ai_provider", aiProvider);
  }, [aiProvider]);

  // Unified Configuration State
  const [fullConfig, setFullConfig] = useState<any>(null);
  const [initialFullConfig, setInitialFullConfig] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>("SAST&SCA Prompts");
  const [newValues, setNewValues] = useState<Record<string, string>>({});
  const [newLangCategory, setNewLangCategory] = useState("");
  
  const [hideProcessedFindings, setHideProcessedFindings] = useState<boolean>(() => {
    return localStorage.getItem("hide_processed_findings") === "true";
  });

  useEffect(() => {
    localStorage.setItem("hide_processed_findings", String(hideProcessedFindings));
  }, [hideProcessedFindings]);

  const [detailedGroup, setDetailedGroup] = useState<AggregatedGroup | null>(
    null,
  );
  const [sensitiveGroupToBypass, setSensitiveGroupToBypass] = useState<AggregatedGroup | null>(null);
  const [loadingAIGroups, setLoadingAIGroups] = useState<Set<string>>(new Set());

  const [configNoSca, setConfigNoSca] = useState<string[]>([]);
  const [configEngines, setConfigEngines] = useState<string[]>([
    "Gemini",
    "azure.gpt-4o",
    "Azure OpenAI",
    "OpenAI",
    "Anthropic",
  ]);
  const [configHistory, setConfigHistory] = useState<string[]>([]);
  const [veracodeHistory, setVeracodeHistory] = useState<string[]>([
    "GBL_ASR_NGA_ADMIN_CROSS_BORDERS.json",
    "GBL_ADV_CDE_Junction_US_2_03.json",
    "GBL_ADV_CDE_Junction_US_2_02.json",
    "GBL_ADV_CDE_Junction_US_2_01.json",
    "GBL_ASR_NGA_OMNI_DOC_VIEWER_03.json",
    "GBL_ASR_NGA_OMNI_DOC_VIEWER_02.json",
    "GBL_ASR_NGA_OMNI_DOC_VIEWER_01.json",
    "GBL_ASR_NGA_OMNI_DOC_VIEWER.json",
    "USA_IFS_Job_Requisition_Assistant.json",
    "USA_ADV_Value_Creation_for_CFOs_04.json"
  ]);
  const [checkmarxHistory, setCheckmarxHistory] = useState<string[]>([
    "FIT_Honeybee_develop.json",
    "FIT_Honeybee_1781906942677.json"
  ]);
  const [configScanValidityDays, setConfigScanValidityDays] =
    useState<number>(90);
  const [configIntakeRequest, setConfigIntakeRequest] = useState<boolean | undefined>(undefined);
  const [scaSafeVersionEnabled, setScaSafeVersionEnabled] = useState(false);
  const [isServerOnline, setIsServerOnline] = useState(false);
  const [showSnowScreen, setShowSnowScreen] = useState(false);
  const [branch, setBranch] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("tier-1");
  const [configTiers, setConfigTiers] = useState<string[]>(["tier-1", "tier-2", "tier-3a", "tier-3b"]);

  useEffect(() => {
    if (selectedTools.includes("Checkmarx")) {
      setConfigHistory(checkmarxHistory);
    } else {
      setConfigHistory(veracodeHistory);
    }
  }, [selectedTools, veracodeHistory, checkmarxHistory]);

  const fetchPrompts = async () => {
    try {
      const res = await fetch(getEndpoint('configPrompts'));
      const data = await res.json();
      
      // Normalize data into the requested 5 groups (plus Exclusions if present)
      // This handles cases where the backend might return flat keys or a different structure
      const normalizedData: any = {
        "SAST&SCA Prompts": data["SAST&SCA Prompts"] || {
          sastPrompt: data.sastPrompt || "I’m providing information on a First Party Finding for an application in JSON format.\n\nDefinitions:\n- cwe id: The CWE ID of the finding\n- mitigation information: Actions taken by the application team (may be empty)\n\nYour task:\n1. Determine if this is a real security issue.\n2. Determine if the mitigation sufficiently reduces the risk.\n3. If not mitigated, clearly state why.\n\nInstructions (STRICT):\n- Start with: \"Proposal Approved\" or \"Proposal Rejected\"\n- Provide ONLY ONE short paragraph\n- Maximum 4–5 sentences\n- Maximum 120 words\n- No repetition, no extra explanation\n- Keep reasoning concise and direct\n- Follow Zero-Trust principles in evaluation but don't repeat it in para.\n\nDo not provide bullet points, headings, or long explanations.",
          scaPrompt: data.scaPrompt || "I’m providing information on a Third Party (SCA) Finding in JSON format.\n\nDefinitions:\n- name: Vulnerable component name\n- cve id: CVE identifier\n- mitigation information: Actions taken by the application team (may be empty)\n\nYour task:\n1. Identify if a non-vulnerable version exists\n2. Identify if mitigation without upgrade is possible\n3. Assess if the finding could be a false positive\n4. Enforce strict security governance (Zero-Trust)\n\nSTRICT GOVERNANCE RULES:\n- If the vulnerability is still reported by the SCA tool → DO NOT accept false positive claim\n- If the source of the dependency is unclear → REJECT and require investigation\n- Always require validation with Veracode (or tool owner) before closure\n- Never approve based solely on assumption\n\nOUTPUT INSTRUCTIONS (STRICT):\n- Start with ONLY ONE of:\n  \"Proposal Approved\" OR \"Proposal Rejected\" OR \"Check Manually\"\n- Provide ONE paragraph only\n- Maximum 6 sentences\n- Maximum 150 words\n- Keep reasoning concise and direct\n- Do NOT explain CWE background\n- Avoid repetition and filler text\n\nCVE HANDLING:\n- If you are confident about the CVE → include a short reference link:"
        },
        "System": data["System"] || {
          scanValidityDays: data.scanValidityDays || 90,
          mitigationProposalEnabled: data.mitigationProposalEnabled ?? true,
          mitigationApiType: data.mitigationApiType || "REST",
          saveXmlLogs: data.saveXmlLogs ?? true,
          saveJsonHistory: data.saveJsonHistory ?? true,
          historyLimit: data.historyLimit || 10,
          secondaryAuditEnabled: data.secondaryAuditEnabled ?? false,
          safeSCAVERSION: data.safeSCAVERSION || {
            scaSafeVersionEnabled: true,
            scaStaleFixMessage: "No safe version found. Fix applies to a different major version. Check manually.",
            scaNoFixMessage: "No safe version published in GHSA. Check manually.",
            saveScaLog: false
          }
        },
        "AiEngine": {
          aiEngines: data["AiEngine"]?.aiEngines || data.aiEngines || configEngines,
          engineModels: data["AiEngine"]?.engineModels || data.engineModels || [ "azure.gpt-4o", "gemini-1.5-flash" ],
          sharedServiceEndpoint: data["AiEngine"]?.sharedServiceEndpoint || data.sharedServiceEndpoint || "https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions",
          sharedServiceRole: data["AiEngine"]?.sharedServiceRole || data.sharedServiceRole || "user",
          sharedServiceMaxTokens: data["AiEngine"]?.sharedServiceMaxTokens || data.sharedServiceMaxTokens || 1000
        },
        "SecondaryAudit": data["SecondaryAudit"] ? {
          auditorModel: data["SecondaryAudit"].auditorModel || "gpt-4o-mini",
          sharedAuditorEndpoint: data["SecondaryAudit"].sharedAuditorEndpoint || "https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions",
          sharedAuditorMaxTokens: data["SecondaryAudit"].sharedAuditorMaxTokens || 1000,
          sharedAuditorRole: data["SecondaryAudit"].sharedAuditorRole || "user",
          auditorPrompt: data["SecondaryAudit"].auditorPrompt || "You are a Senior Security QA Auditor acting as a secondary verification layer. Your job is to strictly review the output generated by a primary evaluation model against the original input data.\n\nYou will be provided with two sets of data:\n1. [Original Request Data]: The raw vulnerability JSON payload.\n2. [Phase 1 Output]: The text response generated by the primary model.\n\nYour task is to independently verify the quality, accuracy, and constraint compliance of the Phase 1 Output.\n\n### CRITERIA FOR EVALUATION\n1. Accuracy Check: Did Phase 1 correctly interpret the vulnerability description and user comments? (e.g., If the user comments proved the value is a non-secret UI lookup GUID, did Phase 1 correctly identify it as a false positive?)\n2. Constraint Compliance Check: Did Phase 1 strictly adhere to its formatting boundaries?\n   - Does it start exactly with \"Proposal Approved\" or \"Proposal Rejected\"?\n   - Is it written as exactly ONE paragraph?\n   - Is it under 120 words and free of bullet points or headings?\n\n### OUTPUT FORMAT\nYou must output your audit evaluation strictly using the following Markdown template. Do not add conversational intro text or metadata.\n\n### Second Look Assessment\n- **Validation Verdict:** [Agree / Disagree with Phase 1 Verdict]\n- **Rule Compliance:** [Pass / Fail - state if formatting limits were met]\n- **Critique:** [2-3 sentences explaining your reasoning regarding the technical accuracy and compliance of Phase 1]",
          fallbackText: data["SecondaryAudit"].fallbackText || "Proposal Rejected please perform a Manual Review as The Evaluator and Auditor model has contradiction!"
        } : {
          auditorModel: data.auditorModel || "gpt-4o-mini",
          sharedAuditorEndpoint: data.sharedAuditorEndpoint || "https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions",
          sharedAuditorMaxTokens: data.sharedAuditorMaxTokens || 1000,
          sharedAuditorRole: data.sharedAuditorRole || "user",
          auditorPrompt: data.auditorPrompt || "You are a Senior Security QA Auditor acting as a secondary verification layer. Your job is to strictly review the output generated by a primary evaluation model against the original input data.\n\nYou will be provided with two sets of data:\n1. [Original Request Data]: The raw vulnerability JSON payload.\n2. [Phase 1 Output]: The text response generated by the primary model.\n\nYour task is to independently verify the quality, accuracy, and constraint compliance of the Phase 1 Output.\n\n### CRITERIA FOR EVALUATION\n1. Accuracy Check: Did Phase 1 correctly interpret the vulnerability description and user comments? (e.g., If the user comments proved the value is a non-secret UI lookup GUID, did Phase 1 correctly identify it as a false positive?)\n2. Constraint Compliance Check: Did Phase 1 strictly adhere to its formatting boundaries?\n   - Does it start exactly with \"Proposal Approved\" or \"Proposal Rejected\"?\n   - Is it written as exactly ONE paragraph?\n   - Is it under 120 words and free of bullet points or headings?\n\n### OUTPUT FORMAT\nYou must output your audit evaluation strictly using the following Markdown template. Do not add conversational intro text or metadata.\n\n### Second Look Assessment\n- **Validation Verdict:** [Agree / Disagree with Phase 1 Verdict]\n- **Rule Compliance:** [Pass / Fail - state if formatting limits were met]\n- **Critique:** [2-3 sentences explaining your reasoning regarding the technical accuracy and compliance of Phase 1]",
          fallbackText: data.fallbackText || "Proposal Rejected please perform a Manual Review as The Evaluator and Auditor model has contradiction!"
        },
        "Compliance": data["Compliance"] || {
          tierMappings: data.tierMappings || {
            "External": {
              "Confidential": "tier-1",
              "HighlyConfidential": "tier-1",
              "Internal": "tier-2",
              "Public": "tier-2"
            },
            "Internal": {
              "Confidential": "tier-3b",
              "HighlyConfidential": "tier-3a",
              "Internal": "tier-3b",
              "Public": "tier-3b"
            }
          },
          gracePeriods: data.gracePeriods || {
            "tier-4": { "VeryHigh" : 60, "High" : 60, "Medium" : 90, "Low" : 180 },
            "tier-3b": { "VeryHigh" : 60, "High" : 60, "Medium" : 90, "Low" : 180 },
            "tier-3a": { "VeryHigh" : 30, "High" : 30, "Medium" : 60, "Low" : 180 },
            "tier-2": { "VeryHigh" : 10, "High" : 10, "Medium" : 30, "Low" : 180 },
            "tier-1": { "VeryHigh" : 10, "High" : 10, "Medium" : 30, "Low" : 180 }
          },
          tierDropDown: data.tierDropDown || [ "tier-1", "tier-2", "tier-3a", "tier-3b", "tier-4" ]
        },
        "Exclusions": data["Exclusions"] || {
          ignoredModules: data.ignoredModules || [ "Microsoft", "Azure", "System", "AspNetCore", "Newtonsoft", "EntityFramework", "NLog", "Log4Net", "AutoMapper", "AppInsights", "UnitTesting", "BouncyCastle", "Serilog", "Dapper", "OpenXml", "Serialization", "OpenXmlPowerTools", "GemBox", "SharpDocx", "Quartz", "sni.dll", "VeracodeJavaAPI.jar", ".test.dll", ".Tests.dll", ".map", "_nodemodule_", "fsmonitor-watchman.sample" ],
          includedModules: data.includedModules || [ "veracodegen.htmla.pya", "pwc.", ".zip", ".war", "snapshot.jar", "0.jar", "pwc", "release.jar", "app_", ".bca", ".gz", "-service.jar", "-advancer.jar" ],
          ignoredEcosystems: data.ignoredEcosystems || [ "so" ],
          noScaArchitectures: data.noScaArchitectures || [ "Apex", "TSQL" ]
        },
        "architecture-mappings": data["architecture-mappings"] || {
          "Java": ["maven", "gradle", "JAVA", "JVM"],
          "JavaScript": ["npm", "bower", "JAVASCRIPT"],
          "Go": ["go", "golang", "GO", "GOLANG"],
          "PHP": ["composer", "PHP", "Packagist"],
          "NET": ["nuget", "CIL32", "MSIL"],
          "Ruby": ["rubygems", "RUBY"],
          "Python": ["pip", "pypi", "PYTHON"]
        }
      };

      setFullConfig(normalizedData);
      setInitialFullConfig(JSON.parse(JSON.stringify(normalizedData)));
      
      // Update local states that derive from config (excluding prompt/engine selections which should remain independent)
      if (normalizedData["System"]) {
        setConfigScanValidityDays(normalizedData["System"].scanValidityDays || 90);
        if (normalizedData["System"].safeSCAVERSION) {
          setScaSafeVersionEnabled(normalizedData["System"].safeSCAVERSION.scaSafeVersionEnabled);
        }
      }
      if (normalizedData["Exclusions"] && Array.isArray(normalizedData["Exclusions"].noScaArchitectures)) {
        setConfigNoSca(normalizedData["Exclusions"].noScaArchitectures);
      }

      // Ensure current settingsTab exists in the normalized config
      if (!normalizedData[settingsTab]) {
        setSettingsTab("SAST&SCA Prompts");
      }
      setIsServerOnline(true);
    } catch (err) {
      console.warn("Failed to fetch config (using fallback defaults since server is starting up):", err);
      setIsServerOnline(false);
    }
  };

  const savePrompts = async () => {
    try {
      const res = await fetch(getEndpoint('configPrompts'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullConfig),
      });
      if (res.ok) {
        setInitialFullConfig(JSON.parse(JSON.stringify(fullConfig)));
        setIsSettingsOpen(false);
        setSuccessMessage("Configuration updated successfully");
        
        // Update local derived states
        if (fullConfig["System"]) {
          setConfigScanValidityDays(fullConfig["System"].scanValidityDays || 90);
          if (fullConfig["System"].safeSCAVERSION && fullConfig["System"].safeSCAVERSION.scaSafeVersionEnabled !== undefined) {
            setScaSafeVersionEnabled(fullConfig["System"].safeSCAVERSION.scaSafeVersionEnabled);
          }
        }
      } else {
        console.error("Failed to save config");
        setBackendError("Failed to save configuration to backend");
      }
    } catch (err) {
      console.error("Failed to save config", err);
      setBackendError("Network error while saving configuration");
    }
  };

  const toggleSettings = async () => {
    if (!isSettingsOpen) {
      await fetchPrompts();
    }
    setIsSettingsOpen(!isSettingsOpen);
  };

  const toggleTool = (tool: ToolName) => {
    setSelectedTools((prev) => {
      if (prev.includes(tool)) {
        return [];
      } else {
        setShowSnowScreen(false);
        if (tool === "Checkmarx") {
          const tierVal = (activeOverview as any)?.tier;
          if (tierVal && configTiers.includes(tierVal)) {
            setSelectedTier(tierVal);
          }
        }
        return [tool];
      }
    });
  };

  // Restore accidentally removed config fetching logic or ensure it's handled via fetchPrompts
  useEffect(() => {
    const checkServerHealth = () => {
      fetch(getEndpoint('heartbeat'))
        .then((res) => {
          const contentType = res.headers.get('content-type');
          if (res.ok && contentType && contentType.includes('application/json')) {
            return res.json();
          }
          throw new Error(`Response is not valid JSON or status is not OK (Status: ${res.status})`);
        })
        .then((data) => {
          setIsServerOnline(data.isServerOnline === true || data.isServerOnline === 'true');
        })
        .catch((err) => {
          console.warn("Heartbeat check: server not yet fully online, using fallback offline mode:", err.message || err);
          setIsServerOnline(false);
        });
    };

    const fetchConfigInfo = () => {
      fetch(getEndpoint('configInfo'))
        .then((res) => {
          const contentType = res.headers.get('content-type');
          if (res.ok && contentType && contentType.includes('application/json')) {
            return res.json();
          }
          throw new Error(`Response is not valid JSON or status is not OK (Status: ${res.status})`);
        })
        .then((data) => {
          if (Array.isArray(data.history)) setVeracodeHistory(data.history);
          if (Array.isArray(data["history-checkmarx"])) setCheckmarxHistory(data["history-checkmarx"]);
          if (Array.isArray(data.engines)) setConfigEngines(data.engines);
          if (data.scanValidityDays) setConfigScanValidityDays(data.scanValidityDays);
          if (Array.isArray(data.noSca)) setConfigNoSca(data.noSca);
          if (Array.isArray(data.tiers)) setConfigTiers(data.tiers);
          if (data.scaSafeVersionEnabled !== undefined) {
            setScaSafeVersionEnabled(data.scaSafeVersionEnabled);
          }
          if (data.intakeRequest !== undefined) {
            setConfigIntakeRequest(data.intakeRequest);
          }
        })
        .catch((err) => {
          console.warn("Failed to fetch initial config info (using local default config info):", err.message || err);
        });
    };

    checkServerHealth();
    fetchConfigInfo();
    fetchPrompts();

    // Check health every 10 seconds
    const interval = setInterval(() => {
      checkServerHealth();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Dynamic Summaries
  const sastSummary = React.useMemo(() => {
    const IS_PRODUCTION =
      import.meta.env.PROD || import.meta.env.VITE_ENVIRONMENT === "production";

    let baseSummary = mockSastSummary;
    if (resultsLoaded && backendSastSummary) {
      baseSummary = {
        vulnerabilities:
          typeof backendSastSummary.vulnerabilities === "number"
            ? backendSastSummary.vulnerabilities
            : parseInt(backendSastSummary.vulnerabilities) || 0,
        breakdown: adaptBreakdown(backendSastSummary.breakdown),
      };
    } else if (backendSastSummary) {
      baseSummary = {
        vulnerabilities: backendSastSummary.vulnerabilities || 0,
        breakdown: backendSastSummary.breakdown || {},
      };
    } else if (IS_PRODUCTION) {
      return {
        vulnerabilities: 0,
        breakdown: { "Very High": 0, High: 0, Medium: 0, Low: 0, Information: 0 },
      };
    }

    return {
      vulnerabilities: baseSummary.vulnerabilities,
      breakdown: baseSummary.breakdown,
    };
  }, [resultsLoaded, backendSastSummary]);

  const scaSummary = React.useMemo(() => {
    const IS_PRODUCTION =
      import.meta.env.PROD || import.meta.env.VITE_ENVIRONMENT === "production";

    let baseSummary = {
      vulnerabilities: 0,
      breakdown: { "Very High": 0, High: 0, Medium: 0, Low: 0 },
      totalPackages: 0,
      totalVulnerablePackages: 0,
    };

    if (resultsLoaded && backendScaSummary) {
      baseSummary = {
        vulnerabilities:
          typeof backendScaSummary.vulnerabilities === "number"
            ? backendScaSummary.vulnerabilities
            : parseInt(backendScaSummary.vulnerabilities) || 0,
        breakdown: adaptBreakdown(backendScaSummary.breakdown),
        totalPackages: backendScaSummary.totalPackages || 0,
        totalVulnerablePackages: backendScaSummary.totalVulnerablePackages || 0,
      };
    } else if (backendScaSummary) {
      baseSummary = {
        vulnerabilities: backendScaSummary.vulnerabilities || 0,
        breakdown: backendScaSummary.breakdown || {},
        totalPackages: backendScaSummary.totalPackages || 0,
        totalVulnerablePackages: backendScaSummary.totalVulnerablePackages || 0,
      };
    } else if (IS_PRODUCTION) {
      return {
        vulnerabilities: 0,
        breakdown: { "Very High": 0, High: 0, Medium: 0, Low: 0 },
        totalPackages: 0,
        totalVulnerablePackages: 0,
      };
    }

    if (scaDetails && scaDetails.length > 0) {
      let dynamicVulnerabilities = 0;
      const dynamicBreakdown: Record<string, number> = { "Very High": 0, High: 0, Medium: 0, Low: 0 };
      let dynamicVulnerablePackages = 0;

      scaDetails.forEach((detail: any) => {
        const pkgName = (detail.packageName || "").trim().toLowerCase();
        const cvesInDetail = (detail.cveList || "")
          .split(",")
          .map((c: string) => c.trim().toLowerCase())
          .filter(Boolean);

        let unapprovedCvesInPkg = 0;

        // Parse severityCounts for this package: e.g. "High: 1, Low: 2"
        const parsedCounts: Record<string, number> = { "Very High": 0, High: 0, Medium: 0, Low: 0 };
        const sevCounts = (detail.severityCounts || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        sevCounts.forEach((sc: string) => {
          const parts = sc.split(":");
          if (parts.length === 2) {
            let sName = parts[0].trim();
            if (sName === "VeryHigh" || sName === "Critical") sName = "Very High";
            const count = parseInt(parts[1].trim(), 10) || 0;
            if (parsedCounts[sName] !== undefined) {
              parsedCounts[sName] = count;
            }
          }
        });

        if (cvesInDetail.length === 0) {
          // If no explicitly listed CVEs in cveList are present, represent severityCounts as separate items
          Object.entries(parsedCounts).forEach(([severity, count]) => {
            for (let i = 0; i < count; i++) {
              let isApproved = false;
              if (aggregatedData?.sca) {
                isApproved = aggregatedData.sca.some((g: any) => {
                  if (g.status !== "approved") return false;
                  const matchesPkg = g.records && g.records.some((r: any) => {
                    const rPkg = (r.packageName || r.location || r.fileName || "").toLowerCase().trim();
                    return rPkg.includes(pkgName) || pkgName.includes(rPkg);
                  });
                  return matchesPkg && g.severity === severity;
                });
              }
              if (!isApproved) {
                unapprovedCvesInPkg++;
                if (dynamicBreakdown[severity] !== undefined) {
                  dynamicBreakdown[severity]++;
                }
              }
            }
          });
        } else {
          // Process each cve in cveList
          cvesInDetail.forEach((cve) => {
            let isApproved = false;
            if (aggregatedData?.sca) {
              isApproved = aggregatedData.sca.some((g: any) => {
                if (g.status !== "approved") return false;

                return g.records && g.records.some((r: any) => {
                  const rPkg = (r.packageName || r.location || r.fileName || "").toLowerCase().trim();
                  const rCveList = (r.cveList || r.title || r.id || "").toLowerCase();

                  const pkgMatch = rPkg.includes(pkgName) || pkgName.includes(rPkg);
                  const cveMatch =
                    rCveList.includes(cve) ||
                    cve.includes(rCveList) ||
                    (g.identifier && g.identifier.toLowerCase().includes(cve));

                  return pkgMatch && cveMatch;
                });
              });
            }

            if (!isApproved) {
              unapprovedCvesInPkg++;
              
              let cveSeverity = "Medium";
              let foundInGroup = false;
              if (aggregatedData?.sca) {
                for (const g of aggregatedData.sca) {
                  const match = g.records && g.records.find((r: any) => {
                    const rCveList = (r.cveList || r.title || r.id || "").toLowerCase();
                    return rCveList.includes(cve) || cve.includes(rCveList);
                  });
                  if (match) {
                    let sName = match.severity || "Medium";
                    if (sName === "VeryHigh" || sName === "Critical") sName = "Very High";
                    cveSeverity = sName;
                    foundInGroup = true;
                    break;
                  }
                }
              }

              if (!foundInGroup) {
                for (const sev of ["Very High", "High", "Medium", "Low"]) {
                  if (parsedCounts[sev] > 0) {
                    cveSeverity = sev;
                    parsedCounts[sev]--;
                    break;
                  }
                }
              }

              if (dynamicBreakdown[cveSeverity] !== undefined) {
                dynamicBreakdown[cveSeverity]++;
              }
            }
          });
        }

        if (unapprovedCvesInPkg > 0) {
          dynamicVulnerablePackages++;
          dynamicVulnerabilities += unapprovedCvesInPkg;
        }
      });

      return {
        ...baseSummary,
        vulnerabilities: dynamicVulnerabilities,
        breakdown: dynamicBreakdown,
        totalVulnerablePackages: dynamicVulnerablePackages,
      };
    } else {
      // Fallback if scaDetails is empty/unavailable
      const dynamicBreakdown = { ...baseSummary.breakdown };
      let approvedCount = 0;
      const approvedPackages = new Set<string>();
      const unapprovedPackages = new Set<string>();

      if (aggregatedData?.sca) {
        aggregatedData.sca.forEach((g: any) => {
          const isGrpApproved = g.status === "approved";
          g.records?.forEach((r: any) => {
            const pkg = (r.packageName || r.location || r.fileName || "unknown").toLowerCase().trim();
            if (isGrpApproved) {
              approvedCount++;
              const sev = r.severity;
              if (dynamicBreakdown[sev] > 0) {
                dynamicBreakdown[sev]--;
              }
              approvedPackages.add(pkg);
            } else {
              unapprovedPackages.add(pkg);
            }
          });
        });
      }

      const dynamicVulnerabilities = Math.max(0, baseSummary.vulnerabilities - approvedCount);
      let dynamicVulnerablePackages = baseSummary.totalVulnerablePackages;
      if (unapprovedPackages.size > 0 || approvedPackages.size > 0) {
        dynamicVulnerablePackages = unapprovedPackages.size;
      }

      return {
        ...baseSummary,
        vulnerabilities: dynamicVulnerabilities,
        breakdown: dynamicBreakdown,
        totalVulnerablePackages: dynamicVulnerablePackages,
      };
    }
  }, [resultsLoaded, backendScaSummary, aggregatedData, scaDetails]);

  const processImportedData = (data: any) => {
    console.log("CRITICAL: processImportedData called with:", data);
    try {
      setLastRawResponse(data);
      // The Recommended Version(s) column depends strictly on "scaSafeVersionEnabled" : true inside the JSON response of the scan
      setScaSafeVersionEnabled(data && data.scaSafeVersionEnabled === true);
      
      // Update fullConfig if these fields are present in the imported data (e.g. from dry-run JSON)
      if (fullConfig) {
        setFullConfig((prev: any) => {
          if (!prev) return prev;
          const next = JSON.parse(JSON.stringify(prev));
          if (data.auditorPrompt && next["SecondaryAudit"]) next["SecondaryAudit"].auditorPrompt = data.auditorPrompt;
          if (data.fallbackText && next["SecondaryAudit"]) next["SecondaryAudit"].fallbackText = data.fallbackText;
          if (data.sastPrompt && next["SAST&SCA Prompts"]) next["SAST&SCA Prompts"].sastPrompt = data.sastPrompt;
          if (data.scaPrompt && next["SAST&SCA Prompts"]) next["SAST&SCA Prompts"].scaPrompt = data.scaPrompt;
          return next;
        });
      }

      if (!data || Object.keys(data).length === 0) {
        throw new Error("Invalid Response: Data is empty.");
      }

      if (data && data.overview) {
        console.log("Merging Overview...");
        let languages = mockOverview.scanLanguages
          ? [...mockOverview.scanLanguages]
          : [];
        if (data.architectures) {
          if (Array.isArray(data.architectures)) {
            languages = data.architectures;
          } else if (typeof data.architectures === "string") {
            languages = data.architectures
              .replace(/[\[\]]/g, "")
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
          }
        }

        const getSafeArray = (key: string) => {
          if (Array.isArray((data as any)[key])) return (data as any)[key];
          if (data.overview && Array.isArray((data.overview as any)[key]))
            return (data.overview as any)[key];
          return [];
        };

        const packagingAnomalies = getSafeArray("packagingAnomalies");
        const unselectedModules = getSafeArray("unselectedModules");
        const minifedFiles = getSafeArray("minifedFiles");
        const noPrecompile = getSafeArray("noPrecompile");
        const missingSCAForSelectedModules = getSafeArray("missingSCAForSelectedModules");
        
        // Merge configNoSca into scaEcosystems
        let currentScaEcosystems = data.scaEcosystems || "";
        let ecosArray: string[] = [];
        if (typeof currentScaEcosystems === "string") {
          ecosArray = currentScaEcosystems.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
        } else if (Array.isArray(currentScaEcosystems)) {
          ecosArray = [...currentScaEcosystems];
        }
        
        configNoSca.forEach((noSca) => {
          if (!ecosArray.some((e: string) => e.toLowerCase() === noSca.toLowerCase())) {
            ecosArray.push(noSca);
          }
        });

        const mergedOverview = {
          ...mockOverview,
          ...data.overview,
          scanType: data.overview?.scanType || (selectedTools.includes("Checkmarx") ? "checkmarx" : "veracode"),
          architectures: data.architectures || [],
          scaEcosystems: ecosArray.length > 0 ? `[${ecosArray.join(", ")}]` : "",
          packagingAnomalies,
          unselectedModules,
          minifedFiles,
          noPrecompile,
          missingSCAForSelectedModules,
          selectedModules: data.selectedModules || [],
          scanLanguages:
            languages && languages.length > 0
              ? languages
              : mockOverview.scanLanguages,
        };

        console.log("Updating Overview State.");
        setOverview(mergedOverview);
      }

      if (data && data.sastSummary) setBackendSastSummary(data.sastSummary);
      if (data && data.scaSummary) setBackendScaSummary(data.scaSummary);
      
      // Enhance scaDetails with fileName from findingsWithCommentsSCA if available
      if (data && data.scaDetails) {
        let enhanced = data.scaDetails;
        const findings = data.findingsWithCommentsSCA || [];
        if (findings.length > 0) {
          enhanced = data.scaDetails.map((detail: any) => {
            const match = findings.find((f: any) => 
               (f.location === detail.packageName || f.packageName === detail.packageName) &&
               f.fileName
            );
            return {
              ...detail,
              fileName: match ? match.fileName : detail.fileName
            };
          });
        }
        setScaDetails(enhanced);
      }
      if (data && data.sastMitigationProposal)
        setSastMitigationProposal(data.sastMitigationProposal);
      if (data && data.scaMitigationProposal)
        setScaMitigationProposal(data.scaMitigationProposal);

      console.log("Processing Findings...");
      // Handle both formats (standard scan and dry run format)
      const rawSast = data?.findingsWithCommentsSAST || data?.sastDetails || [];
      const rawSca = data?.findingsWithCommentsSCA || data?.scaDetails || [];

      const sastFindings = Array.isArray(rawSast) ? rawSast : [];
      const scaFindings = Array.isArray(rawSca)
        ? rawSca.map((f: any) => ({
            ...f,
            type: "SCA",
            id: f.id || `sca-${Math.random().toString(36).substr(2, 9)}`,
            cweid: f.cweid || "0",
            title: f.title || f.packageName || "Unknown Product",
            severity: f.severity || f.severityCounts || "Medium",
            location: f.location || f.packageName || "Unknown location",
            userComments: f.userComments || [],
          }))
        : [];

      console.log(
        `Findings parsed: SAST=${sastFindings.length}, SCA=${scaFindings.length}`,
      );
      const sastGroups = aggregateFindings(sastFindings, "SAST");
      const scaGroups = aggregateFindings(scaFindings, "SCA");

      console.log("Setting Final States.");
      setAggregatedData({ sast: sastGroups, sca: scaGroups });

      // Auto-switch to appropriate tab based on findings
      if (sastGroups.length > 0) {
        setActiveTab("SAST");
      } else if (scaGroups.length > 0) {
        setActiveTab("SCA");
      } else {
        setActiveTab("Review");
      }

      setResultsLoaded(true);
      setBackendError(null);
      console.log("processImportedData Complete.");
    } catch (err) {
      console.error("Data Processing CRASH:", err);
      const message = err instanceof Error ? err.message : String(err);
      setBackendError(`Processing Error: ${message}`);
      throw err;
    }
  };

  const handleFetchResults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTools.length === 0) return;
    
    if (selectedTools.includes("Checkmarx")) {
      const isJsonFile = appProfile.toLowerCase().endsWith(".json");
      if (!appProfile || (!isJsonFile && (!branch || !selectedTier))) {
        setBackendError("Profile, Branch and Tier are all mandatory for Checkmarx analysis.");
        return;
      }
    } else {
      if (!appProfile) return;
    }

    setIsSubmitting(true);
    setBackendError(null);
    setErrorType(null);
    setSuggestedApps([]);
    const IS_PRODUCTION =
      import.meta.env.PROD || import.meta.env.VITE_ENVIRONMENT === "production";

    let handled = false;
    try {
      let reportUrl;
      if (selectedTools.includes("Checkmarx")) {
        reportUrl = `/api/checkmarx/getreport?application-name=${encodeURIComponent(appProfile)}&branch-name=${encodeURIComponent(branch)}&tierValue=${encodeURIComponent(selectedTier)}`;
      } else {
        reportUrl = `${getEndpoint('getFinalReport')}?application-name=${encodeURIComponent(appProfile)}`;
      }
      const response = await fetch(reportUrl);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonErr) {
          // If body is not JSON, check status
          const msg =
            response.status >= 500
              ? `Server Error (${response.status}): The backend encountered an unrecoverable issue.`
              : `Connection Error: Server returned ${response.status} ${response.statusText}`;

          setErrorType("SYSTEM_ERROR");
          setBackendError(msg);
          handled = true;
          return;
        }

        if (errorData) {
          const type = errorData.type || "SYSTEM_ERROR";
          const msg =
            errorData.message ||
            errorData.msg ||
            errorData.error ||
            (type === "SYSTEM_ERROR"
              ? "Veracode API is currently unavailable. Please try again later."
              : "An unexpected error occurred");

          setErrorType(type);
          if (type === "INVALID_APP") {
            setSuggestedApps(errorData.suggestions || []);
          }

          setBackendError(msg);
          setResultsLoaded(false);
          handled = true;
          return; // Stop here, states are set
        } else {
          setErrorType("SYSTEM_ERROR");
          setBackendError(
            `Connection Error: Server returned ${response.status}`,
          );
          handled = true;
          return;
        }
      }

      const data = await response.json();
      processImportedData(data);
    } catch (err: any) {
      if (handled) return;

      const message = err.message || String(err);
      console.error("Fetch Error:", message);

      const IS_PRODUCTION =
        import.meta.env.PROD ||
        import.meta.env.VITE_ENVIRONMENT === "production";

      if (IS_PRODUCTION) {
        setBackendError(message);
        setResultsLoaded(false);
      } else {
        console.warn(
          "Backend unreachable or invalid data. Falling back to mock data in Development mode.",
        );
        const sastGroups = aggregateFindings(mockSastFindings, "SAST");
        const scaGroups = aggregateFindings(mockScaFindings, "SCA");

        setBackendSastSummary(JSON.parse(JSON.stringify(mockSastSummary)));
        setBackendScaSummary(JSON.parse(JSON.stringify(mockScaSummary)));
        setSastMitigationProposal({ Total: 17, Medium: 16, Info: 1 });
        setScaMitigationProposal({ Total: 0, Medium: 0, Info: 0 });
        setOverview(mockOverview);
        setAggregatedData({ sast: sastGroups, sca: scaGroups });

        // Auto-switch to appropriate tab based on findings
        if (sastGroups.length > 0) {
          setActiveTab("SAST");
        } else if (scaGroups.length > 0) {
          setActiveTab("SCA");
        } else {
          setActiveTab("Review");
        }

        setResultsLoaded(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePullAIResponse = async (group: AggregatedGroup, forceBypass = false) => {
    // Basic secret detection in comments before sending to AI
    const secretPattern = /\b(password|pwd|secret|token|api_key|apikey|user-name|username|credential|key)\b/i;
    
    // Check if any comment contains sensitive info
    const hasSensitiveInfo = secretPattern.test(group.comments);

    if (hasSensitiveInfo && !forceBypass) {
      setSensitiveGroupToBypass(group);
      return;
    }
    
    setSensitiveGroupToBypass(null);
    setLoadingAIGroups(prev => new Set(prev).add(group.groupId));

    try {
      let flawId: string | undefined;
      let flawSummary: string | undefined;

      if (group.type === "SAST") {
        flawId = String(group.cweId).startsWith("CWE-") ? String(group.cweId) : `CWE-${group.cweId}`;
        flawSummary = (group.records[0] as any)?.description;
      } else if (group.type === "SCA") {
        flawId = group.records[0]?.id;
        flawSummary = (group.records[0] as any)?.cve_summary;
      }

      // Call API with engine name, user comments (group.comments), and finding type (SCA/SAST)
      const response = await getAIResponseForComment(
        group.comments,
        group.type,
        aiProvider,
        flawId,
        flawSummary
      );
      
      const estimatedInputTokens = Math.ceil((group.comments || "").length / 4) + 150; // Approximating ~150 prompt tokens
      const estimatedOutputTokens = Math.ceil((response.result || "").length / 4);

      updateGroupAIComment(group.groupId, response.result, {
        inputTokens: response.inputTokens || estimatedInputTokens,
        outputTokens: response.outputTokens || estimatedOutputTokens,
        totalTokens: response.totalTokens || (estimatedInputTokens + estimatedOutputTokens),
        engine: response.engine || aiProvider
      });
    } finally {
      setLoadingAIGroups(prev => {
        const next = new Set(prev);
        next.delete(group.groupId);
        return next;
      });
    }
  };

  const updateGroupAIComment = (groupId: string, newComment: string, aiMetrics?: any) => {
    setAggregatedData((prev) => ({
      sast: prev.sast.map((g) =>
        g.groupId === groupId ? { ...g, aiComment: newComment, ...(aiMetrics ? { aiMetrics } : {}) } : g,
      ),
      sca: prev.sca.map((g) =>
        g.groupId === groupId ? { ...g, aiComment: newComment, ...(aiMetrics ? { aiMetrics } : {}) } : g,
      ),
    }));
    setDetailedGroup((prev) =>
      prev?.groupId === groupId ? { ...prev, aiComment: newComment, ...(aiMetrics ? { aiMetrics } : {}) } : prev,
    );
  };

  const toggleGroupSelection = (groupId: string) => {
    const next = new Set(selectedGroups);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setSelectedGroups(next);
  };

  const toggleGroupExpansion = (groupId: string) => {
    const next = new Set(expandedGroups);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setExpandedGroups(next);
  };

  const handleBatchAction = async (status: "approved" | "rejected") => {
    const affected =
      activeTab === "SAST" ? aggregatedData.sast : aggregatedData.sca;
    const selected = affected.filter((g) => selectedGroups.has(g.groupId));

    if (selected.length === 0) {
      alert("Please select records to " + status);
      return;
    }

    const missingComments = selected.filter((g) => !g.aiComment || g.aiComment.trim() === "");
    if (missingComments.length > 0) {
      const missingNames = missingComments
        .map(g => {
          if (g.type === "SCA" && g.identifier) {
            return g.records[0]?.title || g.identifier.split(" - ")[0];
          }
          return `CWE-${g.cweId}`;
        })
        .join("\n• ");
      setErrorType("MITIGATION_COMMENTS_REQUIRED");
      setBackendError(`Mitigation proposals or Review comments are missing for the following selected items:\n\n• ${missingNames}\n\nPlease add comments for all selected items before submitting approvals or rejections.`);
      return;
    }

    setBatchModalConfig({
      isOpen: true,
      actionType: status,
      selectedItems: selected,
    });
  };

  const handleBatchSubmit = async () => {
    if (!batchModalConfig) return;
    
    setIsSubmitting(true);
    const { actionType, selectedItems } = batchModalConfig;
    const actionStr = actionType === "approved" ? "accepted" : "rejected";
    const buildId = activeOverview.buildId || "";

    let successCount = 0;
    let lastErrorMsg = "";
    for (const group of selectedItems) {
      const flawIdList = group.records.map((f: any) => f.issue_id || f.id).join(",");
      const isSCA = group.type === "SCA";
      const cveId = isSCA ? group.records[0]?.title || null : null;

      const isCheckmarxFlow = selectedTools.includes("Checkmarx") || activeOverview.scanType === "checkmarx";
      const useCheckmarxApi = isCheckmarxFlow && group.type === "SAST";

      const payload = useCheckmarxApi ? {
        appId: activeOverview.appId || "",
        scanId: buildId,
        flawIdList,
        action: actionStr,
        comment: group.aiComment,
        type: "SAST"
      } : {
        buildId,
        appId: activeOverview.appId || "",
        flawIdList,
        action: actionStr,
        comment: group.aiComment,
        cveId,
        type: group.type,
      };

      try {
        const endpoint = useCheckmarxApi 
          ? getEndpoint('checkmarxMitigation') 
          : getEndpoint('veracodeMitigation');
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        let resData;
        try {
          resData = await response.json();
        } catch (err) {
          resData = {};
        }

        if (!response.ok || resData.status === "error") {
          throw new Error(JSON.stringify({
            message: resData.message || "Failed to update mitigation. Please check the server logs.",
            type: resData.type || "MITIGATION_ERROR"
          }));
        }

        successCount++;
        setAggregatedData((prev) => ({
          sast: prev.sast.map((g) =>
            g.groupId === group.groupId ? { ...g, status: actionType } : g,
          ),
          sca: prev.sca.map((g) =>
            g.groupId === group.groupId ? { ...g, status: actionType } : g,
          ),
        }));
        setSelectedGroups((prev) => {
          const next = new Set(prev);
          next.delete(group.groupId);
          return next;
        });

        const isSAST = group.type === "SAST";
        
        if (isSAST) {
          setSastMitigationProposal((prev: any) => updateMitigationProposal(prev, group));

          if (actionType === "approved") {
            setBackendSastSummary((prev: any) => updateBackendSummary(prev, group));
          }
        } else {
          setScaMitigationProposal((prev: any) => updateMitigationProposal(prev, group));

          if (actionType === "approved") {
            setBackendScaSummary((prev: any) => updateBackendSummary(prev, group));
          }
        }
      } catch (err: any) {
        console.error(`Error during batch action for ${group.groupId}:`, err.message);
        lastErrorMsg = err.message;
      }
    }
    
    setIsSubmitting(false);
    setBatchModalConfig(null);
    setSelectedGroups(new Set());
    if (successCount === selectedItems.length) {
      setSuccessMessage(`Successfully ${actionType} ${successCount}/${selectedItems.length} groups.`);
    } else if (successCount > 0) {
      setSuccessMessage(`Successfully ${actionType} ${successCount}/${selectedItems.length} groups. Some failed: ${lastErrorMsg}`);
    } else {
      let parsedErr: any = {};
      try {
        parsedErr = JSON.parse(lastErrorMsg);
      } catch (e) {
        parsedErr = null;
      }
      
      const errMsg = parsedErr ? parsedErr.message : lastErrorMsg;
      const errType = parsedErr ? parsedErr.type : "MITIGATION_ERROR";

      setErrorType(errType || "MITIGATION_ERROR");
      setBackendError(errMsg || 'Unknown error');
    }
  };

  const severityOrderRenderer: Record<string, number> = {
    "Very High": 1,
    High: 2,
    Medium: 3,
    Low: 4,
    Information: 5,
    Info: 5,
  };

  const getSortedGroups = (groups: AggregatedGroup[]) => {
    return [...groups].sort((a, b) => {
      const orderA = severityOrderRenderer[a.severity] || 99;
      const orderB = severityOrderRenderer[b.severity] || 99;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const titleA = (a.type === 'SCA' 
        ? (a.records[0]?.title || (a.identifier ? a.identifier.split(" - ")[0] : "")) 
        : `CWE-${a.cweId}`).toLowerCase();
      const titleB = (b.type === 'SCA' 
        ? (b.records[0]?.title || (b.identifier ? b.identifier.split(" - ")[0] : "")) 
        : `CWE-${b.cweId}`).toLowerCase();
      return titleA.localeCompare(titleB);
    });
  };

  const currentGroups = React.useMemo(() => {
    const raw = activeTab === "SAST"
      ? getSortedGroups(aggregatedData.sast)
      : getSortedGroups(aggregatedData.sca);
    
    if (hideProcessedFindings) {
      return raw.filter(g => !g.status);
    }
    return raw;
  }, [activeTab, aggregatedData, hideProcessedFindings]);

  const activeOverview = React.useMemo(() => {
    const IS_PRODUCTION =
      import.meta.env.PROD || import.meta.env.VITE_ENVIRONMENT === "production";
    if (!resultsLoaded && IS_PRODUCTION) {
      return {
        applicationName: "System Idle",
        appId: "---",
        accountId: "---",
        buildId: "---",
        analysisId: "---",
        scanName: "---",
        generationDate: "---",
        submitted_date: "---",
        policyName: "---",
        policyComplianceStatus: "---",
        sastScore: 0,
        sastRating: "-",
        scanLanguages: [],
        packagingAnomalies: [],
        unselectedModules: [],
        gracePeriod: "---"
      };
    }
    return resultsLoaded ? overview : mockOverview;
  }, [resultsLoaded, overview]);

  useEffect(() => {
    const tierVal = (activeOverview as any)?.tier;
    if (tierVal && configTiers.includes(tierVal)) {
      setSelectedTier(tierVal);
    }
  }, [activeOverview, configTiers]);

  return (
    <ErrorBoundary
      onError={(err) => setBackendError(`Render Crash: ${err.message}`)}
    >
      <div className="h-screen overflow-hidden bg-slate-950 text-slate-200 font-sans p-4 selection:bg-blue-500/30">
        <div className="max-w-[1450px] mx-auto grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-4 h-full">
          {/* TOP BAR: Controls */}
          <div className="col-span-12 bento-card p-2.5 flex items-center justify-start gap-4 bg-slate-900/50 backdrop-blur-xl flex-shrink-0">
            <div className="flex gap-4 items-center flex-1">
              <div className="flex items-center gap-2.5">
                <div className="bg-blue-600 p-1.5 rounded-lg text-white">
                  <Shield size={20} />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-sm font-black tracking-tight leading-tight">
                    CRS Review Tool
                  </h1>
                  <p className="text-[9px] text-slate-500 font-mono tracking-widest uppercase mt-0.5">
                    v1.0.0
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleFetchResults}
                className="flex gap-4 items-end"
              >
                {configIntakeRequest !== false && (
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                        SNOW
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !showSnowScreen;
                          setShowSnowScreen(nextVal);
                          if (nextVal) {
                            setSelectedTools([]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border flex items-center gap-1.5 shadow-lg active:scale-95 ${
                          showSnowScreen
                            ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40 border-blue-500"
                            : "bg-slate-800 border-slate-700 text-blue-400 hover:border-slate-600"
                        }`}
                      >
                        <Database size={12} className={showSnowScreen ? "text-white" : "text-blue-500"} />
                        Intake
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                    Tool Chain
                  </span>
                  <div className="flex gap-2">
                    {(["Veracode", "Checkmarx"] as ToolName[]).map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => toggleTool(tool)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          selectedTools.includes(tool)
                            ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40"
                            : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                    Profile
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. app-core-v1"
                    value={appProfile}
                    onChange={(e) => setAppProfile(e.target.value)}
                    list="app-profiles-list"
                    className="bento-input w-48 text-[10px] py-1"
                  />
                  <datalist id="app-profiles-list">
                    {configHistory.map((app) => (
                      <option key={app} value={app} />
                    ))}
                  </datalist>
                </div>

                {selectedTools.includes("Checkmarx") && (
                  <>
                    <div id="checkmarx-branch-container" className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                        Branch
                      </span>
                      <input
                        type="text"
                        placeholder="e.g. main, dev"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="bento-input w-36 text-[10px] py-1 bg-slate-950 border-slate-700"
                      />
                    </div>
                    <div id="checkmarx-tier-container" className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                        Tier
                      </span>
                      <select
                        value={selectedTier}
                        onChange={(e) => setSelectedTier(e.target.value)}
                        className="bento-input w-32 text-[10px] py-1 bg-slate-950 border-slate-700 font-bold"
                      >
                        {configTiers.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                    AI Engine
                  </span>
                  <select
                    value={aiProvider}
                    onChange={(e) =>
                      setAiProvider(e.target.value as AIProvider)
                    }
                    className="bento-input text-[10px] py-1 border-slate-700 bg-slate-950 font-bold"
                  >
                    {configEngines.map((engine) => (
                      <option key={engine} value={engine}>
                        {engine}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    selectedTools.length === 0 ||
                    !appProfile ||
                    (selectedTools.includes("Checkmarx") &&
                      !appProfile.toLowerCase().endsWith(".json") &&
                      (!branch.trim() || !selectedTier))
                  }
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-6 rounded-lg text-xs transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCcw size={14} className="animate-spin" />
                  ) : (
                    "RUN ANALYSIS"
                  )}
                </button>
              </form>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={toggleSettings}
                className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all ring-1 ring-slate-800 hover:shadow-lg"
                title="System Configuration"
              >
                <Settings size={20} />
              </button>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    isServerOnline 
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" 
                      : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                  }`} />
                  <span className={`text-[10px] font-mono tracking-wider ${
                    isServerOnline ? "text-slate-400" : "text-red-400"
                  }`}>
                    {isServerOnline ? "SYSTEM_READY" : "SYSTEM_OFFLINE"}
                  </span>
                </div>
              </div>
              {resultsLoaded && (
                <button
                  onClick={() => setResultsLoaded(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-all"
                >
                  <RefreshCcw size={16} />
                </button>
              )}
            </div>
          </div>

          {showSnowScreen ? (
            <SnowIntakeScreen onClose={() => setShowSnowScreen(false)} />
          ) : !resultsLoaded ? (
            <div className="col-span-12 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <div className="w-20 h-20 bg-slate-900 rounded-3xl border border-slate-700 flex items-center justify-center mx-auto mb-6 shadow-2xl">
                  <Search className="text-blue-500" size={32} />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Access Secure Findings
                </h2>
                <p className="text-slate-500 text-sm">
                  Select your security scanner and target application profile to
                  initialize the vulnerability audit workflow.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* SIDEBAR: Stats */}
              <div className="col-span-3 flex flex-col gap-2 overflow-y-auto min-h-0 min-w-0 pr-1 pb-4">
                <div className="bento-card p-3 bg-slate-900/40 shrink-0">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-black">
                      VULNERABILITIES
                    </h3>
                    <div className="text-right">
                      <span className="text-2xl font-black text-blue-400 leading-none">
                        {activeOverview.sastScore}%
                      </span>
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black opacity-60 mt-1">
                        SAST SCORE
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {/* SAST Breakdown */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] uppercase tracking-widest font-black text-slate-400 border-b border-slate-800 pb-0.5">
                        <span>SAST</span>
                        <span className="text-white text-[10px]">
                          {sastSummary.vulnerabilities}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {["Very High", "High", "Medium", "Low", "Information"].map((sev) => {
                          const count =
                            (sastSummary.breakdown as any)[sev] || 0;
                          return (
                            <div
                              key={sev}
                              className="flex-1 min-w-[48px] p-2 rounded-lg border border-slate-800/50 flex flex-col items-center justify-center text-center bg-slate-800/10"
                            >
                              <span className="text-[8px] text-slate-500 uppercase font-black tracking-tighter mb-0.5 select-none">
                                {sev === "Very High" ? (selectedTools.includes("Checkmarx") ? "CRITICAL" : "V. HIGH") : sev === "Information" ? "INFO" : sev}
                              </span>
                              <span
                                className={`text-[13px] font-mono font-black ${
                                  (count as number) > 0
                                    ? sev === "Very High"
                                      ? "text-purple-400"
                                    : sev === "High"
                                      ? "text-red-400"
                                      : sev === "Medium"
                                        ? "text-orange-400"
                                        : sev === "Low"
                                          ? "text-blue-400"
                                          : "text-slate-300"
                                    : "text-slate-600"
                                }`}
                              >
                                {count as number}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SCA Breakdown */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] uppercase tracking-widest font-black text-slate-400 border-b border-slate-800 pb-0.5">
                        <span>SCA</span>
                        <span className="text-white text-[10px]">
                          {scaSummary.vulnerabilities}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {["Very High", "High", "Medium", "Low"].map((sev) => {
                          const count = (scaSummary.breakdown as any)[sev] || 0;
                          return (
                            <div
                              key={sev}
                              className="flex-1 min-w-[48px] p-2 rounded-lg border border-slate-800/50 flex flex-col items-center justify-center text-center bg-slate-800/10"
                            >
                              <span className="text-[8px] text-slate-500 uppercase font-black tracking-tighter mb-0.5 select-none">
                                {sev === "Very High" ? (selectedTools.includes("Checkmarx") ? "CRITICAL" : "V. HIGH") : sev}
                              </span>
                              <span
                                className={`text-[13px] font-mono font-black ${
                                  (count as number) > 0
                                    ? sev === "Very High"
                                      ? "text-purple-400"
                                      : sev === "High"
                                        ? "text-red-400"
                                        : sev === "Medium"
                                          ? "text-orange-400"
                                          : sev === "Low"
                                            ? "text-blue-400"
                                            : "text-slate-300"
                                    : "text-slate-600"
                                }`}
                              >
                                {count as number}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold px-1 uppercase tracking-widest pt-0.5">
                        <span>TOTAL PACKAGES: {scaSummary.totalPackages}</span>
                        <span className="text-red-400">
                          VULNERABLE PACKAGES:{" "}
                          {scaSummary.totalVulnerablePackages}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bento-card bg-slate-900/40 p-3 flex flex-col shrink-0 !overflow-visible">
                  <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-black mb-2">
                    Scan Analysis
                  </h3>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center py-1 border-b border-slate-800/50 gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 uppercase font-black shrink-0">
                        MODULE SELECTED
                      </span>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {((activeOverview as any).scanLanguages || []).map(
                          (lang: string) => (
                            <div
                              key={lang}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/50 border border-slate-700/50"
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${
                                  lang === "JavaScript"
                                    ? "bg-yellow-400"
                                    : lang === ".NET"
                                      ? "bg-indigo-400"
                                      : lang === "Java"
                                        ? "bg-orange-500"
                                        : lang === "Python"
                                          ? "bg-blue-400"
                                          : "bg-slate-400"
                                }`}
                              />
                              <span className="text-[9px] font-bold text-slate-300">
                                {lang}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-800/50 gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 uppercase font-black shrink-0">
                        SCA MISSING
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase text-right break-words min-w-0 ${(() => {
                          const archs =
                            (activeOverview as any).architectures || [];
                          const ecoObj =
                            (activeOverview as any).scaEcosystems || "";
                          let ecos: string[] = [];
                          if (typeof ecoObj === "string") {
                            ecos = ecoObj
                              .replace(/[\[\]]/g, "")
                              .split(",")
                              .map((s: string) => s.trim())
                              .filter(Boolean);
                          } else if (Array.isArray(ecoObj)) {
                            ecos = ecoObj;
                          }
                          const missing = archs.filter(
                            (a: string) =>
                              !ecos.some(
                                (e: string) =>
                                  e.toLowerCase() === a.toLowerCase(),
                              ),
                          );
                          return missing.length === 0
                            ? "text-emerald-500"
                            : "text-red-400";
                        })()}`}
                      >
                        {(() => {
                          const archs =
                            (activeOverview as any).architectures || [];
                          const ecoObj =
                            (activeOverview as any).scaEcosystems || "";
                          let ecos: string[] = [];
                          if (typeof ecoObj === "string") {
                            ecos = ecoObj
                              .replace(/[\[\]]/g, "")
                              .split(",")
                              .map((s: string) => s.trim())
                              .filter(Boolean);
                          } else if (Array.isArray(ecoObj)) {
                            ecos = ecoObj;
                          }
                          const missing = archs.filter(
                            (a: string) =>
                              !ecos.some(
                                (e: string) =>
                                  e.toLowerCase() === a.toLowerCase(),
                              ),
                          );
                          return missing.length === 0
                            ? "NORMAL"
                            : missing.join(", ");
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 uppercase font-black shrink-0">
                        MODULE SELECTION
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase ${((activeOverview as any).unselectedModules || []).length === 0 ? "text-emerald-500" : "text-red-400"}`}
                      >
                        {((activeOverview as any).unselectedModules || [])
                          .length === 0
                          ? "Complete"
                          : "Partial"}
                      </span>
                    </div>

                    {/* Minified Files Status */}
                    {(activeOverview as any).scanType !== "checkmarx" && (
                    <div id="scan-analysis-minified" className="flex justify-between items-center py-1 border-t border-slate-800/50 gap-2 flex-wrap relative group">
                      <span className="text-[10px] text-slate-500 uppercase font-black shrink-0">
                        MINIFIED FILES
                      </span>
                      <div className="flex items-center gap-1.5 cursor-pointer leading-none">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            ((activeOverview as any).minifedFiles || []).length === 0
                              ? "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                              : "bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse"
                          }`}
                        />
                        <span
                          className={`text-[10px] font-black uppercase ${
                            ((activeOverview as any).minifedFiles || []).length === 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {((activeOverview as any).minifedFiles || []).length === 0
                            ? "None"
                            : `${((activeOverview as any).minifedFiles || []).length} Found`}
                        </span>
                      </div>
                      {((activeOverview as any).minifedFiles || []).length > 0 && (
                        <div id="scan-analysis-minified-tooltip" className="absolute right-0 bottom-full mb-1.5 z-50 hidden group-hover:block w-72 bg-slate-950 border border-slate-800 rounded-lg p-2.5 shadow-2xl transition-all duration-150">
                          <div className="text-[9px] uppercase font-black text-red-400 mb-1 border-b border-slate-800/60 pb-0.5 font-mono">
                            Minified Files ({((activeOverview as any).minifedFiles || []).length})
                          </div>
                          <ul className="text-[8px] font-mono text-slate-300 space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
                            {((activeOverview as any).minifedFiles || []).map((file: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="text-red-400 select-none shrink-0">•</span>
                                <span className="break-all">{file}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    )}

                    {/* Precompile Status */}
                    {(activeOverview as any).scanType !== "checkmarx" && (
                    <div id="scan-analysis-precompile" className="flex justify-between items-center py-1 border-t border-slate-800/50 gap-2 flex-wrap relative group">
                      <span className="text-[10px] text-slate-500 uppercase font-black shrink-0">
                        PRECOMPILE
                      </span>
                      <div className="flex items-center gap-1.5 cursor-pointer leading-none">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            ((activeOverview as any).noPrecompile || []).length === 0
                              ? "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                              : "bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse"
                          }`}
                        />
                        <span
                          className={`text-[10px] font-black uppercase ${
                            ((activeOverview as any).noPrecompile || []).length === 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {((activeOverview as any).noPrecompile || []).length === 0
                            ? "None"
                            : `${((activeOverview as any).noPrecompile || []).length} Missing`}
                        </span>
                      </div>
                      {((activeOverview as any).noPrecompile || []).length > 0 && (
                        <div id="scan-analysis-precompile-tooltip" className="absolute right-0 bottom-full mb-1.5 z-50 hidden group-hover:block w-72 bg-slate-950 border border-slate-800 rounded-lg p-2.5 shadow-2xl transition-all duration-150">
                          <div className="text-[9px] uppercase font-black text-red-400 mb-1 border-b border-slate-800/60 pb-0.5 font-mono">
                            Unprecompiled Modules ({((activeOverview as any).noPrecompile || []).length})
                          </div>
                          <ul className="text-[8px] font-mono text-slate-300 space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
                            {((activeOverview as any).noPrecompile || []).map((file: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="text-red-400 select-none shrink-0">•</span>
                                <span className="break-all">{file}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    )}


                  </div>
                </div>

                <div className="bento-card p-3 bg-slate-900 border-slate-800/50 shadow-xl flex flex-col shrink-0">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-2">
                    Batch Actions
                  </h3>
                  <div className="space-y-1.5">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800/50 flex flex-wrap items-center justify-between gap-x-2">
                      <span className="text-[8px] text-slate-500 uppercase font-black break-words min-w-0">
                        Selected
                      </span>
                      <span className="text-white font-mono font-black text-xs shrink-0">
                        {selectedGroups.size}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => handleBatchAction("approved")}
                        disabled={selectedGroups.size === 0 || isSubmitting}
                        className="py-2 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-20 flex items-center justify-center gap-1"
                      >
                        {isSubmitting && batchModalConfig?.actionType === "approved" && (
                          <RefreshCcw size={10} className="animate-spin" />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => handleBatchAction("rejected")}
                        disabled={selectedGroups.size === 0 || isSubmitting}
                        className="py-2 bg-red-600/10 text-red-400 border border-red-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all disabled:opacity-20 flex items-center justify-center gap-1"
                      >
                        {isSubmitting && batchModalConfig?.actionType === "rejected" && (
                          <RefreshCcw size={10} className="animate-spin" />
                        )}
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* MAIN CONTENT: Findings Table */}
              <div className="col-span-9 bento-card flex flex-col bg-slate-900 border-slate-800 overflow-hidden min-h-0 min-w-0">
                {/* Metadata Panel */}
                <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-start">
                  <div className="flex flex-col mr-4 lg:mr-6 flex-1 min-w-[200px] max-w-[320px]">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      Profile
                    </span>
                    {(() => {
                      const accountId = activeOverview.accountId || "";
                      const appId = activeOverview.appId || "";
                      const buildId = activeOverview.buildId || "";
                      const scanName = activeOverview.scanName || "";
                      const isCheckmarx = activeOverview.scanType === "checkmarx";
                      const profileUrl = isCheckmarx
                        ? `https://us.ast.checkmarx.net/projects/${buildId}/overview?branch=${scanName}`
                        : `https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:${accountId}:${appId}:${buildId}`;
                      
                      return (
                        <p
                          className="text-[11px] font-bold truncate w-full"
                          title={activeOverview.applicationName}
                        >
                          <a
                            href={profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 hover:text-sky-300 underline transition-colors"
                          >
                            {activeOverview.applicationName}
                          </a>
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col mr-8 lg:mr-14">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      Scan Name
                    </span>
                    <p
                      className="text-[11px] font-bold text-slate-300 truncate max-w-[180px]"
                      title={activeOverview.scanName}
                    >
                      {activeOverview.scanName}
                    </p>
                  </div>
                  <div className="flex flex-col mr-6 lg:mr-10">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      Date
                    </span>
                    <p className="text-[11px] font-mono text-slate-400" title={activeOverview.submitted_date || activeOverview.generationDate || ""}>
                      {
                        String(activeOverview.submitted_date || activeOverview.generationDate || "---").split(
                          " ",
                        )[0]
                      }
                    </p>
                  </div>
                  {(() => {
                    const getEffectiveScanDate = (ovw: any) => {
                      if (ovw?.scanName) {
                        const match = ovw.scanName.match(/^\d{4}-\d{2}-\d{2}/);
                        if (match) return match[0];
                      }
                      return ovw?.submitted_date || ovw?.generationDate || null;
                    };
                    const effectiveDate = getEffectiveScanDate(activeOverview);
                    if (calculateIsScanTooOld(effectiveDate, configScanValidityDays)) {
                      return (
                        <div className="flex flex-col mr-6 lg:mr-8 bg-red-900/40 px-6 py-2 rounded-lg border-2 border-red-500/50 justify-center">
                          <p className="text-xl font-bold text-red-500">
                            Scan is older then {configScanValidityDays} days
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="flex flex-col mr-4 flex-1 min-w-[250px]">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      Policy
                    </span>
                    <p
                      className="text-[11px] font-bold text-slate-400 truncate w-full"
                      title={activeOverview.policyName}
                    >
                      {activeOverview.policyName}
                    </p>
                    {activeOverview.gracePeriod && activeOverview.gracePeriod !== "---" && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {activeOverview.gracePeriod.split(',').map((period, index) => {
                          const trimPeriod = period.trim();
                          let colorClass = "bg-blue-600/10 text-blue-400 border-blue-500/20";
                          if (trimPeriod.toLowerCase().includes("high")) colorClass = "bg-red-600/10 text-red-400 border-red-500/20";
                          else if (trimPeriod.toLowerCase().includes("medium")) colorClass = "bg-amber-600/10 text-amber-400 border-amber-500/20";
                          else if (trimPeriod.toLowerCase().includes("low")) colorClass = "bg-emerald-600/10 text-emerald-400 border-emerald-500/20";
                          
                          return (
                          <span 
                            key={index} 
                            className={`text-[8px] font-bold px-1 py-px rounded border whitespace-nowrap hidden lg:inline-block ${colorClass}`}
                            title={trimPeriod}
                          >
                            {trimPeriod.replace(/:/g, ': ').toUpperCase()}
                          </span>
                        )})}
                        <span 
                          className="text-[9px] font-medium text-slate-400 truncate w-full lg:hidden"
                          title={activeOverview.gracePeriod}
                        >
                          {activeOverview.gracePeriod.replace(/:/g, ': ')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col flex-shrink-0">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                      Compliance
                    </span>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${(activeOverview.policyComplianceStatus || "").includes("Pass") ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
                      />
                      <p
                        className={`text-[10px] font-black uppercase ${(activeOverview.policyComplianceStatus || "").includes("Pass") ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {activeOverview.policyComplianceStatus || "---"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex w-full justify-start border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 overflow-x-auto whitespace-nowrap scrollbar-hide">
                  {(["SAST", "SCA", "Review"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`grow-0 basis-1/3 px-6 py-3 text-[11px] font-black uppercase tracking-[0.1em] transition-all relative flex flex-col justify-center items-center gap-1 ${
                        activeTab === tab
                          ? "text-blue-400 bg-blue-500/5"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <span>{tab === "Review" ? "Review Comments" : `${tab} Mitigation Proposals`}</span>
                      
                      {tab === "SAST" && sastMitigationProposal && sastMitigationProposal.Total > 0 && (
                        <div className="flex items-center gap-2 text-[8px] tracking-normal font-bold">
                          <span className="text-slate-400">Proposals: <span className="text-white">{sastMitigationProposal.Total}</span></span>
                          {[
                            "Very High",
                            "High",
                            "Medium",
                            "Low",
                            "Information",
                            "Info",
                          ].map((sev) => {
                            const count = sastMitigationProposal[sev];
                            if (!count || count <= 0) return null;
                            return (
                              <span key={sev} className="flex gap-1">
                                <span className="text-slate-500">
                                  {sev === "Very High" 
                                    ? (selectedTools.includes("Checkmarx") ? "Critical" : "V.High") 
                                    : sev.replace('Information', 'Info')}
                                </span>
                                <span className={`${
                                  (sev === "Very High" || sev === "Critical") ? "text-purple-400" :
                                  sev === "High" ? "text-red-400" :
                                  sev === "Medium" ? "text-orange-400" :
                                  sev === "Low" ? "text-blue-400" :
                                  "text-slate-300"
                                }`}>{count as number}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {tab === "SCA" && scaMitigationProposal && scaMitigationProposal.Total > 0 && (
                        <div className="flex items-center gap-2 text-[8px] tracking-normal font-bold">
                          <span className="text-slate-400">Proposals: <span className="text-white">{scaMitigationProposal.Total}</span></span>
                          {[
                            "Very High",
                            "High",
                            "Medium",
                            "Low",
                            "Information",
                            "Info",
                          ].map((sev) => {
                            const count = scaMitigationProposal[sev];
                            if (!count || count <= 0) return null;
                            return (
                              <span key={sev} className="flex gap-1">
                                <span className="text-slate-500">
                                  {sev === "Very High" 
                                    ? (selectedTools.includes("Checkmarx") ? "Critical" : "V.High") 
                                    : sev.replace('Information', 'Info')}
                                </span>
                                <span className={`${
                                  (sev === "Very High" || sev === "Critical") ? "text-purple-400" :
                                  sev === "High" ? "text-red-400" :
                                  sev === "Medium" ? "text-orange-400" :
                                  sev === "Low" ? "text-blue-400" :
                                  "text-slate-300"
                                }`}>{count as number}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {activeTab === tab && (
                        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-500 shadow-[0_-4px_12px_rgba(59,130,246,0.5)]" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-auto flex flex-col min-h-0 min-w-0">
                  {activeTab === "Review" ? (
                    <ReviewTabContent
                      overview={activeOverview}
                      backendSastSummary={backendSastSummary}
                      backendScaSummary={backendScaSummary}
                      scaDetails={scaDetails}
                      sastSummary={sastSummary}
                      scaSummary={scaSummary}
                      configNoSca={configNoSca}
                      configScanValidityDays={configScanValidityDays}
                      scaSafeVersionEnabled={scaSafeVersionEnabled}
                      aggregatedData={aggregatedData}
                      selectedTools={selectedTools}
                    />
                  ) : (
                    <>
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950/40 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-20 backdrop-blur-sm">
                          <tr>
                            <th className="p-4 w-12 text-center">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0"
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const ids = currentGroups
                                      .filter((g) => !g.status)
                                      .map((g) => g.groupId);
                                    setSelectedGroups(new Set(ids));
                                  } else {
                                    setSelectedGroups(new Set());
                                  }
                                }}
                                checked={
                                  currentGroups.filter(g => !g.status).length > 0 &&
                                  selectedGroups.size === currentGroups.filter(g => !g.status).length
                                }
                                disabled={currentGroups.filter(g => !g.status).length === 0}
                              />
                            </th>
                            <th className="p-4 w-20">Qty</th>
                            <th className="p-4 w-40">Identifier</th>
                            <th className="p-4">Context & AI assessment</th>
                            <th className="p-4 w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          <AnimatePresence initial={false}>
                            {currentGroups.map((group) => (
                              <GroupRow
                                key={group.groupId}
                                group={group}
                                isSelected={selectedGroups.has(group.groupId)}
                                onSelect={() =>
                                  toggleGroupSelection(group.groupId)
                                }
                                onPullAI={() => handlePullAIResponse(group)}
                                isPulling={loadingAIGroups.has(group.groupId)}
                                onUpdateAIComment={(val) =>
                                  updateGroupAIComment(group.groupId, val)
                                }
                                onViewFull={() => setDetailedGroup(group)}
                                isCheckmarx={selectedTools.includes("Checkmarx")}
                              />
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                      {currentGroups.length === 0 && (
                        <div className="py-24 text-center">
                          <Database
                            size={40}
                            className="mx-auto text-slate-800 mb-4"
                          />
                          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">
                            No active {activeTab === "Review" ? "review comments" : "mitigation proposals"} in {activeTab}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>TOTAL: {currentGroups.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>
                        APPROVED:{" "}
                        {
                          currentGroups.filter((g) => g.status === "approved")
                            .length
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span>
                        REJECTED:{" "}
                        {
                          currentGroups.filter((g) => g.status === "rejected")
                            .length
                        }
                      </span>
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}
        </div>

        {/* Settings Modal */}
        <AnimatePresence>
          {isSettingsOpen && fullConfig && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSettingsOpen(false)}
                className="absolute inset-0 bg-black/20 pointer-events-auto"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-5xl bg-slate-900/40 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto"
              >
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                      <Settings className="text-blue-500" size={24} /> System Configuration
                    </h2>
                    <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-widest">
                      Grouped System Control Center
                    </p>
                  </div>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all shadow-sm"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex gap-2 p-3 border-b border-slate-800 bg-slate-900/30 overflow-x-auto scrollbar-hide">
                  {["SAST&SCA Prompts", "System", "AiEngine", "SecondaryAudit", "Compliance", "Exclusions", "Architecture Mapping"].filter(tab => {
                    if (tab === "SecondaryAudit") {
                      return fullConfig["System"]?.secondaryAuditEnabled;
                    }
                    return true;
                  }).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setSettingsTab(tab)}
                      className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap border shrink-0 ${
                        settingsTab === tab 
                          ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40' 
                          : 'bg-slate-800/50 text-slate-500 border-slate-800 hover:border-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="p-8 space-y-8 overflow-y-auto h-[600px] custom-scrollbar bg-slate-950/20">
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* SAST&SCA Prompts Tab */}
                    {settingsTab === "SAST&SCA Prompts" && fullConfig["SAST&SCA Prompts"] && (
                      <div className="space-y-8">
                        <section className="space-y-3">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" /> SAST Prompt Engine
                          </h3>
                          <textarea
                            value={fullConfig["SAST&SCA Prompts"].sastPrompt || ""}
                            onChange={(e) => setFullConfig({
                              ...fullConfig,
                              "SAST&SCA Prompts": { ...fullConfig["SAST&SCA Prompts"], sastPrompt: e.target.value }
                            })}
                            className="w-full h-48 bento-input font-mono text-xs leading-relaxed"
                          />
                        </section>
                        <section className="space-y-3">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> SCA Prompt Engine
                          </h3>
                          <textarea
                            value={fullConfig["SAST&SCA Prompts"].scaPrompt || ""}
                            onChange={(e) => setFullConfig({
                              ...fullConfig,
                              "SAST&SCA Prompts": { ...fullConfig["SAST&SCA Prompts"], scaPrompt: e.target.value }
                            })}
                            className="w-full h-48 bento-input font-mono text-xs leading-relaxed"
                          />
                        </section>
                      </div>
                    )}

                    {/* System Tab */}
                    {settingsTab === "System" && fullConfig["System"] && (
                      <div className="space-y-8">
                        <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-inner-sm">
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">Hide Processed Mitigation</h4>
                            <p className="text-[10px] text-slate-500 font-mono">Automatically filter findings with statuses.</p>
                          </div>
                          <button 
                            className="flex items-center"
                            onClick={() => setHideProcessedFindings(!hideProcessedFindings)}
                          >
                            <div className={`w-10 h-5 rounded-full relative transition-colors ${hideProcessedFindings ? 'bg-blue-600' : 'bg-slate-700'}`}>
                              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${hideProcessedFindings ? 'left-6' : 'left-1'}`} />
                            </div>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <section className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Scan Validity (Days)</label>
                            <input 
                              type="number"
                              value={fullConfig["System"].scanValidityDays || 0}
                              onChange={(e) => setFullConfig({
                                ...fullConfig,
                                "System": { ...fullConfig["System"], scanValidityDays: parseInt(e.target.value) || 0 }
                              })}
                              className="w-full bento-input py-3 px-4 text-sm"
                            />
                          </section>
                          <section className="space-y-2">
                            <label className={`text-[10px] font-black uppercase tracking-widest ${!fullConfig["System"].saveJsonHistory ? 'text-slate-600' : 'text-slate-500'}`}>History Limit</label>
                            <input 
                              type="number"
                              disabled={!fullConfig["System"].saveJsonHistory}
                              value={fullConfig["System"].historyLimit || 0}
                              onChange={(e) => setFullConfig({
                                ...fullConfig,
                                "System": { ...fullConfig["System"], historyLimit: parseInt(e.target.value) || 0 }
                              })}
                              className={`w-full bento-input py-3 px-4 text-sm ${!fullConfig["System"].saveJsonHistory ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                            />
                          </section>
                          <section className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Mitigation API Type</label>
                            <select 
                              value={fullConfig["System"].mitigationApiType || "REST"}
                              onChange={(e) => setFullConfig({
                                ...fullConfig,
                                "System": { ...fullConfig["System"], mitigationApiType: e.target.value }
                              })}
                              className="w-full bento-input py-3 px-4 text-sm"
                            >
                              <option value="REST">REST</option>
                              <option value="XML">XML</option>
                              <option value="Veracode">Veracode</option>
                            </select>
                          </section>
                        </div>

                        <section className="space-y-3">
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Mitigation Proposal Status</label>
                          <div className="flex gap-4">
                            {[true, false, 'debug'].map((val) => (
                              <label key={val.toString()} className="flex items-center gap-2 cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-800 hover:border-slate-600 transition-all">
                                <input 
                                  type="radio" 
                                  name="proposal_status" 
                                  checked={String(fullConfig["System"].mitigationProposalEnabled) === String(val)}
                                  onChange={() => {
                                    const current = fullConfig["System"].mitigationProposalEnabled;
                                    const newVal = typeof current === 'string' ? String(val) : val;
                                    setFullConfig({
                                      ...fullConfig,
                                      "System": { ...fullConfig["System"], mitigationProposalEnabled: newVal }
                                    });
                                  }}
                                  className="w-4 h-4 text-blue-500 bg-slate-950 border-slate-700"
                                />
                                <span className="text-xs font-bold text-slate-300 uppercase">{val.toString()}</span>
                              </label>
                            ))}
                          </div>
                        </section>

                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          {[
                            { key: 'saveXmlLogs', label: 'Save XML Logs' },
                            { key: 'saveJsonHistory', label: 'Save JSON History' },
                            { key: 'secondaryAuditEnabled', label: 'Secondary Audit' }
                          ].map(opt => (
                            <label key={opt.key} className="flex flex-col gap-2 p-4 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800/50 transition-all cursor-pointer">
                              <span className="text-[9px] font-bold text-slate-500 uppercase">{opt.label}</span>
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-slate-300">{fullConfig["System"][opt.key] ? 'ENABLED' : 'DISABLED'}</span>
                                <input 
                                  type="checkbox"
                                  checked={!!fullConfig["System"][opt.key]}
                                  onChange={(e) => {
                                    const next = { ...fullConfig };
                                    next["System"][opt.key] = e.target.checked;
                                    // If secondaryAudit is disabled and we are on that tab, switch back
                                    if (opt.key === 'secondaryAuditEnabled' && !e.target.checked && settingsTab === 'SecondaryAudit') {
                                      setSettingsTab('System');
                                    }
                                    setFullConfig(next);
                                  }}
                                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-blue-500"
                                />
                              </div>
                            </label>
                          ))}
                        </section>

                        <section className="space-y-4 border-t border-slate-800/50 pt-6">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${fullConfig["System"].safeSCAVERSION?.scaSafeVersionEnabled ? 'bg-blue-500' : 'bg-slate-500'}`} />
                                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Safe SCA Version Config</h3>
                              </div>
                              <button 
                                onClick={() => {
                                  const next = { ...fullConfig };
                                  if (!next["System"].safeSCAVERSION) next["System"].safeSCAVERSION = { scaSafeVersionEnabled: false };
                                  next["System"].safeSCAVERSION.scaSafeVersionEnabled = !next["System"].safeSCAVERSION.scaSafeVersionEnabled;
                                  setFullConfig(next);
                                }}
                                className={`px-4 py-1 text-[9px] font-black uppercase rounded-lg border transition-all ${
                                  fullConfig["System"].safeSCAVERSION?.scaSafeVersionEnabled 
                                    ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' 
                                    : 'bg-slate-800 border-slate-700 text-slate-500'
                                }`}
                              >
                                {fullConfig["System"].safeSCAVERSION?.scaSafeVersionEnabled ? 'ON' : 'OFF'}
                              </button>
                           </div>

                           {fullConfig["System"].safeSCAVERSION?.scaSafeVersionEnabled && (
                             <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Stale Fix Message</label>
                                    <textarea 
                                      value={fullConfig["System"].safeSCAVERSION.scaStaleFixMessage || ""}
                                      onChange={(e) => {
                                        const next = JSON.parse(JSON.stringify(fullConfig));
                                        next["System"].safeSCAVERSION.scaStaleFixMessage = e.target.value;
                                        setFullConfig(next);
                                      }}
                                      className="w-full bento-input p-4 text-sm h-24 resize-none"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">No Fix Message</label>
                                    <textarea 
                                      value={fullConfig["System"].safeSCAVERSION.scaNoFixMessage || ""}
                                      onChange={(e) => {
                                        const next = JSON.parse(JSON.stringify(fullConfig));
                                        next["System"].safeSCAVERSION.scaNoFixMessage = e.target.value;
                                        setFullConfig(next);
                                      }}
                                      className="w-full bento-input p-4 text-sm h-24 resize-none"
                                    />
                                  </div>
                               </div>
                               <label className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-all">
                                  <input 
                                    type="checkbox"
                                    checked={!!fullConfig["System"].safeSCAVERSION.saveScaLog}
                                    onChange={(e) => {
                                      const next = JSON.parse(JSON.stringify(fullConfig));
                                      next["System"].safeSCAVERSION.saveScaLog = e.target.checked;
                                      setFullConfig(next);
                                    }}
                                    className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-blue-500"
                                  />
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Save SCA Logs</span>
                               </label>
                             </div>
                           )}
                        </section>
                      </div>
                    )}

                    {/* AiEngine Tab */}
                    {settingsTab === "AiEngine" && fullConfig["AiEngine"] && (
                      <div className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <section className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">AI Engines (one per line)</label>
                                <textarea 
                                    value={(fullConfig["AiEngine"].aiEngines || []).join('\n')}
                                    onChange={(e) => setFullConfig({
                                        ...fullConfig,
                                        "AiEngine": { ...fullConfig["AiEngine"], aiEngines: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }
                                    })}
                                    className="w-full h-32 bento-input font-mono text-sm leading-normal p-4"
                                />
                             </section>
                             <section className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Application Engine Models</label>
                                <textarea 
                                    value={(fullConfig["AiEngine"].engineModels || []).join('\n')}
                                    onChange={(e) => setFullConfig({
                                        ...fullConfig,
                                        "AiEngine": { ...fullConfig["AiEngine"], engineModels: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }
                                    })}
                                    className="w-full h-32 bento-input font-mono text-sm leading-normal p-4"
                                />
                             </section>
                         </div>

                         <section className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shared Service Endpoint</label>
                            <input 
                                type="text"
                                value={fullConfig["AiEngine"].sharedServiceEndpoint || ""}
                                onChange={(e) => setFullConfig({
                                    ...fullConfig,
                                    "AiEngine": { ...fullConfig["AiEngine"], sharedServiceEndpoint: e.target.value }
                                })}
                                className="w-full bento-input py-3 px-4 text-sm font-mono"
                                placeholder="https://..."
                            />
                         </section>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <section className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shared Service Role</label>
                                <input 
                                    type="text"
                                    value={fullConfig["AiEngine"].sharedServiceRole || ""}
                                    onChange={(e) => setFullConfig({
                                        ...fullConfig,
                                        "AiEngine": { ...fullConfig["AiEngine"], sharedServiceRole: e.target.value }
                                    })}
                                    className="w-full bento-input py-3 px-4 text-sm"
                                    placeholder="user"
                                />
                            </section>
                            <section className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shared Service Max Tokens</label>
                                <input 
                                    type="number"
                                    value={fullConfig["AiEngine"].sharedServiceMaxTokens || 2048}
                                    onChange={(e) => setFullConfig({
                                        ...fullConfig,
                                        "AiEngine": { ...fullConfig["AiEngine"], sharedServiceMaxTokens: parseInt(e.target.value) || 2048 }
                                    })}
                                    className="w-full bento-input py-3 px-4 text-sm"
                                />
                            </section>
                         </div>
                      </div>
                    )}

                    {/* SecondaryAudit Tab */}
                    {settingsTab === "SecondaryAudit" && fullConfig["SecondaryAudit"] && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <section className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Auditor Model</label>
                            <input 
                              type="text"
                              value={fullConfig["SecondaryAudit"].auditorModel || ""}
                              onChange={(e) => setFullConfig({
                                ...fullConfig,
                                "SecondaryAudit": { ...fullConfig["SecondaryAudit"], auditorModel: e.target.value }
                              })}
                              className="w-full bento-input py-3 px-4 text-sm font-mono"
                              placeholder="gpt-4o-mini"
                            />
                          </section>
                          <section className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shared Auditor Role</label>
                            <input 
                              type="text"
                              value={fullConfig["SecondaryAudit"].sharedAuditorRole || ""}
                              onChange={(e) => setFullConfig({
                                ...fullConfig,
                                "SecondaryAudit": { ...fullConfig["SecondaryAudit"], sharedAuditorRole: e.target.value }
                              })}
                              className="w-full bento-input py-3 px-4 text-sm"
                              placeholder="user"
                            />
                          </section>
                        </div>

                        <section className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shared Auditor Endpoint</label>
                          <input 
                            type="text"
                            value={fullConfig["SecondaryAudit"].sharedAuditorEndpoint || ""}
                            onChange={(e) => setFullConfig({
                              ...fullConfig,
                              "SecondaryAudit": { ...fullConfig["SecondaryAudit"], sharedAuditorEndpoint: e.target.value }
                            })}
                            className="w-full bento-input py-3 px-4 text-sm font-mono"
                            placeholder="https://..."
                          />
                        </section>

                        <section className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shared Auditor Max Tokens</label>
                          <input 
                            type="number"
                            value={fullConfig["SecondaryAudit"].sharedAuditorMaxTokens !== undefined ? fullConfig["SecondaryAudit"].sharedAuditorMaxTokens : 1000}
                            onChange={(e) => setFullConfig({
                              ...fullConfig,
                              "SecondaryAudit": { ...fullConfig["SecondaryAudit"], sharedAuditorMaxTokens: parseInt(e.target.value) || 1000 }
                            })}
                            className="w-full bento-input py-3 px-4 text-sm"
                          />
                        </section>

                        <section className="space-y-3">
                          <label className="text-sm font-bold uppercase tracking-wider text-slate-300">Auditor System Prompt</label>
                          <textarea
                            value={fullConfig["SecondaryAudit"].auditorPrompt || ""}
                            onChange={(e) => setFullConfig({
                              ...fullConfig,
                              "SecondaryAudit": { ...fullConfig["SecondaryAudit"], auditorPrompt: e.target.value }
                            })}
                            className="w-full h-48 bento-input font-mono text-xs leading-relaxed"
                          />
                        </section>
                        <section className="space-y-3">
                          <label className="text-sm font-bold uppercase tracking-wider text-slate-300">Conflict Fallback Text</label>
                          <textarea
                            value={fullConfig["SecondaryAudit"].fallbackText || ""}
                            onChange={(e) => setFullConfig({
                              ...fullConfig,
                              "SecondaryAudit": { ...fullConfig["SecondaryAudit"], fallbackText: e.target.value }
                            })}
                            className="w-full h-24 bento-input font-mono text-xs leading-relaxed"
                          />
                        </section>
                      </div>
                    )}

                    {/* Exclusions Tab */}
                    {settingsTab === "Exclusions" && fullConfig["Exclusions"] && (
                        <div className="space-y-6">
                             <section className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Ignored Modules (CSV Area)</label>
                                <textarea 
                                    value={(fullConfig["Exclusions"].ignoredModules || []).join(', ')}
                                    onChange={(e) => setFullConfig({
                                        ...fullConfig,
                                        "Exclusions": { ...fullConfig["Exclusions"], ignoredModules: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }
                                    })}
                                    className="w-full h-32 bento-input font-mono text-sm leading-normal p-4"
                                />
                             </section>
                             <section className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Included Modules (CSV Area)</label>
                                <textarea 
                                    value={(fullConfig["Exclusions"].includedModules || []).join(', ')}
                                    onChange={(e) => setFullConfig({
                                        ...fullConfig,
                                        "Exclusions": { ...fullConfig["Exclusions"], includedModules: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }
                                    })}
                                    className="w-full h-32 bento-input font-mono text-sm leading-normal p-4"
                                />
                             </section>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <section className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Ignored Ecosystems (CSV)</label>
                                    <input 
                                        type="text"
                                        value={(fullConfig["Exclusions"].ignoredEcosystems || []).join(', ')}
                                        onChange={(e) => setFullConfig({
                                            ...fullConfig,
                                            "Exclusions": { ...fullConfig["Exclusions"], ignoredEcosystems: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }
                                        })}
                                        className="w-full bento-input py-3 px-4 text-sm font-mono"
                                    />
                                </section>
                                <section className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">No SCA Architectures (CSV)</label>
                                    <input 
                                        type="text"
                                        value={(fullConfig["Exclusions"].noScaArchitectures || []).join(', ')}
                                        onChange={(e) => setFullConfig({
                                            ...fullConfig,
                                            "Exclusions": { ...fullConfig["Exclusions"], noScaArchitectures: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }
                                        })}
                                        className="w-full bento-input py-3 px-4 text-sm font-mono"
                                    />
                                </section>
                             </div>
                        </div>
                    )}

                    {/* Compliance Tab */}
                    {settingsTab === "Compliance" && fullConfig["Compliance"] && (
                        <div className="space-y-10">
                            {/* Tier Mappings Matrix */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                                    <div className="p-2 bg-blue-600/10 rounded-lg">
                                        <div className="w-4 h-4 text-blue-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2 4-4"/><path d="m3 17 2 2 4-4"/><path d="m11 7 2 2 4-4"/><path d="m3 7 2 2 4-4"/></svg>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-200">Tier Mappings Matrix</h3>
                                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-0.5">Asset classification mapping by context & confidentiality</p>
                                    </div>
                                </div>

                                <div className="overflow-x-auto border border-slate-800/50 rounded-2xl bg-slate-900/20">
                                    <table className="w-full min-w-[600px] text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900/50 border-b border-slate-800/50">
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Mapping Category</th>
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Confidentiality Level</th>
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Value Dropdown Selection</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/30">
                                            {(() => {
                                                const rows: React.ReactNode[] = [];
                                                Object.entries(fullConfig["Compliance"].tierMappings || {}).forEach(([category, mappings]: [string, any]) => {
                                                    Object.entries(mappings).forEach(([confidentiality, currentTier]) => {
                                                        rows.push(
                                                            <tr key={`${category}-${confidentiality}`} className="hover:bg-slate-800/10 transition-colors">
                                                                <td className="px-6 py-2 text-xs font-black text-slate-200 uppercase tracking-widest">{category}</td>
                                                                <td className="px-6 py-2 text-xs font-bold text-slate-300">{confidentiality}</td>
                                                                <td className="px-6 py-2">
                                                                    <div className="flex">
                                                                        <select 
                                                                            value={currentTier as string}
                                                                            onChange={(e) => {
                                                                                const newConfig = JSON.parse(JSON.stringify(fullConfig));
                                                                                newConfig["Compliance"].tierMappings[category][confidentiality] = e.target.value;
                                                                                setFullConfig(newConfig);
                                                                            }}
                                                                            className="bg-[#1a1c23] border border-slate-700/50 rounded-lg text-xs font-black text-blue-400 py-1.5 px-4 outline-none hover:border-blue-500/50 transition-all cursor-pointer min-w-[140px]"
                                                                        >
                                                                            {fullConfig["Compliance"].tierDropDown.map((t: string) => (
                                                                                <option key={t} value={t}>[ {t} ]</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                });
                                                return rows;
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* Grace Periods Matrix */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                                    <div className="p-2 bg-emerald-600/10 rounded-lg">
                                        <div className="w-4 h-4 text-emerald-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-200">Grace Periods SLA Matrix</h3>
                                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-0.5">Remediation timelines by Asset Tier & Severity</p>
                                    </div>
                                </div>

                                <div className="overflow-x-auto border border-slate-800/50 rounded-2xl bg-slate-900/20">
                                    <table className="w-full min-w-[700px] text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900/50 border-b border-slate-800/50">
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-r border-slate-800/50">Asset Tier</th>
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 text-center">{selectedTools.includes("Checkmarx") ? "Critical" : "Very High"}</th>
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 text-center">High</th>
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-orange-500 text-center">Medium</th>
                                                <th className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Low</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/30">
                                            {(fullConfig["Compliance"].tierDropDown || []).map((tier: string) => (
                                                <tr key={tier} className="hover:bg-slate-800/10 transition-colors">
                                                    <td className="px-6 py-2 text-xs font-black text-slate-300 uppercase tracking-widest bg-slate-900/30 border-r border-slate-800/50">
                                                        {tier}
                                                    </td>
                                                    {["VeryHigh", "High", "Medium", "Low"].map((sev) => (
                                                        <td key={sev} className="px-4 py-1.5">
                                                            <div className="flex justify-center">
                                                                <input 
                                                                    type="number"
                                                                    value={fullConfig["Compliance"].gracePeriods[tier]?.[sev] ?? 0}
                                                                    onChange={(e) => {
                                                                        const newConfig = JSON.parse(JSON.stringify(fullConfig));
                                                                        if (!newConfig["Compliance"].gracePeriods[tier]) {
                                                                            newConfig["Compliance"].gracePeriods[tier] = {};
                                                                        }
                                                                        newConfig["Compliance"].gracePeriods[tier][sev] = parseInt(e.target.value) || 0;
                                                                        setFullConfig(newConfig);
                                                                    }}
                                                                    className="w-20 bento-input !px-2 text-center py-1 text-[11px] font-bold"
                                                                />
                                                            </div>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* Architecture Mapping Tab */}
                    {settingsTab === "Architecture Mapping" && fullConfig["architecture-mappings"] && (
                      <div className="space-y-6">
                        <section className="space-y-1">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" /> Architecture Mapping Engine
                          </h3>
                          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest leading-relaxed">
                            Configure association values/ecosystems mapping detected under matching environments
                          </p>
                        </section>

                        {/* Card to Add a new Language Category */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 bg-slate-900/30 border border-slate-800/80 rounded-2xl">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                              Define Custom Language Category
                            </h4>
                            <p className="text-[9px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">
                              Register a new technology or pipeline environment mapping
                            </p>
                          </div>
                          <div className="flex gap-2 w-full md:w-auto">
                            <input 
                              type="text"
                              placeholder="e.g. Rust, Kotlin, Scala..."
                              value={newLangCategory}
                              onChange={(e) => setNewLangCategory(e.target.value)}
                              className="bg-slate-900/50 border border-slate-800 text-xs text-slate-300 font-bold py-2 px-3 rounded-xl outline-none focus:border-blue-500 transition-all max-w-xs w-full"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (!newLangCategory.trim()) return;
                                  const normalizedKey = newLangCategory.trim();
                                  const next = { ...fullConfig };
                                  if (!next["architecture-mappings"]) {
                                    next["architecture-mappings"] = {};
                                  }
                                  if (!next["architecture-mappings"][normalizedKey]) {
                                    next["architecture-mappings"][normalizedKey] = [];
                                    setFullConfig(next);
                                  }
                                  setNewLangCategory("");
                                }
                              }}
                            />
                            <button 
                              onClick={() => {
                                if (!newLangCategory.trim()) return;
                                const normalizedKey = newLangCategory.trim();
                                const next = { ...fullConfig };
                                if (!next["architecture-mappings"]) {
                                  next["architecture-mappings"] = {};
                                }
                                if (!next["architecture-mappings"][normalizedKey]) {
                                  next["architecture-mappings"][normalizedKey] = [];
                                  setFullConfig(next);
                                }
                                setNewLangCategory("");
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Plus size={12} /> Add Category
                            </button>
                          </div>
                        </div>

                        {/* Grid with category cards */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {Object.entries(fullConfig["architecture-mappings"] || {}).map(([lang, vals]: [string, any]) => {
                            const valueList = Array.isArray(vals) ? vals : [];
                            return (
                              <div key={lang} className="bg-slate-950/40 border border-slate-800/85 rounded-2xl p-5 flex flex-col space-y-4 shadow-sm hover:border-slate-700/50 transition-colors">
                                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                                    <span className="text-xs font-bold text-slate-100 uppercase tracking-widest">{lang}</span>
                                    <span className="text-[9px] font-bold text-slate-500 font-mono">({valueList.length})</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      const next = JSON.parse(JSON.stringify(fullConfig));
                                      delete next["architecture-mappings"][lang];
                                      setFullConfig(next);
                                    }}
                                    className="p-1.5 bg-red-950/10 hover:bg-red-950/40 text-red-500 hover:text-red-400 rounded-lg transition-colors border border-red-900/10 cursor-pointer"
                                    title={`Delete Category ${lang}`}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>

                                <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                                  {valueList.length === 0 ? (
                                    <p className="text-[10px] italic text-slate-600 text-center py-2 uppercase tracking-wider">No matching values configured</p>
                                  ) : (
                                    valueList.map((valStr: string, idx: number) => (
                                      <div key={idx} className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={valStr}
                                          onChange={(e) => {
                                            const next = JSON.parse(JSON.stringify(fullConfig));
                                            next["architecture-mappings"][lang][idx] = e.target.value;
                                            setFullConfig(next);
                                          }}
                                          className="bg-slate-900/50 border border-slate-800 text-xs text-slate-300 font-mono py-1 px-3 rounded-lg flex-1 outline-none focus:border-blue-500/60 transition-all"
                                        />
                                        <button
                                          onClick={() => {
                                            const next = JSON.parse(JSON.stringify(fullConfig));
                                            next["architecture-mappings"][lang].splice(idx, 1);
                                            setFullConfig(next);
                                          }}
                                          className="p-1.5 bg-red-950/10 text-red-400 hover:bg-red-900/20 hover:text-red-300 rounded-lg transition-colors cursor-pointer"
                                          title="Remove Value"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>

                                <div className="pt-2 border-t border-slate-800 flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add mapping value..."
                                    value={newValues[lang] || ""}
                                    onChange={(e) => setNewValues({ ...newValues, [lang]: e.target.value })}
                                    className="bg-slate-900/30 border border-slate-800 text-[11px] font-mono py-1 px-3 rounded-lg outline-none focus:border-blue-500 block flex-1 text-slate-300"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const pending = (newValues[lang] || "").trim();
                                        if (!pending) return;
                                        const next = JSON.parse(JSON.stringify(fullConfig));
                                        next["architecture-mappings"][lang].push(pending);
                                        setFullConfig(next);
                                        setNewValues({ ...newValues, [lang]: "" });
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      const pending = (newValues[lang] || "").trim();
                                      if (!pending) return;
                                      const next = JSON.parse(JSON.stringify(fullConfig));
                                      next["architecture-mappings"][lang].push(pending);
                                      setFullConfig(next);
                                      setNewValues({ ...newValues, [lang]: "" });
                                    }}
                                    className="p-1.5 bg-blue-600/10 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 rounded-lg transition-all border border-blue-900/10 flex items-center justify-center shrink-0 cursor-pointer"
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
                  <button
                    onClick={() => {
                      fetchPrompts(); // Reset
                      setIsSettingsOpen(false);
                    }}
                    className="px-6 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={savePrompts}
                    disabled={JSON.stringify(fullConfig) === JSON.stringify(initialFullConfig)}
                    className="px-8 py-2 bg-white text-black text-sm font-black rounded-xl hover:bg-slate-200 transition-all active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    SAVE MASTER CONFIG
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Detailed Analysis Modal */}
        <AnimatePresence>
          {detailedGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDetailedGroup(null)}
                className="absolute inset-0 bg-black/60"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                      <Sparkles size={24} />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold tracking-tight">
                        Vulnerability Analysis Deep-Dive
                      </h2>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono uppercase tracking-widest">
                          <span>{detailedGroup.type}</span>
                          <span className="opacity-30">|</span>
                          {detailedGroup.type === 'SCA' ? (
                            (() => {
                              const title = detailedGroup.records[0]?.title || detailedGroup.identifier || `CWE-${detailedGroup.cweId}`;
                              const cveMatch = title.match(/CVE-\d{4}-\d+/i);
                              const cveCode = cveMatch ? cveMatch[0] : null;

                              return cveCode ? (
                                <a
                                  href={`https://nvd.nist.gov/vuln/detail/${cveCode}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 font-bold underline decoration-blue-500/30 underline-offset-2"
                                >
                                  {title}
                                </a>
                              ) : (
                                <span className="text-slate-300 font-bold">
                                  {title}
                                </span>
                              );
                            })()
                          ) : (
                            <a
                              href={`${CWE_BASE_URL}${detailedGroup.cweId}.html`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 font-bold underline decoration-blue-500/30 underline-offset-2"
                            >
                              CWE-{detailedGroup.cweId}
                            </a>
                          )}
                          <span className="opacity-30">|</span>
                          <span>{detailedGroup.records.length} Findings</span>
                        </div>
                        <span
                          className={`px-2 py-1 rounded border text-[10px] font-black uppercase tracking-widest leading-none ${
                            (detailedGroup.severity === "Very High" || detailedGroup.severity === "Critical")
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                              : detailedGroup.severity === "High"
                                ? "bg-red-500/10 text-red-400 border border-red-500/30"
                                : detailedGroup.severity === "Medium"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                                  : detailedGroup.severity === "Low"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    : "bg-slate-800 text-slate-500 border border-slate-700"
                          }`}
                        >
                          {(detailedGroup.severity === "Very High" && selectedTools.includes("Checkmarx")) || detailedGroup.severity === "Critical" ? "CRITICAL" : detailedGroup.severity}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setDetailedGroup(null)}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 space-y-8 overflow-y-auto bg-slate-950/30">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Context Side */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                          <Database size={14} /> Context & Mitigation
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                          Source Data
                        </span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 min-h-[300px] shadow-xl relative group">
                        <div className="absolute -top-3 -right-3 px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-bold text-slate-400">
                          INPUT
                        </div>
                        <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {detailedGroup.comments ||
                            "-- No customer mitigation information provided --"}
                        </div>
                        <div className="mt-6 pt-6 border-t border-slate-800/50">
                          <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-widest">
                            Original Description
                          </h4>
                          <div className="text-xs text-slate-400 leading-relaxed font-mono">
                            {detailedGroup.description}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Assessment Side */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-blue-400 flex items-center gap-2">
                          <Sparkles size={14} /> AI Recommendation
                        </h3>
                        <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          Generated Analysis
                        </span>
                      </div>
                      <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6 min-h-[300px] shadow-[0_0_50px_rgba(59,130,246,0.05)] relative group">
                        <div className="absolute -top-3 -right-3 px-3 py-1 bg-blue-600 text-white rounded-full text-[10px] font-black tracking-widest">
                          RESULT
                        </div>
                        <textarea
                          value={detailedGroup.aiComment}
                          onChange={(e) =>
                            updateGroupAIComment(
                              detailedGroup.groupId,
                              e.target.value,
                            )
                          }
                          className="w-full h-full bg-transparent text-sm text-blue-100 leading-relaxed border-none outline-none focus:ring-0 resize-none font-sans relative z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                          placeholder="Enter your mitigation proposal or pull AI analysis..."
                          rows={12}
                          disabled={!!detailedGroup.status}
                        />
                        {!detailedGroup.aiComment && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 pointer-events-none">
                            <RefreshCcw size={32} className="mb-4 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest">
                              Analysis Pending
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <div className="flex items-center gap-4">
                          {detailedGroup.aiMetrics && (
                            <div className="flex gap-4 text-[10px] text-slate-500 font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                              <div><span className="text-slate-400 mr-1">IN:</span>{detailedGroup.aiMetrics.inputTokens || '-'}</div>
                              <div><span className="text-slate-400 mr-1">OUT:</span>{detailedGroup.aiMetrics.outputTokens || '-'}</div>
                              <div className="text-emerald-400 font-black"><span className="text-slate-400 mr-1 font-mono font-normal">TOTAL:</span>{detailedGroup.aiMetrics.totalTokens || '-'}</div>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => handlePullAIResponse(detailedGroup)}
                            disabled={loadingAIGroups.has(detailedGroup.groupId) || !!detailedGroup.status}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-blue-500 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                          >
                            <RefreshCcw size={14} className={loadingAIGroups.has(detailedGroup.groupId) ? "animate-spin" : ""} /> 
                            {loadingAIGroups.has(detailedGroup.groupId) ? "ANALYZING..." : `Refresh AI Assessment (${aiProvider})`}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                        Impacted Records
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-mono font-black text-white">
                          {detailedGroup.records.length}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase py-0.5 px-2 bg-slate-800 rounded border border-slate-700">
                          Vulnerabilities
                        </span>
                      </div>
                    </div>
                    {detailedGroup.status && (
                      <div className="h-8 w-px bg-slate-800 mx-2" />
                    )}
                    {detailedGroup.status && (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                          Status
                        </span>
                        <div
                          className={`text-[11px] font-black uppercase px-3 py-1 rounded-lg border ${
                            detailedGroup.status === "approved"
                              ? "bg-emerald-600/10 text-emerald-400 border-emerald-500/20"
                              : "bg-red-600/10 text-red-400 border-red-500/20"
                          }`}
                        >
                          {detailedGroup.status}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setDetailedGroup(null)}
                    className="px-8 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all shadow-xl active:scale-95"
                  >
                    Close Analysis
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Sensitive Information Bypass Modal */}
        <AnimatePresence>
          {sensitiveGroupToBypass && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-transparent pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSensitiveGroupToBypass(null)}
                className="absolute inset-0 bg-black/60 pointer-events-auto"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-lg bg-[#0a0c10] border border-orange-500/30 rounded-xl flex flex-col shadow-2xl overflow-hidden relative z-10 pointer-events-auto"
              >
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-orange-500/10">
                  <h2 className="text-sm font-black flex items-center gap-2 uppercase tracking-widest text-orange-400">
                    <AlertCircle size={18} /> Sensitive Information Detected
                  </h2>
                </div>
                <div className="p-6 pb-2">
                  <p className="text-sm text-slate-300 mb-4">
                    We detected potential sensitive information (e.g., username, password, key) in the finding's comments.
                  </p>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4">
                    <p className="text-xs text-slate-400 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{sensitiveGroupToBypass.comments}</p>
                  </div>
                  <p className="text-xs text-orange-400/80 italic mb-6">
                    If this is a false positive and does not contain actual credentials, you can bypass this check to fetch the AI response.
                  </p>
                  <div className="flex justify-end gap-3 mb-2">
                    <button
                      onClick={() => setSensitiveGroupToBypass(null)}
                      className="px-6 py-2.5 bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handlePullAIResponse(sensitiveGroupToBypass, true)}
                      className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase tracking-widest rounded-lg transition"
                    >
                      Bypass & Pull AI
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Batch Mitigate Modal */}
        <AnimatePresence>
        {batchModalConfig && batchModalConfig.isOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-transparent pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBatchModalConfig(null)}
              className="absolute inset-0 bg-black/60 pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-xl bg-[#0a0c10] border border-blue-500/30 rounded-xl flex flex-col shadow-2xl overflow-hidden relative z-10 pointer-events-auto"
            >
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <h2 className="text-sm font-black uppercase tracking-widest text-blue-400">
                  Confirm {batchModalConfig.actionType === "approved" ? "Approval" : "Rejection"}
                </h2>
              </div>
              <div className="p-6">
                {isSubmitting ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <RefreshCcw size={40} className="animate-spin text-blue-500" />
                    <div className="text-center">
                      <p className="text-sm font-black uppercase tracking-widest text-white mb-2">Processing mitigation proposals</p>
                      <p className="text-xs text-slate-500 font-mono">Synchronizing with Veracode backend. This may take several moments...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-300 mb-4">
                      You are about to submit mitigation proposals for the following {batchModalConfig.selectedItems.reduce((acc, item) => acc + item.records.length, 0)} records:
                    </p>
                    <div className="space-y-2 mb-6 max-h-[40vh] overflow-auto">
                      {Object.values(
                        batchModalConfig.selectedItems.reduce((acc, item) => {
                          const displayKey = item.type === "SCA" && item.identifier
                            ? (item.records[0]?.title || item.identifier.split(" - ")[0])
                            : `CWE-${item.cweId}`;
                          let gSev = item.severity;
                          if (gSev === "VeryHigh" || gSev === "Critical") gSev = "Very High";
                          if (gSev === "Information") gSev = "Info";

                          const key = `${displayKey}__${gSev}`;
                          if (!acc[key]) {
                            acc[key] = { displayKey, count: 0, severity: gSev };
                          }
                          acc[key].count += item.records.length;
                          return acc;
                        }, {} as Record<string, { displayKey: string; count: number; severity: string }>)
                      ).map(({ displayKey, count, severity }) => (
                        <div key={`${displayKey}__${severity}`} className="flex justify-between items-center p-3 bg-slate-900 border border-slate-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-black text-slate-400 uppercase">{displayKey}</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest leading-none shrink-0 ${
                              (severity === 'Very High' || severity === 'Critical') ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                              severity === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                              severity === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                              severity === 'Low' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                              'bg-slate-800 text-slate-500 border-slate-700'
                            }`}>
                              {(severity === 'Very High' && selectedTools.includes("Checkmarx")) || severity === 'Critical' ? 'CRITICAL' : severity}
                            </span>
                          </div>
                          <span className="text-xs font-black text-blue-400 bg-blue-500/10 px-2 py-1 rounded shrink-0">{count} {count === 1 ? 'record' : 'records'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-3 px-0 pb-0">
                  <button
                    onClick={() => setBatchModalConfig(null)}
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBatchSubmit}
                    disabled={isSubmitting}
                    className={`px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg transition ${batchModalConfig.actionType === "approved" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-red-600 hover:bg-red-500 text-white"} disabled:opacity-50 flex items-center gap-2`}
                  >
                    {isSubmitting ? <RefreshCcw size={14} className="animate-spin" /> : null}
                    {isSubmitting ? "Submitting..." : `Submit ${batchModalConfig.actionType === "approved" ? "Approval" : "Rejection"}`}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>

        <AnimatePresence>
          {successMessage && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-transparent pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSuccessMessage(null)}
                className="absolute inset-0 bg-black/60 pointer-events-auto"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-xl bg-[#0a0c10] border border-emerald-500/30 rounded-2xl flex flex-col shadow-2xl overflow-hidden p-8 relative z-10 pointer-events-auto"
              >
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                    <CheckCircle2 className="text-emerald-500" size={32} />
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-xl font-black tracking-tight text-white uppercase leading-tight">
                      Success
                    </h2>
                    <p className="text-sm font-medium text-slate-300">
                      {successMessage}
                    </p>
                  </div>
                  <button
                    onClick={() => setSuccessMessage(null)}
                    className="px-8 py-3 bg-white hover:bg-slate-200 text-black font-black rounded-xl transition-all active:scale-95 shadow-xl shadow-white/10 text-xs tracking-widest uppercase w-full max-w-[200px] mx-auto block"
                  >
                    Okay
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {backendError && (
            <div className="fixed inset-0 z-[310] flex items-center justify-center p-6 bg-transparent pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setBackendError(null);
                  setErrorType(null);
                  setSuggestedApps([]);
                }}
                className="absolute inset-0 bg-black/60 pointer-events-auto"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-xl bg-[#0a0c10] border border-red-500/30 rounded-2xl flex flex-col shadow-2xl overflow-hidden p-8 relative z-10 pointer-events-auto"
              >
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/30">
                    <XCircle className="text-red-500" size={32} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-black tracking-tight text-white uppercase leading-tight">
                      {(errorType || "Backend Service Failure").replace(/_/g, " ")}
                    </h2>
                    <div className="p-4 bg-black/40 rounded-xl border border-red-500/10 font-mono text-xs text-red-400 leading-relaxed text-left overflow-auto max-h-48">
                      {backendError}
                    </div>
                  </div>

                  {suggestedApps.length > 0 && (
                    <div className="space-y-4 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">
                        Suggested Profiles
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {suggestedApps.map((app) => (
                          <button
                            key={app}
                            onClick={() => {
                              setAppProfile(app);
                              setBackendError(null);
                              setErrorType(null);
                              setSuggestedApps([]);
                            }}
                            className="px-4 py-2 bg-blue-600/10 hover:bg-blue-600/30 border border-blue-500/20 rounded-xl text-xs font-medium text-blue-200 transition-all active:scale-95 hover:border-blue-500/50"
                          >
                            {app}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-slate-400 text-sm leading-relaxed">
                    {errorType === "INVALID_APP" ? (
                      "The specified application profile could not be found. Please select from the suggestions above or check the profile name."
                    ) : errorType === "SYSTEM_ERROR" ? (
                      "The backend service or Veracode API encountered a critical issue. Please check the error message above for details."
                    ) : errorType === "MITIGATION_COMMENTS_REQUIRED" ? (
                      "Please provide mitigation comments or recommendations for all selected items to proceed."
                    ) : (
                      "Please review the error details and try again."
                    )}
                  </p>
                  
                  <button
                    onClick={() => {
                      setBackendError(null);
                      setErrorType(null);
                      setSuggestedApps([]);
                    }}
                    className="px-8 py-3 bg-white hover:bg-slate-200 text-black font-black rounded-xl transition-all active:scale-95 shadow-xl shadow-white/10 text-xs tracking-widest uppercase w-full max-w-[200px] mx-auto block"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Floating Debug Toggle */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="fixed bottom-4 right-4 z-[100] p-3 bg-slate-900 border border-slate-700 rounded-full shadow-2xl text-slate-400 hover:text-white transition-colors"
          title="Debug Overlay"
        >
          <Code2 size={20} />
        </button>

        {/* Debug Modal */}
        <AnimatePresence>
        {showDebug && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-transparent pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDebug(false)}
              className="absolute inset-0 bg-black/60 pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-4xl max-h-[80vh] bento-card border-blue-500/30 bg-[#0a0c10] flex flex-col shadow-2xl relative z-10 pointer-events-auto"
            >
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <h2 className="text-sm font-black uppercase tracking-widest text-blue-400">
                  System Debugger
                </h2>
                <button
                  onClick={() => setShowDebug(false)}
                  className="text-slate-500 hover:text-white"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-6">
                <div>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">
                    Paste Custom JSON for Dry Run
                  </h3>
                  <textarea
                    value={debugPastedJson}
                    onChange={(e) => setDebugPastedJson(e.target.value)}
                    placeholder="Paste Veracode JSON response here..."
                    className="w-full h-32 bg-black border border-slate-700 rounded p-3 text-[10px] font-mono text-blue-200 focus:border-blue-500 outline-none resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => {
                        if (!debugPastedJson.trim()) {
                          setBackendError("Please paste JSON first.");
                          return;
                        }
                        try {
                          const parsed = JSON.parse(debugPastedJson);
                          processImportedData(parsed);
                          setShowDebug(false);
                        } catch (e) {
                          setBackendError(
                            `Invalid JSON: ${e instanceof Error ? e.message : "Unknown"}`,
                          );
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase rounded shadow-lg transition-all"
                    >
                      Load Pasted JSON
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-slate-800/50">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    System Testing
                  </h3>
                  <button
                    onClick={() => {
                      processImportedData(dryRunJson);
                      setShowDebug(false);
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase rounded shadow-lg transition-all"
                  >
                    Run Official Dry Run
                  </button>
                </div>
                <div>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">
                    Last Operation Error
                  </h3>
                  <pre className="bg-black p-3 rounded border border-red-900/30 text-red-500 text-[10px] overflow-auto whitespace-pre-wrap font-mono">
                    {backendError || "No Errors Reported"}
                  </pre>
                </div>
                <div>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">
                    Raw JSON Response
                  </h3>
                  <pre className="bg-black p-3 rounded border border-slate-800 text-blue-300 text-[10px] overflow-auto font-mono p-4">
                    {lastRawResponse
                      ? JSON.stringify(lastRawResponse, null, 2)
                      : "No Data Captured"}
                  </pre>
                </div>
              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-900/50 text-[9px] text-slate-500 font-mono uppercase tracking-widest text-center">
                Internal Diagnostic Mode // AIS-DEBUG-v1
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
