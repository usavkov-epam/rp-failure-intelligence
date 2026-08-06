---
name: reportportal-failure-report
description: 'Generate an isolated ReportPortal failure-report folder for a team from the latest completed named launch, including Markdown analysis, direct logs, TestRail links, recent statistics, and Cypress specs files for all failed, To investigate, and Flaky tests. Use when asked for nightly failure reports, team failure analysis, flaky-test history, last-N-run statistics, or repeat-run spec lists.'
argument-hint: '<launch name> <team> [history depth=10] [output path]'
user-invocable: true
---

# ReportPortal Failure Report

Generate a local report package from the official ReportPortal MCP server. Keep all calculations and spec classifications grounded in MCP responses.

## Defaults

- ReportPortal project: `cypress-nightly`
- Team filter: case-insensitive substring in the test item name
- History depth: `10`
- History scope: launches with the same name (`type: line`)
- Output folder: `.local/reportportal/<team>-<launch-name>-<launch-id>/`
- Markdown report: `<output-folder>/report.md`
- Cypress spec lists: `<output-folder>/specs/`

Use user-provided values instead of defaults. Ask only when the launch name or team cannot be inferred.

## Procedure

1. Find the launch.
   - Call `get_launches` with `filter-cnt-name`, newest-first sorting, and enough results to handle similarly named launches.
   - Select an exact, case-sensitive launch-name match.
   - Use the newest completed launch by default. If a newer matching launch is `IN_PROGRESS`, state that it was skipped because its failure set is incomplete.
   - Record the launch name, number, ID, and status.
   - The official MCP may emit `Time.UnmarshalJSON` while still including valid JSON because some ReportPortal deployments return numeric timestamps. Recover and use the embedded payload; do not discard otherwise valid results.

2. Fetch the failed team tests.
   - Call `get_test_items_by_filter` with the launch ID, `filter-in-status: FAILED`, and `filter-cnt-name` set to the team.
   - Set `include-before-after-hooks: false` to return test steps rather than hook failures.
   - Request up to 100 items and follow pagination when `totalPages` is greater than one.
   - Preserve each ReportPortal test identity. Do not deduplicate by TestRail case ID: one case can contain multiple independently tracked tests.

3. Build repeat-run spec lists.
    - Read the current failed item's exact `issue.issueType` value. Use these ReportPortal locators:
       - To investigate: `ti001`
       - Flaky: `ab_uvbcfwkvo3e8`
    - Extract the Cypress spec path from `codeRef`, ending at `.cy.js` or `.cy.ts`. A code reference may continue with suite and test names after the spec path.
    - Preserve failed-item launch order, but deduplicate each file by complete spec path. Multiple ReportPortal test identities can belong to one Cypress spec and must produce one specs-file row.
    - Create the `specs/` directory and always write all three files, including empty files when no item matches a category:
       - `specs/all-failed.txt`: every unique spec represented by the failed team items.
       - `specs/to-investigate.txt`: unique specs whose failed item has `issue.issueType: ti001`.
       - `specs/flaky.txt`: unique specs whose failed item has `issue.issueType: ab_uvbcfwkvo3e8`.
    - Write one repository-relative spec path per line with a trailing newline when the file is non-empty. Do not add headings, comments, counts, quotes, or shell commands to these files; they must be accepted directly by `--specs-file`.
    - Classify only by the exact issue-type locator. Do not infer To investigate or Flaky from status history, defect labels, `autoAnalyzed`, or failure rate.

4. Fetch recent history.
   - Prefer one `get_test_items_history` batch using the selected launch ID, team name, failed status, requested `historyDepth`, and `type: line`.
   - Follow pagination until every failed item is represented.
   - Each history result has a `resources` array. Treat `resources[0]` as the current failed item and count statuses across all returned resources.
   - Count `PASSED` and `FAILED` exactly. If other statuses occur, add an `Other` count rather than silently treating them as failures.
   - Never infer missing history as Passed or Failed. State the actual number of available executions when it is less than the requested depth.

5. Build links.
   - ReportPortal log URL:
     `https://report-portal.ci.folio.org/ui/#cypress-nightly/launches/all/<launchId>/<parentId>/<itemId>/log`
   - Extract a leading TestRail ID matching `C<digits>` from the item name.
   - FOLIO TestRail URL:
     `https://foliotest.testrail.io/index.php?/cases/view/<digits>`
   - If an item has no TestRail ID, write `TestRail case: not found` and continue.

6. Write the report using [report-template.md](./assets/report-template.md).
   - Create the isolated output folder under `.local/reportportal/` unless the user requests another path.
   - Write the Markdown report as `report.md` inside that folder.
   - Use one section per ReportPortal test identity.
   - Keep the current launch order unless the user requests another sort.
   - In the completion response, include ready-to-run examples for each non-empty list:
     `yarn cypress:repeat --specs-file <output-folder>/specs/<file>.txt`

7. Validate before reporting completion.
   - The number of test sections equals the failed-item count.
   - Every section has one ReportPortal link.
   - Every extracted TestRail ID has one TestRail link.
   - For each section, status counts sum to the number of returned history resources.
   - Cross-check item ID, parent ID, case ID, and counts against the MCP history payload.
   - Every `all-failed.txt` path comes from a failed item's `codeRef`, exists in the workspace when the repository is available locally, and appears exactly once.
   - Every `to-investigate.txt` path comes from at least one current failed item with issue type `ti001` and appears exactly once.
   - Every `flaky.txt` path comes from at least one current failed item with issue type `ab_uvbcfwkvo3e8` and appears exactly once.
   - Spec list order matches the first occurrence of each path in the failed-item launch order.
   - Empty categories still have an empty specs file.
   - Confirm `.local/` output is ignored by Git.

## Safety

- Use read-only ReportPortal tools for this workflow.
- Do not run analysis, update defect types, delete launches, or modify Jira/TestRail records.
- Generating spec lists does not authorize running them. Run Cypress only when the user explicitly requests execution or confirms it through a local runner UI.
- Never put API tokens or MCP response dumps in the generated report.