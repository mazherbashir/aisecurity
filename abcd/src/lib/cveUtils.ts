import { AggregatedGroup } from '../types';

/**
 * Extracts unique CVE codes (e.g. CVE-2021-44228) from an AggregatedGroup or any object.
 */
export function extractCveCodes(group: AggregatedGroup | null | undefined): string[] {
  if (!group) return [];
  const found = new Set<string>();
  const cveRegex = /CVE-\d{4}-\d+/gi;

  const checkAndAdd = (val: any) => {
    if (!val) return;
    if (typeof val === 'string') {
      const matches = val.match(cveRegex);
      if (matches) {
        matches.forEach((m) => found.add(m.toUpperCase()));
      }
    } else if (Array.isArray(val)) {
      val.forEach(checkAndAdd);
    }
  };

  checkAndAdd(group.identifier);
  checkAndAdd(group.cweId);
  checkAndAdd(group.description);

  if (Array.isArray(group.records)) {
    group.records.forEach((r: any) => {
      if (!r) return;
      checkAndAdd(r.title);
      checkAndAdd(r.id);
      checkAndAdd(r.vulnerabilityId);
      checkAndAdd(r.cve);
      checkAndAdd(r.cveList);
      checkAndAdd(r.cveid);
      checkAndAdd(r.packageName);
      checkAndAdd(r.fileName);
      checkAndAdd(r.location);
    });
  }

  return Array.from(found);
}

/**
 * Constructs NVD URL for a given CVE code.
 */
export function getCveNvdUrl(cveCode: string): string {
  const cleanCode = cveCode.trim().toUpperCase();
  return `https://nvd.nist.gov/vuln/detail/${cleanCode}`;
}
