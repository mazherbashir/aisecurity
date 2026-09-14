import { describe, it, expect } from 'vitest';
import { 
  SAST_JUSTIFICATION_PRESETS, 
  SCA_JUSTIFICATION_PRESETS, 
  CWE_SPECIFIC_PRESETS,
  GENERAL_SAST_PRESETS,
  normalizeCwe,
  getPresetsForCwe,
  isPresetActive, 
  toggleJustificationPreset 
} from '../data/justificationPresets';

describe('Common Justification Presets', () => {
  it('should have valid SAST presets with labels and text', () => {
    expect(SAST_JUSTIFICATION_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of SAST_JUSTIFICATION_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.category).toBe('SAST');
      expect(preset.text.length).toBeGreaterThan(20);
    }
  });

  it('should have valid SCA presets with labels and text', () => {
    expect(SCA_JUSTIFICATION_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of SCA_JUSTIFICATION_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.category).toBe('SCA');
      expect(preset.text.length).toBeGreaterThan(20);
    }
  });

  it('normalizes CWE numbers from various formats', () => {
    expect(normalizeCwe('CWE-798')).toBe('798');
    expect(normalizeCwe('cwe-89')).toBe('89');
    expect(normalizeCwe(798)).toBe('798');
    expect(normalizeCwe('CWE79')).toBe('79');
    expect(normalizeCwe('259')).toBe('259');
    expect(normalizeCwe('')).toBe('');
    expect(normalizeCwe(null)).toBe('');
    expect(normalizeCwe(undefined)).toBe('');
  });

  it('loads tailored presets specifically for CWE-798', () => {
    const result = getPresetsForCwe('CWE-798');
    expect(result.isSpecific).toBe(true);
    expect(result.normalizedCwe).toBe('798');
    expect(result.presets.length).toBeGreaterThanOrEqual(4);
    const labels = result.presets.map(p => p.label);
    expect(labels).toContain('Secret Store / Vault Migration');
    expect(labels).toContain('Environment Variable Injection');
  });

  it('loads tailored presets for other top CWEs (89, 79, 117, 259, 22, 352)', () => {
    const cwes = ['89', '79', '117', '259', '22', '352', '502'];
    for (const cwe of cwes) {
      const result = getPresetsForCwe(cwe);
      expect(result.isSpecific).toBe(true);
      expect(result.presets.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('falls back to General SAST presets for unmapped CWEs', () => {
    const result = getPresetsForCwe('CWE-9999');
    expect(result.isSpecific).toBe(false);
    expect(result.presets).toEqual(GENERAL_SAST_PRESETS);
  });

  it('supports custom catalog addition or overrides', () => {
    const customCatalog = {
      '9999': [
        {
          id: 'custom-cwe-9999',
          label: 'Custom Policy Sign-off',
          category: 'SAST' as const,
          cwe: '9999',
          text: 'Custom organizational policy mitigation approved.',
        },
      ],
    };
    const result = getPresetsForCwe('9999', customCatalog);
    expect(result.isSpecific).toBe(true);
    expect(result.presets[0].label).toBe('Custom Policy Sign-off');
  });

  it('detects if preset is active correctly', () => {
    const preset = SAST_JUSTIFICATION_PRESETS[2]; // 'Internal Network Only'
    expect(isPresetActive('', preset.text)).toBe(false);
    expect(isPresetActive('Some random comment', preset.text)).toBe(false);
    expect(isPresetActive(preset.text, preset.text)).toBe(true);
    expect(isPresetActive(`User note\n\n${preset.text}`, preset.text)).toBe(true);
  });

  it('toggles preset: adds when absent, removes when already present (no duplicates)', () => {
    const preset = SAST_JUSTIFICATION_PRESETS[2]; // 'Internal Network Only'
    
    // 1. Initial click on empty comment -> adds preset
    const step1 = toggleJustificationPreset('', preset.text);
    expect(step1).toBe(preset.text);
    expect(isPresetActive(step1, preset.text)).toBe(true);

    // 2. Second click -> removes preset
    const step2 = toggleJustificationPreset(step1, preset.text);
    expect(step2).toBe('');
    expect(isPresetActive(step2, preset.text)).toBe(false);

    // 3. Click again -> adds back
    const step3 = toggleJustificationPreset(step2, preset.text);
    expect(step3).toBe(preset.text);

    // 4. Multiple duplicates cleanup: if text already contained 3 duplicates (e.g. from prior bug)
    const tripleDuplicated = `${preset.text}\n\n${preset.text}\n\n${preset.text}`;
    const cleaned = toggleJustificationPreset(tripleDuplicated, preset.text);
    expect(cleaned).toBe('');
    expect(isPresetActive(cleaned, preset.text)).toBe(false);

    // 5. Preserves other custom user notes when removing preset
    const customWithPreset = `Custom reviewer analysis.\n\n${preset.text}\n\nAdditional follow-up.`;
    const removedPreset = toggleJustificationPreset(customWithPreset, preset.text);
    expect(removedPreset).toContain('Custom reviewer analysis.');
    expect(removedPreset).toContain('Additional follow-up.');
    expect(removedPreset).not.toContain(preset.text);
  });
});

describe('Batch Undo Logic Simulation', () => {
  it('simulates status reversal on undo action', () => {
    const originalGroups = [
      { groupId: 'sast-1', type: 'SAST', status: undefined },
      { groupId: 'sast-2', type: 'SAST', status: undefined },
    ];

    // Simulate batch approval
    const approvedGroups = originalGroups.map(g => ({ ...g, status: 'approved' as const }));
    expect(approvedGroups[0].status).toBe('approved');
    expect(approvedGroups[1].status).toBe('approved');

    // Simulate undo with revertData
    const prevStatuses = originalGroups.map(g => ({ groupId: g.groupId, status: g.status }));
    const undoneGroups = approvedGroups.map(g => {
      const match = prevStatuses.find(p => p.groupId === g.groupId);
      return match ? { ...g, status: match.status } : g;
    });

    expect(undoneGroups[0].status).toBeUndefined();
    expect(undoneGroups[1].status).toBeUndefined();
  });
});
