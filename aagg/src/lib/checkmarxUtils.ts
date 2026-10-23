/**
 * Checkmarx URL and Profile utilities.
 * Handles encoding of branch names containing '/' characters so URLs never break.
 */

/**
 * Safely encodes a branch name for Checkmarx AST URLs.
 * When there is a '/' sign in the branch name, it encodes it as '%2F'
 * (e.g. "feature/auth" -> "feature%2Fauth", "bugfix/CRS/123" -> "bugfix%2FCRS%2F123")
 * so that URLs never break. Avoids double-encoding if already encoded as '%2F'.
 */
export function encodeCheckmarxBranch(branch: string | undefined | null): string {
  if (!branch) return "";
  let str = String(branch).trim();
  try {
    str = decodeURIComponent(str);
  } catch {
    // If malformed URI sequence, keep raw string
  }
  return encodeURIComponent(str);
}

/**
 * Builds a Checkmarx AST project overview URL with properly encoded branch parameter.
 * Example:
 * buildCheckmarxProfileUrl("app-123", "feature/login")
 * -> "https://us.ast.checkmarx.net/projects/app-123/overview?branch=feature%2Flogin"
 */
export function buildCheckmarxProfileUrl(
  appId: string | undefined | null,
  branchOrScanName: string | undefined | null
): string {
  const safeAppId = (appId || "---").trim();
  const encodedBranch = encodeCheckmarxBranch(branchOrScanName);
  return `https://us.ast.checkmarx.net/projects/${safeAppId}/overview?branch=${encodedBranch}`;
}

/**
 * Ensures any existing Checkmarx viewerLink / URL encodes slashes in the ?branch= parameter.
 */
export function sanitizeCheckmarxUrl(url: string | undefined | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  return trimmed.replace(/([?&]branch=)([^&#]+)/g, (_match, prefix, val) => {
    return prefix + encodeCheckmarxBranch(val);
  });
}
