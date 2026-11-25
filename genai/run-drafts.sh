#!/usr/bin/env bash
# Runs each draft in its own Playwright run so one broken draft cannot hide the
# results of the others. Usage: genai/run-drafts.sh <drafts-dir> <results-dir>
# Writes <results-dir>/<slug>/results.json. Never fails: results are measurements.
set -u
drafts="$1"
out="$2"
mkdir -p "$out"
for file in "$drafts"/*.spec.ts; do
  slug="$(basename "$file" .spec.ts)"
  echo "::group::draft $slug"
  GENAI_DRAFTS_DIR="$drafts" REPORT_DIR="$out/$slug" npx playwright test --project=genai-drafts "$slug.spec.ts" \
    || echo "::notice::Draft $slug did not pass as written"
  echo "::endgroup::"
done
exit 0
