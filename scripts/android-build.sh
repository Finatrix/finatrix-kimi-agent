#!/usr/bin/env bash
# Build the FinatriX Android app from the current web source.
#
#   scripts/android-build.sh debug                 # installable APK for testing
#   scripts/android-build.sh release 2 1.0.1       # signed AAB for Play (versionCode, versionName)
#
# Always rebuilds the web bundle first: the app ships the bundle inside the
# APK, so an Android build from a stale dist/ would silently ship old code.
# See docs/ANDROID.md.
set -euo pipefail

MODE="${1:-debug}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Capacitor 8 / AGP 8.13 need JDK 21. Use JAVA_HOME if it already is 21,
# otherwise the Homebrew or Android Studio copy.
java_major() { "$1/bin/java" -version 2>&1 | awk -F'"' '/version/ {split($2, v, "."); print v[1]}'; }
if [[ -z "${JAVA_HOME:-}" || "$(java_major "$JAVA_HOME" 2>/dev/null)" != "21" ]]; then
  for candidate in \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    if [[ -x "$candidate/bin/java" && "$(java_major "$candidate")" == "21" ]]; then
      export JAVA_HOME="$candidate"; break
    fi
  done
fi
if [[ "$(java_major "${JAVA_HOME:-/nonexistent}" 2>/dev/null)" != "21" ]]; then
  echo "JDK 21 not found. Install it with:  brew install openjdk@21" >&2
  exit 1
fi

npm run build
npx cap sync android

cd android
case "$MODE" in
  debug)
    ./gradlew assembleDebug
    echo
    echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
    echo "Install on a connected device/emulator:  adb install -r android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  release)
    VERSION_CODE="${2:?release needs a versionCode, e.g. scripts/android-build.sh release 2 1.0.1}"
    VERSION_NAME="${3:?release needs a versionName, e.g. 1.0.1}"
    if [[ ! -f keystore.properties ]]; then
      echo "android/keystore.properties is missing — run scripts/android-keystore.sh first." >&2
      exit 1
    fi
    ./gradlew bundleRelease -PfxVersionCode="$VERSION_CODE" -PfxVersionName="$VERSION_NAME"
    echo
    echo "AAB: android/app/build/outputs/bundle/release/app-release.aab  (v$VERSION_NAME, code $VERSION_CODE)"
    echo "Upload it in Play Console → Test and release → (track) → Create new release."
    ;;
  *)
    echo "Usage: scripts/android-build.sh debug | release <versionCode> <versionName>" >&2
    exit 1
    ;;
esac
