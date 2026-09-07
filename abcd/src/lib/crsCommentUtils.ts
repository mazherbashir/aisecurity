/**
 * Formats the final prompt sent to AI for vulnerability analysis.
 * Combines customer mitigation comments with CRS team code review analysis and snippets.
 *
 * Pattern requested:
 * `<customer comments>\n\nCRS team comments: "<crs comments>"`
 */
export function formatPromptWithCrsComments(
  customerComments?: string | null,
  crsComments?: string | null
): string {
  const cleanCustomer = (customerComments || "").trim();
  const cleanCrs = (crsComments || "").trim();

  if (!cleanCrs) {
    return cleanCustomer;
  }

  // Format as requested: CRS team comments: "comments"
  const crsBlock = `CRS team comments: "${cleanCrs}"`;

  if (!cleanCustomer) {
    return crsBlock;
  }

  return `${cleanCustomer}\n\n${crsBlock}`;
}

/**
 * Quick templates for CRS team reviewers when documenting code inspection
 */
export interface CrsReviewTemplate {
  id: string;
  label: string;
  text: string;
}

export const CRS_REVIEW_TEMPLATES: CrsReviewTemplate[] = [
  {
    id: 'code-inspection',
    label: 'Code Inspection',
    text: `// Code Review Analysis:\nFile: [file_path.java:line_no]\nInspected code:\n[insert verified code snippet]\nAnalysis: Validated that defensive controls prevent vulnerability exploitation.`,
  },
  {
    id: 'boundary-check',
    label: 'Internal Boundary',
    text: `// Security Review:\nEndpoint is restricted to internal VPC microservices with mutual TLS.\nNo external ingress or public untrusted input exposure.`,
  },
  {
    id: 'compensating-control',
    label: 'Compensating Control',
    text: `// Compensating Control:\nValidated active WAF rule and perimeter ingress sanitization.\nStrict allowlist validation applied prior to execution.`,
  }
];
