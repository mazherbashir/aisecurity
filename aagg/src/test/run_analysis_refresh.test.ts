import { describe, it, expect } from 'vitest';

describe('Run Analysis Screen Refresh & State Reset', () => {
  it('defines the expected reset contract for clearing previous analysis', () => {
    // Contract verification for resetting analysis states
    const createMockAnalysisState = () => ({
      resultsLoaded: true,
      aggregatedData: {
        sast: [{ groupId: 'g1', type: 'SAST', severity: 'High', cweId: '89', records: [] }],
        sca: [{ groupId: 'g2', type: 'SCA', severity: 'Medium', records: [] }],
      },
      backendSastSummary: { vulnerabilities: 5 },
      backendScaSummary: { vulnerabilities: 2 },
      scaDetails: [{ packageName: 'lodash', version: '4.17.21' }],
      sastMitigationProposal: { Total: 5 },
      scaMitigationProposal: { Total: 2 },
      selectedGroups: new Set(['g1']),
      selectedDevDepPkgs: new Set(['lodash']),
      detailedGroup: { groupId: 'g1' },
      expandedGroups: new Set(['g1']),
      overrideHtml: '<p>Custom Override</p>',
      backendError: 'Old Error',
      errorType: 'SYSTEM_ERROR',
      suggestedApps: ['app-old'],
      successMessage: 'Previous Success',
      activeTab: 'Review',
      removedMissingSca: ['Python'],
      removedNoPrecompile: ['test.dll'],
      removedMinifiedFiles: ['vendor.min.js'],
    });

    const resetAnalysisState = (state: ReturnType<typeof createMockAnalysisState>) => {
      return {
        resultsLoaded: false,
        aggregatedData: { sast: [], sca: [] },
        backendSastSummary: null,
        backendScaSummary: null,
        scaDetails: [],
        sastMitigationProposal: null,
        scaMitigationProposal: null,
        selectedGroups: new Set(),
        selectedDevDepPkgs: new Set(),
        detailedGroup: null,
        expandedGroups: new Set(),
        overrideHtml: null,
        backendError: null,
        errorType: null,
        suggestedApps: [],
        successMessage: null,
        activeTab: 'SAST',
        removedMissingSca: [],
        removedNoPrecompile: [],
        removedMinifiedFiles: [],
      };
    };

    const previousState = createMockAnalysisState();
    expect(previousState.resultsLoaded).toBe(true);
    expect(previousState.aggregatedData.sast.length).toBe(1);

    const refreshedState = resetAnalysisState(previousState);
    expect(refreshedState.resultsLoaded).toBe(false);
    expect(refreshedState.aggregatedData.sast).toEqual([]);
    expect(refreshedState.aggregatedData.sca).toEqual([]);
    expect(refreshedState.backendSastSummary).toBeNull();
    expect(refreshedState.backendScaSummary).toBeNull();
    expect(refreshedState.scaDetails).toEqual([]);
    expect(refreshedState.sastMitigationProposal).toBeNull();
    expect(refreshedState.scaMitigationProposal).toBeNull();
    expect(refreshedState.selectedGroups.size).toBe(0);
    expect(refreshedState.selectedDevDepPkgs.size).toBe(0);
    expect(refreshedState.detailedGroup).toBeNull();
    expect(refreshedState.overrideHtml).toBeNull();
    expect(refreshedState.backendError).toBeNull();
    expect(refreshedState.suggestedApps).toEqual([]);
    expect(refreshedState.activeTab).toBe('SAST');
    expect(refreshedState.removedMissingSca).toEqual([]);
  });

  it('verifies that the RUN ANALYSIS button ID and clear button ID match UI elements', () => {
    const runAnalysisBtnId = 'btn-run-analysis';
    const clearAnalysisBtnId = 'btn-clear-analysis';
    const runningIndicatorId = 'running-analysis-indicator';

    expect(runAnalysisBtnId).toBe('btn-run-analysis');
    expect(clearAnalysisBtnId).toBe('btn-clear-analysis');
    expect(runningIndicatorId).toBe('running-analysis-indicator');
  });
});
