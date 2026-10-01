import { describe, it, expect } from "vitest";

function calculateNextWorkingDays(daysToAdd = 2, fromDate = new Date()): string {
  const date = new Date(fromDate);
  let added = 0;
  while (added < daysToAdd) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) { // Skip Sunday (0) and Saturday (6)
      added++;
    }
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildSnowPayload(
  sctask: string,
  addCommentsOnly: boolean,
  pendingDate: string,
  reviewCommentsHtml: string
) {
  const trimmedTask = sctask.trim().toUpperCase();

  if (!trimmedTask) {
    throw new Error("SCTASK number is required.");
  }

  if (!trimmedTask.startsWith("SCTASK")) {
    throw new Error("SCTASK number must start with 'SCTASK' (e.g. SCTASK0123456).");
  }

  if (!addCommentsOnly && !pendingDate) {
    throw new Error("Pending Date is required (format: YYYY-MM-DD).");
  }

  const action = addCommentsOnly ? "AddComment" : "setReviewComments";
  const endpoint = `/api/snow/sctaskUpdate?action=${action}`;

  const payload = addCommentsOnly
    ? {
        u_number: trimmedTask,
        u_additional_comments: reviewCommentsHtml,
      }
    : {
        u_number: trimmedTask,
        u_state: "Pending",
        u_pending_reason: "Awaiting Customer Response",
        u_end_pending: pendingDate,
        u_additional_comments: reviewCommentsHtml,
      };

  return { endpoint, action, payload };
}

describe("ServiceNow SCTASK Update Suite", () => {
  it("calculates next 2 working days correctly on weekdays", () => {
    // Wednesday 2026-10-07 -> Next 2 working days should be Friday 2026-10-09
    const wednesday = new Date("2026-10-07T10:00:00Z");
    const result = calculateNextWorkingDays(2, wednesday);
    expect(result).toBe("2026-10-09");
  });

  it("skips Saturday and Sunday when calculating working days", () => {
    // Thursday 2026-10-08 -> +1 is Friday, +2 is Monday 2026-10-12
    const thursday = new Date("2026-10-08T10:00:00Z");
    const result = calculateNextWorkingDays(2, thursday);
    expect(result).toBe("2026-10-12");

    // Friday 2026-10-09 -> skips Sat/Sun -> Monday (+1), Tuesday (+2) 2026-10-13
    const friday = new Date("2026-10-09T10:00:00Z");
    const resultFri = calculateNextWorkingDays(2, friday);
    expect(resultFri).toBe("2026-10-13");
  });

  it("enforces SCTASK number format requirement", () => {
    expect(() => buildSnowPayload("12345", false, "2026-10-01", "<p>Review</p>")).toThrow(
      "SCTASK number must start with 'SCTASK'"
    );
    expect(() => buildSnowPayload("INC009988", false, "2026-10-01", "<p>Review</p>")).toThrow(
      "SCTASK number must start with 'SCTASK'"
    );
    expect(() => buildSnowPayload("", false, "2026-10-01", "<p>Review</p>")).toThrow(
      "SCTASK number is required"
    );
  });

  it("generates correct payload when ADD-COMMENTS ONLY toggle is disabled (default)", () => {
    const { endpoint, action, payload } = buildSnowPayload(
      "sctask0987654",
      false,
      "2026-10-05",
      "<p>Findings sign-off HTML</p>"
    );

    expect(endpoint).toBe("/api/snow/sctaskUpdate?action=setReviewComments");
    expect(action).toBe("setReviewComments");
    expect(payload).toEqual({
      u_number: "SCTASK0987654",
      u_state: "Pending",
      u_pending_reason: "Awaiting Customer Response",
      u_end_pending: "2026-10-05",
      u_additional_comments: "<p>Findings sign-off HTML</p>",
    });
  });

  it("generates correct payload when ADD-COMMENTS ONLY toggle is enabled", () => {
    const { endpoint, action, payload } = buildSnowPayload(
      "SCTASK9998887",
      true,
      "",
      "<p>Additional comments only</p>"
    );

    expect(endpoint).toBe("/api/snow/sctaskUpdate?action=AddComment");
    expect(action).toBe("AddComment");
    expect(payload).toEqual({
      u_number: "SCTASK9998887",
      u_additional_comments: "<p>Additional comments only</p>",
    });
    // Ensure state and pending fields are absent
    expect((payload as any).u_state).toBeUndefined();
    expect((payload as any).u_pending_reason).toBeUndefined();
    expect((payload as any).u_end_pending).toBeUndefined();
  });
});
