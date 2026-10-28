#!/bin/sh
# Xcode Cloud post-clone hook (runs on Apple's CI before xcodebuild).
#
# 1. Materialize the gitignored GoogleService-Info.plist from the
#    GOOGLE_SERVICE_INFO_PLIST_B64 secret set in the workflow's Environment:
#      base64 -i ios/PlayOYBC/GoogleService-Info.plist | pbcopy
#    Written BEFORE the project is generated: xcodegen silently drops a
#    resource reference whose file is absent, and an app built without the
#    plist crashes at launch.
# 2. Generate PlayOYBC.xcodeproj with the pinned XcodeGen release (2026-10-28,
#    oybc#688). project.pbxproj is NOT tracked any more — it conflicted on
#    every pair of PRs that touched the project and forced a re-sync push (and
#    a CI run) per merge. project.yml + the file tree are the source of truth;
#    GitHub's `ios-hosted` job and every local checkout generate the same way.
#    Keep XCODEGEN_VERSION / XCODEGEN_ZIP_SHA256 equal to
#    .github/workflows/ci.yml. The committed Package.resolved is untouched.
# 3. Stamp the build number from CI_BUILD_NUMBER so every upload is unique
#    (after generation, which would overwrite it). MARKETING_VERSION stays
#    repo-managed in project.yml.
# 4. Re-resolve packages with this machine's Xcode. swift-custom-dump ships a
#    Package@swift-6.1.swift that names its dependency xctest-dynamic-overlay
#    while its Package.swift names it swift-issue-reporting, so the committed
#    Package.resolved only matches one toolchain range. Resolving here keeps
#    every existing pin and only adds what this toolchain's graph needs.
set -eu

REPO="${CI_PRIMARY_REPOSITORY_PATH:?not running under Xcode Cloud}"
IOS="$REPO/ios"
PLIST="$IOS/PlayOYBC/GoogleService-Info.plist"
PBXPROJ="$IOS/PlayOYBC.xcodeproj/project.pbxproj"
XCODEGEN_VERSION="2.45.4"
XCODEGEN_ZIP_SHA256="090ec29491aad50aec10631bf6e62253fed733c50f3aab0f5ffc86bc170bdbef"

# 1. plist
if [ -z "${GOOGLE_SERVICE_INFO_PLIST_B64:-}" ]; then
  echo "error: GOOGLE_SERVICE_INFO_PLIST_B64 is not set in the Xcode Cloud workflow environment." >&2
  exit 1
fi
printf '%s' "$GOOGLE_SERVICE_INFO_PLIST_B64" | base64 --decode > "$PLIST"
plutil -lint "$PLIST"
echo "GoogleService-Info.plist materialized."

# 2. project
XCODEGEN_DIR="${TMPDIR:-/tmp}/xcodegen-install"
mkdir -p "$XCODEGEN_DIR"
curl -sSL -o "$XCODEGEN_DIR/xcodegen.zip" \
  "https://github.com/yonaskolb/XcodeGen/releases/download/${XCODEGEN_VERSION}/xcodegen.zip"
computed_sha256=$(shasum -a 256 "$XCODEGEN_DIR/xcodegen.zip" | awk '{print $1}')
if [ "$computed_sha256" != "$XCODEGEN_ZIP_SHA256" ]; then
  echo "error: xcodegen.zip checksum mismatch: expected $XCODEGEN_ZIP_SHA256, got $computed_sha256" >&2
  exit 1
fi
unzip -q -o "$XCODEGEN_DIR/xcodegen.zip" -d "$XCODEGEN_DIR"
(cd "$IOS" && "$XCODEGEN_DIR/xcodegen/bin/xcodegen" generate)
if ! grep -q 'GoogleService-Info.plist in Resources' "$PBXPROJ"; then
  echo "error: generated project.pbxproj has no GoogleService-Info.plist resource reference; the app would crash at launch." >&2
  exit 1
fi
echo "PlayOYBC.xcodeproj generated (xcodegen ${XCODEGEN_VERSION})."

# 3. build number
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9][0-9]*;/CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};/g" "$PBXPROJ"
echo "CURRENT_PROJECT_VERSION stamped to ${CI_BUILD_NUMBER}."

# 4. packages — Xcode Cloud disables package resolution globally; lift that for
# this one resolve so the pins can be brought in line, then the build runs as usual.
xcodebuild -version
swift --version
defaults write com.apple.dt.Xcode IDEPackageOnlyUseVersionsFromResolvedFile -bool NO
defaults write com.apple.dt.Xcode IDEDisableAutomaticPackageResolution -bool NO
xcodebuild -resolvePackageDependencies -project "$IOS/PlayOYBC.xcodeproj" -scheme PlayOYBC
echo "Package dependencies resolved."
