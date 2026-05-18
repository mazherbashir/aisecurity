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
}

export function generateReviewSummary(input: SummaryInput) {
  const {
    backendSastSummary,
    backendScaSummary,
    aggregatedData,
    overview,
    configNoSca,
    scaDetails,
    scaSafeVersionEnabled = false
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
  const sastSection =
    backendSastSummary && (backendSastSummary.vulnerabilities > 0 || hasAnyProcessedSAST) && rows !== ""
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
  const hasAnyProcessedSCA = (aggregatedData.sca || []).some(g => !!g.status);
  if (backendScaSummary && (backendScaSummary.vulnerabilities > 0 || hasAnyProcessedSCA)) {
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

  return { sastSection, scaSection, missingScaMessages };
}
