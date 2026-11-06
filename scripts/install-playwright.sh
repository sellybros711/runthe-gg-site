#!/usr/bin/env bash
# Playwright and its Chromium on a CI runner, bounded in time. The runner's apt mirror sometimes stalls
# on "apt-get update" with no timeout of its own: one Shut The Door job sat in this step for 30 minutes
# until the job's limit cancelled it (run 42118461675, frame, 2026-11-05), and others took 7 to 8. So apt
# gets network timeouts, and each try is cut at 4 minutes and tried again, three times at most (a
# healthy install takes under a minute).
#   bash scripts/install-playwright.sh            (the version the Shut The Door checks pin)
set -euo pipefail
VERSION="${1:-1.49.1}"
printf 'Acquire::http::Timeout "20";\nAcquire::https::Timeout "20";\nAcquire::Retries "3";\n' | sudo tee /etc/apt/apt.conf.d/99-ci-timeouts >/dev/null
npm install --no-save "playwright@${VERSION}"
for try in 1 2 3; do
  if timeout 240 npx playwright install --with-deps chromium; then exit 0; fi
  echo "::warning title=install-playwright::try ${try} of 3 failed or ran past 4 minutes"
done
exit 1
