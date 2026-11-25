# GenAI helper: measured evaluation

The helper turns each user story in `genai/stories/` into a draft Playwright test (`genai/drafts/<adapter>/`). A person then reviews each draft against [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) and commits the accepted version to `tests/web/generated/`. `npm run genai:evaluate` measures the distance between every draft and its accepted version:

- **Needed changes**: the draft and the accepted test differ after normalisation (comments, blank lines and the fixtures import path are ignored).
- **Lines changed**: lines added plus lines removed (LCS line diff).
- **Checklist**: the automated checks R1 to R8.
- **Executed as drafted**: the raw draft run against the app (`genai-drafts` Playwright project).

CI repeats the measurement on every push (job **GenAI drafts · mock adapter**, written to the job summary and the `genai-evaluation-mock` artifact).

## Mock adapter (deterministic, default in CI)

| Metric | Value |
| --- | --- |
| Stories drafted | 7 |
| Drafts accepted unchanged | 4 (57%) |
| **Drafts that needed changes** | **3 (43%)** |
| Lines changed during review | 13 of 72 draft lines (18%) |
| Drafts passing the automated checklist | 4 of 7 (57%) |
| Raw drafts passing when executed | 7 of 7 (100%) |

| Story | Executed as drafted | Checklist failures | Lines changed | Needed changes |
| --- | --- | --- | ---: | --- |
| checkout-happy-path | passed | none | 0 | no |
| free-shipping | passed | none | 0 | no |
| login-error | passed | R4, R5, R7 | 3 | yes |
| out-of-stock | passed | R4, R5 | 7 | yes |
| quantity-subtotal | passed | R4, R5 | 3 | yes |
| remove-from-cart | passed | none | 0 | no |
| search-products | passed | none | 0 | no |

**Main finding:** every raw draft passed, but three of them did not test the full story. When the adapter could not map a step it left a `TODO`, so a *Then* step had no assertion and the draft passed without checking it. The `out-of-stock` draft checked nothing at all. "Green" is not the same as "reviewed". This is why R4 and R5 are automated and why manual item M4 (watch the test fail at least once) is on the checklist.

## Local open model (Ollama, optional workflow)

The **GenAI (local model)** workflow installs Ollama on the runner, pulls a small open-weights model at run time (default `qwen2.5-coder:1.5b`), drafts the same seven stories and evaluates the drafts against the same accepted tests. No API key, account or secret is involved.

Measured in run [45673880607](https://github.com/hamza2829/playwright-e2e-lab/actions/runs/45673880607) with  (temperature 0, seed 42, CPU-only GitHub runner):

| Metric | Mock adapter | qwen2.5-coder:1.5b |
| --- | --- | --- |
| Drafts that needed changes | 3 of 7 (43%) | **7 of 7 (100%)** |
| Lines changed during review | 13 of 72 (18%) | 61 of 82 (74%) |
| Drafts passing the automated checklist | 4 of 7 | 5 of 7 |
| Raw drafts passing when executed | 7 of 7 | **0 of 7** |

| Story | Executed as drafted | Checklist failures | Lines changed |
| --- | --- | --- | ---: |
| checkout-happy-path | error (did not load) | R2, R3 (no test() call) | 9 |
| free-shipping | failed | none | 6 |
| login-error | failed | none | 9 |
| out-of-stock | failed | none | 10 |
| quantity-subtotal | failed | R3 (2 tests for 1 scenario) | 13 |
| remove-from-cart | failed | none | 6 |
| search-products | failed | none | 8 |

**What went wrong:** the drafts *look* right. They use the fixtures, tags and page objects, and five of seven pass the automated checklist. But the model invents page-object methods that do not exist (for example  instead of ). It also asserts the wrong field (subtotal instead of total) and once produced a file without a valid test. Every draft failed or errored when executed.

So the two adapters fail in opposite ways. The mock is safe about the API but silently skips steps it does not know. The small model covers every step but invents API calls. Each failure is caught by a different safeguard: the checklist (R4, R5) for the mock, and running the draft (checklist item M4) for the model. Neither replaces review. A typed API reference in the prompt, or feeding  errors back to the model, are the obvious next experiments.
