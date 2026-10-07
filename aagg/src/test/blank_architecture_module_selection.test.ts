import { describe, it, expect } from "vitest";

function evaluateModuleSelectionStatus(activeOverview: {
  architectures?: string[];
  scanLanguages?: string[];
  selectedModules?: string[];
  unselectedModules?: string[];
}) {
  const archs = activeOverview.architectures;
  const langs = activeOverview.scanLanguages;

  const hasArchs = Array.isArray(archs)
    ? archs.length > 0 && archs.some((a) => String(a).trim().length > 0)
    : typeof archs === "string"
    ? String(archs).replace(/[\[\]]/g, "").trim().length > 0
    : false;

  const hasLangs = Array.isArray(langs)
    ? langs.length > 0 && langs.some((l) => String(l).trim().length > 0)
    : typeof langs === "string"
    ? String(langs).replace(/[\[\]]/g, "").trim().length > 0
    : false;

  const isArchBlank = (archs !== undefined && Array.isArray(archs) && archs.length === 0) || (!hasArchs && !hasLangs);

  const moduleSelectedStatus = isArchBlank
    ? "Error"
    : (langs && langs.length > 0 ? langs : "Error");

  const moduleSelectionStatus = isArchBlank
    ? "Error"
    : (activeOverview.unselectedModules || []).length === 0
    ? "Complete"
    : "Partial";

  return {
    isArchBlank,
    moduleSelectedStatus,
    moduleSelectionStatus,
  };
}

function normalizeImportedOverview(
  data: any,
  mockOverview: { scanLanguages: string[]; architectures: string[] }
) {
  const hasExplicitArchitectures =
    data.architectures !== undefined ||
    (data.overview && (data.overview as any).architectures !== undefined);

  let parsedArchitectures: string[] = [];
  const rawArch =
    data.architectures !== undefined
      ? data.architectures
      : data.overview && (data.overview as any).architectures;

  if (Array.isArray(rawArch)) {
    parsedArchitectures = rawArch
      .map((s: any) => String(s).trim())
      .filter(Boolean);
  } else if (typeof rawArch === "string") {
    parsedArchitectures = rawArch
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  let resolvedScanLanguages: string[] = [];
  if (hasExplicitArchitectures) {
    resolvedScanLanguages = parsedArchitectures;
  } else if (data.overview && Array.isArray((data.overview as any).scanLanguages)) {
    resolvedScanLanguages = (data.overview as any).scanLanguages;
  } else if (data.selectedModules !== undefined) {
    resolvedScanLanguages = parsedArchitectures;
  } else {
    resolvedScanLanguages = mockOverview.scanLanguages || [];
  }

  return {
    ...mockOverview,
    ...data.overview,
    architectures: hasExplicitArchitectures ? parsedArchitectures : (mockOverview.architectures || []),
    unselectedModules: data.unselectedModules || [],
    selectedModules: data.selectedModules || [],
    scanLanguages: resolvedScanLanguages,
  };
}

function evaluateMissingScaArchs(params: {
  architectures?: string[];
  scaEcosystems?: string | string[];
  configNoSca?: string[];
  removedMissingSca?: string[];
  totalPackages: number;
  resultsLoaded?: boolean;
}) {
  const archs = params.architectures || [];
  const ecoObj = params.scaEcosystems || "";
  let ecos: string[] = [];
  if (typeof ecoObj === "string") {
    ecos = ecoObj
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(ecoObj)) {
    ecos = ecoObj;
  }
  const allEcos = [...ecos, ...(params.configNoSca || [])];
  const removedMissingSca = params.removedMissingSca || [];
  const isTotalPackagesZero = params.resultsLoaded !== false && params.totalPackages === 0;

  let missingList: string[] = [];

  if (isTotalPackagesZero) {
    if (archs.length > 0) {
      missingList = archs.filter(
        (a: string) =>
          !removedMissingSca.some(
            (r: string) => r.toLowerCase().trim() === a.toLowerCase().trim(),
          ),
      );
    }
    if (
      missingList.length === 0 &&
      !removedMissingSca.some(
        (r: string) =>
          r.toLowerCase().trim() === "sca" ||
          r.toLowerCase().trim() === "0 packages" ||
          r.toLowerCase().trim() === "zero packages" ||
          r.toLowerCase().trim() === "missing",
      )
    ) {
      missingList = ["SCA"];
    }
  } else {
    missingList = archs.filter(
      (a: string) =>
        !allEcos.some(
          (e: string) => e.toLowerCase().trim() === a.toLowerCase().trim(),
        ) &&
        !removedMissingSca.some(
          (r: string) => r.toLowerCase().trim() === a.toLowerCase().trim(),
        ),
    );
  }

  return {
    missingScaArchs: missingList,
    isScaMissing: missingList.length > 0,
    statusText: missingList.length === 0 ? "NORMAL" : "MISSING",
  };
}

describe("Blank Architecture & Module Selection Status", () => {
  const mockOverview = {
    scanLanguages: ["JavaScript", ".NET"],
    architectures: ["JavaScript", ".NET"],
  };

  it("does not inject mock JavaScript and .NET when architectures and selectedModules are empty", () => {
    const userPayload = {
      overview: {
        applicationName: "KOR-ADV-agent api platform",
        appId: "3333302",
        policyComplianceStatus: "Pass",
      },
      unselectedModules: [],
      selectedModules: [],
      architectures: [],
    };

    const normalized = normalizeImportedOverview(userPayload, mockOverview);

    // Verify architectures and scanLanguages are empty, NOT ["JavaScript", ".NET"]
    expect(normalized.architectures).toEqual([]);
    expect(normalized.scanLanguages).toEqual([]);
    expect(normalized.scanLanguages).not.toContain("JavaScript");
    expect(normalized.scanLanguages).not.toContain(".NET");

    // Evaluate UI status
    const status = evaluateModuleSelectionStatus(normalized);
    expect(status.isArchBlank).toBe(true);
    // Both MODULE SELECTED and MODULE SELECTION must show "Error"
    expect(status.moduleSelectedStatus).toBe("Error");
    expect(status.moduleSelectionStatus).toBe("Error");
  });

  it("handles string format architectures and whitespace properly", () => {
    const emptyStringPayload = {
      overview: {
        applicationName: "Test App",
      },
      unselectedModules: [],
      selectedModules: [],
      architectures: "[]",
    };

    const normalized = normalizeImportedOverview(emptyStringPayload, mockOverview);
    expect(normalized.architectures).toEqual([]);
    expect(normalized.scanLanguages).toEqual([]);

    const status = evaluateModuleSelectionStatus(normalized);
    expect(status.isArchBlank).toBe(true);
    expect(status.moduleSelectedStatus).toBe("Error");
    expect(status.moduleSelectionStatus).toBe("Error");
  });

  it("shows language chips and Complete status when architectures are present and unselectedModules is empty", () => {
    const validPayload = {
      overview: {
        applicationName: "Java Service",
      },
      unselectedModules: [],
      selectedModules: ["service.jar"],
      architectures: ["Java"],
    };

    const normalized = normalizeImportedOverview(validPayload, mockOverview);
    expect(normalized.architectures).toEqual(["Java"]);
    expect(normalized.scanLanguages).toEqual(["Java"]);

    const status = evaluateModuleSelectionStatus(normalized);
    expect(status.isArchBlank).toBe(false);
    expect(status.moduleSelectedStatus).toEqual(["Java"]);
    expect(status.moduleSelectionStatus).toBe("Complete");
  });

  it("shows language chips and Partial status when unselected modules exist", () => {
    const partialPayload = {
      overview: {
        applicationName: "DotNet App",
      },
      unselectedModules: ["UnselectedHelper.dll"],
      selectedModules: ["MainApp.dll"],
      architectures: [".NET"],
    };

    const normalized = normalizeImportedOverview(partialPayload, mockOverview);
    const status = evaluateModuleSelectionStatus(normalized);

    expect(status.isArchBlank).toBe(false);
    expect(status.moduleSelectedStatus).toEqual([".NET"]);
    expect(status.moduleSelectionStatus).toBe("Partial");
  });

  it("marks SCA MISSING when totalPackages is zero, even if architectures is empty", () => {
    // User's exact scan scenario: 0 packages, empty architectures
    const result = evaluateMissingScaArchs({
      architectures: [],
      scaEcosystems: "",
      totalPackages: 0,
      resultsLoaded: true,
    });

    expect(result.isScaMissing).toBe(true);
    expect(result.statusText).toBe("MISSING");
    expect(result.missingScaArchs).toEqual(["SCA"]);
  });

  it("marks all scanned architectures as SCA MISSING when totalPackages is zero", () => {
    // Scan with architectures present, but totalPackages is 0
    const result = evaluateMissingScaArchs({
      architectures: ["Java", "JavaScript"],
      scaEcosystems: "[Java, JavaScript]", // Ecosystems appear in scan, but 0 packages found!
      totalPackages: 0,
      resultsLoaded: true,
    });

    expect(result.isScaMissing).toBe(true);
    expect(result.statusText).toBe("MISSING");
    expect(result.missingScaArchs).toEqual(["Java", "JavaScript"]);
  });

  it("allows removing SCA missing finding via removedMissingSca when totalPackages is zero", () => {
    const result = evaluateMissingScaArchs({
      architectures: [],
      scaEcosystems: "",
      totalPackages: 0,
      removedMissingSca: ["SCA"],
      resultsLoaded: true,
    });

    expect(result.isScaMissing).toBe(false);
    expect(result.statusText).toBe("NORMAL");
    expect(result.missingScaArchs).toEqual([]);
  });

  it("reports NORMAL when totalPackages > 0 and all architectures match ecosystems", () => {
    const result = evaluateMissingScaArchs({
      architectures: ["Java"],
      scaEcosystems: "[Java]",
      totalPackages: 45,
      resultsLoaded: true,
    });

    expect(result.isScaMissing).toBe(false);
    expect(result.statusText).toBe("NORMAL");
    expect(result.missingScaArchs).toEqual([]);
  });
});
