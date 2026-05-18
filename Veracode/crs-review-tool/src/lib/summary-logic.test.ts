import { describe, it, expect } from 'vitest';
import { generateReviewSummary } from './summary-logic';

describe('generateReviewSummary', () => {
  const mockInput = {
    backendSastSummary: {
      vulnerabilities: 0,
      breakdown: {
        'High': {
          findings: [
            { cwe: 'CWE-89', count: '1', remediation_due_date: '2023-01-01' }
          ]
        }
      }
    },
    backendScaSummary: {
      vulnerabilities: 0,
      totalVulnerablePackages: 0,
      totalPackages: 10,
      breakdown: {
        'High': {
          total: 1,
          findings: [
            { packageName: 'lodash', packageVersion: '4.17.0', count: '1', severity: 'High' }
          ]
        }
      }
    },
    aggregatedData: {
      sast: [
        { groupId: 'g1', cweId: '89', severity: 'High', status: 'approved', records: [{}, {}], type: 'SAST' }
      ],
      sca: [
         { groupId: 'g2', identifier: 'CVE-123', severity: 'High', status: 'approved', records: [{ location: 'lodash' }], type: 'SCA' }
      ]
    },
    overview: { architectures: [], scaEcosystems: '' },
    configNoSca: [],
    scaDetails: [
      { packageName: 'lodash', version: '4.17.0', severityCounts: 'High: 1', cveList: 'CVE-123' }
    ]
  };

  it('should show SAST table if vulnerabilities are 0 but some findings are processed (approved/rejected)', () => {
    const result = generateReviewSummary(mockInput);
    expect(result.sastSection).toContain('Open Flaw and Mitigation Proposal Summary');
    expect(result.sastSection).toContain('Approved');
  });

  it('should show SCA table if vulnerabilities are 0 but some findings are processed', () => {
    const result = generateReviewSummary(mockInput);
    expect(result.scaSection).toContain('Third-party Components');
    expect(result.scaSection).toContain('Approved');
  });

  it('should NOT show SAST table if vulnerabilities are 0 AND nothing is processed', () => {
    const emptyInput = {
      ...mockInput,
      backendSastSummary: { vulnerabilities: 0, breakdown: {} },
      aggregatedData: { sast: [], sca: [] }
    };
    const result = generateReviewSummary(emptyInput);
    expect(result.sastSection).toBe("");
  });

  it('should NOT show SCA table if vulnerabilities are 0 AND nothing is processed AND no scaDetails matches', () => {
      const emptyInput = {
        ...mockInput,
        backendScaSummary: { vulnerabilities: 0, breakdown: {} },
        aggregatedData: { sast: [], sca: [] },
        scaDetails: []
      };
      const result = generateReviewSummary(emptyInput);
      expect(result.scaSection).toBe("");
    });
});
