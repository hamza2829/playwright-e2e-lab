# Failure drill: root cause analysis

**Test:** `tests/drill/cart-badge.drill.spec.ts` › `BROKEN: badge shows 1 after adding a product`
**How to reproduce:** Actions › **Failure drill** › Run workflow (`variant: broken`, `latency_ms: 400`), or locally run `npm run test:drill`.
**Status:** Root cause found. The fix is the `FIXED` variant, and the same pattern is used everywhere in the main suite.

This drill is deliberate. The broken test is kept out of the default run: the `drill` Playwright project exists only when `DRILL=1` is set, and only the opt-in workflow sets it. It is here so the failure-analysis tooling (trace, screenshot, video, HTML report, test-health analyzer) can be shown on a real, reproducible failure.

## Summary

The test clicks **Add to cart** and then checks that the cart badge says `1`. It reads the badge text once, right after the click, and compares it with a plain `expect(value).toBe('1')`. The app updates the badge only after `POST /api/cart` responds. When the API takes longer than the gap between the click and the read, the test sees the old value `0` and fails. A plain value assertion does not retry, so the test never sees the later update.

The app is not at fault: the badge does show `1` a moment later. This is a **test defect**: a race between a one-time read and an asynchronous UI update.

## Symptom

```
Error: expect(received).toBe(expected) // Object.is equality
Expected: "1"
Received: "0"
```

The failure screenshot shows the product grid with the badge at `0`. The video shows it changing to `1` shortly after the test has already failed.

## Evidence

**1. Failure rate depends on API latency.** The broken test was run locally 30 times at each latency (`DRILL=1 CART_LATENCY_MS=<n> npx playwright test --project=drill --repeat-each=30`, Chromium, Windows 11):

| `CART_LATENCY_MS` | Failed | Failure rate |
| ---: | ---: | ---: |
| 0 | 0 / 30 | 0% |
| 10 | 14 / 30 | 47% |
| 50 | 28 / 30 | 93% |
| 400 | 30 / 30 | 100% |

At 0 ms (a developer laptop against localhost) the test **always passed**. That is how this kind of bug gets merged. At a realistic 10 to 50 ms it is a classic flaky test. At 400 ms it fails every time, which makes it a good drill.

**2. The trace shows the order of events** (HTML report › failed test › Trace):

1. `locator.click` on **Add to cart** completes. Playwright waits for the click to be dispatched, not for the network requests it starts.
2. Network tab: `POST /api/cart` is still pending.
3. `locator.textContent` on `cart-count` returns `"0"`. The DOM snapshot at that step shows the badge at `0`.
4. `expect.toBe` fails straight away. There is no retry, so there is no 5 s expect timeout.
5. About 400 ms later the `POST /api/cart` response arrives (201) and the badge changes to `1`, after the test has already failed.

**3. Retrying the test does not help** at 400 ms: both attempts fail the same way, so the failure is deterministic and not caused by the environment.

**4. The test-health analyzer** (`npm run analyze`) flags the test. At 10 ms latency across repeated runs it is reported as flaky. It suggests: *"Asserts on a value read once from the page, so the check never retries: use a web-first assertion"*. It finds this by reading the test source at the reported line.

## Root cause

```ts
await productsPage.addButton('Wireless Mouse').click();
const badge = await page.getByTestId('cart-count').textContent(); // read once
expect(badge).toBe('1');                                            // never retried
```

`textContent()` returns a snapshot of the DOM at that moment, and `expect(string)` is a plain value assertion. Together they turn an asynchronous condition ("the badge will show 1") into a one-time check of whatever is on screen right after the click.

### Contributing factors

- **No latency in local runs.** The app and the tests run on the same machine, so the API usually answers before the next Playwright command. The race was hidden.
- **The assertion looked correct.** `expect(...).toBe(...)` is valid Playwright code. Only the *kind* of assertion was wrong, so code review did not catch it.
- **It bypassed the page object.** `ProductsPage.addToCart()` already waits correctly for the badge (`await expect(cartCount).toHaveText(...)`). The test reimplemented the step inline.

## Fix

Use a web-first assertion, which retries until the condition holds or the expect timeout (5 s) runs out:

```ts
await productsPage.addButton('Wireless Mouse').click();
await expect(productsPage.shell.cartCount).toHaveText('1');
```

Verification: the `FIXED` variant passes at 400 ms latency (Actions › Failure drill › `variant: fixed`). The equivalent test in the main suite (`tests/web/cart.spec.ts`) uses `ProductsPage.addToCart()` and passes on every browser and OS in CI.

## Prevention

| Action | Where |
| --- | --- |
| Page objects wrap waits for asynchronous UI (for example `addToCart` waits for the badge), so tests do not rewrite them inline | `tests/web/pages/` |
| The review checklist asks for web-first assertions and no value-read-then-assert patterns (R6, plus manual item M3) | `genai/REVIEW_CHECKLIST.md` |
| The test-health analyzer detects `expect(await x.textContent())` and `const v = await x.textContent(); expect(v)` in failing or flaky tests | `tools/analyze-runs/analyze.ts` |
| The suite can be run against a slowed API by setting `CART_LATENCY_MS`, so timing assumptions show up before production does | `apps/web/src/server.ts`, `playwright.config.ts` |
| CI retries (2) plus flaky reporting: a test that only passes on retry shows up as *flaky* in the HTML report and in the test-health job summary instead of being hidden | `playwright.config.ts`, `.github/workflows/ci.yml` |

## How to read the drill artifacts

1. Open the failed **Failure drill** run › **Artifacts** › `failure-drill-report-broken`, and unzip it.
2. Run `npx playwright show-report playwright-report` (or open `playwright-report/index.html`).
3. Click the failed test. You will see the error, the failure screenshot, the video and the **trace** for each attempt.
4. In the trace, step through the actions. The *Network* tab shows `POST /api/cart` still pending at the `textContent` step.
5. `reports/test-health.md` in the same artifact is the analyzer's summary and suggested fix.
