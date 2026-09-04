import { describe, it, expect } from 'vitest';
import { generateReviewSummary, isSameSeverity, isSeverityMatching, isPackageMatchingFinding } from './summary-logic';

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

describe('isSameSeverity', () => {
  it('should treat Critical and Very High as the same severity', () => {
    expect(isSameSeverity('Critical', 'Very High')).toBe(true);
    expect(isSameSeverity('Very High', 'Critical')).toBe(true);
    expect(isSameSeverity('veryhigh', 'Critical')).toBe(true);
    expect(isSameSeverity('critical', 'veryhigh')).toBe(true);
  });

  it('should compare standard severities case-insensitively', () => {
    expect(isSameSeverity('High', 'high')).toBe(true);
    expect(isSameSeverity('Medium', 'medium')).toBe(true);
    expect(isSameSeverity('Low', 'LOW')).toBe(true);
    expect(isSameSeverity('High', 'Medium')).toBe(false);
  });
});

describe('isSeverityMatching', () => {
  it('should match correctly against structured severity counts string', () => {
    expect(isSeverityMatching('Very High', 'Critical: 2, High: 4')).toBe(true);
    expect(isSeverityMatching('High', 'Critical: 2, High: 4')).toBe(true);
    expect(isSeverityMatching('Medium', 'Critical: 2, High: 4')).toBe(false);
  });

  it('should return true for empty or unknown severities', () => {
    expect(isSeverityMatching('High', '')).toBe(true);
    expect(isSeverityMatching('High', 'n/a')).toBe(true);
    expect(isSeverityMatching('High', 'empty')).toBe(true);
  });
});

describe('isPackageMatchingFinding', () => {
  it('should match jsoup finding with location "jsoup Java HTML Parser" and fileName "jsoup-1.15.3.jar" to "jsoup-1.15.3.jar"', () => {
    const finding = {
      location: 'jsoup Java HTML Parser',
      fileName: 'jsoup-1.15.3.jar',
      title: 'CVE-2026-71497'
    };
    const detail = {
      packageName: 'jsoup-1.15.3.jar',
      version: '1.15.3',
      cveList: 'CVE-2026-71497'
    };
    expect(isPackageMatchingFinding(finding, detail)).toBe(true);
  });

  it('should match rhino finding with location "rhino" and fileName "rhino-1.7.13.jar" to "rhino-1.7.13.jar"', () => {
    const finding = {
      location: 'rhino',
      fileName: 'rhino-1.7.13.jar',
      title: 'CVE-2025-66453'
    };
    const detail = {
      packageName: 'rhino-1.7.13.jar',
      version: '1.7.13',
      cveList: 'CVE-2025-66453'
    };
    expect(isPackageMatchingFinding(finding, detail)).toBe(true);
  });

  it('should match logback finding with location "Logback Core Module" and fileName "logback-core-1.2.13.jar" to "logback-core-1.2.13.jar"', () => {
    const finding = {
      location: 'Logback Core Module',
      fileName: 'logback-core-1.2.13.jar',
      title: 'CVE-2026-1225'
    };
    const detail = {
      packageName: 'logback-core-1.2.13.jar',
      version: '1.2.13',
      cveList: 'CVE-2026-1225'
    };
    expect(isPackageMatchingFinding(finding, detail)).toBe(true);
  });

  it('should NOT falsely match rhino to logback', () => {
    const finding = {
      location: 'rhino',
      fileName: 'rhino-1.7.13.jar',
      title: 'CVE-2025-66453'
    };
    const detail = {
      packageName: 'logback-core-1.2.13.jar',
      version: '1.2.13',
      cveList: 'CVE-2026-1225'
    };
    expect(isPackageMatchingFinding(finding, detail)).toBe(false);
  });
});

describe('CVE-2026-71497 reflection in review summary', () => {
  const baseScanInput = {
    backendSastSummary: { vulnerabilities: 0, breakdown: {} },
    backendScaSummary: {
      vulnerabilities: 6,
      totalPackages: 130,
      totalVulnerablePackages: 3,
      breakdown: {
        'Very High': { total: 0, findings: [] },
        'High': { total: 2, findings: [] },
        'Medium': { total: 3, findings: [] },
        'Low': { total: 1, findings: [] }
      }
    },
    overview: {
      applicationName: 'USA-ADV-Value Store - PwC IT',
      scaEcosystems: '[Java, JavaScript]'
    },
    configNoSca: [],
    scaDetails: [
      {
        packageName: 'logback-core-1.2.13.jar',
        version: '1.2.13',
        severityCounts: 'Medium: 2, Low: 1, High: 1',
        cveList: 'CVE-2026-1225,CVE-2025-11226,CVE-2024-12801,CVE-2024-12798'
      },
      {
        packageName: 'rhino-1.7.13.jar',
        version: '1.7.13',
        severityCounts: 'High: 1',
        cveList: 'CVE-2025-66453'
      },
      {
        packageName: 'jsoup-1.15.3.jar',
        version: '1.15.3',
        severityCounts: 'Medium: 1',
        cveList: 'CVE-2026-71497'
      }
    ]
  };

  it('should reflect Approved status for jsoup when CVE-2026-71497 is approved', () => {
    const input = {
      ...baseScanInput,
      aggregatedData: {
        sast: [],
        sca: [
          {
            groupId: 'g-jsoup',
            identifier: 'CVE-2026-71497 - d06b805f',
            severity: 'Medium',
            status: 'approved',
            type: 'SCA',
            records: [
              {
                title: 'CVE-2026-71497',
                location: 'jsoup Java HTML Parser',
                fileName: 'jsoup-1.15.3.jar'
              }
            ]
          }
        ]
      }
    };

    const result = generateReviewSummary(input as any);
    expect(result.scaSection).toContain('jsoup-1.15.3.jar');
    expect(result.scaSection).toContain('CVE-2026-71497');
    expect(result.scaSection).toContain('Approved');
    expect(result.scaSection).toContain('bg-green');
  });

  it('should reflect Rejected status for jsoup when CVE-2026-71497 is rejected', () => {
    const input = {
      ...baseScanInput,
      aggregatedData: {
        sast: [],
        sca: [
          {
            groupId: 'g-jsoup',
            identifier: 'CVE-2026-71497 - d06b805f',
            severity: 'Medium',
            status: 'rejected',
            type: 'SCA',
            records: [
              {
                title: 'CVE-2026-71497',
                location: 'jsoup Java HTML Parser',
                fileName: 'jsoup-1.15.3.jar'
              }
            ]
          }
        ]
      }
    };

    const result = generateReviewSummary(input as any);
    expect(result.scaSection).toContain('jsoup-1.15.3.jar');
    expect(result.scaSection).toContain('CVE-2026-71497');
    expect(result.scaSection).toContain('Rejected');
    expect(result.scaSection).toContain('bg-red');
  });

  it('should match exactly the Component column from the Review comment editor and reflect status', () => {
    const input = {
      ...baseScanInput,
      scaComponents: [
        {
          id: 'jsoup-1.15.3.jar::1.15.3',
          packageName: 'jsoup-1.15.3.jar',
          version: '1.15.3',
          status: 'Approved'
        },
        {
          id: 'rhino-1.7.13.jar::1.7.13',
          packageName: 'rhino-1.7.13.jar',
          version: '1.7.13',
          status: 'Rejected'
        }
      ],
      aggregatedData: { sast: [], sca: [] }
    };

    const result = generateReviewSummary(input as any);
    expect(result.scaSection).toContain('jsoup-1.15.3.jar');
    expect(result.scaSection).toContain('Approved');
    expect(result.scaSection).toContain('rhino-1.7.13.jar');
    expect(result.scaSection).toContain('Rejected');
  });

  it('should perform exact match on Component column fileName or packageName', () => {
    // Review comment editor Component column is detail.packageName
    const detail = { packageName: 'jsoup-1.15.3.jar', version: '1.15.3' };
    const findingExactFile = { fileName: 'jsoup-1.15.3.jar', location: 'jsoup Java HTML Parser' };
    expect(isPackageMatchingFinding(findingExactFile, detail)).toBe(true);

    const npmDetail = { packageName: 'express', version: '4.18.2' };
    const npmFinding = { packageName: 'express', location: 'node_modules/express' };
    expect(isPackageMatchingFinding(npmFinding, npmDetail)).toBe(true);
  });

  it('should support Information severity in SCA summary breakdown and table rows', () => {
    const infoInput = {
      ...baseScanInput,
      backendScaSummary: {
        vulnerabilities: 1,
        totalVulnerablePackages: 1,
        totalPackages: 5,
        breakdown: {
          'Information': {
            total: 1,
            findings: [
              { packageName: 'debug-pkg', packageVersion: '1.0.0', count: '1', severity: 'Information' }
            ]
          }
        }
      },
      scaDetails: [
        { packageName: 'debug-pkg', version: '1.0.0', severityCounts: 'Information: 1', cveList: 'CVE-2026-99999' }
      ],
      aggregatedData: {
        sast: [],
        sca: [
          {
            groupId: 'g-info',
            identifier: 'CVE-2026-99999',
            severity: 'Information',
            status: 'approved',
            records: [
              {
                title: 'CVE-2026-99999',
                location: 'debug-pkg',
                fileName: 'debug-pkg-1.0.0.jar'
              }
            ]
          }
        ]
      }
    };

    const result = generateReviewSummary(infoInput as any);
    expect(result.scaSection).toContain('Info');
    expect(result.scaSection).toContain('debug-pkg');
    expect(result.scaSection).toContain('info');
    expect(result.scaSection).toContain('Approved');
  });

  const baseMissingInput: any = {
    backendSastSummary: { vulnerabilities: 0, breakdown: {} },
    backendScaSummary: { vulnerabilities: 0, totalVulnerablePackages: 0, totalPackages: 0, breakdown: {} },
    aggregatedData: { sast: [], sca: [] },
    overview: { architectures: [], scaEcosystems: '' },
    configNoSca: [],
    scaDetails: []
  };

  it('should include missing SCA message when architecture is missing and not removed', () => {
    const inputWithMissing: any = {
      ...baseMissingInput,
      overview: {
        architectures: ['JavaScript', 'Python', '.NET'],
        scaEcosystems: '[JavaScript]' // Only JavaScript is present, Python and .NET missing
      },
      configNoSca: [],
      removedMissingSca: []
    };
    const result = generateReviewSummary(inputWithMissing);
    expect(result.missingScaMessages).toContain('Missing Software Composition Analysis for Python');
    expect(result.missingScaMessages).toContain('Missing Software Composition Analysis for .NET');
    expect(result.missingScaMessages).not.toContain('Missing Software Composition Analysis for JavaScript');
  });

  it('should exclude missing SCA message when architecture is in removedMissingSca', () => {
    const inputWithRemoved: any = {
      ...baseMissingInput,
      overview: {
        architectures: ['JavaScript', 'Python', '.NET'],
        scaEcosystems: ''
      },
      configNoSca: [],
      removedMissingSca: ['JavaScript', '.NET']
    };
    const result = generateReviewSummary(inputWithRemoved);
    expect(result.missingScaMessages).not.toContain('Missing Software Composition Analysis for JavaScript');
    expect(result.missingScaMessages).not.toContain('Missing Software Composition Analysis for .NET');
    expect(result.missingScaMessages).toContain('Missing Software Composition Analysis for Python');
  });

  it('should include noPrecompileSection when overview has noPrecompile items', () => {
    const inputWithPrecompile: any = {
      ...baseMissingInput,
      overview: {
        architectures: [],
        noPrecompile: ['App.Api.dll', 'App.Core.dll'],
      },
      removedNoPrecompile: [],
    };
    const result = generateReviewSummary(inputWithPrecompile);
    expect(result.noPrecompileSection).toContain('Missing Precompiled Files');
  });

  it('should exclude noPrecompileSection when all items are in removedNoPrecompile', () => {
    const inputWithRemovedPrecompile: any = {
      ...baseMissingInput,
      overview: {
        architectures: [],
        noPrecompile: ['App.Api.dll', 'App.Core.dll'],
      },
      removedNoPrecompile: ['App.Api.dll', 'App.Core.dll'],
    };
    const result = generateReviewSummary(inputWithRemovedPrecompile);
    expect(result.noPrecompileSection).toBe('');
  });

  it('should include minifiedFilesSection and exclude removed minified files', () => {
    const inputWithMinified: any = {
      ...baseMissingInput,
      overview: {
        architectures: [],
        minifedFiles: ['assets/vendor.min.js', 'assets/bundle.min.js'],
      },
      removedMinifiedFiles: ['assets/vendor.min.js'],
    };
    const result = generateReviewSummary(inputWithMinified);
    expect(result.minifiedFilesSection).toContain('Minified Files');
    expect(result.minifiedFilesSection).toContain('assets/bundle.min.js');
    expect(result.minifiedFilesSection).not.toContain('assets/vendor.min.js');
  });

  it('should exclude minifiedFilesSection when all minified files are in removedMinifiedFiles', () => {
    const inputWithAllMinifiedRemoved: any = {
      ...baseMissingInput,
      overview: {
        architectures: [],
        minifedFiles: ['assets/vendor.min.js', 'assets/bundle.min.js'],
      },
      removedMinifiedFiles: ['assets/vendor.min.js', 'assets/bundle.min.js'],
    };
    const result = generateReviewSummary(inputWithAllMinifiedRemoved);
    expect(result.minifiedFilesSection).toBe('');
  });
});


