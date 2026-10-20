import { describe, it, expect } from "vitest";
import {
  encodeCheckmarxBranch,
  buildCheckmarxProfileUrl,
  sanitizeCheckmarxUrl,
} from "./checkmarxUtils";

describe("Checkmarx Branch URL Encoding Utilities", () => {
  describe("encodeCheckmarxBranch", () => {
    it("encodes forward slashes as %2F in branch names", () => {
      expect(encodeCheckmarxBranch("feature/user-login")).toBe("feature%2Fuser-login");
      expect(encodeCheckmarxBranch("bugfix/CRS/SCTASK-12345")).toBe("bugfix%2FCRS%2FSCTASK-12345");
      expect(encodeCheckmarxBranch("release/2026.1/hotfix-1")).toBe("release%2F2026.1%2Fhotfix-1");
    });

    it("handles branches without slashes", () => {
      expect(encodeCheckmarxBranch("main")).toBe("main");
      expect(encodeCheckmarxBranch("master")).toBe("master");
      expect(encodeCheckmarxBranch("develop")).toBe("develop");
    });

    it("does not double-encode if %2F is already present", () => {
      expect(encodeCheckmarxBranch("feature%2Fuser-login")).toBe("feature%2Fuser-login");
      expect(encodeCheckmarxBranch("bugfix%2FCRS%2F123")).toBe("bugfix%2FCRS%2F123");
    });

    it("handles empty or nullish branch names", () => {
      expect(encodeCheckmarxBranch("")).toBe("");
      expect(encodeCheckmarxBranch(null)).toBe("");
      expect(encodeCheckmarxBranch(undefined)).toBe("");
    });

    it("encodes special characters and spaces correctly", () => {
      expect(encodeCheckmarxBranch("feature/user login")).toBe("feature%2Fuser%20login");
    });
  });

  describe("buildCheckmarxProfileUrl", () => {
    it("constructs full Checkmarx AST URL with encoded branch containing slashes", () => {
      const url = buildCheckmarxProfileUrl("proj-456", "feature/auth-service");
      expect(url).toBe("https://us.ast.checkmarx.net/projects/proj-456/overview?branch=feature%2Fauth-service");
      expect(url).not.toContain("?branch=feature/auth-service");
    });

    it("constructs full Checkmarx AST URL for main branch", () => {
      const url = buildCheckmarxProfileUrl("proj-789", "main");
      expect(url).toBe("https://us.ast.checkmarx.net/projects/proj-789/overview?branch=main");
    });

    it("handles fallback defaults gracefully", () => {
      const url = buildCheckmarxProfileUrl("", "");
      expect(url).toBe("https://us.ast.checkmarx.net/projects/---/overview?branch=");
    });
  });

  describe("sanitizeCheckmarxUrl", () => {
    it("replaces unencoded slash in branch parameter within a full URL", () => {
      const rawUrl = "https://us.ast.checkmarx.net/projects/123/overview?branch=feature/auth";
      const sanitized = sanitizeCheckmarxUrl(rawUrl);
      expect(sanitized).toBe("https://us.ast.checkmarx.net/projects/123/overview?branch=feature%2Fauth");
    });

    it("leaves already encoded branch in URL untouched", () => {
      const rawUrl = "https://us.ast.checkmarx.net/projects/123/overview?branch=feature%2Fauth";
      const sanitized = sanitizeCheckmarxUrl(rawUrl);
      expect(sanitized).toBe("https://us.ast.checkmarx.net/projects/123/overview?branch=feature%2Fauth");
    });

    it("handles empty string gracefully", () => {
      expect(sanitizeCheckmarxUrl("")).toBe("");
      expect(sanitizeCheckmarxUrl(null)).toBe("");
    });
  });
});
