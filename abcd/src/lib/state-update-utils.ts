function normalizeSev(raw: string) {
  const low = raw.trim().toLowerCase();
  if (low === "critical" || low === "very high" || low === "veryhigh") return "Very High";
  if (low === "high") return "High";
  if (low === "medium") return "Medium";
  if (low === "low") return "Low";
  if (low === "information" || low === "info") return "Information";
  return "Medium";
}

export function updateMitigationProposal(prev: any, group: any) {
  if (!prev) return prev;
  // Only update mitigation proposal count if the group represents actual mitigation proposal(s) (i.e. has comments)
  if (!group || !group.comments || group.comments.trim() === "") {
    return prev;
  }
  const updated = { ...prev };
  
  let sevStr = group.severity || "Medium";
  const counts: Record<string, number> = { "Very High": 0, "High": 0, "Medium": 0, "Low": 0, "Information": 0 };
  
  if (sevStr.includes(":")) {
    const matches = Array.from(sevStr.matchAll(/(Critical|Very High|VeryHigh|High|Medium|Low|Information|Info):\s*(\d+)/gi));
    let found = false;
    for (const m of matches) {
      found = true;
      let s = normalizeSev(m[1]);
      counts[s] = (counts[s] || 0) + parseInt(m[2], 10);
    }
    if (!found) {
      const nameMatches = Array.from(sevStr.matchAll(/(Critical|Very High|VeryHigh|High|Medium|Low|Information|Info)/gi));
      for (const m of nameMatches) {
        let s = normalizeSev(m[1]);
        counts[s] = (counts[s] || 0) + 1;
      }
    }
  } else {
    let s = normalizeSev(sevStr);
    counts[s] = group.records ? group.records.length : 1;
  }

  // Decrement pending proposal counts and ensure they do not go below zero
  Object.keys(counts).forEach(s => {
    if (counts[s] > 0) {
      const existingKey = Object.keys(updated).find(k => {
        let normK = k;
        if (normK === "Critical" || normK === "VeryHigh" || normK === "Very High") normK = "Very High";
        if (normK === "Info") normK = "Information";
        return normK === s;
      }) || s;
      const currentVal = updated[existingKey] || 0;
      const subAmount = Math.min(currentVal, counts[s]);
      updated[existingKey] = Math.max(0, currentVal - subAmount);
      if (updated.Total !== undefined) {
        updated.Total = Math.max(0, updated.Total - subAmount);
      }
    }
  });

  return updated;
}

export function updateBackendSummary(prev: any, group: any) {
  if (!prev || !prev.breakdown) return prev;
  const breakdown = { ...prev.breakdown };
  
  let sevStr = group.severity || "Medium";
  const counts: Record<string, number> = { "Very High": 0, "High": 0, "Medium": 0, "Low": 0, "Information": 0 };
  
  if (sevStr.includes(":")) {
    const matches = Array.from(sevStr.matchAll(/(Critical|Very High|VeryHigh|High|Medium|Low|Information|Info):\s*(\d+)/gi));
    let found = false;
    for (const m of matches) {
      found = true;
      let s = normalizeSev(m[1]);
      counts[s] = (counts[s] || 0) + parseInt(m[2], 10);
    }
    if (!found) {
      const nameMatches = Array.from(sevStr.matchAll(/(Critical|Very High|VeryHigh|High|Medium|Low|Information|Info)/gi));
      for (const m of nameMatches) {
        let s = normalizeSev(m[1]);
        counts[s] = (counts[s] || 0) + 1;
      }
    }
  } else {
    let s = normalizeSev(sevStr);
    counts[s] = group.records ? group.records.length : 1;
  }

  let totalSubtracted = 0;
  
  Object.keys(counts).forEach(s => {
    if (counts[s] > 0) {
      const breakdownKey = Object.keys(breakdown).find(k => {
        let normK = k;
        if (normK === "Critical" || normK === "VeryHigh" || normK === "Very High") normK = "Very High";
        if (normK === "Info") normK = "Information";
        return normK === s;
      });
      
      if (breakdownKey && breakdown[breakdownKey] !== undefined) {
        if (typeof breakdown[breakdownKey] === 'number') {
          breakdown[breakdownKey] = Math.max(0, breakdown[breakdownKey] - counts[s]);
        } else if (typeof breakdown[breakdownKey] === 'object' && breakdown[breakdownKey] !== null) {
          const sevData = { ...breakdown[breakdownKey] };
          if (typeof sevData.total === 'number') {
            sevData.total = Math.max(0, sevData.total - counts[s]);
          }
          breakdown[breakdownKey] = sevData;
        }
        totalSubtracted += counts[s];
      }
    }
  });

  const totalVulnerabilities = Math.max(0, (Number(prev.vulnerabilities) || 0) - totalSubtracted);
  const totalVulnerablePackages = Math.max(0, (Number(prev.totalVulnerablePackages) || 0) - 1);
  return { ...prev, breakdown, vulnerabilities: totalVulnerabilities, totalVulnerablePackages };
}

export function calculateIsScanTooOld(scanDateStr: string | undefined, validityDays: number): boolean {
  if (!scanDateStr) return false;
  const scanDate = new Date(scanDateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - scanDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > validityDays;
}
