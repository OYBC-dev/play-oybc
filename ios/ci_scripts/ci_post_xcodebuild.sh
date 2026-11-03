#!/bin/sh
# DIAGNOSTIC v2 (temporary): map the TEST machine's copy of the repository.
# Run 18 showed: no .git on the test machine, CI_PRIMARY_REPOSITORY_PATH unset,
# and ios/PlayOYBCSnapshotTests/__Snapshots__ absent until the tests wrote it.
set -u
R=/Volumes/workspace/repository
echo "action=${CI_XCODEBUILD_ACTION:-?} repo_env=${CI_PRIMARY_REPOSITORY_PATH:-unset}"
echo "--- top level"; ls -la "$R" 2>&1 | head -40
echo "--- du per top-level dir"; du -sh "$R"/*/ 2>/dev/null | sort -h
echo "--- file count"; find "$R" -type f 2>/dev/null | wc -l
echo "--- ios/"; ls -la "$R/ios" 2>&1
echo "--- ios/PlayOYBCSnapshotTests"; ls -la "$R/ios/PlayOYBCSnapshotTests" 2>&1
echo "--- ios/PlayOYBC (plist present?)"; ls "$R/ios/PlayOYBC" 2>&1 | head -30
echo "--- generated project present?"; ls "$R/ios/PlayOYBC.xcodeproj" 2>&1
echo "--- any png anywhere in repo copy (first 10)"; find "$R" -name '*.png' 2>/dev/null | head -10
echo "--- png count"; find "$R" -name '*.png' 2>/dev/null | wc -l
echo "--- other large/binary files in copy"; find "$R" -type f -size +100k 2>/dev/null | head -20
echo "--- workspace root"; ls -la /Volumes/workspace 2>&1 | head -30
exit 0
