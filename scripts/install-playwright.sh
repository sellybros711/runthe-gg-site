#!/usr/bin/env bash
# Playwright and its Chromium on a CI runner, bounded in time. The runner's apt mirror sometimes stalls
# on "apt-get update" with no timeout of its own: one Shut The Door job sat in this step for 30 minutes
# until the job's limit cancelled it (run 42118461675, frame, 2026-11-05), and others took 7 to 8. So apt
# gets network timeouts (a stalled mirror fails in seconds, not minutes), and a try is tried again,
# three times at most. A try is cut only at 10 minutes: a slow but working mirror took over 4 (run
# 42162721505, camera-1), and the apt-get that a cut try leaves behind keeps the dpkg lock, so apt
# waits up to 10 minutes for that lock instead of failing the next try at once.
#
# THE CACHE (.github/actions/playwright, 2026-11-06: slow mirrors still ran the step to its 14 minute
# limit). The action restores ~/.cache/ms-playwright (the browser) and ~/.cache/pw-apt (the .deb files
# apt fetched for Chromium's system packages on this runner image) and sets PW_CACHED=true on a hit.
# Then the packages go in with dpkg from those files, nothing asks a mirror, and Chromium must launch;
# if it does not, the install below runs as before. On a miss apt keeps what it downloads in
# /var/cache/pw-apt, and the files are copied to ~/.cache/pw-apt for the action to save.
#   bash scripts/install-playwright.sh            (the version the Shut The Door checks pin)
set -euo pipefail
VERSION="${1:-1.49.1}"
KEEP="$HOME/.cache/pw-apt"
printf 'Acquire::http::Timeout "20";\nAcquire::https::Timeout "20";\nAcquire::Retries "3";\nDPkg::Lock::Timeout "600";\n' | sudo tee /etc/apt/apt.conf.d/99-ci-timeouts >/dev/null
npm install --no-save "playwright@${VERSION}"
launches() {
  timeout 120 node -e "require('playwright').chromium.launch().then((b) => b.close()).then(() => process.exit(0), (e) => { console.error(e.message.split('\n')[0]); process.exit(1); })"
}
if [ "${PW_CACHED:-}" = "true" ]; then
  if compgen -G "$KEEP/*.deb" >/dev/null; then
    sudo timeout 300 dpkg -i "$KEEP"/*.deb >/dev/null || echo "::warning title=install-playwright::dpkg of the cached packages did not finish cleanly"
  fi
  if launches; then echo "Playwright ${VERSION} and its packages from the cache"; exit 0; fi
  echo "::warning title=install-playwright::the cached Chromium did not launch, installing it"
fi
# apt keeps every package it downloads here, so they can be cached for the next run on this image
sudo mkdir -p /var/cache/pw-apt/partial
printf 'Dir::Cache::Archives "/var/cache/pw-apt/";\nAPT::Keep-Downloaded-Packages "true";\nBinary::apt::APT::Keep-Downloaded-Packages "true";\n' | sudo tee /etc/apt/apt.conf.d/99-ci-keep >/dev/null
for try in 1 2 3; do
  if timeout 600 npx playwright install --with-deps chromium; then
    mkdir -p "$KEEP"
    if compgen -G "/var/cache/pw-apt/*.deb" >/dev/null; then cp /var/cache/pw-apt/*.deb "$KEEP"/; fi
    echo "kept $(ls "$KEEP" | wc -l) packages for the cache"
    exit 0
  fi
  echo "::warning title=install-playwright::try ${try} of 3 failed or ran past 10 minutes"
done
exit 1
