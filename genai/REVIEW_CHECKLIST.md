# Review checklist for AI-drafted tests

Every draft in `genai/drafts/` is **unreviewed**. Before a draft is moved into `tests/web/generated/`, a person checks it against this list and edits it until every item passes. Note each change in the header comment of the accepted file.

Items marked **auto** are also checked by `genai/src/review.ts`. Their results appear in the evaluation table (`npm run genai:evaluate`), but a pass there is a hint, not an approval.

## Structure

| Id | Check | Auto |
| --- | --- | :---: |
| R1 | Imports `test` / `expect` from the shared fixtures (`tests/web/fixtures.ts`), not from `@playwright/test`, so it gets login state, page objects and data teardown | ✔ |
| R2 | Every test is tagged `@smoke` or `@regression` (matching the story's `Tags:` line) | ✔ |
| R3 | One test per scenario, inside a `test.describe` named after the feature | ✔ |
| M1 | Login state comes from `test.use({ role })`, not from logging in through the UI (unless login is what the test is about) | |

## Correctness

| Id | Check | Auto |
| --- | --- | :---: |
| R4 | No `TODO`, `FIXME`, `test.fixme` or unimplemented steps | ✔ |
| R5 | Every **Then** step becomes at least one assertion. A draft with a missing assertion still passes, and that is the most dangerous kind of draft | ✔ |
| M2 | The assertions check what the story means, not just that something is visible (exact text, totals, counts, URL) | |
| M3 | Assertions are web-first (`await expect(locator).toHaveText(...)`), never `expect(await locator.textContent())`. See `docs/failure-drill-rca.md` | |
| M4 | The test fails when the feature is broken. Mutate the expectation, or comment out the app behaviour, and watch it go red at least once | |

## Stability

| Id | Check | Auto |
| --- | --- | :---: |
| R6 | No fixed sleeps (`waitForTimeout`, `setTimeout`) | ✔ |
| R7 | Uses page-object locators and helpers, not raw `page.locator()` / `page.getByText()` | ✔ |
| R8 | Data the test creates is unique per run (`uniqueName()`, `createProduct()` fixture) and cleaned up in teardown | ✔ |
| M5 | No dependence on test order or on data another test creates. It must pass alone, in parallel, and on all three browsers | |

## Hygiene

| Id | Check | Auto |
| --- | --- | :---: |
| M6 | No secrets or real personal data. Only the seeded demo accounts or users created by fixtures | |
| M7 | Names read as behaviour ("Wrong password is rejected"), not implementation | |
| M8 | Header comment updated: the source story, and what was changed in review and why | |
