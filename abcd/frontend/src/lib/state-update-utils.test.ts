
import { describe, it, expect } from 'vitest';
import { 
  updateMitigationProposal, 
  updateBackendSummary, 
  calculateIsScanTooOld,
  createMitigationPayload
} from './state-update-utils';

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

  describe('createMitigationPayload', () => {
    it('should create Veracode payload without apiDebug when apiDebug is false or omitted', () => {
      const payload = createMitigationPayload({
        useCheckmarxApi: false,
        appId: 'APP-101',
        buildId: 'BUILD-202',
        flawIdList: '1,2,3',
        actionStr: 'accepted',
        comment: 'Valid control in place',
        type: 'SAST',
        severity: 'High',
        cveId: null,
        apiDebug: false
      });

      expect(payload).toEqual({
        buildId: 'BUILD-202',
        appId: 'APP-101',
        flawIdList: '1,2,3',
        action: 'accepted',
        comment: 'Valid control in place',
        cveId: null,
        type: 'SAST',
        severity: 'High'
      });
      expect(payload.apiDebug).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain('apiDebug');
    });

    it('should add "apiDebug": "debug" when apiDebug is true in Veracode flow', () => {
      const payload = createMitigationPayload({
        useCheckmarxApi: false,
        appId: 'APP-101',
        buildId: 'BUILD-202',
        flawIdList: '1,2,3',
        actionStr: 'accepted',
        comment: 'Valid control in place',
        type: 'SAST',
        severity: 'High',
        cveId: null,
        apiDebug: true
      });

      expect(payload.apiDebug).toBe('debug');
      expect(JSON.stringify(payload)).toContain('"apiDebug":"debug"');
      expect(payload.action).toBe('accepted');
    });

    it('should add "apiDebug": "debug" when apiDebug is true for rejection in Veracode flow', () => {
      const payload = createMitigationPayload({
        useCheckmarxApi: false,
        appId: 'APP-101',
        buildId: 'BUILD-202',
        flawIdList: '4,5',
        actionStr: 'rejected',
        comment: 'Insufficient evidence',
        type: 'SCA',
        severity: 'Critical',
        cveId: 'CVE-2023-12345',
        apiDebug: true
      });

      expect(payload.apiDebug).toBe('debug');
      expect(payload.action).toBe('rejected');
      expect(payload.cveId).toBe('CVE-2023-12345');
      expect(JSON.stringify(payload)).toContain('"apiDebug":"debug"');
    });

    it('should create Checkmarx payload with "apiDebug": "debug" when apiDebug is true', () => {
      const payload = createMitigationPayload({
        useCheckmarxApi: true,
        appId: 'APP-CX-1',
        buildId: 'SCAN-CX-99',
        flawIdList: '101,102',
        actionStr: 'accepted',
        comment: 'Sanitized input',
        type: 'SAST',
        severity: 'Medium',
        apiDebug: true
      });

      expect(payload).toEqual({
        appId: 'APP-CX-1',
        scanId: 'SCAN-CX-99',
        flawIdList: '101,102',
        action: 'accepted',
        comment: 'Sanitized input',
        type: 'SAST',
        severity: 'Medium',
        apiDebug: 'debug'
      });
      expect(JSON.stringify(payload)).toContain('"apiDebug":"debug"');
    });

    it('should NOT include apiDebug in Checkmarx payload when apiDebug is false', () => {
      const payload = createMitigationPayload({
        useCheckmarxApi: true,
        appId: 'APP-CX-1',
        buildId: 'SCAN-CX-99',
        flawIdList: '101,102',
        actionStr: 'rejected',
        comment: 'Issue still present',
        type: 'SAST',
        severity: 'Medium',
        apiDebug: false
      });

      expect(payload.apiDebug).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain('apiDebug');
    });
  });
});
