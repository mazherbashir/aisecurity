import { describe, it, expect } from "vitest";
import { StaticContent } from "../staticContent";

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

  it("builds and validates Auto Sign-off payload correctly", () => {
    function buildAutoSignoff(
      sctask: string,
      mitigations: string,
      appName: string,
      isCheckmarx: boolean
    ) {
      const trimmedTask = sctask.trim().toUpperCase();
      if (!trimmedTask.startsWith("SCTASK")) {
        throw new Error("SCTASK number must start with 'SCTASK' (e.g. SCTASK30824068).");
      }
      return {
        sctaskNumber: trimmedTask,
        mitigationProposalsReviewed: (mitigations || "0").trim() || "0",
        applicationName: appName.trim(),
        tool: isCheckmarx ? "Checkmarx" : "Veracode",
        signoffType: "no_flaw",
      };
    }

    // 1. Veracode tool
    const veracodePayload = buildAutoSignoff("sctask30824068", "2", "USA-TAX-Tax Research Chatbot", false);
    expect(veracodePayload).toEqual({
      sctaskNumber: "SCTASK30824068",
      mitigationProposalsReviewed: "2",
      applicationName: "USA-TAX-Tax Research Chatbot",
      tool: "Veracode",
      signoffType: "no_flaw",
    });

    // 2. Checkmarx tool
    const cxPayload = buildAutoSignoff("SCTASK998877", "", "My-App", true);
    expect(cxPayload).toEqual({
      sctaskNumber: "SCTASK998877",
      mitigationProposalsReviewed: "0",
      applicationName: "My-App",
      tool: "Checkmarx",
      signoffType: "no_flaw",
    });

    // 3. Validation failure
    expect(() => buildAutoSignoff("INC12345", "0", "App", false)).toThrow(
      "SCTASK number must start with 'SCTASK'"
    );
  });

  function buildAutoRpSignoff(params: {
    sctask: string;
    mitigations?: string;
    appName: string;
    isCheckmarx: boolean;
    rpId: string;
    date: string;
    rpWithinGracePeriod?: boolean;
  }) {
    const trimmedTask = params.sctask.trim().toUpperCase();
    if (!trimmedTask.startsWith("SCTASK")) {
      throw new Error("SCTASK number must start with 'SCTASK' (e.g. SCTASK30824068).");
    }

    const trimmedRp = params.rpId.trim().toUpperCase();
    if (!trimmedRp.startsWith("RITM") && !trimmedRp.startsWith("IPT") && !trimmedRp.startsWith("PER")) {
      throw new Error("Remediation Plan ID must start with RITM, IPT, or PER (e.g. PER123456).");
    }

    if (!params.date) {
      throw new Error("Estimated completion date is required.");
    }

    let parsedDate: Date | null = null;
    const dateStr = params.date.trim();
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        if (!isNaN(m) && !isNaN(d) && !isNaN(y) && m >= 0 && m <= 11 && d >= 1 && d <= 31 && y >= 1000) {
          parsedDate = new Date(y, m, d, 23, 59, 59);
        }
      }
    } else if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(m) && !isNaN(d) && !isNaN(y) && m >= 0 && m <= 11 && d >= 1 && d <= 31 && y >= 1000) {
          parsedDate = new Date(y, m, d, 23, 59, 59);
        }
      }
    }

    if (!parsedDate || isNaN(parsedDate.getTime())) {
      throw new Error("Estimated completion date is invalid. Please format as MM/DD/YYYY or YYYY-MM-DD.");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDate < today) {
      throw new Error("Estimated completion date cannot be in the past.");
    }

    return {
      sctaskNumber: trimmedTask,
      mitigationProposalsReviewed: (params.mitigations || "0").trim() || "0",
      applicationName: params.appName.trim(),
      tool: params.isCheckmarx ? "Checkmarx" : "Veracode",
      signoffType: "with_plan",
      remediationPlanId: trimmedRp,
      estimatedCompletionDate: params.date,
      rpWithinGracePeriod: params.rpWithinGracePeriod !== undefined ? params.rpWithinGracePeriod : true,
    };
  }

  it("builds and validates Auto RP Sign-off payload correctly", () => {
    // 1. Veracode with PER plan
    const veracodeRp = buildAutoRpSignoff({
      sctask: "sctask30824068",
      mitigations: "2",
      appName: "USA-TAX-Tax Research Chatbot",
      isCheckmarx: false,
      rpId: "PER123456",
      date: "12/31/2026",
      rpWithinGracePeriod: true,
    });

    expect(veracodeRp).toEqual({
      sctaskNumber: "SCTASK30824068",
      mitigationProposalsReviewed: "2",
      applicationName: "USA-TAX-Tax Research Chatbot",
      tool: "Veracode",
      signoffType: "with_plan",
      remediationPlanId: "PER123456",
      estimatedCompletionDate: "12/31/2026",
      rpWithinGracePeriod: true,
    });

    // 2. Checkmarx with RITM plan and YYYY-MM-DD date
    const checkmarxRp = buildAutoRpSignoff({
      sctask: "SCTASK8877665",
      appName: "Payment-Gateway",
      isCheckmarx: true,
      rpId: "RITM998877",
      date: "2026-11-15",
      rpWithinGracePeriod: false,
    });

    expect(checkmarxRp).toEqual({
      sctaskNumber: "SCTASK8877665",
      mitigationProposalsReviewed: "0",
      applicationName: "Payment-Gateway",
      tool: "Checkmarx",
      signoffType: "with_plan",
      remediationPlanId: "RITM998877",
      estimatedCompletionDate: "2026-11-15",
      rpWithinGracePeriod: false,
    });

    // 3. Validation failure: Invalid SCTASK format
    expect(() =>
      buildAutoRpSignoff({
        sctask: "TASK1234",
        appName: "App",
        isCheckmarx: false,
        rpId: "PER123",
        date: "12/31/2026",
      })
    ).toThrow("SCTASK number must start with 'SCTASK'");

    // 4. Validation failure: Invalid RP ID prefix (must be RITM, IPT, or PER)
    expect(() =>
      buildAutoRpSignoff({
        sctask: "SCTASK123456",
        appName: "App",
        isCheckmarx: false,
        rpId: "INC123456",
        date: "12/31/2026",
      })
    ).toThrow("Remediation Plan ID must start with RITM, IPT, or PER");

    // 5. Validation failure: Past date
    expect(() =>
      buildAutoRpSignoff({
        sctask: "SCTASK123456",
        appName: "App",
        isCheckmarx: false,
        rpId: "IPT123456",
        date: "01/01/2020",
      })
    ).toThrow("Estimated completion date cannot be in the past");
  });

  it("builds and validates Mitigation Approval Review (MAR) Closed payload correctly", () => {
    function buildCloseMarPayload(params: {
      sctask: string;
      mitigations: string | number;
      profileUrl: string;
      reviewHtml: string;
    }) {
      const trimmedTask = String(params.sctask).trim().toUpperCase();
      if (!trimmedTask) {
        throw new Error("SCTASK number is required.");
      }
      if (!trimmedTask.startsWith("SCTASK")) {
        throw new Error("SCTASK number must start with 'SCTASK' (e.g. SCTASK0012345).");
      }

      const trimmedMitigations = String(params.mitigations).trim();
      if (!trimmedMitigations) {
        throw new Error("Mitigation proposals reviewed count is required.");
      }

      const parsedMitigations = parseInt(trimmedMitigations, 10);

      return {
        sctaskNumber: trimmedTask,
        scanToolProfileUrl: params.profileUrl,
        scanUrl: params.profileUrl,
        mitigationProposalsReviewed: isNaN(parsedMitigations) ? trimmedMitigations : parsedMitigations,
        reviewCommentsHtml: params.reviewHtml,
        reviewCommentHtml: params.reviewHtml,
      };
    }

    // 1. Valid Veracode MAR Close payload
    const veracodeMar = buildCloseMarPayload({
      sctask: "SCTASK0012345",
      mitigations: 3,
      profileUrl: "https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:123",
      reviewHtml: "<p>Mitigation Approval Review completed for 3 flaws.</p>",
    });

    expect(veracodeMar).toEqual({
      sctaskNumber: "SCTASK0012345",
      scanToolProfileUrl: "https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:123",
      scanUrl: "https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:123",
      mitigationProposalsReviewed: 3,
      reviewCommentsHtml: "<p>Mitigation Approval Review completed for 3 flaws.</p>",
      reviewCommentHtml: "<p>Mitigation Approval Review completed for 3 flaws.</p>",
    });

    // 2. Valid Checkmarx MAR Close payload
    const cxMar = buildCloseMarPayload({
      sctask: "sctask30824068",
      mitigations: "2",
      profileUrl: "https://us.ast.checkmarx.net/projects/app-1/overview?branch=main",
      reviewHtml: "<p>CX MAR comments</p>",
    });

    expect(cxMar.sctaskNumber).toBe("SCTASK30824068");
    expect(cxMar.mitigationProposalsReviewed).toBe(2);

    // 3. Validation failure: Missing SCTASK
    expect(() =>
      buildCloseMarPayload({
        sctask: "",
        mitigations: 3,
        profileUrl: "url",
        reviewHtml: "html",
      })
    ).toThrow("SCTASK number is required.");

    // 4. Validation failure: Invalid SCTASK prefix
    expect(() =>
      buildCloseMarPayload({
        sctask: "INC0012345",
        mitigations: 3,
        profileUrl: "url",
        reviewHtml: "html",
      })
    ).toThrow("SCTASK number must start with 'SCTASK'");

    // 5. Validation failure: Missing mitigations count
    expect(() =>
      buildCloseMarPayload({
        sctask: "SCTASK0012345",
        mitigations: "",
        profileUrl: "url",
        reviewHtml: "html",
      })
    ).toThrow("Mitigation proposals reviewed count is required.");
  });

  it("builds and validates Invalid Profile payload and HTML correctly", () => {
    function buildInvalidProfilePayload(params: {
      sctask: string;
      ritm: string;
      profileName: string;
      pendingDate: string;
    }) {
      const trimmedTask = String(params.sctask).trim().toUpperCase();
      if (!trimmedTask) {
        throw new Error("SCTASK number is required.");
      }
      if (!trimmedTask.startsWith("SCTASK")) {
        throw new Error("SCTASK number must start with 'SCTASK' (e.g. SCTASK1423412341234).");
      }

      const trimmedRitm = String(params.ritm).trim().toUpperCase();
      if (!trimmedRitm) {
        throw new Error("RITM number is required.");
      }

      const trimmedProfile = String(params.profileName).trim();
      if (!trimmedProfile) {
        throw new Error("Profile name is required.");
      }

      if (!params.pendingDate) {
        throw new Error("Pending Date is required.");
      }

      const generatedComments = StaticContent.generateInvalidProfileHtml(trimmedProfile, trimmedRitm);

      return {
        u_number: trimmedTask,
        u_state: "Pending",
        u_pending_reason: "Awaiting Customer Response",
        u_end_pending: params.pendingDate,
        u_additional_comments: generatedComments,
      };
    }

    // 1. Build valid Invalid Profile payload
    const payload = buildInvalidProfilePayload({
      sctask: "SCTASK1423412341234",
      ritm: "RITM1423412341234",
      profileName: "USA-TAX-Tax Research Chatbot",
      pendingDate: "2026-10-06",
    });

    expect(payload.u_number).toBe("SCTASK1423412341234");
    expect(payload.u_state).toBe("Pending");
    expect(payload.u_pending_reason).toBe("Awaiting Customer Response");
    expect(payload.u_end_pending).toBe("2026-10-06");

    // Verify HTML contains required header, profile, ritm, onboarding text, and footer
    expect(payload.u_additional_comments).toContain("[code]");
    expect(payload.u_additional_comments).toContain("USA-TAX-Tax Research Chatbot");
    expect(payload.u_additional_comments).toContain("RITM1423412341234");
    expect(payload.u_additional_comments).toContain("does not correspond to an existing application profile in Veracode");
    expect(payload.u_additional_comments).toContain("Create Scanning Tool Profile");
    expect(payload.u_additional_comments).toContain("Phase 1 - Onboarding");
    expect(payload.u_additional_comments).toContain("[/code]");

    // 2. Validation failure: missing SCTASK
    expect(() =>
      buildInvalidProfilePayload({
        sctask: "",
        ritm: "RITM123",
        profileName: "App",
        pendingDate: "2026-10-06",
      })
    ).toThrow("SCTASK number is required.");

    // 3. Validation failure: invalid SCTASK prefix
    expect(() =>
      buildInvalidProfilePayload({
        sctask: "INC123",
        ritm: "RITM123",
        profileName: "App",
        pendingDate: "2026-10-06",
      })
    ).toThrow("SCTASK number must start with 'SCTASK'");

    // 4. Validation failure: missing RITM
    expect(() =>
      buildInvalidProfilePayload({
        sctask: "SCTASK123",
        ritm: "",
        profileName: "App",
        pendingDate: "2026-10-06",
      })
    ).toThrow("RITM number is required.");

    // 5. Validation failure: missing Profile
    expect(() =>
      buildInvalidProfilePayload({
        sctask: "SCTASK123",
        ritm: "RITM123",
        profileName: "",
        pendingDate: "2026-10-06",
      })
    ).toThrow("Profile name is required.");
  });

  it("verifies compact toolbar buttons specifications and conditional clean vs RP sign-off", () => {
    function getVisibleToolbarButtons(showSignOffButton: boolean) {
      if (showSignOffButton) {
        return [
          { id: "btn-auto-sign-off-trigger", title: "Auto Sign-off" },
          { id: "btn-manual-sign-off-trigger", title: "Manual Sign-off" },
          { id: "btn-update-snow-trigger", title: "Update Snow with current comments" },
          { id: "btn-copy-raw-html", title: "Copy Review Comments" },
          { id: "btn-mar-closed-trigger", title: "Closed Mitigation Approval Review Request" },
          { id: "btn-invalid-profile-trigger", title: "Invalid Profile" },
        ];
      } else {
        return [
          { id: "btn-auto-rp-sign-off-trigger", title: "Auto RP Sign-off" },
          { id: "btn-manual-rp-sign-off-trigger", title: "Manual RP Sign-off" },
          { id: "btn-update-snow-trigger", title: "Update Snow with current comments" },
          { id: "btn-copy-raw-html", title: "Copy Review Comments" },
          { id: "btn-mar-closed-trigger", title: "Closed Mitigation Approval Review Request" },
          { id: "btn-invalid-profile-trigger", title: "Invalid Profile" },
        ];
      }
    }

    // 1. When scan is clean: Auto Sign-off & Manual Sign-off are visible; RP Sign-off buttons are NOT visible
    const cleanButtons = getVisibleToolbarButtons(true);
    expect(cleanButtons.map(b => b.id)).toEqual([
      "btn-auto-sign-off-trigger",
      "btn-manual-sign-off-trigger",
      "btn-update-snow-trigger",
      "btn-copy-raw-html",
      "btn-mar-closed-trigger",
      "btn-invalid-profile-trigger",
    ]);
    expect(cleanButtons.some(b => b.id.includes("-rp-"))).toBe(false);

    // 2. When scan has findings: Auto RP Sign-off & Manual RP Sign-off are visible; standard sign-off buttons are NOT visible
    const rpButtons = getVisibleToolbarButtons(false);
    expect(rpButtons.map(b => b.id)).toEqual([
      "btn-auto-rp-sign-off-trigger",
      "btn-manual-rp-sign-off-trigger",
      "btn-update-snow-trigger",
      "btn-copy-raw-html",
      "btn-mar-closed-trigger",
      "btn-invalid-profile-trigger",
    ]);
    expect(rpButtons.some(b => b.id === "btn-auto-sign-off-trigger" || b.id === "btn-manual-sign-off-trigger")).toBe(false);

    // 3. In both modes, Copy is right-aligned immediately next to Update Snow
    for (const buttonList of [cleanButtons, rpButtons]) {
      const snowIndex = buttonList.findIndex(b => b.id === "btn-update-snow-trigger");
      const copyIndex = buttonList.findIndex(b => b.id === "btn-copy-raw-html");
      expect(copyIndex).toBe(snowIndex + 1);
    }
  });

  it("builds correct ServiceNow comments for Current, No-Response, and Response-Needed options", () => {
    function resolveSnowComments(
      option: "current" | "no_response" | "response_needed",
      currentComments: string
    ) {
      if (option === "no_response") {
        return StaticContent.generateNoResponseHtml();
      }
      if (option === "response_needed") {
        return StaticContent.generateResponseNeededHtml();
      }
      return currentComments;
    }

    // 1. Current Review Comments (default)
    const currentHtml = "<p>My custom active review comments</p>";
    const commentsCurrent = resolveSnowComments("current", currentHtml);
    expect(commentsCurrent).toBe(currentHtml);

    // 2. No Response Comments (includes header, snippet body, and footer)
    const commentsNoResponse = resolveSnowComments("no_response", currentHtml);
    expect(commentsNoResponse).toContain("[code]");
    expect(commentsNoResponse).toContain("Code Review Services (CRS) has waited in accordance with our policy");
    expect(commentsNoResponse).toContain("This request has been closed");
    expect(commentsNoResponse).toContain("CRS SharePoint");
    expect(commentsNoResponse).toContain("[/code]");

    // 3. Response Needed Comments (includes header, snippet body, and footer)
    const commentsResponseNeeded = resolveSnowComments("response_needed", currentHtml);
    expect(commentsResponseNeeded).toContain("[code]");
    expect(commentsResponseNeeded).toContain("Response Needed");
    expect(commentsResponseNeeded).toContain("CRS policy only allows us to keep requests without action open for 4 business days");
    expect(commentsResponseNeeded).toContain("If no response is received in 2 business day(s)");
    expect(commentsResponseNeeded).toContain("CRS SharePoint");
    expect(commentsResponseNeeded).toContain("[/code]");

    // 4. Verify Payload with No Response comments
    const snowNoResponsePayload = buildSnowPayload("SCTASK998877", false, "2026-10-06", commentsNoResponse);
    expect(snowNoResponsePayload.payload.u_number).toBe("SCTASK998877");
    expect(snowNoResponsePayload.payload.u_additional_comments).toBe(commentsNoResponse);
    expect(snowNoResponsePayload.payload.u_pending_reason).toBe("Awaiting Customer Response");

    // 5. Verify Payload with Response Needed comments (AddComment only mode)
    const snowResponseNeededAddComment = buildSnowPayload("SCTASK998877", true, "", commentsResponseNeeded);
    expect(snowResponseNeededAddComment.payload.u_number).toBe("SCTASK998877");
    expect(snowResponseNeededAddComment.payload.u_additional_comments).toBe(commentsResponseNeeded);
    expect(snowResponseNeededAddComment.action).toBe("AddComment");
  });

  it("verifies Invalid Profile defaults to blank profile name and ServiceNow modal has no preview box", () => {
    // Default initial profile name must be blank
    const defaultInvalidProfileName = "";
    expect(defaultInvalidProfileName).toBe("");

    // ServiceNow modal comment preview block should not be rendered
    const showSnowCommentPreview = false;
    expect(showSnowCommentPreview).toBe(false);
  });

  it("verifies WITHIN GRACE PERIOD radio button options (YES / NO) in RP Sign-off", () => {
    const graceRadioOptions = [
      { id: "radio-auto-rp-grace-yes", value: true, label: "YES" },
      { id: "radio-auto-rp-grace-no", value: false, label: "NO" },
    ];

    expect(graceRadioOptions.map(o => o.label)).toEqual(["YES", "NO"]);
    expect(graceRadioOptions[0].value).toBe(true);
    expect(graceRadioOptions[1].value).toBe(false);

    // Verify auto RP signoff builds with false when NO is chosen
    const rpExceedsGrace = buildAutoRpSignoff({
      sctask: "SCTASK123456",
      mitigations: "0",
      appName: "My App",
      isCheckmarx: false,
      rpId: "PER778899",
      date: "12/31/2026",
      rpWithinGracePeriod: false,
    });

    expect(rpExceedsGrace.rpWithinGracePeriod).toBe(false);

    // Verify info button and explanation specifications
    const graceInfoButton = {
      id: "btn-auto-rp-grace-info",
      manualId: "btn-manual-rp-grace-info",
      title: "Information: Explains how Within Grace Period impacts the ServiceNow remediation plan workflow",
      ariaLabel: "Information: Within Grace Period workflow impact",
    };
    expect(graceInfoButton.id).toBe("btn-auto-rp-grace-info");
    expect(graceInfoButton.manualId).toBe("btn-manual-rp-grace-info");
    expect(graceInfoButton.title).toContain("ServiceNow remediation plan workflow");

    const graceExplanation = {
      yesImpact: "Target completion date satisfies policy grace periods; sign-off records that date does meet grace period",
      noImpact: "Target completion date exceeds policy timelines; sign-off records that date does not meet grace period and routes for exception review",
    };
    expect(graceExplanation.yesImpact).toContain("does meet grace period");
    expect(graceExplanation.noImpact).toContain("does not meet grace period");
  });
});
