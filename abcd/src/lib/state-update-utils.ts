
export function updateMitigationProposal(prev: any, group: any) {
  if (!prev) return prev;
  const updated = { ...prev };
  let sev = group.severity;
  if (sev === 'VeryHigh' || sev === 'Critical') sev = 'Very High';
  
  // Normalization logic
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
}

export function updateBackendSummary(prev: any, group: any) {
  if (!prev || !prev.breakdown) return prev;
  const breakdown = { ...prev.breakdown };
  let sevKey = group.severity;
  if (sevKey === 'VeryHigh' || sevKey === 'Critical') sevKey = 'Very High';
  
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
}

export function calculateIsScanTooOld(scanDateStr: string | undefined, validityDays: number): boolean {
  if (!scanDateStr) return false;
  const scanDate = new Date(scanDateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - scanDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > validityDays;
}
