#!/usr/bin/env bash
# Build, and separately upload, a signed App Store build of the FinatriX iOS app.
#
#   scripts/ios-release.sh archive          # signed archive + .ipa from the committed source
#   scripts/ios-release.sh upload <dir>     # send that archive to App Store Connect
#
# The two steps are separate on purpose: an archive can be inspected (its
# entitlements, its bundle, its commit) before anything leaves the machine,
# and an upload consumes the build number for good.
#
# The version comes from Xcode (MARKETING_VERSION / CURRENT_PROJECT_VERSION in
# project.pbxproj), so the number in App Store Connect is the number in git.
# Signing is automatic, with the team passed here rather than committed — see
# docs/IOS.md §5. The output folder is gitignored; it holds the archive, the
# .ipa, the exact commit and SHA-256 sums. See docs/IOS.md §7.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEAM="${APPLE_TEAM_ID:-AY79GYWLDP}"
PROJECT="ios/App/App.xcodeproj"

export_options() { # $1 = export | upload
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$1</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
}

build_setting() {
  xcodebuild -project "$PROJECT" -scheme App -configuration Release -showBuildSettings 2>/dev/null \
    | awk -v key="$1" '$1 == key { print $3; exit }'
}

archive() {
  # A store build is reproducible only from a commit. An uncommitted edit would
  # ship in the binary while appearing nowhere in the history.
  if [[ -n "$(git status --porcelain)" && "${FX_ALLOW_DIRTY:-}" != "1" ]]; then
    echo "The working tree has uncommitted changes. Commit them first (or FX_ALLOW_DIRTY=1 for a throwaway build)." >&2
    git status --short >&2
    exit 1
  fi

  # Install first: the Apple-flag check below loads Vite to read .env, and a
  # fresh worktree has no node_modules until this runs.
  if [[ "${FX_CLEAN_INSTALL:-}" == "1" ]]; then npm ci; fi

  # VITE_* is inlined at build time and a missing value fails nothing. On iOS the
  # Apple flag decides whether ANY third-party sign-in is offered (src/lib/
  # authProviders.ts), so it must be a decision, not an accident of the shell.
  local apple
  apple="$(node --input-type=module -e "import { loadEnv } from 'vite'; process.stdout.write(process.env.VITE_AUTH_APPLE ?? loadEnv('production', process.cwd(), 'VITE_').VITE_AUTH_APPLE ?? '')")"
  if [[ "$apple" != "1" && "${FX_IOS_NO_APPLE:-}" != "1" ]]; then
    echo "VITE_AUTH_APPLE is not 1, so this build would offer email sign-in only." >&2
    echo "Set it in .env once the Apple provider works (scripts/configure-apple-signin.mjs --check)," >&2
    echo "or FX_IOS_NO_APPLE=1 to build without Apple and Google on purpose." >&2
    exit 1
  fi

  npm run build
  npx cap sync ios

  local version build out
  version="$(build_setting MARKETING_VERSION)"
  build="$(build_setting CURRENT_PROJECT_VERSION)"
  out="ios/release-candidates/$version-$build"
  if [[ -e "$out" ]]; then
    echo "$out already exists. Build $build may already be uploaded — raise CURRENT_PROJECT_VERSION." >&2
    exit 1
  fi
  mkdir -p "$out"

  xcodebuild -project "$PROJECT" -scheme App -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$out/FinatriX.xcarchive" \
    -allowProvisioningUpdates -skipMacroValidation DEVELOPMENT_TEAM="$TEAM" \
    archive | tee "$out/archive.log" | grep -E '^(\*\*|error:)' || true
  [[ -d "$out/FinatriX.xcarchive" ]] || { echo "Archive failed — see $out/archive.log" >&2; exit 1; }

  export_options export > "$out/ExportOptions.plist"
  xcodebuild -exportArchive -archivePath "$out/FinatriX.xcarchive" -exportPath "$out" \
    -exportOptionsPlist "$out/ExportOptions.plist" -allowProvisioningUpdates \
    | tee "$out/export.log" | grep -E '^(\*\*|error:)' || true
  ls "$out"/*.ipa >/dev/null 2>&1 || { echo "Export failed — see $out/export.log" >&2; exit 1; }

  local app="$out/FinatriX.xcarchive/Products/Applications/App.app"
  {
    echo "commit:  $(git rev-parse HEAD)"
    echo "version: $version ($build)"
    echo "team:    $TEAM"
    echo "apple:   VITE_AUTH_APPLE=${apple:-unset}"
    echo "xcode:   $(xcodebuild -version | tr '\n' ' ')"
    echo "signer:  $(codesign -dvv "$app" 2>&1 | awk -F= '/^Authority/ { print $2; exit }')"
  } > "$out/BUILD-INFO.txt"
  codesign -d --entitlements - --xml "$app" 2>/dev/null | plutil -convert xml1 -o "$out/entitlements.plist" -
  (cd "$out" && shasum -a 256 ./*.ipa > SHA256SUMS)

  cat "$out/BUILD-INFO.txt"
  echo
  echo "Archive: $out/FinatriX.xcarchive"
  echo "Upload:  scripts/ios-release.sh upload $out"
}

upload() {
  local out="${1:?upload needs the release-candidate folder, e.g. ios/release-candidates/1.0.0-1}"
  [[ -d "$out/FinatriX.xcarchive" ]] || { echo "No archive in $out" >&2; exit 1; }
  export_options upload > "$out/ExportOptions-upload.plist"
  xcodebuild -exportArchive -archivePath "$out/FinatriX.xcarchive" -exportPath "$out/upload" \
    -exportOptionsPlist "$out/ExportOptions-upload.plist" -allowProvisioningUpdates \
    2>&1 | tee "$out/upload.log" | grep -E '^(\*\*|error:)|Upload|uploaded' || true
  grep -q 'EXPORT SUCCEEDED' "$out/upload.log" || { echo "Upload failed — see $out/upload.log" >&2; exit 1; }
  echo "Uploaded. App Store Connect processes the build before it appears in TestFlight."
}

case "${1:-}" in
  archive) archive ;;
  upload) upload "${2:-}" ;;
  *) echo "Usage: scripts/ios-release.sh archive | upload <release-candidate folder>" >&2; exit 1 ;;
esac
