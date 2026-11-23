#!/bin/bash
B="--browser-executable=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell --chrome-mode=headless-shell"
cd "$(dirname "$0")"
[ -f out/long.done ] && mv out/long.done out/long.done.old
npx remotion render src/index.ts LongCaptioned out/sunroot-2min-16x9-preview.mp4 --scale=0.5 --concurrency=4 $B > out/long1.log 2>&1
npx remotion render src/index.ts LongVerticalCaptioned out/sunroot-2min-9x16-preview.mp4 --scale=0.5 --concurrency=4 $B > out/long2.log 2>&1
echo done > out/long.done
