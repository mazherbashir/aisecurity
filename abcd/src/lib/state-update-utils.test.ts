
import { describe, it, expect } from 'vitest';
import { updateMitigationProposal, updateBackendSummary, calculateIsScanTooOld } from './state-update-utils';

describe('state-update-utils', () => {
  describe('updateMitigationProposal', () => {
    it('should correctly decrease counts for approved finding', () => {
      const prev = { 'High': 10, 'Medium': 5, 'Total': 15 };
      const group = { severity: 'High', records: [{}, {}], comments: 'Some proposal comment' }; // 2 records
      const result = updateMitigationProposal(prev, group);
      expect(result['High']).toBe(8);
      expect(result['Total']).toBe(13);
    });

    it('should handle normalization of VeryHigh to Very High', () => {
      const prev = { 'Very High': 10, 'Total': 10 };
      const group = { severity: 'VeryHigh', records: [{}], comments: 'Some proposal comment' };
      const result = updateMitigationProposal(prev, group);
      expect(result['Very High']).toBe(9);
    });

    it('should not decrease below zero', () => {
      const prev = { 'High': 1, 'Total': 1 };
      const group = { severity: 'High', records: [{}, {}], comments: 'Some proposal comment' };
      const result = updateMitigationProposal(prev, group);
      expect(result['High']).toBe(0);
      expect(result['Total']).toBe(0);
    });

    it('should NOT decrease counts if the group has no comments (i.e. not a proposal)', () => {
      const prev = { 'High': 10, 'Total': 10 };
      const group = { severity: 'High', records: [{}, {}] }; // no comments
      const result = updateMitigationProposal(prev, group);
      expect(result['High']).toBe(10);
      expect(result['Total']).toBe(10);
    });
  });

  describe('updateBackendSummary', () => {
    it('should decrease breakdown total and overall vulnerabilities', () => {
      const prev = {
        vulnerabilities: 10,
        breakdown: {
          'High': { total: 5, findings: [] },
          'Low': { total: 5, findings: [] }
        }
      };
      const group = { severity: 'High', records: [{}, {}] };
      const result = updateBackendSummary(prev, group);
      expect(result.vulnerabilities).toBe(8);
      expect(result.breakdown['High'].total).toBe(3);
      expect(result.breakdown['Low'].total).toBe(5);
    });
  });

  describe('calculateIsScanTooOld', () => {
    it('should return true if scan is older than validity days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
      expect(calculateIsScanTooOld(oldDate.toISOString(), 5)).toBe(true);
    });

    it('should return false if scan is within validity days', () => {
      const freshDate = new Date();
      freshDate.setDate(freshDate.getDate() - 2); // 2 days ago
      expect(calculateIsScanTooOld(freshDate.toISOString(), 5)).toBe(false);
    });

    it('should return false if no scan date provided', () => {
      expect(calculateIsScanTooOld(undefined, 5)).toBe(false);
    });
  });
});
