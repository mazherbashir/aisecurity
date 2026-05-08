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
}

export interface ScaFinding {
  type: 'SCA';
  id: string;
  cweid: string;
  title: string;
  severity: string;
  location: string;
  userComments: string[];
}

export type Finding = SastFinding | ScaFinding;

export interface AggregatedGroup {
  groupId: string;
  type: 'SAST' | 'SCA';
  cweId: string | number;
  comments: string;
  description: string;
  records: Finding[];
  severity: string;
  aiComment: string;
  status?: 'approved' | 'rejected';
}

export type ToolName = 'Veracode' | 'Checkmarx';

export type AIProvider = 'gemini' | 'azure';
