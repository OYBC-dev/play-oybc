#!/bin/sh
# DIAGNOSTIC (temporary): what does the Xcode Cloud TEST machine's checkout look like?
# The first "PR Tests" run reported every snapshot baseline as missing on disk while
# the same files pass on OYBC's Xcode Cloud runs and on the GitHub macOS runner.
set -u
echo "action=${CI_XCODEBUILD_ACTION:-?} repo=${CI_PRIMARY_REPOSITORY_PATH:-?} branch=${CI_BRANCH:-?} commit=${CI_COMMIT:-?} pr=${CI_PULL_REQUEST_NUMBER:-?}"
env | grep -E '^CI_(GIT|PULL|TAG|BRANCH|COMMIT|WORKFLOW|XCODE_SCHEME|PRODUCT|TEST)' | sort || true
R="${CI_PRIMARY_REPOSITORY_PATH:-/Volumes/workspace/repository}"
echo "--- git state"; git -C "$R" rev-parse HEAD 2>&1 || true; git -C "$R" status --short 2>&1 | head -20 || true
echo "--- tracked baselines per git:"; git -C "$R" ls-files 'ios/PlayOYBCSnapshotTests/__Snapshots__' 2>&1 | wc -l
echo "--- on disk:"; ls -la "$R/ios/PlayOYBCSnapshotTests/__Snapshots__/ScreenSnapshotTests" 2>&1 | head -8
echo "--- any testHome.light.png under /Volumes/workspace:"; find /Volumes/workspace -name 'testHome.light.png' -not -path '*/DerivedData/*' 2>/dev/null | head -5
exit 0
