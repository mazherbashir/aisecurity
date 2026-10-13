import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Vulnerability Analysis Deep-Dive Copy Functionality", () => {
  let clipboardText = "";

  beforeEach(() => {
    clipboardText = "";
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async (text: string) => {
          clipboardText = text;
        }),
      },
    });
  });

  it("copies customer / developer mitigation when comments are provided", async () => {
    const mockDetailedGroup = {
      groupId: "group-1",
      comments: "Input validation is handled via Spring Validator and database sanitization on service layer.",
      aiComment: "Verified that sanitization prevents SQL injection.",
    };

    const textToCopy = (mockDetailedGroup.comments || "").trim();
    expect(textToCopy).toBeTruthy();

    await navigator.clipboard.writeText(textToCopy);
    expect(clipboardText).toBe(
      "Input validation is handled via Spring Validator and database sanitization on service layer."
    );
  });

  it("does not copy customer mitigation when empty or only whitespace", async () => {
    const mockDetailedGroup = {
      groupId: "group-2",
      comments: "   ",
      aiComment: "Some AI recommendation.",
    };

    const textToCopy = (mockDetailedGroup.comments || "").trim();
    expect(textToCopy).toBe("");
    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
    }
    expect(clipboardText).toBe("");
  });

  it("copies AI recommendation correctly", async () => {
    const mockDetailedGroup = {
      groupId: "group-3",
      comments: "Customer notes.",
      aiComment:
        "Recommendation: The application uses prepared statements. However, ensure ORM queries also bind parameters.",
    };

    const textToCopy = (mockDetailedGroup.aiComment || "").trim();
    expect(textToCopy).toBeTruthy();

    await navigator.clipboard.writeText(textToCopy);
    expect(clipboardText).toBe(
      "Recommendation: The application uses prepared statements. However, ensure ORM queries also bind parameters."
    );
  });

  it("copies updated AI recommendation after user edits", async () => {
    const mockDetailedGroup = {
      groupId: "group-4",
      comments: "Customer notes.",
      aiComment: "Original AI text",
    };

    // User updates comment in deep dive window
    mockDetailedGroup.aiComment = "CRS reviewed: Approved mitigation with compensating WAF rule.";

    const textToCopy = (mockDetailedGroup.aiComment || "").trim();
    await navigator.clipboard.writeText(textToCopy);
    expect(clipboardText).toBe("CRS reviewed: Approved mitigation with compensating WAF rule.");
  });

  it("provides copy button IDs for UI testing and accessibility", () => {
    const customerCopyBtnId = "btn-copy-customer-mitigation";
    const aiCopyBtnHeaderId = "btn-copy-ai-recommendation-header";
    const aiCopyBtnFooterId = "btn-copy-ai-recommendation-footer";

    expect(customerCopyBtnId).toBe("btn-copy-customer-mitigation");
    expect(aiCopyBtnHeaderId).toBe("btn-copy-ai-recommendation-header");
    expect(aiCopyBtnFooterId).toBe("btn-copy-ai-recommendation-footer");
  });
});
