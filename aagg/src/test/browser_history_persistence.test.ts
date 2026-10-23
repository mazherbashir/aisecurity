import { describe, it, expect, beforeEach } from 'vitest';
import { safeStorage } from '../lib/storage';

describe('Browser Memory History Persistence (Multi-User Production)', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('initializes Veracode and Checkmarx history with defaults only when empty', () => {
    const defaultVeracode = [
      'App_01.json', 'App_02.json', 'App_03.json', 'App_04.json', 'App_05.json',
      'App_06.json', 'App_07.json', 'App_08.json', 'App_09.json', 'App_10.json',
      'App_11.json', // 11th should be capped to 10
    ];
    const defaultCheckmarx = ['CM_01.json', 'CM_02.json'];

    const veracodeInit = safeStorage.initHistoryIfEmpty('Veracode', defaultVeracode);
    expect(veracodeInit.length).toBe(10);
    expect(veracodeInit[0]).toBe('App_01.json');
    expect(veracodeInit).not.toContain('App_11.json');

    const checkmarxInit = safeStorage.initHistoryIfEmpty('Checkmarx', defaultCheckmarx);
    expect(checkmarxInit).toEqual(['CM_01.json', 'CM_02.json']);

    // Second call with different items should NOT overwrite existing browser memory
    const secondCall = safeStorage.initHistoryIfEmpty('Veracode', ['BrandNewApp.json']);
    expect(secondCall).toEqual(veracodeInit);
    expect(secondCall).not.toContain('BrandNewApp.json');
  });

  it('prepends newly pulled profiles to browser memory and caps at last 10 entries', () => {
    const initialList = [
      'App_01.json', 'App_02.json', 'App_03.json', 'App_04.json', 'App_05.json',
      'App_06.json', 'App_07.json', 'App_08.json', 'App_09.json', 'App_10.json'
    ];
    safeStorage.initHistoryIfEmpty('Veracode', initialList);

    // Pull a brand new profile
    const updated = safeStorage.saveProfileToHistory('Veracode', 'NewlyPulledApp.json');
    expect(updated.length).toBe(10);
    expect(updated[0]).toBe('NewlyPulledApp.json');
    expect(updated[1]).toBe('App_01.json');
    // The oldest entry (App_10.json) should have been dropped
    expect(updated).not.toContain('App_10.json');

    // Confirm it persisted in localStorage
    const fromStorage = safeStorage.getHistory('Veracode');
    expect(fromStorage).toEqual(updated);
  });

  it('deduplicates when re-pulling an existing profile and moves it to top', () => {
    const initialList = ['App_A.json', 'App_B.json', 'App_C.json'];
    safeStorage.initHistoryIfEmpty('Veracode', initialList);

    // Re-pull App_C.json
    const updated = safeStorage.saveProfileToHistory('Veracode', 'App_C.json');
    expect(updated).toEqual(['App_C.json', 'App_A.json', 'App_B.json']);
    expect(updated.filter(x => x === 'App_C.json').length).toBe(1);
  });

  it('maintains distinct isolated histories for Veracode and Checkmarx', () => {
    safeStorage.saveProfileToHistory('Veracode', 'Veracode_App1.json');
    safeStorage.saveProfileToHistory('Checkmarx', 'Checkmarx_Scan1.json');

    expect(safeStorage.getHistory('Veracode')).toEqual(['Veracode_App1.json']);
    expect(safeStorage.getHistory('Checkmarx')).toEqual(['Checkmarx_Scan1.json']);
  });

  it('simulates production multi-user safety: backend info does not overwrite browser memory', () => {
    // User pulls their personal profile on their browser
    safeStorage.saveProfileToHistory('Veracode', 'MyCompany_Custom_Profile.json');

    // Backend /api/config/info sends server-wide default/static history array
    const backendConfigInfoData = {
      history: [
        'Global_Corporate_01.json',
        'Global_Corporate_02.json'
      ],
      'history-checkmarx': [
        'Backend_Global_CM.json'
      ]
    };

    // Client-side simulation of fetchConfigInfo logic:
    // Only seed if browser memory has no history saved
    const userStoredVeracode = safeStorage.getHistory('Veracode');
    if (userStoredVeracode.length === 0 && Array.isArray(backendConfigInfoData.history)) {
      safeStorage.setItem('veracode_history', backendConfigInfoData.history.slice(0, 10));
    }

    // Verify user's browser memory remained intact
    expect(safeStorage.getHistory('Veracode')).toEqual(['MyCompany_Custom_Profile.json']);
    expect(safeStorage.getHistory('Veracode')).not.toContain('Global_Corporate_01.json');
  });

  it('automatically stores raw profile names as JSON filenames ending with .json', () => {
    // When saving a raw profile name without .json
    const updated = safeStorage.saveProfileToHistory('Veracode', 'GBL-IFS-DevEx-CSP');
    expect(updated[0]).toBe('GBL-IFS-DevEx-CSP.json');
    expect(updated).not.toContain('GBL-IFS-DevEx-CSP');

    // Confirm getHistory returns it with .json
    const history = safeStorage.getHistory('Veracode');
    expect(history[0]).toBe('GBL-IFS-DevEx-CSP.json');

    // Deduplicates case-insensitively when re-saving with or without .json
    const reSaved = safeStorage.saveProfileToHistory('Veracode', 'GBL-IFS-DevEx-CSP.json');
    expect(reSaved.length).toBe(1);
    expect(reSaved[0]).toBe('GBL-IFS-DevEx-CSP.json');
  });

  it('normalizes legacy items in storage without .json to .json extension on retrieval', () => {
    // Manually simulate legacy storage having items without .json
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('veracode_history', JSON.stringify(['OldProfileWithoutExt', 'Existing.json']));
    }

    const history = safeStorage.getHistory('Veracode');
    expect(history).toEqual(['OldProfileWithoutExt.json', 'Existing.json']);
  });

  describe('Backend jsonFileName Tag Integration & Anti-Fabrication Logic', () => {
    it('extracts backend true jsonFileName tag from payload root', () => {
      const payload = {
        jsonFileName: 'GBR_ASR_Proteus_01.json',
        overview: {
          applicationName: 'Proteus (Legacy Production)',
          scanType: 'veracode',
        },
      };

      const extracted = safeStorage.extractJsonFileName(payload);
      expect(extracted).toBe('GBR_ASR_Proteus_01.json');
    });

    it('extracts backend true jsonFileName tag nested inside overview', () => {
      const payload = {
        overview: {
          jsonFileName: 'GBR_ASR_Proteus_01.json',
          applicationName: 'Proteus Core',
        },
      };

      const extracted = safeStorage.extractJsonFileName(payload);
      expect(extracted).toBe('GBR_ASR_Proteus_01.json');
    });

    it('extracts backend true jsonFileName tag from aliases (savedJsonName, historyFileName, filename)', () => {
      expect(safeStorage.extractJsonFileName({ savedJsonName: 'App_Backup_01.json' })).toBe('App_Backup_01.json');
      expect(safeStorage.extractJsonFileName({ historyFileName: 'History_Record.json' })).toBe('History_Record.json');
      expect(safeStorage.extractJsonFileName({ filename: 'Scan_Export.json' })).toBe('Scan_Export.json');
      expect(safeStorage.extractJsonFileName({ fileName: 'Raw_File.json' })).toBe('Raw_File.json');
    });

    it('does NOT fabricate a .json filename when jsonFileName tag is absent', () => {
      const payloadWithoutTag = {
        overview: {
          applicationName: 'GBL-IFS-DevEx-CSP',
          scanType: 'veracode',
        },
      };

      const extracted = safeStorage.extractJsonFileName(payloadWithoutTag);
      expect(extracted).toBeNull();
    });

    it('saves payload with jsonFileName tag to browser memory history without fabricating names', () => {
      const payload = {
        jsonFileName: 'GBR_ASR_Proteus_01.json',
        overview: {
          applicationName: 'Proteus (Replacing Map)',
        },
      };

      const result = safeStorage.savePayloadToHistory('Veracode', payload);
      expect(result.savedFileName).toBe('GBR_ASR_Proteus_01.json');
      expect(result.history[0]).toBe('GBR_ASR_Proteus_01.json');

      const storedHistory = safeStorage.getHistory('Veracode');
      expect(storedHistory).toContain('GBR_ASR_Proteus_01.json');
      // Crucial: ensure client-side fabricated names from applicationName are NOT stored
      expect(storedHistory).not.toContain('Proteus (Replacing Map).json');
    });

    it('handles discrepancy between applicationName and backend file name logic', () => {
      // Backend uses clean alphanumeric underscore IDs, while applicationName has spaces and special characters
      const backendPayload = {
        jsonFileName: 'GBL-TAX-Sightline_Global_Documents.json',
        overview: {
          applicationName: 'GBL-TAX-Sightline_Global - Documents',
        },
      };

      const result = safeStorage.savePayloadToHistory('Veracode', backendPayload);
      expect(result.savedFileName).toBe('GBL-TAX-Sightline_Global_Documents.json');

      const history = safeStorage.getHistory('Veracode');
      expect(history[0]).toBe('GBL-TAX-Sightline_Global_Documents.json');
      // Never store the UI-synthesized name
      expect(history).not.toContain('GBL-TAX-Sightline_Global - Documents.json');
    });

    it('saveJsonFileToHistory only accepts valid .json filenames and ignores raw inputs', () => {
      safeStorage.saveJsonFileToHistory('Veracode', 'ValidFile.json');
      expect(safeStorage.getHistory('Veracode')).toEqual(['ValidFile.json']);

      // Attempting to save a non-json string is rejected
      safeStorage.saveJsonFileToHistory('Veracode', 'RawAppNameWithoutExt');
      expect(safeStorage.getHistory('Veracode')).toEqual(['ValidFile.json']);
    });
  });
});
