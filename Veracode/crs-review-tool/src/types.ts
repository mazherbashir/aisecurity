export interface Mitigation {
  technique?: string;
  specifics?: string;
  remaining_risk?: string;
  verification?: string;
  date?: string;
  description?: string;
}

export interface SastFinding {
  type: 'SAST';
  id: string;
  cweid: string;
  title: string;
  severity: string;
  location: string;
  userComments: string[];
  fileName?: string;
  description?: string;
}

export interface ScaFinding {
  type: 'SCA';
  id: string;
  cweid: string;
  title: string;
  severity: string;
  location: string;
  userComments: string[];
  fileName?: string;
  cve_summary?: string;
}

export type Finding = SastFinding | ScaFinding;

export interface AIMetrics {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AggregatedGroup {
  groupId: string;
  type: 'SAST' | 'SCA';
  cweId: string | number;
  identifier?: string;
  comments: string;
  description: string;
  records: Finding[];
  severity: string;
  aiComment: string;
  aiMetrics?: AIMetrics;
  status?: 'approved' | 'rejected';
}

export type ToolName = 'Veracode' | 'Checkmarx';

export type AIProvider = string;
