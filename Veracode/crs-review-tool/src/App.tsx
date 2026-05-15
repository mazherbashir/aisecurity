/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
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
import { CWE_BASE_URL } from "./constants";
import { getEndpoint } from "./config";
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
    if (severity === "VeryHigh") severity = "Very High";
    if (severity === "Info") severity = "Information";

    const location = finding.location || "Unknown Location";
    const description = `${title} | ${severity} | ${location}`;

    // For SCA rely on title or id for identifier 
    let identifier: string | undefined = undefined;
    if (type === "SCA") {
      identifier = finding.id && finding.id !== "N/A" && finding.id !== "0" && !finding.id.startsWith("sca-")
        ? finding.id
        : (finding.title !== "Unknown Product" && finding.title !== "Unknown Finding" ? finding.title : `CWE-${cweId}`);
    }

    // Create a stable group ID
    const groupId = `${type}-${identifier || cweId}-${comments}`.substring(0, 500);

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
    if (sev === "VeryHigh") normalizedSev = "Very High";
    if (sev === "Information" || sev === "Info") normalizedSev = "Information";

    if (normalizedSev in result) {
      result[normalizedSev as keyof typeof result] = data.total || 0;
    }
  });

  return result;
}

function ReviewTabContent({
  overview,
  backendSastSummary,
  backendScaSummary,
  scaDetails = [],
  sastSummary,
  configNoSca = [],
  configScanValidityDays = 90,
  aggregatedData,
}: {
  overview: any;
  backendSastSummary: any;
  backendScaSummary: any;
  scaDetails: any[];
  sastSummary: any;
  configNoSca?: string[];
  configScanValidityDays?: number;
  aggregatedData: { sast: AggregatedGroup[]; sca: AggregatedGroup[] };
}) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  // TEMPORARY TOGGLE for Scan Too Old
  const [isScanTooOld, setIsScanTooOld] = useState(false);

  const formattedHeader = React.useMemo(() => {
    let header = StaticContent.main_header;
    header = header.replace(/\{\$accountId\}/g, overview.accountId || "---");
    header = header.replace(/\{\$appId\}/g, overview.appId || "---");
    header = header.replace(/\{\$buildId\}/g, overview.buildId || "---");
    header = header.replace(/\{\$analysisId\}/g, overview.analysisId || "---");
    header = header.replace(
      /\{\$static_analysis_unit_id\}/g,
      overview.staticAnalysisUnitId || "---",
    );
    header = header.replace(/\{\$sandbox_id\}/g, overview.sandboxId || "---");
    header = header.replace(/\{\$scanName\}/g, overview.scanName || "---");
    header = header.replace(
      /\{\$profile_name\}/g,
      overview.applicationName || "---",
    );

    const getEffectiveScanDate = (ovw: any) => {
      if (ovw?.scanName) {
        const match = ovw.scanName.match(/^\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
      }
      return ovw?.generationDate || null;
    };
    const effectiveDate = getEffectiveScanDate(overview);

    const daysSinceScan = effectiveDate
      ? (new Date().getTime() - new Date(effectiveDate).getTime()) /
        (1000 * 3600 * 24)
      : 0;
    const isActuallyTooOld = daysSinceScan > configScanValidityDays;

    // If scan is too old, ONLY display the scan too old message between header and footer
    if (isScanTooOld || isActuallyTooOld) {
      return (
        StaticContent.header_style +
        header +
        StaticContent.scanTooOldMsg(overview) +
        StaticContent.footerMsg
      );
    }

    let rows = "";
    if (backendSastSummary && backendSastSummary.breakdown) {
      Object.entries(backendSastSummary.breakdown).forEach(
        ([severity, data]: [string, any]) => {
          data.findings?.forEach((finding: any) => {
            const cweIdMatch = finding.cwe.match(/\d+/);
            const extractedCwe = cweIdMatch ? cweIdMatch[0] : "";
            const remediationDate =
              (finding.remediation_due_date || "").split(" ")[0] || "N/A";
              
            let approvedCount = 0;
            let rejectedCount = 0;
            const originalCount = parseInt(finding.count, 10) || 0;
            
            if (aggregatedData?.sast) {
              for (const g of aggregatedData.sast) {
                // Normalize severity strings to match what comes from backend
                let gSev = g.severity;
                if (gSev === "VeryHigh") gSev = "Very High";
                if (gSev === "Information") gSev = "Info";
                
                let bSev = severity;
                if (bSev === "VeryHigh") bSev = "Very High";
                if (bSev === "Information") bSev = "Info";
                
                if (String(g.cweId) === String(extractedCwe) && gSev === bSev) {
                  if (g.status === "approved") {
                    approvedCount += g.records.length;
                  }
                  if (g.status === "rejected") {
                    rejectedCount += g.records.length;
                  }
                }
              }
            }
            
            const noneCount = Math.max(0, originalCount - approvedCount - rejectedCount);
            const severityClass = severity.toLowerCase().replace(" ", "");

            const buildRow = (count: number, label: string, bgClass: string) => {
              if (count <= 0) return "";
              return `<tr>
                <td><span class="crs-rounded minwidth ${severityClass}">${severity}</span></td>
                <td><a target="_blank" href="https://cwe.mitre.org/data/definitions/${extractedCwe}.html">${finding.cwe}</a></td>
                <td><span class="crs-rounded sev ${bgClass}">${label}</span></td>
                <td>${count}</td>
                <td>${remediationDate}</td>
            </tr>`;
            };

            const noneHtml = buildRow(noneCount, "None", "bg-gold");
            const approvedHtml = buildRow(approvedCount, "Approved", "bg-green");
            const rejectedHtml = buildRow(rejectedCount, "Rejected", "bg-red");
            
            rows += noneHtml + approvedHtml + rejectedHtml;
          });
        },
      );
    }

    const sastSection =
      sastSummary && sastSummary.vulnerabilities > 0
        ? StaticContent.sastHeader + rows + StaticContent.sastFooter
        : "";

    let missingScaMessages = "";
    if (overview.architectures && Array.isArray(overview.architectures)) {
      let scaEcosystemsArray: string[] = [];
      if (Array.isArray(overview.scaEcosystems)) {
        scaEcosystemsArray = overview.scaEcosystems.map((s: string) =>
          String(s).trim().toUpperCase(),
        );
      } else if (typeof overview.scaEcosystems === "string") {
        scaEcosystemsArray = overview.scaEcosystems
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((s: string) => s.trim().toUpperCase());
      }

      configNoSca.forEach((item) => {
        if (!scaEcosystemsArray.includes(item.toUpperCase())) {
          scaEcosystemsArray.push(item.toUpperCase());
        }
      });

      overview.architectures.forEach((arch: string) => {
        if (!scaEcosystemsArray.includes(arch.toUpperCase())) {
          missingScaMessages += StaticContent.missingScaMsg(arch);
        }
      });
    }

    let scaSection = "";
    if (backendScaSummary && backendScaSummary.vulnerabilities > 0) {
      const breakdown = backendScaSummary.breakdown || {};
      const severities = [
        {
          name: "Very High",
          count: breakdown["Very High"]?.total || 0,
          class: "veryhigh",
        },
        { name: "High", count: breakdown["High"]?.total || 0, class: "high" },
        {
          name: "Medium",
          count: breakdown["Medium"]?.total || 0,
          class: "medium",
        },
        { name: "Low", count: breakdown["Low"]?.total || 0, class: "low" },
      ];
      const activeSeverities = severities.filter((s) => s.count > 0);
      const vulnerablePackages = backendScaSummary.totalVulnerablePackages || 0;
      const totalPackages = backendScaSummary.totalPackages || 0;

      let vulnerabilitySentencePart = "";
      if (activeSeverities.length > 0) {
        const descriptions = activeSeverities.map(
          (s) =>
            `${s.count} <span class="crs-rounded ${s.class}">${s.name}</span>`,
        );
        if (descriptions.length > 1) {
          vulnerabilitySentencePart =
            descriptions.slice(0, -1).join(", ") +
            " and " +
            descriptions.slice(-1);
        } else {
          vulnerabilitySentencePart = descriptions[0];
        }
      } else {
        vulnerabilitySentencePart = "0";
      }

      const listItems = activeSeverities
        .map(
          (s) =>
            `        <li><span class="crs-rounded minwidth ${s.class}">${s.name}</span>: ${s.count}</li>`,
        )
        .join("\n");

      const scaEcosystems = (overview.scaEcosystems || "").toUpperCase();
      const hasJS = scaEcosystems.includes("JAVASCRIPT");
      const hasJava = scaEcosystems.includes("JAVA");

      let hasRequest = false;
      Object.values(breakdown).forEach((data: any) => {
        data.findings?.forEach((finding: any) => {
          if (
            finding.packageName &&
            finding.packageName.toLowerCase() === "request"
          ) {
            hasRequest = true;
          }
        });
      });

      const nodeMsgUsed = hasJS ? ` ${StaticContent.nodeMsg}` : "";
      const requestMsgUsed = hasRequest ? StaticContent.requestMsg : "";
      const javaMsgUsed = hasJava ? ` ${StaticContent.javaMsg}` : "";

      const remediation_guidance = `Please be advised, the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:b:/r/sites/NetworkInformationSecurityPolicyIsp/Shared%20Documents/Standards/PwC%20NIS%20Application%20Readiness%20Standard.pdf">Application Readiness Standard</a> requires that secure code findings identified during the Software Composition Analysis of third-party components must resolved via upgrade, removal, mitigation, or replacement.<br/><br/>
Code Review Services recommends upgrading the third-party component with a vulnerability-free version when possible.${nodeMsgUsed} If no vulnerability-free version exists, then the following actions can be taken:
<ol>
    <li>Remove the component if it is not necessary or being used.</li>
    <li>Analyze to determine if the reported vulnerability applies to the application.<ul>
        <li>If the application <b>is not</b> affected, <a target="_blank" href="https://docs.veracode.com/r/Address_Veracode_SCA_Vulnerabilities">a mitigation proposal can be created</a>.</li>
        <li>If the application <b>is</b> affected, there may be a defensive mechanism that can be implemented to mitigate the security risk.${javaMsgUsed}</li></ul></li>
    <li>Replace the vulnerable component with a different component.</li>
    <li>Actively look for a new patched version of the component and upgrade as soon as a fixed version is available.${requestMsgUsed}</li>
</ol>
<br/>`;

      // Sort SCA details by highest severity first
      const getHighestSeverity = (cnts: string) => {
        const s = (cnts || "").toLowerCase().replace(" ", "");
        if (s.includes("veryhigh")) return 1;
        if (s.includes("high")) return 2;
        if (s.includes("medium")) return 3;
        if (s.includes("low")) return 4;
        return 99;
      };

      const sortedScaDetails = [...scaDetails].sort(
        (a, b) =>
          getHighestSeverity(a.severityCounts) -
          getHighestSeverity(b.severityCounts),
      );

      // SCA Details Table Rows
      const scaTableRows = sortedScaDetails
        .map((detail: any) => {
          let countsStr = detail.severityCounts || "";
          const severityMatches = Array.from(
            countsStr.matchAll(
              /(Very High|VeryHigh|High|Medium|Low):\s*(\d+)/g,
            ),
          );
          let parsedSeverities: { sev: string; count: string }[] = [];

          if (severityMatches.length > 0) {
            parsedSeverities = severityMatches.map((m) => ({
              sev: m[1] === "VeryHigh" ? "Very High" : m[1],
              count: m[2],
            }));
          } else {
            const parts = countsStr
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
            parsedSeverities = parts.map((p: string) => {
              const [sev, count] = p.split(":");
              return { sev: (sev || "").trim(), count: (count || "").trim() };
            });
          }

          const severityOrder: Record<string, number> = {
            "Very High": 1,
            VeryHigh: 1,
            High: 2,
            Medium: 3,
            Low: 4,
          };

          let totalCounts: Record<string, number> = { "Very High": 0, "High": 0, "Medium": 0, "Low": 0 };
          parsedSeverities.forEach((p) => {
            let s = p.sev.trim();
            if (s === "VeryHigh") s = "Very High";
            if (s === "Info" || s === "Information") s = "Low";
            if (s !== "Very High" && s !== "High" && s !== "Medium" && s !== "Low") return;
            totalCounts[s] = (totalCounts[s] || 0) + (parseInt(p.count, 10) || 0);
          });

          let approvedCves: string[] = [];
          let rejectedCves: string[] = [];
          let noneCves: string[] = [];

          let approvedCounts: Record<string, number> = { "Very High": 0, "High": 0, "Medium": 0, "Low": 0 };
          let rejectedCounts: Record<string, number> = { "Very High": 0, "High": 0, "Medium": 0, "Low": 0 };
          let noneCounts: Record<string, number> = { ...totalCounts };

          const cvesInPackage = (detail.cveList || "").split(",").map((c: string) => c.trim()).filter(Boolean);

          cvesInPackage.forEach((cve: string) => {
            let status = "none";
            let severity = "Medium";

            if (aggregatedData?.sca) {
              for (const g of aggregatedData.sca) {
                if (g.identifier === cve) {
                  const locMatch = g.records.some((r) => r.location === detail.packageName);
                  if (locMatch || g.identifier === cve) {
                    status = g.status || "none";
                    let s = g.severity.trim();
                    if (s === "VeryHigh") s = "Very High";
                    if (s === "Info" || s === "Information") s = "Low";
                    if (s !== "Very High" && s !== "High" && s !== "Medium" && s !== "Low") s = "Medium";
                    severity = s;
                    break;
                  }
                }
              }
            }

            if (status === "approved") {
              approvedCves.push(cve);
              approvedCounts[severity] = (approvedCounts[severity] || 0) + 1;
            } else if (status === "rejected") {
              rejectedCves.push(cve);
              rejectedCounts[severity] = (rejectedCounts[severity] || 0) + 1;
            } else {
              noneCves.push(cve);
            }
          });

          Object.keys(noneCounts).forEach((s) => {
            noneCounts[s] -= (approvedCounts[s] || 0);
            noneCounts[s] -= (rejectedCounts[s] || 0);
            if (noneCounts[s] < 0) noneCounts[s] = 0;
          });

          const buildRow = (cves: string[], countsObj: Record<string, number>, label: string, bgClass: string) => {
            if (cves.length === 0) return "";

            const severitiesToRender = Object.entries(countsObj)
              .filter(([sev, c]) => c > 0)
              .sort(([sevA], [sevB]) => (severityOrder[sevA] || 99) - (severityOrder[sevB] || 99))
              .map(([sev, c]) => {
                const sevClass = sev.toLowerCase().replace(" ", "");
                return `<span class="crs-rounded minwidth ${sevClass}">${sev}</span>: ${c}`;
              });

            if (severitiesToRender.length === 0) return "";

            const severityHtml = severitiesToRender.join("<br/>");
            const cveLinks = cves
              .map(
                (cve) =>
                  `<a target="_blank" href="http://web.nvd.nist.gov/view/vuln/detail?vulnId=${cve}">${cve}</a>`,
              )
              .join("</div><div>");

            return `
        <tr>
            <td>${detail.packageName}</td>
            <td>${detail.version}</td>
            <td>${severityHtml}</td>
            <td>${detail.remediation_due_date || "N/A"}</td>
            <td><div class="top_row"><div>${cveLinks}</div></div></td>
            <td><span class="crs-rounded minwidth ${bgClass}">${label}</span></td>
        </tr>`;
          };

          const noneRow = buildRow(noneCves, noneCounts, "None", "bg-gold");
          const appRow = buildRow(approvedCves, approvedCounts, "Approved", "bg-green");
          const rejRow = buildRow(rejectedCves, rejectedCounts, "Rejected", "bg-red");

          return noneRow + appRow + rejRow;
        })
        .join("");

      scaSection = `
<h3 class="heading bg-red">Third-party Components</h3><br/>
A review of the third-party components in the Software Composition Analysis was performed. There are ${vulnerabilitySentencePart} severity vulnerabilities that affect ${vulnerablePackages} third-party components.<br/>
<h4>Third-Party Component Summary</h4>
<ul>
    <li>Components: ${totalPackages}</li>
    <li>Vulnerable Components: ${vulnerablePackages}</li>
    <li>Vulnerabilities: ${backendScaSummary.vulnerabilities}<ul>
${listItems}
    </ul></li>
</ul>
<br/>
${remediation_guidance}
${StaticContent.scaDetailHeader}
${scaTableRows}
</table>
`;
    }

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

    return (
      StaticContent.header_style +
      header +
      sastSection +
      scaSection +
      missingScaMessages +
      moduleSelectionSection +
      StaticContent.footerMsg
    );
  }, [
    overview,
    backendSastSummary,
    backendScaSummary,
    sastSummary,
    scaDetails,
    isScanTooOld,
    aggregatedData,
  ]);

  const [rawHtml, setRawHtml] = useState(formattedHeader);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRawHtml(formattedHeader);
  }, [formattedHeader]);

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
          className="w-full flex-1 p-4 bg-slate-950 text-slate-200 font-mono text-[11px] rounded-lg border border-slate-800 resize-none"
          value={rawHtml}
          onChange={(e) => setRawHtml(e.target.value)}
        />
      ) : (
        <div
          className="w-full flex-1 p-4 bg-white text-black rounded-lg overflow-auto"
          dangerouslySetInnerHTML={{ __html: rawHtml }}
        />
      )}
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
  const [aiProvider, setAiProvider] = useState<AIProvider>("Gemini");
  const [sastSystemPrompt, setSastSystemPrompt] = useState<string>("");
  const [scaSystemPrompt, setScaSystemPrompt] = useState<string>("");
  const [initialSastPrompt, setInitialSastPrompt] = useState<string>("");
  const [initialScaPrompt, setInitialScaPrompt] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [detailedGroup, setDetailedGroup] = useState<AggregatedGroup | null>(
    null,
  );
  const [sensitiveGroupToBypass, setSensitiveGroupToBypass] = useState<AggregatedGroup | null>(null);
  const [loadingAIGroups, setLoadingAIGroups] = useState<Set<string>>(new Set());

  const [configNoSca, setConfigNoSca] = useState<string[]>([]);
  const [configEngines, setConfigEngines] = useState<string[]>([
    "Gemini",
    "Azure OpenAI",
    "OpenAI",
    "Anthropic",
  ]);
  const [configHistory, setConfigHistory] = useState<string[]>([]);
  const [configScanValidityDays, setConfigScanValidityDays] =
    useState<number>(90);

  useEffect(() => {
    fetch(getEndpoint('configInfo'))
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.noSca)) setConfigNoSca(data.noSca);
        if (Array.isArray(data.engines)) {
          setConfigEngines(data.engines);
          if (data.engines.length > 0) setAiProvider(data.engines[0]);
        }
        if (Array.isArray(data.history)) setConfigHistory(data.history);
        if (typeof data.scanValidityDays === "number")
          setConfigScanValidityDays(data.scanValidityDays);
      })
      .catch((err) => console.error("Failed to fetch config:", err));
  }, []);

  // Dynamic Summaries
  const sastSummary = React.useMemo(() => {
    const IS_PRODUCTION =
      import.meta.env.PROD || import.meta.env.VITE_ENVIRONMENT === "production";

    // Choose base summary
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
      // Strictly no mock data in production
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

    // Choose base summary
    let baseSummary = mockScaSummary;
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
      // Strictly no mock data in production
      return {
        vulnerabilities: 0,
        breakdown: { "Very High": 0, High: 0, Medium: 0, Low: 0 },
        totalPackages: 0,
        totalVulnerablePackages: 0,
      };
    }

    return {
      ...baseSummary,
      vulnerabilities: baseSummary.vulnerabilities,
      breakdown: baseSummary.breakdown,
    };
  }, [resultsLoaded, backendScaSummary]);

  useEffect(() => {
    // processImportedData(sampleReportData); // Removed as requested
  }, []);

  const fetchPrompts = async () => {
    try {
      const res = await fetch(getEndpoint('configPrompts'));
      const data = await res.json();
      setSastSystemPrompt(data.sastPrompt);
      setScaSystemPrompt(data.scaPrompt);
      setInitialSastPrompt(data.sastPrompt);
      setInitialScaPrompt(data.scaPrompt);
    } catch (err) {
      console.error("Failed to fetch prompts", err);
    }
  };

  const savePrompts = async () => {
    try {
      const res = await fetch(getEndpoint('configPrompts'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sastPrompt: sastSystemPrompt,
          scaPrompt: scaSystemPrompt,
        }),
      });
      if (res.ok) {
        setInitialSastPrompt(sastSystemPrompt);
        setInitialScaPrompt(scaSystemPrompt);
        setIsSettingsOpen(false);
      } else {
        console.error("Failed to save prompts");
      }
    } catch (err) {
      console.error("Failed to save prompts", err);
    }
  };

  const toggleSettings = async () => {
    if (!isSettingsOpen) {
      await fetchPrompts();
    }
    setIsSettingsOpen(!isSettingsOpen);
  };

  const toggleTool = (tool: ToolName) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const processImportedData = (data: any) => {
    console.log("CRITICAL: processImportedData called with:", data);
    try {
      setLastRawResponse(data);

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
          architectures: data.architectures || [],
          scaEcosystems: ecosArray.length > 0 ? `[${ecosArray.join(", ")}]` : "",
          packagingAnomalies,
          unselectedModules,
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
      if (data && data.scaDetails) setScaDetails(data.scaDetails);
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
    if (selectedTools.length === 0 || !appProfile) return;

    setIsSubmitting(true);
    setBackendError(null);
    setErrorType(null);
    setSuggestedApps([]);
    const IS_PRODUCTION =
      import.meta.env.PROD || import.meta.env.VITE_ENVIRONMENT === "production";

    let handled = false;
    try {
      const response = await fetch(
        `${getEndpoint('getFinalReport')}?application-name=${encodeURIComponent(appProfile)}`,
      );

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

      fetch(getEndpoint('configInfo'))
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.history)) {
            setConfigHistory(data.history);
          }
        })
        .catch((err) => console.warn("Failed to refresh history:", err));
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
      const missingNames = missingComments.map(g => g.type === "SCA" && g.identifier ? g.identifier : `CWE-${g.cweId}`).join("\n• ");
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

    setBatchModalConfig(null);

    let successCount = 0;
    let lastErrorMsg = "";
    for (const group of selectedItems) {
      const flawIdList = group.records.map((f: any) => f.issue_id || f.id).join(",");

      const payload = {
        buildId,
        appId: activeOverview.appId || "",
        flawIdList,
        action: actionStr,
        comment: group.aiComment,
      };

      try {
        const response = await fetch(getEndpoint('veracodeMitigation'), {
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

        if (!response.ok) {
          throw new Error(JSON.stringify(resData));
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

        const isSAST = group.type === "SAST";
        
        if (isSAST) {
          setSastMitigationProposal((prev: any) => {
             if (!prev) return prev;
             const updated = { ...prev };
             let sev = group.severity;
             if (sev === 'VeryHigh') sev = 'Very High';
             if (!updated[sev] && updated[sev.replace("Information", "Info")] !== undefined) {
               sev = sev.replace("Information", "Info");
             } else if (!updated[sev] && updated[sev.replace("Info", "Information")] !== undefined) {
               sev = sev.replace("Info", "Information");
             }
             if (updated[sev] !== undefined) {
               updated[sev] = Math.max(0, updated[sev] - group.records.length);
             }
             if (updated.Total !== undefined) {
               updated.Total = Math.max(0, updated.Total - group.records.length);
             }
             return updated;
          });

          if (actionType === "approved") {
            setBackendSastSummary((prev: any) => {
               if (!prev || !prev.breakdown) return prev;
               const breakdown = { ...prev.breakdown };
               let sevKey = group.severity;
               if (sevKey === 'VeryHigh') sevKey = 'Very High';
               if (!breakdown[sevKey] && breakdown[sevKey.replace("Information", "Info")]) {
                 sevKey = sevKey.replace("Information", "Info");
               } else if (!breakdown[sevKey] && breakdown[sevKey.replace("Info", "Information")]) {
                 sevKey = sevKey.replace("Info", "Information");
               }
               if (!breakdown[sevKey]) return prev;

               const sevData = { ...breakdown[sevKey] };
               sevData.total = Math.max(0, sevData.total - group.records.length);
               breakdown[sevKey] = sevData;
               
               const totalVulnerabilities = Math.max(0, prev.vulnerabilities - group.records.length);
               return { ...prev, breakdown, vulnerabilities: totalVulnerabilities };
            });
          }
        } else {
          setScaMitigationProposal((prev: any) => {
             if (!prev) return prev;
             const updated = { ...prev };
             let sev = group.severity;
             if (sev === 'VeryHigh') sev = 'Very High';
             if (updated[sev] !== undefined) {
               updated[sev] = Math.max(0, updated[sev] - group.records.length);
             }
             if (updated.Total !== undefined) {
               updated.Total = Math.max(0, updated.Total - group.records.length);
             }
             return updated;
          });

          if (actionType === "approved") {
            setBackendScaSummary((prev: any) => {
               if (!prev || !prev.breakdown) return prev;
               const breakdown = { ...prev.breakdown };
               let sevKey = group.severity;
               if (sevKey === 'VeryHigh') sevKey = 'Very High';
               if (!breakdown[sevKey]) return prev;

               const sevData = { ...breakdown[sevKey] };
               sevData.total = Math.max(0, sevData.total - group.records.length);
               breakdown[sevKey] = sevData;
               
               const totalVulnerabilities = Math.max(0, prev.vulnerabilities - group.records.length);
               return { ...prev, breakdown, vulnerabilities: totalVulnerabilities };
            });
          }
        }
      } catch (err: any) {
        console.error(`Error during batch action for ${group.groupId}:`, err.message);
        lastErrorMsg = err.message;
      }
    }
    
    setIsSubmitting(false);
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
      return orderA - orderB;
    });
  };

  const currentGroups =
    activeTab === "SAST"
      ? getSortedGroups(aggregatedData.sast)
      : getSortedGroups(aggregatedData.sca);

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

  return (
    <ErrorBoundary
      onError={(err) => setBackendError(`Render Crash: ${err.message}`)}
    >
      <div className="h-screen overflow-hidden bg-slate-950 text-slate-200 font-sans p-6 selection:bg-blue-500/30">
        <div className="max-w-[1400px] mx-auto grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-5 h-full">
          {/* TOP BAR: Controls */}
          <div className="col-span-12 bento-card p-4 flex items-center justify-start gap-8 bg-slate-900/50 backdrop-blur-xl flex-shrink-0">
            <div className="flex gap-8 items-center flex-1">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg text-white">
                  <Shield size={24} />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-lg font-black tracking-tight leading-tight">
                    CRS
                  </h1>
                  <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
                    REVIEW TOOL // v1.0.0
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleFetchResults}
                className="flex gap-4 items-end"
              >
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
                    className="bento-input w-64 text-[10px] py-1"
                  />
                  <datalist id="app-profiles-list">
                    {configHistory.map((app) => (
                      <option key={app} value={app} />
                    ))}
                  </datalist>
                </div>
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
                    isSubmitting || selectedTools.length === 0 || !appProfile
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
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                    SYSTEM_READY
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

          {!resultsLoaded ? (
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
                                {sev === "Very High" ? "V. HIGH" : sev === "Information" ? "INFO" : sev}
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
                                {sev}
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

                <div className="bento-card bg-slate-900/40 p-3 flex flex-col shrink-0">
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
                        disabled={selectedGroups.size === 0}
                        className="py-2 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-20"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleBatchAction("rejected")}
                        disabled={selectedGroups.size === 0}
                        className="py-2 bg-red-600/10 text-red-400 border border-red-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all disabled:opacity-20"
                      >
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
                    <p
                      className="text-[11px] font-bold text-white truncate w-full"
                      title={activeOverview.applicationName}
                    >
                      {activeOverview.applicationName}
                    </p>
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
                    <p className="text-[11px] font-mono text-slate-400">
                      {
                        String(activeOverview.generationDate || "---").split(
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
                      return ovw?.generationDate || null;
                    };
                    const effectiveDate = getEffectiveScanDate(activeOverview);

                    const daysSinceScan = effectiveDate
                      ? (new Date().getTime() -
                          new Date(effectiveDate).getTime()) /
                        (1000 * 3600 * 24)
                      : 0;
                    if (daysSinceScan > configScanValidityDays) {
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

                <div className="flex w-full justify-start border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
                  {(["SAST", "SCA", "Review"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`grow-0 basis-1/3 px-2 py-3 text-[11px] font-black uppercase tracking-[0.1em] transition-all relative flex flex-col justify-center items-center gap-1 ${
                        activeTab === tab
                          ? "text-blue-400 bg-blue-500/5"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <span>{tab === "Review" ? "Review Comments" : `${tab} Findings`}</span>
                      
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
                                <span className="text-slate-500">{sev.replace('Information', 'Info')}</span>
                                <span className={`${
                                  sev === "Very High" ? "text-purple-400" :
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
                                <span className="text-slate-500">{sev.replace('Information', 'Info')}</span>
                                <span className={`${
                                  sev === "Very High" ? "text-purple-400" :
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
                      configNoSca={configNoSca}
                      configScanValidityDays={configScanValidityDays}
                      aggregatedData={aggregatedData}
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
                            No active findings in {activeTab}
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
          {isSettingsOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSettingsOpen(false)}
                className="absolute inset-0 bg-black/60"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">
                      AI Analysis Configuration
                    </h2>
                    <p className="text-xs text-slate-500 font-mono mt-1 uppercase tracking-widest">
                      Global System Instructions
                    </p>
                  </div>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all shadow-sm"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 space-y-8 overflow-y-auto">
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                        SAST Prompt Engine
                      </h3>
                    </div>
                    <textarea
                      value={sastSystemPrompt}
                      onChange={(e) => setSastSystemPrompt(e.target.value)}
                      className="w-full h-48 bg-black/40 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 outline-none transition-all resize-none"
                      placeholder="Enter 200-300 lines of prompt context here..."
                    />
                    <p className="text-[10px] text-slate-500 italic">
                      Used for Static Application Security Testing analysis.
                    </p>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                        SCA Prompt Engine
                      </h3>
                    </div>
                    <textarea
                      value={scaSystemPrompt}
                      onChange={(e) => setScaSystemPrompt(e.target.value)}
                      className="w-full h-48 bg-black/40 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-300 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all resize-none"
                      placeholder="Enter software composition instructions..."
                    />
                    <p className="text-[10px] text-slate-500 italic">
                      Used for Third-party library and CVE vulnerability
                      assessment.
                    </p>
                  </section>
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
                    disabled={
                      sastSystemPrompt === initialSastPrompt &&
                      scaSystemPrompt === initialScaPrompt
                    }
                    className="px-8 py-2 bg-white text-black text-sm font-black rounded-xl hover:bg-slate-200 transition-all active:scale-95 shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    SAVE CONFIGURATION
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
                          <a
                            href={`${CWE_BASE_URL}${detailedGroup.cweId}.html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 font-bold underline decoration-blue-500/30 underline-offset-2"
                          >
                            CWE-{detailedGroup.cweId}
                          </a>
                          <span className="opacity-30">|</span>
                          <span>{detailedGroup.records.length} Findings</span>
                        </div>
                        <span
                          className={`px-2 py-1 rounded border text-[10px] font-black uppercase tracking-widest leading-none ${
                            detailedGroup.severity === "Very High"
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
                          {detailedGroup.severity}
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
                <p className="text-sm text-slate-300 mb-4">
                  You are about to submit mitigation proposals for the following {batchModalConfig.selectedItems.reduce((acc, item) => acc + item.records.length, 0)} records:
                </p>
                <div className="space-y-2 mb-6 max-h-[40vh] overflow-auto">
                  {Object.values(
                    batchModalConfig.selectedItems.reduce((acc, item) => {
                      const displayKey = item.type === "SCA" && item.identifier ? item.identifier : `CWE-${item.cweId}`;
                      let gSev = item.severity;
                      if (gSev === "VeryHigh") gSev = "Very High";
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
                          severity === 'Very High' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                          severity === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                          severity === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                          severity === 'Low' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          'bg-slate-800 text-slate-500 border-slate-700'
                        }`}>
                          {severity}
                        </span>
                      </div>
                      <span className="text-xs font-black text-blue-400 bg-blue-500/10 px-2 py-1 rounded shrink-0">{count} {count === 1 ? 'record' : 'records'}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setBatchModalConfig(null)}
                    className="px-6 py-2.5 bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBatchSubmit}
                    disabled={isSubmitting}
                    className={`px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-lg transition ${batchModalConfig.actionType === "approved" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-red-600 hover:bg-red-500 text-white"} disabled:opacity-50 flex items-center gap-2`}
                  >
                    {isSubmitting ? <RefreshCcw size={14} className="animate-spin" /> : null}
                    Submit {batchModalConfig.actionType === "approved" ? "Approval" : "Rejection"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>

        <AnimatePresence>
          {successMessage && (
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-6 bg-transparent pointer-events-none">
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
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-transparent pointer-events-none">
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
