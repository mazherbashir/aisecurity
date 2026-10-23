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

  it('should strike the Fix by Date for approved SAST mitigation proposals in Review comments', () => {
    const inputApproved = {
      backendSastSummary: {
        vulnerabilities: 1,
        breakdown: {
          High: {
            findings: [
              { cwe: 'CWE-89', count: '1', remediation_due_date: '2025-11-20' }
            ]
          }
        }
      },
      backendScaSummary: { vulnerabilities: 0, totalPackages: 0, breakdown: {} },
      aggregatedData: {
        sast: [
          { groupId: 'g1', cweId: '89', severity: 'High', status: 'approved', records: [{}], type: 'SAST' }
        ],
        sca: []
      },
      overview: { architectures: [] },
      configNoSca: [],
      scaDetails: []
    };
    const result = generateReviewSummary(inputApproved as any);
    expect(result.sastSection).toContain('<td><strike>2025-11-20</strike></td>');
    expect(result.sastSection).toContain('<span class="crs-rounded sev bg-green">Approved</span>');
  });

  it('should NOT strike the Fix by Date for unapproved or rejected SAST proposals in Review comments', () => {
    const inputRejected = {
      backendSastSummary: {
        vulnerabilities: 1,
        breakdown: {
          High: {
            findings: [
              { cwe: 'CWE-89', count: '1', remediation_due_date: '2025-11-20' }
            ]
          }
        }
      },
      backendScaSummary: { vulnerabilities: 0, totalPackages: 0, breakdown: {} },
      aggregatedData: {
        sast: [
          { groupId: 'g1', cweId: '89', severity: 'High', status: 'rejected', records: [{}], type: 'SAST' }
        ],
        sca: []
      },
      overview: { architectures: [] },
      configNoSca: [],
      scaDetails: []
    };
    const result = generateReviewSummary(inputRejected as any);
    expect(result.sastSection).toContain('<td>2025-11-20</td>');
    expect(result.sastSection).not.toContain('<strike>2025-11-20</strike>');
    expect(result.sastSection).toContain('<span class="crs-rounded sev bg-red">Rejected</span>');
  });

  it('should strike the Fix by Date for approved SCA mitigation proposals in Review comments', () => {
    const inputApprovedSca = {
      backendSastSummary: { vulnerabilities: 0, breakdown: {} },
      backendScaSummary: {
        vulnerabilities: 1,
        totalPackages: 1,
        totalVulnerablePackages: 1,
        breakdown: {
          High: {
            total: 1,
            findings: [
              { packageName: 'fast-xml-parser', packageVersion: '4.2.4', count: '1', severity: 'High' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [],
        sca: [
          {
            groupId: 'g-sca-1',
            identifier: 'CVE-2023-1234',
            severity: 'High',
            status: 'approved',
            records: [{ location: 'fast-xml-parser', packageName: 'fast-xml-parser' }],
            type: 'SCA'
          }
        ]
      },
      overview: { architectures: [], scaEcosystems: 'JAVASCRIPT' },
      configNoSca: [],
      scaDetails: [
        {
          packageName: 'fast-xml-parser',
          version: '4.2.4',
          severityCounts: 'High: 1',
          cveList: 'CVE-2023-1234',
          remediation_due_date: '2026-06-30'
        }
      ]
    };
    const result = generateReviewSummary(inputApprovedSca as any);
    expect(result.scaSection).toContain('<td><strike>2026-06-30</strike></td>');
    expect(result.scaSection).toContain('Approved');
  });

  it('should NOT strike the Fix by Date for unapproved SCA findings in Review comments', () => {
    const inputUnapprovedSca = {
      backendSastSummary: { vulnerabilities: 0, breakdown: {} },
      backendScaSummary: {
        vulnerabilities: 1,
        totalPackages: 1,
        totalVulnerablePackages: 1,
        breakdown: {
          High: {
            total: 1,
            findings: [
              { packageName: 'fast-xml-parser', packageVersion: '4.2.4', count: '1', severity: 'High' }
            ]
          }
        }
      },
      aggregatedData: {
        sast: [],
        sca: [] // None approved
      },
      overview: { architectures: [], scaEcosystems: 'JAVASCRIPT' },
      configNoSca: [],
      scaDetails: [
        {
          packageName: 'fast-xml-parser',
          version: '4.2.4',
          severityCounts: 'High: 1',
          cveList: 'CVE-2023-1234',
          remediation_due_date: '2026-06-30'
        }
      ]
    };
    const result = generateReviewSummary(inputUnapprovedSca as any);
    expect(result.scaSection).toContain('<td>2026-06-30</td>');
    expect(result.scaSection).not.toContain('<strike>2026-06-30</strike>');
  });

  it('should accurately preserve 2 High and 2 Medium when some CVEs have mitigation proposals in aggregatedData.sca', () => {
    const inputWithMixedSeverities = {
      backendSastSummary: { vulnerabilities: 0, breakdown: {} },
      backendScaSummary: {
        vulnerabilities: 4,
        totalPackages: 79,
        totalVulnerablePackages: 1,
        breakdown: {
          'Very High': { total: 0, findings: [] },
          'High': { total: 2, findings: [] },
          'Medium': { total: 2, findings: [] },
          'Low': { total: 0, findings: [] }
        }
      },
      aggregatedData: {
        sast: [],
        sca: [
          {
            groupId: 'g-sca-1',
            identifier: 'CVE-2026-88029',
            severity: 'High',
            records: [{ location: 'pymongo', packageName: 'pymongo', title: 'CVE-2026-88029', severity: 'High' }],
            type: 'SCA'
          },
          {
            groupId: 'g-sca-2',
            identifier: 'CVE-2026-96749',
            severity: 'High',
            records: [{ location: 'pymongo', packageName: 'pymongo', title: 'CVE-2026-96749', severity: 'High' }],
            type: 'SCA'
          }
        ]
      },
      overview: { architectures: ['Python'], scaEcosystems: '[Python]' },
      configNoSca: [],
      scaDetails: [
        {
          packageName: 'pymongo',
          version: '4.10.1',
          safeVersion: '4.18.2',
          firstFoundDate: '2026-10-14 10:03:59 UTC',
          remediation_due_date: '2026-10-24',
          severityCounts: 'Medium: 2, High: 2',
          cveList: 'CVE-2026-88029,CVE-2026-96747,CVE-2026-96748,CVE-2026-96749'
        }
      ]
    };

    const result = generateReviewSummary(inputWithMixedSeverities as any);
    expect(result.scaSection).toContain('2 <span class="crs-rounded high">High</span> and 2 <span class="crs-rounded medium">Medium</span>');
    expect(result.scaSection).not.toContain('4 <span class="crs-rounded high">High</span>');
    expect(result.scaSection).toContain('<li><span class="crs-rounded minwidth high">High</span>: 2</li>');
    expect(result.scaSection).toContain('<li><span class="crs-rounded minwidth medium">Medium</span>: 2</li>');
    expect(result.scaSection).toContain('<span class="crs-rounded minwidth high">High</span>: 2<br/><span class="crs-rounded minwidth medium">Medium</span>: 2');
    expect(result.scaSection).not.toContain('High</span>: 4');
  });

  it('should accurately deduct approved High finding and keep remaining 1 High and 2 Medium', () => {
    const inputOneApproved = {
      backendSastSummary: { vulnerabilities: 0, breakdown: {} },
      backendScaSummary: {
        vulnerabilities: 4,
        totalPackages: 79,
        totalVulnerablePackages: 1,
        breakdown: {
          'Very High': { total: 0, findings: [] },
          'High': { total: 2, findings: [] },
          'Medium': { total: 2, findings: [] },
          'Low': { total: 0, findings: [] }
        }
      },
      aggregatedData: {
        sast: [],
        sca: [
          {
            groupId: 'g-sca-1',
            identifier: 'CVE-2026-88029',
            severity: 'High',
            status: 'approved',
            records: [{ location: 'pymongo', packageName: 'pymongo', title: 'CVE-2026-88029', severity: 'High' }],
            type: 'SCA'
          },
          {
            groupId: 'g-sca-2',
            identifier: 'CVE-2026-96749',
            severity: 'High',
            records: [{ location: 'pymongo', packageName: 'pymongo', title: 'CVE-2026-96749', severity: 'High' }],
            type: 'SCA'
          }
        ]
      },
      overview: { architectures: ['Python'], scaEcosystems: '[Python]' },
      configNoSca: [],
      scaDetails: [
        {
          packageName: 'pymongo',
          version: '4.10.1',
          safeVersion: '4.18.2',
          firstFoundDate: '2026-10-14 10:03:59 UTC',
          remediation_due_date: '2026-10-24',
          severityCounts: 'Medium: 2, High: 2',
          cveList: 'CVE-2026-88029,CVE-2026-96747,CVE-2026-96748,CVE-2026-96749'
        }
      ]
    };

    const result = generateReviewSummary(inputOneApproved as any);
    expect(result.scaSection).toContain('1 <span class="crs-rounded high">High</span> and 2 <span class="crs-rounded medium">Medium</span>');
    expect(result.scaSection).toContain('<td><strike>2026-10-24</strike></td>');
    expect(result.scaSection).toContain('<span class="crs-rounded minwidth bg-green">Approved</span>');
  });

  describe('SCA Mixed Severities & Proposal Allocation Resilience', () => {
    it('handles mixed statuses in single package: 1 Approved, 1 Rejected, 2 Unreviewed', () => {
      const inputMixedStatuses = {
        backendSastSummary: { vulnerabilities: 0, breakdown: {} },
        backendScaSummary: {
          vulnerabilities: 4,
          totalPackages: 79,
          totalVulnerablePackages: 1,
          breakdown: {
            'Very High': { total: 0, findings: [] },
            'High': { total: 2, findings: [] },
            'Medium': { total: 2, findings: [] },
            'Low': { total: 0, findings: [] }
          }
        },
        aggregatedData: {
          sast: [],
          sca: [
            {
              groupId: 'g-sca-1',
              identifier: 'CVE-2026-88029',
              severity: 'High',
              status: 'approved',
              records: [{ location: 'pymongo', packageName: 'pymongo', title: 'CVE-2026-88029', severity: 'High' }],
              type: 'SCA'
            },
            {
              groupId: 'g-sca-2',
              identifier: 'CVE-2026-96749',
              severity: 'High',
              status: 'rejected',
              records: [{ location: 'pymongo', packageName: 'pymongo', title: 'CVE-2026-96749', severity: 'High' }],
              type: 'SCA'
            }
          ]
        },
        overview: { architectures: ['Python'], scaEcosystems: '[Python]' },
        configNoSca: [],
        scaDetails: [
          {
            packageName: 'pymongo',
            version: '4.10.1',
            safeVersion: '4.18.2',
            firstFoundDate: '2026-10-14 10:03:59 UTC',
            remediation_due_date: '2026-10-24',
            severityCounts: 'Medium: 2, High: 2',
            cveList: 'CVE-2026-88029,CVE-2026-96747,CVE-2026-96748,CVE-2026-96749'
          }
        ]
      };

      const result = generateReviewSummary(inputMixedStatuses as any);
      // 1 High approved -> 1 High and 2 Medium remain unapproved (total 3)
      expect(result.scaSection).toContain('1 <span class="crs-rounded high">High</span> and 2 <span class="crs-rounded medium">Medium</span>');
      expect(result.scaSection).toContain('Vulnerabilities: 3');

      // Table should contain separate rows for Approved, Rejected, and None
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth bg-green">Approved</span>');
      expect(result.scaSection).toContain('<strike>2026-10-24</strike>');
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth bg-red">Rejected</span>');
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth bg-gold">None</span>');
      // Rejected row should have High: 1
      expect(result.scaSection).toContain('CVE-2026-96749');
      // None row should have Medium: 2
      expect(result.scaSection).toContain('CVE-2026-96747');
      expect(result.scaSection).toContain('CVE-2026-96748');
    });

    it('preserves multi-tier package severities (Very High, High, Medium, Low) with partial proposals', () => {
      const inputFourTiers = {
        backendSastSummary: { vulnerabilities: 0, breakdown: {} },
        backendScaSummary: {
          vulnerabilities: 4,
          totalPackages: 10,
          totalVulnerablePackages: 1,
          breakdown: {
            'Very High': { total: 1, findings: [] },
            'High': { total: 1, findings: [] },
            'Medium': { total: 1, findings: [] },
            'Low': { total: 1, findings: [] }
          }
        },
        aggregatedData: {
          sast: [],
          sca: [
            // Proposals exist for High and Low only
            {
              groupId: 'g-sca-high',
              identifier: 'CVE-HIGH-1',
              severity: 'High',
              records: [{ location: 'multi-pkg', packageName: 'multi-pkg', title: 'CVE-HIGH-1', severity: 'High' }],
              type: 'SCA'
            },
            {
              groupId: 'g-sca-low',
              identifier: 'CVE-LOW-1',
              severity: 'Low',
              records: [{ location: 'multi-pkg', packageName: 'multi-pkg', title: 'CVE-LOW-1', severity: 'Low' }],
              type: 'SCA'
            }
          ]
        },
        overview: { architectures: ['Python'], scaEcosystems: '[Python]' },
        configNoSca: [],
        scaDetails: [
          {
            packageName: 'multi-pkg',
            version: '1.0.0',
            remediation_due_date: '2026-12-01',
            severityCounts: 'Very High: 1, High: 1, Medium: 1, Low: 1',
            cveList: 'CVE-VH-1,CVE-HIGH-1,CVE-MED-1,CVE-LOW-1'
          }
        ]
      };

      const result = generateReviewSummary(inputFourTiers as any);
      // All 4 tiers should be preserved, not squashed into High or Medium
      expect(result.scaSection).toContain('1 <span class="crs-rounded veryhigh">Very High</span>');
      expect(result.scaSection).toContain('1 <span class="crs-rounded high">High</span>');
      expect(result.scaSection).toContain('1 <span class="crs-rounded medium">Medium</span>');
      expect(result.scaSection).toContain('1 <span class="crs-rounded low">Low</span>');

      // Table row must display all 4 tiers accurately
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth veryhigh">Very High</span>: 1');
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth high">High</span>: 1');
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth medium">Medium</span>: 1');
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth low">Low</span>: 1');
    });

    it('isolates severity allocations between multiple packages', () => {
      const inputMultiplePkgs = {
        backendSastSummary: { vulnerabilities: 0, breakdown: {} },
        backendScaSummary: {
          vulnerabilities: 6,
          totalPackages: 50,
          totalVulnerablePackages: 2,
          breakdown: {
            'High': { total: 3, findings: [] },
            'Medium': { total: 3, findings: [] }
          }
        },
        aggregatedData: {
          sast: [],
          sca: [
            // Package 1 has 2 High proposals
            {
              groupId: 'g-pkg1-1',
              identifier: 'CVE-PKG1-H1',
              severity: 'High',
              records: [{ location: 'pkg-one', packageName: 'pkg-one', title: 'CVE-PKG1-H1', severity: 'High' }],
              type: 'SCA'
            },
            {
              groupId: 'g-pkg1-2',
              identifier: 'CVE-PKG1-H2',
              severity: 'High',
              records: [{ location: 'pkg-one', packageName: 'pkg-one', title: 'CVE-PKG1-H2', severity: 'High' }],
              type: 'SCA'
            }
          ]
        },
        overview: { architectures: ['Python'], scaEcosystems: '[Python]' },
        configNoSca: [],
        scaDetails: [
          // Package 1: 2 High, 1 Medium (3 CVEs)
          {
            packageName: 'pkg-one',
            version: '2.0.0',
            remediation_due_date: '2026-11-15',
            severityCounts: 'High: 2, Medium: 1',
            cveList: 'CVE-PKG1-H1,CVE-PKG1-M1,CVE-PKG1-H2'
          },
          // Package 2: 1 High, 2 Medium (3 CVEs, no proposals)
          {
            packageName: 'pkg-two',
            version: '3.1.0',
            remediation_due_date: '2026-11-20',
            severityCounts: 'High: 1, Medium: 2',
            cveList: 'CVE-PKG2-H1,CVE-PKG2-M1,CVE-PKG2-M2'
          }
        ]
      };

      const result = generateReviewSummary(inputMultiplePkgs as any);
      // Combined total should be 3 High and 3 Medium
      expect(result.scaSection).toContain('3 <span class="crs-rounded high">High</span> and 3 <span class="crs-rounded medium">Medium</span>');
      expect(result.scaSection).toContain('Vulnerabilities: 6');
      expect(result.scaSection).toContain('Vulnerable Components: 2');
    });

    it('robustly parses space-delimited and non-standard severityCounts strings', () => {
      const inputSpaceDelimited = {
        backendSastSummary: { vulnerabilities: 0, breakdown: {} },
        backendScaSummary: {
          vulnerabilities: 4,
          totalPackages: 20,
          totalVulnerablePackages: 1,
          breakdown: {
            'High': { total: 2, findings: [] },
            'Medium': { total: 2, findings: [] }
          }
        },
        aggregatedData: {
          sast: [],
          sca: [
            {
              groupId: 'g-space-1',
              identifier: 'CVE-S1',
              severity: 'High',
              records: [{ location: 'space-pkg', packageName: 'space-pkg', title: 'CVE-S1', severity: 'High' }],
              type: 'SCA'
            }
          ]
        },
        overview: { architectures: ['Python'], scaEcosystems: '[Python]' },
        configNoSca: [],
        scaDetails: [
          {
            packageName: 'space-pkg',
            version: '1.2.3',
            remediation_due_date: '2026-11-01',
            // Space delimited without commas:
            severityCounts: 'High: 2 Medium: 2',
            cveList: 'CVE-S1,CVE-S2,CVE-S3,CVE-S4'
          }
        ]
      };

      const result = generateReviewSummary(inputSpaceDelimited as any);
      expect(result.scaSection).toContain('2 <span class="crs-rounded high">High</span> and 2 <span class="crs-rounded medium">Medium</span>');
      expect(result.scaSection).toContain('Vulnerabilities: 4');
    });

    it('correctly marks component as fully resolved when all proposals are approved', () => {
      const inputAllResolved = {
        backendSastSummary: { vulnerabilities: 0, breakdown: {} },
        backendScaSummary: {
          vulnerabilities: 2,
          totalPackages: 15,
          totalVulnerablePackages: 1,
          breakdown: {
            'High': { total: 2, findings: [] }
          }
        },
        aggregatedData: {
          sast: [],
          sca: [
            {
              groupId: 'g-all-1',
              identifier: 'CVE-A1',
              severity: 'High',
              status: 'approved',
              records: [{ location: 'resolved-pkg', packageName: 'resolved-pkg', title: 'CVE-A1', severity: 'High' }],
              type: 'SCA'
            },
            {
              groupId: 'g-all-2',
              identifier: 'CVE-A2',
              severity: 'High',
              status: 'approved',
              records: [{ location: 'resolved-pkg', packageName: 'resolved-pkg', title: 'CVE-A2', severity: 'High' }],
              type: 'SCA'
            }
          ]
        },
        overview: { architectures: ['Python'], scaEcosystems: '[Python]' },
        configNoSca: [],
        scaDetails: [
          {
            packageName: 'resolved-pkg',
            version: '5.0.0',
            remediation_due_date: '2026-10-31',
            severityCounts: 'High: 2',
            cveList: 'CVE-A1,CVE-A2'
          }
        ]
      };

      const result = generateReviewSummary(inputAllResolved as any);
      // All vulnerabilities resolved -> 0 unapproved vulnerabilities
      expect(result.scaSection).toContain('There are no identified vulnerabilities in the Software Composition Analysis of the third-party components.');
      expect(result.scaSection).toContain('Vulnerabilities: 0');
      expect(result.scaSection).toContain('Vulnerable Components: 0');
      expect(result.scaSection).toContain('heading bg-green">Third-party Components');
      expect(result.scaSection).toContain('<span class="crs-rounded minwidth bg-green">Approved</span>');
      expect(result.scaSection).not.toContain('<span class="crs-rounded minwidth bg-gold">None</span>');
    });
  });
});


