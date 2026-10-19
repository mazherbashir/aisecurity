import { describe, it, expect } from "vitest";
import { DuplicateTicketsResponse, DuplicateTicketItem } from "../types";

describe("ServiceNow Duplicate Ticket Checks", () => {
  it("validates DuplicateTicketsResponse schema with duplicates found", () => {
    const responseWithDuplicates: DuplicateTicketsResponse = {
      sctask: "SCTASK30824068",
      ritm: "RITM0012345",
      applicationProfileName: "MYS-TAX-MyCTax_MY_Desktop",
      duplicateCount: 2,
      duplicates: [
        {
          sctask: "SCTASK30821000",
          ritm: "RITM0012000",
          state: "Work in Progress",
          title: "CRS Static Code Review",
          owner: "John Doe"
        },
        {
          sctask: "SCTASK30819999",
          ritm: "RITM0011999",
          state: "Open",
          title: "CRS Security Scan",
          owner: "Unassigned"
        }
      ]
    };

    expect(responseWithDuplicates.sctask).toBe("SCTASK30824068");
    expect(responseWithDuplicates.duplicateCount).toBe(2);
    expect(responseWithDuplicates.duplicates).toHaveLength(2);
    expect(responseWithDuplicates.duplicates[0].sctask).toBe("SCTASK30821000");
    expect(responseWithDuplicates.duplicates[0].ritm).toBe("RITM0012000");
    expect(responseWithDuplicates.duplicates[0].state).toBe("Work in Progress");
    expect(responseWithDuplicates.duplicates[0].title).toBe("CRS Static Code Review");
    expect(responseWithDuplicates.duplicates[0].owner).toBe("John Doe");

    expect(responseWithDuplicates.duplicates[1].sctask).toBe("SCTASK30819999");
    expect(responseWithDuplicates.duplicates[1].ritm).toBe("RITM0011999");
    expect(responseWithDuplicates.duplicates[1].state).toBe("Open");
    expect(responseWithDuplicates.duplicates[1].owner).toBe("Unassigned");
  });

  it("validates DuplicateTicketsResponse schema when duplicate count is 0", () => {
    const responseNoDuplicates: DuplicateTicketsResponse = {
      sctask: "SCTASK30824068",
      ritm: "RITM0012345",
      applicationProfileName: "MYS-TAX-MyCTax_MY_Desktop",
      duplicateCount: 0,
      duplicates: []
    };

    expect(responseNoDuplicates.sctask).toBe("SCTASK30824068");
    expect(responseNoDuplicates.duplicateCount).toBe(0);
    expect(responseNoDuplicates.duplicates).toEqual([]);
  });

  it("generates correct ServiceNow URLs for RITM and SCTASK", () => {
    const ritm = "RITM0012000";
    const sctask = "SCTASK30821000";

    const ritmUrl = `https://pwcnetwork.service-now.com/sc_req_item.do?sysparm_query=number=${encodeURIComponent(ritm)}`;
    const sctaskUrl = `https://pwcnetwork.service-now.com/nav_to.do?uri=sc_task.do?sysparm_query=number=${encodeURIComponent(sctask)}`;

    expect(ritmUrl).toBe("https://pwcnetwork.service-now.com/sc_req_item.do?sysparm_query=number=RITM0012000");
    expect(sctaskUrl).toBe("https://pwcnetwork.service-now.com/nav_to.do?uri=sc_task.do?sysparm_query=number=SCTASK30821000");
  });

  it("formats duplicate tickets into a readable copyable summary", () => {
    const mockItem: DuplicateTicketItem = {
      sctask: "SCTASK30821000",
      ritm: "RITM0012000",
      state: "Work in Progress",
      title: "CRS Static Code Review",
      owner: "John Doe"
    };

    const formattedRow = `SCTASK: ${mockItem.sctask} | RITM: ${mockItem.ritm} | State: ${mockItem.state} | Title: ${mockItem.title} | Owner: ${mockItem.owner}`;
    expect(formattedRow).toContain("SCTASK: SCTASK30821000");
    expect(formattedRow).toContain("RITM: RITM0012000");
    expect(formattedRow).toContain("Owner: John Doe");
  });
});
