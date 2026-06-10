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

  it('should display Code Flaws head with bg-green if all SAST mitigations are approved', () => {
    const inputAllApproved = {
      ...mockInput,
      backendSastSummary: {
        vulnerabilities: 1,
        breakdown: {
          'High': {
            findings: [
              { cwe: 'CWE-89', count: '1', remediation_due_date: '2023-01-01' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [
          { groupId: 'g1', cweId: '89', severity: 'High', status: 'approved', records: [{}], type: 'SAST' }
        ],
        sca: []
      }
    };
    const result = generateReviewSummary(inputAllApproved);
    expect(result.sastSection).toContain('class="heading bg-green">Code Flaws</h3>');
    expect(result.sastSection).toContain('After reviewing all available flaw mitigation proposals, 1 has been approved');
    expect(result.sastSection).toContain('For approval and rejection details, review');
  });

  it('should display the corect count of multiple proposals in a single approved group', () => {
    const inputMultipleApproved = {
      ...mockInput,
      backendSastSummary: {
        vulnerabilities: 7,
        breakdown: {
          'High': {
            findings: [
              { cwe: 'CWE-89', count: '7', remediation_due_date: '2023-01-01' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [
          {
            groupId: 'g1',
            cweId: '89',
            severity: 'High',
            status: 'approved',
            records: [{}, {}, {}, {}, {}, {}, {}], // 7 proposals
            type: 'SAST'
          }
        ],
        sca: []
      }
    };
    const result = generateReviewSummary(inputMultipleApproved);
    expect(result.sastSection).toContain('After reviewing all available flaw mitigation proposals, 7 have been approved.');
  });

  it('should display Code Flaws head with bg-red if any SAST mitigation is NONE at High severity', () => {
    const inputNoneHigh = {
      ...mockInput,
      backendSastSummary: {
        vulnerabilities: 1,
        breakdown: {
          'High': {
            findings: [
              { cwe: 'CWE-89', count: '1', remediation_due_date: '2023-01-01' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [], // None processed, so status is "None"
        sca: []
      }
    };
    const result = generateReviewSummary(inputNoneHigh);
    expect(result.sastSection).toContain('class="heading bg-red">Code Flaws</h3>');
  });

  it('should display Code Flaws head with bg-gold if any SAST mitigation is NONE at Low severity', () => {
    const inputNoneLow = {
      ...mockInput,
      backendSastSummary: {
        vulnerabilities: 1,
        breakdown: {
          'Low': {
            findings: [
              { cwe: 'CWE-80', count: '1', remediation_due_date: '2023-01-01' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [], // None processed
        sca: []
      }
    };
    const result = generateReviewSummary(inputNoneLow);
    expect(result.sastSection).toContain('class="heading bg-gold">Code Flaws</h3>');
  });

  it('should display Code Flaws head with bg-red if any SAST mitigation is rejected at Medium severity', () => {
    const inputRejectedMedium = {
      ...mockInput,
      backendSastSummary: {
        vulnerabilities: 1,
        breakdown: {
          'Medium': {
            findings: [
              { cwe: 'CWE-79', count: '1', remediation_due_date: '2023-01-01' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [
          { groupId: 'g1', cweId: '79', severity: 'Medium', status: 'rejected', records: [{}], type: 'SAST' }
        ],
        sca: []
      }
    };
    const result = generateReviewSummary(inputRejectedMedium);
    expect(result.sastSection).toContain('class="heading bg-red">Code Flaws</h3>');
  });

  it('should display Code Flaws head with bg-gold if any SAST mitigation is rejected at Low severity and none at Medium/High/Very High', () => {
    const inputRejectedLow = {
      ...mockInput,
      backendSastSummary: {
        vulnerabilities: 1,
        breakdown: {
          'Low': {
            findings: [
              { cwe: 'CWE-80', count: '1', remediation_due_date: '2023-01-01' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [
          { groupId: 'g1', cweId: '80', severity: 'Low', status: 'rejected', records: [{}], type: 'SAST' }
        ],
        sca: []
      }
    };
    const result = generateReviewSummary(inputRejectedLow);
    expect(result.sastSection).toContain('class="heading bg-gold">Code Flaws</h3>');
  });
});
