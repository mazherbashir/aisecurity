export interface JustificationPreset {
  id: string;
  label: string;
  category: 'SAST' | 'SCA' | 'GENERAL';
  cwe?: string;
  text: string;
}

export type CwePresetCatalog = Record<string, JustificationPreset[]>;

/**
 * Normalizes a CWE identifier to a numeric string (e.g. "CWE-798" -> "798", 798 -> "798").
 */
export function normalizeCwe(cweId: string | number | undefined | null): string {
  if (!cweId) return '';
  const str = String(cweId).trim();
  const digits = str.replace(/^CWE-?/i, '').trim();
  return digits;
}

/**
 * Enterprise approval defaults organized specifically per CWE.
 */
export const CWE_SPECIFIC_PRESETS: CwePresetCatalog = {
  '798': [
    {
      id: 'cwe798-vault',
      label: 'Secret Store / Vault Migration',
      category: 'SAST',
      cwe: '798',
      text: 'All credentials and sensitive keys have been migrated to the enterprise secrets manager (Vault / AWS Secrets Manager). The hard-coded reference is a dummy identifier used only in local testing.',
    },
    {
      id: 'cwe798-config-mapping',
      label: 'Non-sensitive Schema Mapping',
      category: 'SAST',
      cwe: '798',
      text: 'Verified that this property is a table/column mapping constant or public client identifier that contains no real authentication credentials or sensitive secrets.',
    },
    {
      id: 'cwe798-env-injection',
      label: 'Environment Variable Injection',
      category: 'SAST',
      cwe: '798',
      text: 'Secrets are dynamically injected at runtime via environment variables in isolated container instances, not stored in source files.',
    },
    {
      id: 'cwe798-internal-vpc',
      label: 'Compensating VPC Isolation',
      category: 'SAST',
      cwe: '798',
      text: 'Target service is strictly isolated within internal VPC/private subnet with no public ingress paths.',
    },
  ],
  '259': [
    {
      id: 'cwe259-vault',
      label: 'Key Vault Storage',
      category: 'SAST',
      cwe: '259',
      text: 'Credentials and passwords are retrieved at runtime from an encrypted key management store and not stored in plaintext.',
    },
    {
      id: 'cwe259-test-mock',
      label: 'Test Mock Only',
      category: 'SAST',
      cwe: '259',
      text: 'Mock password literal is limited exclusively to unit test fixtures and cannot authenticate against staging or production systems.',
    },
    {
      id: 'cwe259-non-credential',
      label: 'Non-Credential Identifier',
      category: 'SAST',
      cwe: '259',
      text: 'Verified this value is an internal dictionary key/hash seed and not a user or administrative password.',
    },
  ],
  '89': [
    {
      id: 'cwe89-orm',
      label: 'Parameterized Query / ORM Binding',
      category: 'SAST',
      cwe: '89',
      text: 'All queries use parameterized statements and ORM criteria binding with strict typing, preventing arbitrary SQL execution.',
    },
    {
      id: 'cwe89-whitelist',
      label: 'Strict Whitelist Validation',
      category: 'SAST',
      cwe: '89',
      text: 'Dynamic sort and column parameters are strictly validated against a hardcoded enum whitelist of allowed database attributes.',
    },
    {
      id: 'cwe89-stored-proc',
      label: 'Stored Procedure / Least Privilege',
      category: 'SAST',
      cwe: '89',
      text: 'Execution is delegated to stored procedures running under a restricted read-only database service account with zero DDL permissions.',
    },
  ],
  '79': [
    {
      id: 'cwe79-escaping',
      label: 'Contextual Output Escaping',
      category: 'SAST',
      cwe: '79',
      text: 'Rendered through UI framework contextual auto-escaping which encodes dynamic content before browser DOM insertion.',
    },
    {
      id: 'cwe79-dompurify',
      label: 'Sanitization with DOMPurify',
      category: 'SAST',
      cwe: '79',
      text: 'User-supplied markup is sanitized through DOMPurify with strict HTML tag and attribute allowlists.',
    },
    {
      id: 'cwe79-csp',
      label: 'Strict CSP Header',
      category: 'SAST',
      cwe: '79',
      text: 'Enforced Content Security Policy (CSP) with nonce-based script-src prevents execution of unauthorized injected script tags.',
    },
  ],
  '117': [
    {
      id: 'cwe117-crlf',
      label: 'Log CRLF Sanitization',
      category: 'SAST',
      cwe: '117',
      text: 'User-supplied arguments are sanitized to remove carriage return (\\r) and newline (\\n) characters prior to logging.',
    },
    {
      id: 'cwe117-json',
      label: 'Structured JSON Logging',
      category: 'SAST',
      cwe: '117',
      text: 'Logging output is formatted as structured JSON, neutralizing line-splitting and fraudulent log entry injection.',
    },
    {
      id: 'cwe117-siem',
      label: 'Immutable SIEM Ingestion',
      category: 'SAST',
      cwe: '117',
      text: 'Logs are forwarded directly to a secure, tamper-evident central SIEM audit collector with cryptographic integrity checks.',
    },
  ],
  '200': [
    {
      id: 'cwe200-generic-err',
      label: 'Generic Error Messaging',
      category: 'SAST',
      cwe: '200',
      text: 'Application intercepts exceptions and returns generic error codes. Diagnostic details are logged internally with no client exposure.',
    },
    {
      id: 'cwe200-scrubbing',
      label: 'PII & Credential Scrubbing',
      category: 'SAST',
      cwe: '200',
      text: 'Data payload is filtered through a field masking filter to redact sensitive user data and internal hostnames.',
    },
  ],
  '201': [
    {
      id: 'cwe201-sanitized-payload',
      label: 'Sanitized Output DTO',
      category: 'SAST',
      cwe: '201',
      text: 'Outgoing network response is mapped to an explicit Data Transfer Object (DTO) that excludes sensitive domain attributes.',
    },
    {
      id: 'cwe201-internal-tls',
      label: 'Mutual TLS Internal Channel',
      category: 'SAST',
      cwe: '201',
      text: 'Data transmission is strictly confined to internal microservices over mutual TLS (mTLS) with authenticated peer verification.',
    },
  ],
  '209': [
    {
      id: 'cwe209-masked-exception',
      label: 'Custom Error Boundary',
      category: 'SAST',
      cwe: '209',
      text: 'Production builds use customized global exception handlers that return opaque correlation IDs without internal stack traces.',
    },
    {
      id: 'cwe209-dev-mode-disabled',
      label: 'Debug Mode Inactive in Prod',
      category: 'SAST',
      cwe: '209',
      text: 'Verbose stack trace emission is compiled out and strictly disabled in production runtime configurations.',
    },
  ],
  '22': [
    {
      id: 'cwe22-canonical',
      label: 'Canonical Path Whitelist',
      category: 'SAST',
      cwe: '22',
      text: 'File paths are normalized using canonical path resolution and validated to ensure they remain inside the approved base directory.',
    },
    {
      id: 'cwe22-indirect-id',
      label: 'Indirect Object Identifier',
      category: 'SAST',
      cwe: '22',
      text: 'Files are accessed through opaque database UUIDs rather than direct filesystem paths supplied by the client.',
    },
  ],
  '352': [
    {
      id: 'cwe352-anti-csrf',
      label: 'Anti-CSRF Synchronizer Token',
      category: 'SAST',
      cwe: '352',
      text: 'All state-changing POST/PUT/DELETE requests validate a cryptographically secure synchronized CSRF token.',
    },
    {
      id: 'cwe352-samesite',
      label: 'SameSite Strict Cookie Policy',
      category: 'SAST',
      cwe: '352',
      text: 'Session cookies are protected by SameSite=Strict and Secure flags, preventing cross-site transmission.',
    },
  ],
  '502': [
    {
      id: 'cwe502-safe-json',
      label: 'Safe Serialization (JSON/Zod)',
      category: 'SAST',
      cwe: '502',
      text: 'Replaced native binary object serialization with schema-validated JSON data structures.',
    },
    {
      id: 'cwe502-class-filter',
      label: 'Deserialization Class Allowlist',
      category: 'SAST',
      cwe: '502',
      text: 'Configured strict lookahead class allowlisting to reject unauthorized object graphs during deserialization.',
    },
  ],
  '327': [
    {
      id: 'cwe327-non-crypto',
      label: 'Non-Security Hash Usage',
      category: 'SAST',
      cwe: '327',
      text: 'The cryptographic algorithm (e.g. MD5/SHA-1) is used exclusively for non-security cache key deduplication and checksum indexing.',
    },
    {
      id: 'cwe327-fips-cipher',
      label: 'FIPS-Compliant Cipher Suite',
      category: 'SAST',
      cwe: '327',
      text: 'Upgraded to AES-256-GCM and SHA-256 in adherence with organizational cryptography standards.',
    },
  ],
  '1333': [
    {
      id: 'cwe1333-timeout',
      label: 'Regex Timeout & Bounded Length',
      category: 'SAST',
      cwe: '1333',
      text: 'Configured execution timeouts on regular expression evaluations and enforced maximum input string length boundaries.',
    },
    {
      id: 'cwe1333-rate-limit',
      label: 'Rate Limiting & Queue Limits',
      category: 'SAST',
      cwe: '1333',
      text: 'Per-client rate limiting and concurrency throttling prevent regular expression resource exhaustion.',
    },
  ],
};

/**
 * Standard General SAST Presets available for any SAST flaw.
 */
export const GENERAL_SAST_PRESETS: JustificationPreset[] = [
  {
    id: 'sast-internal-vpc',
    label: 'Internal VPC Isolation',
    category: 'GENERAL',
    text: 'Target service is strictly isolated within internal VPC/private subnet with no public ingress paths.',
  },
  {
    id: 'sast-waf-rule',
    label: 'Compensating WAF Rule',
    category: 'GENERAL',
    text: 'Compensating perimeter WAF inspect-and-block rule set actively inspects payloads and prevents exploitation.',
  },
  {
    id: 'sast-security-review',
    label: 'Verified by Security Architect',
    category: 'GENERAL',
    text: 'Technical review completed with Security Architecture lead; risk acknowledged with compensating controls.',
  },
  {
    id: 'sast-internal-admin',
    label: 'Internal Administrative Tool',
    category: 'GENERAL',
    text: 'Access is restricted to authenticated internal operators on private management subnets with multi-factor authentication.',
  },
];

export const SAST_JUSTIFICATION_PRESETS: JustificationPreset[] = [
  {
    id: 'sast-orm',
    label: 'Parameterized / ORM',
    category: 'SAST',
    text: 'Parameterized queries and ORM object binding enforce strict typing and prevent untrusted input interpretation.',
  },
  {
    id: 'sast-sanitized',
    label: 'Input Sanitized & Encoded',
    category: 'SAST',
    text: 'Strict whitelist regex validation and context-aware output encoding are enforced at boundary controllers.',
  },
  {
    id: 'sast-internal',
    label: 'Internal Network Only',
    category: 'SAST',
    text: 'Target service is strictly isolated within internal VPC/private subnet with no public ingress paths.',
  },
  {
    id: 'sast-waf',
    label: 'Compensating WAF Rule',
    category: 'SAST',
    text: 'Compensating perimeter WAF inspect-and-block rule set actively inspects payloads and prevents exploitation.',
  },
];

export const SCA_JUSTIFICATION_PRESETS: JustificationPreset[] = [
  {
    id: 'sca-dev-test',
    label: 'Dev/Test Only',
    category: 'SCA',
    text: 'Development/testing dependency only; excluded from production deployment artifacts and runtime containers.',
  },
  {
    id: 'sca-unreachable',
    label: 'Unreachable Vector',
    category: 'SCA',
    text: 'Vulnerable method is not invoked by application execution paths; reachability analysis confirms zero exposure.',
  },
  {
    id: 'sca-internal',
    label: 'Internal Boundary',
    category: 'SCA',
    text: 'Internal utility package with no untrusted network ingestion or public-facing exposure points.',
  },
  {
    id: 'sca-scheduled',
    label: 'Scheduled Next Sprint',
    category: 'SCA',
    text: 'Package version upgrade has been validated and queued for promotion in the upcoming scheduled sprint release.',
  },
  {
    id: 'sca-runtime-protection',
    label: 'Compensating Runtime Control',
    category: 'SCA',
    text: 'Runtime application self-protection (RASP) and perimeter WAF rules are active to mitigate known exploit vectors.',
  },
];

/**
 * Returns presets specifically matching the provided CWE, or falls back to general SAST presets.
 */
export function getPresetsForCwe(
  cweId: string | number | undefined | null,
  customCatalog?: CwePresetCatalog
): { presets: JustificationPreset[]; isSpecific: boolean; normalizedCwe: string } {
  const norm = normalizeCwe(cweId);
  const catalog = customCatalog || CWE_SPECIFIC_PRESETS;
  
  if (norm && catalog[norm] && catalog[norm].length > 0) {
    return {
      presets: catalog[norm],
      isSpecific: true,
      normalizedCwe: norm,
    };
  }

  return {
    presets: GENERAL_SAST_PRESETS,
    isSpecific: false,
    normalizedCwe: norm,
  };
}

/**
 * Checks if a justification preset text is currently present in the comment.
 */
export function isPresetActive(currentText: string | undefined | null, presetText: string): boolean {
  if (!currentText || !presetText) return false;
  return currentText.includes(presetText.trim());
}

/**
 * Toggles a preset in the given comment text:
 * - If present, removes all instances and normalizes line breaks.
 * - If not present, appends it with clean paragraph spacing.
 */
export function toggleJustificationPreset(currentText: string | undefined | null, presetText: string): string {
  const text = (currentText || "").trim();
  const target = presetText.trim();
  if (!target) return text;

  if (text.includes(target)) {
    // Remove all instances of the preset cleanly
    const parts = text.split(target);
    return parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n\n");
  } else {
    // Append preset cleanly
    if (!text) return target;
    return `${text}\n\n${target}`;
  }
}


