#!/bin/bash
B="--browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell --chrome-mode=headless-shell"
cd "$(dirname "$0")"
rm_done() { [ -f out/previews.done ] && mv out/previews.done out/previews.done.old; }
rm_done
r() { npx remotion render src/index.ts "$1" "out/$2.mp4" --scale=0.5 --concurrency=4 $B > "out/$2.log" 2>&1; }
r FilmCaptioned sunroot-60s-16x9-preview
r FilmVerticalCaptioned sunroot-60s-9x16-preview
r Film30 sunroot-30s-16x9-preview
r Film30Vertical sunroot-30s-9x16-preview
r Film15 sunroot-15s-16x9-preview
r Film15Vertical sunroot-15s-9x16-preview
echo done > out/previews.done
