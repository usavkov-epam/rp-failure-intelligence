import { describe, expect, it, vi } from "vitest";

import { collectAllPages } from "./pagination";

describe("ReportPortal pagination", () => {
  it("loads every page and preserves API order", async () => {
    const loadPage = vi.fn(async (pageNumber: number) => ({
      content: [`page-${pageNumber}`],
      page: { number: pageNumber, totalElements: 7, totalPages: 7 },
    }));

    const result = await collectAllPages(loadPage, 3);

    expect(result.content).toEqual([
      "page-1",
      "page-2",
      "page-3",
      "page-4",
      "page-5",
      "page-6",
      "page-7",
    ]);
    expect(loadPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
