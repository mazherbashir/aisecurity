import { StaticContent } from "../staticContent";

export interface SummaryInput {
  backendSastSummary: any;
  backendScaSummary: any;
  aggregatedData: {
    sast: any[];
    sca: any[];
  };
  overview: any;
  configNoSca: string[];
  scaDetails: any[];
  scaSafeVersionEnabled?: boolean;
  selectedTools?: string[];
}

export function generateReviewSummary(input: SummaryInput) {
  const {
    backendSastSummary,
    backendScaSummary,
    aggregatedData,
    overview,
    configNoSca,
    scaDetails,
    scaSafeVersionEnabled = false,
    selectedTools
  } = input;

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

  const hasAnyProcessedSAST = (aggregatedData.sast || []).some(g => !!g.status);

  // Calculate dynamic Code Flaws class and status text
  let headingClass = "bg-green";
  let hasOutstandingHighOrMediumOrVeryHigh = false;
  let hasOutstandingLowOrLower = false;
  let hasAnySastVulnerability = false;

  if (backendSastSummary && backendSastSummary.breakdown) {
    Object.entries(backendSastSummary.breakdown).forEach(
      ([severity, data]: [string, any]) => {
        data.findings?.forEach((finding: any) => {
          hasAnySastVulnerability = true;
          const cweIdMatch = finding.cwe.match(/\d+/);
          const extractedCwe = cweIdMatch ? cweIdMatch[0] : "";
          
          let approvedCount = 0;
          let rejectedCount = 0;
          const originalCount = parseInt(finding.count, 10) || 0;
          
          if (aggregatedData?.sast) {
            for (const g of aggregatedData.sast) {
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
          const outstandingCount = noneCount + rejectedCount;
          
          if (outstandingCount > 0) {
            const sevLower = severity.toLowerCase().replace(" ", "");
            if (["medium", "high", "veryhigh", "very high"].includes(sevLower)) {
              hasOutstandingHighOrMediumOrVeryHigh = true;
            } else {
              hasOutstandingLowOrLower = true;
            }
          }
        });
      }
    );
  }

  if (hasAnySastVulnerability) {
    if (hasOutstandingHighOrMediumOrVeryHigh) {
      headingClass = "bg-red";
    } else if (hasOutstandingLowOrLower) {
      headingClass = "bg-gold";
    } else {
      headingClass = "bg-green";
    }
  }

  let proposalSummaryText = "";
  const num_approved = (aggregatedData.sast || [])
    .filter((g) => g.status === "approved")
    .reduce((sum, g) => sum + (g.records ? g.records.length : 0), 0);
  const num_rejected = (aggregatedData.sast || [])
    .filter((g) => g.status === "rejected")
    .reduce((sum, g) => sum + (g.records ? g.records.length : 0), 0);

  if (num_approved > 0 || num_rejected > 0) {
    proposalSummaryText += "<p>";
    if (num_approved > 0 && num_rejected > 0) {
      const verbApp = num_approved > 1 ? "have been" : "has been";
      const verbRej = num_rejected > 1 ? "have been" : "has been";
      proposalSummaryText += `After reviewing all available flaw mitigation proposals, ${num_approved} ${verbApp} approved and ${num_rejected} ${verbRej} rejected or require(s) additional information.<br/>`;
    } else if (num_approved > 0) {
      const verbApp = num_approved > 1 ? "have been" : "has been";
      proposalSummaryText += `After reviewing all available flaw mitigation proposals, ${num_approved} ${verbApp} approved.<br/>`;
    } else if (num_rejected > 0) {
      const verbRej = num_rejected > 1 ? "have been" : "has been";
      proposalSummaryText += `After reviewing all available flaw mitigation proposals, ${num_rejected} ${verbRej} rejected or require(s) additional information.<br/>`;
    }

    const hasVeracode = !selectedTools || selectedTools.includes("Veracode");
    if (hasVeracode) {
      proposalSummaryText += `For approval and rejection details, review the <a target="_blank" href="https://docs.veracode.com/r/improve_mitigation?section=mitigate__team">individual flaws on the Triage Flaws page</a> and the <a target="_blank" href="https://docs.veracode.com/r/Approve_or_Reject_Veracode_SCA_Mitigations">History tab of the individual Component Profiles on the Software Composition Analysis page</a> within the Veracode platform.<br/>`;
    }
    proposalSummaryText += "</p>";
  }

  const sastSection =
    backendSastSummary && (backendSastSummary.vulnerabilities > 0 || hasAnyProcessedSAST) && rows !== ""
      ? `<h3 class="heading ${headingClass}">Code Flaws</h3></br>` +
        proposalSummaryText +
        StaticContent.sastHeader +
        rows +
        StaticContent.sastFooter
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
  const hasAnyProcessedSCA = (aggregatedData.sca || []).some(g => !!g.status);

  const { remainingScaVulnerabilities, remainingVulnerablePackages, remainingBreakdown } = (() => {
    const totalVulnerabilities = backendScaSummary?.vulnerabilities || 0;
    const totalVulnerablePackages = backendScaSummary?.totalVulnerablePackages || 0;

    const parsedOriginalBreakdown: Record<string, number> = { "Very High": 0, High: 0, Medium: 0, Low: 0 };
    if (backendScaSummary?.breakdown) {
      Object.entries(backendScaSummary.breakdown).forEach(([sev, val]: [string, any]) => {
        let normSev = sev;
        if (sev === "VeryHigh") normSev = "Very High";
        if (parsedOriginalBreakdown[normSev] !== undefined) {
          parsedOriginalBreakdown[normSev] = typeof val === "number" ? val : (val?.total || 0);
        }
      });
    }

    if (totalVulnerabilities === 0) {
      return {
        remainingScaVulnerabilities: 0,
        remainingVulnerablePackages: 0,
        remainingBreakdown: parsedOriginalBreakdown,
      };
    }

    let unapprovedCvesInAll = 0;
    let unapprovedPkgsInAll = 0;
    const dynamicBreakdown: Record<string, number> = { "Very High": 0, High: 0, Medium: 0, Low: 0 };

    if (scaDetails && scaDetails.length > 0) {
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
            if (sName === "VeryHigh") sName = "Very High";
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
                    if (sName === "VeryHigh") sName = "Very High";
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
          unapprovedPkgsInAll++;
          unapprovedCvesInAll += unapprovedCvesInPkg;
        }
      });

      return {
        remainingScaVulnerabilities: unapprovedCvesInAll,
        remainingVulnerablePackages: unapprovedPkgsInAll,
        remainingBreakdown: dynamicBreakdown,
      };
    } else {
      // Fallback if scaDetails is empty/unavailable
      const fbBreakdown = { ...parsedOriginalBreakdown };
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
              if (fbBreakdown[sev] > 0) {
                fbBreakdown[sev]--;
              }
              approvedPackages.add(pkg);
            } else {
              unapprovedPackages.add(pkg);
            }
          });
        });
      }

      const remVulns = Math.max(0, totalVulnerabilities - approvedCount);
      let remPkgs = totalVulnerablePackages;
      if (unapprovedPackages.size > 0 || approvedPackages.size > 0) {
        remPkgs = unapprovedPackages.size;
      }

      return {
        remainingScaVulnerabilities: remVulns,
        remainingVulnerablePackages: remPkgs,
        remainingBreakdown: fbBreakdown,
      };
    }
  })();

  const isAllScaApproved = remainingScaVulnerabilities === 0;

  if (backendScaSummary && (backendScaSummary.vulnerabilities > 0 || hasAnyProcessedSCA)) {
    const breakdown = backendScaSummary.breakdown || {};
    const severities = [
      {
        name: "Very High",
        count: remainingBreakdown["Very High"] || 0,
        class: "veryhigh",
      },
      { name: "High", count: remainingBreakdown["High"] || 0, class: "high" },
      {
        name: "Medium",
        count: remainingBreakdown["Medium"] || 0,
        class: "medium",
      },
      { name: "Low", count: remainingBreakdown["Low"] || 0, class: "low" },
    ];
    const activeSeverities = severities.filter((s) => s.count > 0);
    const vulnerablePackages = remainingVulnerablePackages;
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

          const safeVersionHtml = scaSafeVersionEnabled ? `<td>${detail.safeVersion || "N/A"}</td>` : "";

          return `
      <tr>
          <td>${detail.packageName}</td>
          <td>${detail.version}</td>
          ${safeVersionHtml}
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

    if (scaTableRows !== "") {
      if (isAllScaApproved) {
        scaSection = `
<h3 class="heading bg-green">Third-party Components</h3><br/>
A review of the third-party components in the Software Composition Analysis was performed. There are no identified vulnerabilities in the Software Composition Analysis of the third-party components.<br/>
<h4>Third-Party Component Summary</h4>
<ul>
    <li>Components: ${totalPackages}</li>
    <li>Vulnerable Components: 0</li>
    <li>Vulnerabilities: 0<ul>
    </ul></li>
</ul>
<br/>
${(() => {
  let header = StaticContent.scaDetailHeader;
  if (scaSafeVersionEnabled) {
    header = header.replace(
      "<th><b>Current Version</b></th>",
      "<th><b>Current Version</b></th><th><b>Recommended Version(s)</b></th>",
    );
  }
  return header;
})()}
${scaTableRows}
</table>
`;
      } else {
        scaSection = `
<h3 class="heading bg-red">Third-party Components</h3><br/>
A review of the third-party components in the Software Composition Analysis was performed. There are ${vulnerabilitySentencePart} severity vulnerabilities that affect ${vulnerablePackages} third-party components.<br/>
<h4>Third-Party Component Summary</h4>
<ul>
    <li>Components: ${totalPackages}</li>
    <li>Vulnerable Components: ${vulnerablePackages}</li>
    <li>Vulnerabilities: ${remainingScaVulnerabilities}<ul>
${listItems}
    </ul></li>
</ul>
<br/>
${remediation_guidance}
${(() => {
  let header = StaticContent.scaDetailHeader;
  if (scaSafeVersionEnabled) {
    header = header.replace(
      "<th><b>Current Version</b></th>",
      "<th><b>Current Version</b></th><th><b>Recommended Version(s)</b></th>",
    );
  }
  return header;
})()}
${scaTableRows}
</table>
`;
      }
    }
  }

  return { sastSection, scaSection, missingScaMessages };
}
