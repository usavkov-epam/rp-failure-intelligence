import { describe, expect, it } from "vitest";

import { analyzeHistory } from "./analytics";
import type { HistoryEntry, ReportPortalItem } from "./types";

function item(
  id: number,
  status: string,
  launchNumber: number,
  overrides: Partial<ReportPortalItem> = {},
): ReportPortalItem {
  return {
    id,
    parent: 50,
    name: `C${id} Test ${id}`,
    status,
    startTime: 1_000,
    endTime: 6_000,
    codeRef: `cypress/e2e/module/test-${id}.cy.js/suite/test`,
    pathNames: {
      itemPaths: [{ name: "Module" }],
      launchPathName: { number: launchNumber },
    },
    ...overrides,
  };
}

describe("analyzeHistory", () => {
  it("maps current failures to links, classifications, and status analytics", () => {
    const history: HistoryEntry[] = [{
      resources: [
        item(123, "FAILED", 10, { issue: { issueType: "ab_uvbcfwkvo3e8" } }),
        item(123, "PASSED", 9),
        item(123, "FAILED", 8),
      ],
    }];

    const result = analyzeHistory(
      history,
      [item(1, "PASSED", 10), item(2, "FAILED", 10), item(3, "SKIPPED", 10)],
      "https://report.example.org",
      "project-name",
      99,
      "https://testrail.example.org",
    );

    expect(result.rows[0]).toMatchObject({
      id: 123,
      caseId: "C123",
      specPath: "cypress/e2e/module/test-123.cy.js",
      module: "Module",
      defect: "Flaky",
      passed: 1,
      failed: 2,
      executions: 3,
      failureRate: 67,
      currentStreak: 1,
      transitions: 2,
      regressed: true,
      risk: "Intermittent",
      statuses: ["FAILED", "PASSED", "FAILED"],
      launchNumbers: [8, 9, 10],
      reportPortalUrl: "https://report.example.org/ui/#project-name/launches/all/99/50/123/log",
      testRailUrl: "https://testrail.example.org/index.php?/cases/view/123",
    });
    expect(result.metrics).toMatchObject({
      suiteTotal: 3,
      suitePassed: 1,
      suiteFailed: 1,
      suiteOther: 1,
      cohortExecutions: 3,
      cohortFailures: 2,
      intermittent: 1,
      regressions: 1,
    });
  });

  it("classifies risk and aggregates trends by launch number", () => {
    const persistent = Array.from({ length: 3 }, (_, index) => item(201, "FAILED", 3 - index));
    const isolated = [item(202, "FAILED", 3), item(202, "PASSED", 2), item(202, "PASSED", 1)];
    const highRisk = Array.from({ length: 10 }, (_, index) => item(203, index === 9 ? "PASSED" : "FAILED", 10 - index));

    const result = analyzeHistory(
      [{ resources: persistent }, { resources: isolated }, { resources: highRisk }],
      [],
      "https://report.example.org",
      "project",
      1,
    );

    expect(result.rows.map(({ risk }) => risk)).toEqual(["Persistent", "Isolated", "High risk"]);
    expect(result.metrics).toMatchObject({ persistent: 1, isolated: 1, highRisk: 1, intermittent: 0 });
    expect(result.trend).toEqual(expect.arrayContaining([
      { launchNumber: 1, passed: 2, failed: 1, other: 0 },
      { launchNumber: 3, passed: 0, failed: 3, other: 0 },
    ]));
  });
});