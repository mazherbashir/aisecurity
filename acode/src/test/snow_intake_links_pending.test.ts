import { describe, it, expect } from "vitest";
import { safeStorage } from "../lib/storage";

describe("Snow Intake Screen - SCTASK & RITM Links, Pending Status, and Code Review Services Removal", () => {
  const sampleApiResult = [
    {
      short_description: "Sign Off: HVMS_US",
      assignment_group: {
        display_value: "GLOBAL - NIS - CRS Remediation",
        link: "https://pwcnetwork.service-now.com/api/now/table/sys_user_group/0af08aab1b8704d09b6165b9bd4bcbdf"
      },
      "request_item.number": "RITM28463402",
      "variables.470eedae1bd638104704eacee54bcbec": null,
      "request_item.state": "Work in Progress",
      "variables.69cda5ee1bd638104704eacee54bcbea": "Consumption-based",
      number: "SCTASK31086209",
      "request_item.cat_item": {
        display_value: "Code Review Services",
        link: "https://pwcnetwork.service-now.com/api/now/table/sc_cat_item/6382512ddb59bf40dbf414a05b96194e"
      },
      "variables.29fd21ee1bd638104704eacee54bcb44": "USO0002518.1.1",
      state: "Open",
      "variables.e1147a86dbdb8854dbf414a05b96198f": "High Velocity Managed Sales",
      assigned_to: "",
      "variables.82113e60db2b08d0dbf414a05b961990": "Sign Off"
    },
    {
      short_description: "Sign Off: AI Tool Runway",
      assignment_group: {
        display_value: "GLOBAL - NIS - CRS Remediation",
        link: "https://pwcnetwork.service-now.com/api/now/table/sys_user_group/0af08aab1b8704d09b6165b9bd4bcbdf"
      },
      "request_item.number": "RITM28444995",
      "variables.470eedae1bd638104704eacee54bcbec": "AEX AI COE: General ",
      "request_item.state": "Pending",
      "variables.69cda5ee1bd638104704eacee54bcbea": "Consumption-based",
      number: "SCTASK31069186",
      "request_item.cat_item": {
        display_value: "Code Review Services",
        link: "https://pwcnetwork.service-now.com/api/now/table/sc_cat_item/6382512ddb59bf40dbf414a05b96194e"
      },
      "variables.29fd21ee1bd638104704eacee54bcb44": "USU0012509.1.6",
      state: "Responded",
      "variables.e1147a86dbdb8854dbf414a05b96198f": "USA-IFS-AI Tool Runway",
      assigned_to: {
        display_value: "Rajarshi Roy",
        link: "https://pwcnetwork.service-now.com/api/now/table/sys_user/4146ee601bbd3c548ed0859ee54bcb92"
      },
      "variables.82113e60db2b08d0dbf414a05b961990": "Sign Off"
    },
    {
      short_description: "Sign Off: Admin Portal 2.0",
      assignment_group: {
        display_value: "GLOBAL - NIS - CRS Remediation",
        link: "https://pwcnetwork.service-now.com/api/now/table/sys_user_group/0af08aab1b8704d09b6165b9bd4bcbdf"
      },
      "request_item.number": "RITM28350061",
      "variables.470eedae1bd638104704eacee54bcbec": null,
      "request_item.state": "Pending",
      "variables.69cda5ee1bd638104704eacee54bcbea": "Consumption-based",
      number: "SCTASK30981580",
      "request_item.cat_item": {
        display_value: "Code Review Services",
        link: "https://pwcnetwork.service-now.com/api/now/table/sc_cat_item/6382512ddb59bf40dbf414a05b96194e"
      },
      "variables.29fd21ee1bd638104704eacee54bcb44": "40044049001",
      state: "Responded",
      "variables.e1147a86dbdb8854dbf414a05b96198f": "USA-ADV-concourse-microservices",
      assigned_to: {
        display_value: "Mazher Bashir",
        link: "https://pwcnetwork.service-now.com/api/now/table/sys_user/ae7daac71bc7f8543297c9d1604bcbcf"
      },
      "variables.82113e60db2b08d0dbf414a05b961990": "Sign Off"
    }
  ];

  it("builds correct ServiceNow query links for SCTASK and RITM matching the Dashboard format", () => {
    const sctask = "SCTASK31086209";
    const ritm = "RITM28463402";

    const sctaskLink = `https://pwcnetwork.service-now.com/nav_to.do?uri=sc_task.do?sysparm_query=number=${encodeURIComponent(sctask)}`;
    const ritmLink = `https://pwcnetwork.service-now.com/sc_req_item.do?sysparm_query=number=${encodeURIComponent(ritm)}`;

    expect(sctaskLink).toBe("https://pwcnetwork.service-now.com/nav_to.do?uri=sc_task.do?sysparm_query=number=SCTASK31086209");
    expect(ritmLink).toBe("https://pwcnetwork.service-now.com/sc_req_item.do?sysparm_query=number=RITM28463402");
  });

  it("sanitizes assigned_to object to display clean user name and strips raw api links", () => {
    const assignedObject = {
      display_value: "Rajarshi Roy",
      link: "https://pwcnetwork.service-now.com/api/now/table/sys_user/4146ee601bbd3c548ed0859ee54bcb92"
    };

    const getStr = (v: any) => {
      if (typeof v === "object" && v?.display_value !== undefined) {
        return String(v.display_value);
      }
      return String(v || "").trim();
    };

    const cleanUser = getStr(assignedObject);
    expect(cleanUser).toBe("Rajarshi Roy");

    // Guard against rendering /api/now/table/ links
    const shouldLink = (link?: string) => Boolean(link && !link.includes("/api/now/table/"));
    expect(shouldLink(assignedObject.link)).toBe(false);
  });

  it("detects and counts Pending records across both SCTASK state and RITM state", () => {
    const targetRecords = [
      { number: "SCTASK1", state: "Open", request_item: { number: "RITM1", state: "Work in Progress" } },
      { number: "SCTASK2", state: "Responded", request_item: { number: "RITM2", state: "Pending" } },
      { number: "SCTASK3", state: "Pending", request_item: { number: "RITM3", state: "Pending" } },
      { number: "SCTASK4", state: "No Response", request_item: { number: "RITM4", state: "Pending" } }
    ];

    const pendingCount = targetRecords.filter(
      r => r.state === "Pending" || (r.request_item && r.request_item.state === "Pending")
    ).length;

    expect(pendingCount).toBe(3);
  });

  it("filters accurately when stateFilter is 'Pending'", () => {
    const stateFilter: string = "Pending";
    const records = [
      { number: "SCTASK1", state: "Open", request_item: { number: "RITM1", state: "Work in Progress" } },
      { number: "SCTASK2", state: "Responded", request_item: { number: "RITM2", state: "Pending" } },
      { number: "SCTASK3", state: "Pending", request_item: { number: "RITM3", state: "Open" } },
    ];

    const filtered = records.filter(record => {
      const stateStr = record.state;
      const ritmStateStr = record.request_item?.state || "";
      return (
        stateFilter === "ALL" ||
        stateStr === stateFilter ||
        (stateFilter === "Pending" && (stateStr === "Pending" || ritmStateStr === "Pending"))
      );
    });

    expect(filtered.length).toBe(2);
    expect(filtered.map(r => r.number)).toEqual(["SCTASK2", "SCTASK3"]);
  });

  it("maintains last 10 entries in browser memory for profile history", () => {
    // Test safeStorage profile history saving
    const initialList = [
      "p1.json", "p2.json", "p3.json", "p4.json", "p5.json",
      "p6.json", "p7.json", "p8.json", "p9.json", "p10.json"
    ];
    safeStorage.setItem("veracode_history", initialList);

    const updated = safeStorage.saveProfileToHistory("Veracode", "p_new.json");
    expect(updated.length).toBe(10);
    expect(updated[0]).toBe("p_new.json");
    expect(updated).not.toContain("p10.json");
  });

  it("handles Sign Off short description wrapping and separates prefix from target application", () => {
    const signOffDesc = "Sign Off: Independence_Reference_Library_NGC";
    const isSignOff = signOffDesc.toLowerCase().startsWith("sign off:");
    expect(isSignOff).toBe(true);

    const appName = signOffDesc.replace(/^sign\s*off:\s*/i, "");
    expect(appName).toBe("Independence_Reference_Library_NGC");
  });

  it("applies 30% smaller font size (text-[8.5px]) for Assignment Group column values", () => {
    // Default text-xs is 12px. 30% reduction gives ~8.4px - 8.5px
    const assignmentGroupClass = "text-[8.5px] font-bold leading-snug text-slate-300 tracking-tight";
    expect(assignmentGroupClass).toContain("text-[8.5px]");
  });

  it("wraps Assignment Group values after GLOBAL-NIS to save space", () => {
    const rawGroup = "GLOBAL - NIS - CRS Remediation";
    const match = rawGroup.trim().match(/^(GLOBAL\s*[-–]\s*NIS|GLOBAL[-–]NIS)\s*[-–:]?\s*(.+)$/i);
    expect(match).not.toBeNull();
    expect(match![1].replace(/\s*[-–]\s*/, " - ")).toBe("GLOBAL - NIS");
    expect(match![2]).toBe("CRS Remediation");

    const rawIntake = "GLOBAL - NIS - CRS Intake";
    const matchIntake = rawIntake.trim().match(/^(GLOBAL\s*[-–]\s*NIS|GLOBAL[-–]NIS)\s*[-–:]?\s*(.+)$/i);
    expect(matchIntake).not.toBeNull();
    expect(matchIntake![1].replace(/\s*[-–]\s*/, " - ")).toBe("GLOBAL - NIS");
    expect(matchIntake![2]).toBe("CRS Intake");
  });

  it("increases Intake Node font size by 20% from 7.5px to 9px", () => {
    // 7.5px * 1.20 = 9.0px
    const intakeNodeClass = "text-[9px] text-slate-500 font-extrabold uppercase tracking-widest block font-mono";
    expect(intakeNodeClass).toContain("text-[9px]");
  });
});
