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

Results: see the job summary of the latest *GenAI (local model)* run. The numbers are added here after the first run.
