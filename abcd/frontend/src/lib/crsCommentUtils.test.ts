import { describe, it, expect } from 'vitest';
import { formatPromptWithCrsComments, CRS_REVIEW_TEMPLATES } from './crsCommentUtils';

describe('formatPromptWithCrsComments', () => {
  it('returns customer comments when no CRS comments are present', () => {
    expect(formatPromptWithCrsComments('Input is parameterized', '')).toBe('Input is parameterized');
    expect(formatPromptWithCrsComments('Input is parameterized', null)).toBe('Input is parameterized');
    expect(formatPromptWithCrsComments('Input is parameterized', undefined)).toBe('Input is parameterized');
  });

  it('formats prompt as CRS team comments: "comments" when customer comments are empty', () => {
    const crs = 'Verified PreparedStatement on line 42 of AuthDAO.java';
    const result = formatPromptWithCrsComments('', crs);
    expect(result).toBe(`CRS team comments: "${crs}"`);
  });

  it('combines customer comments and CRS comments at the bottom', () => {
    const customer = 'Used internal API with validation.';
    const crs = 'Checked code in UserEndpoint.ts:\nconst safe = sanitize(req.body);\nreturn safe;';
    const result = formatPromptWithCrsComments(customer, crs);
    expect(result).toBe(`${customer}\n\nCRS team comments: "${crs}"`);
  });

  it('handles multiline code snippets within CRS comments', () => {
    const customer = 'Database queries are safe.';
    const codeSnippet = `const query = sql\`SELECT * FROM users WHERE id = \${userId}\`;`;
    const result = formatPromptWithCrsComments(customer, codeSnippet);
    expect(result).toContain('Database queries are safe.');
    expect(result).toContain(`CRS team comments: "${codeSnippet}"`);
  });

  it('trims excess whitespace around both inputs', () => {
    const customer = '  Trimmed customer comment   ';
    const crs = '   Trimmed CRS comment   ';
    const result = formatPromptWithCrsComments(customer, crs);
    expect(result).toBe(`Trimmed customer comment\n\nCRS team comments: "Trimmed CRS comment"`);
  });

  it('provides default templates with valid structure', () => {
    expect(CRS_REVIEW_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of CRS_REVIEW_TEMPLATES) {
      expect(t.id).toBeDefined();
      expect(t.label).toBeDefined();
      expect(t.text).toBeDefined();
    }
  });
});
