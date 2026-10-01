#!/usr/bin/env bash
# Create the Google Play UPLOAD key for FinatriX and the (gitignored)
# android/keystore.properties that release builds sign with.
#
# Run once, by the account owner. With Play App Signing (the default for new
# apps), Google holds the real app-signing key; this key only proves uploads
# come from you, and Google can reset it if it is ever lost. Still: back up
# the .jks file and both passwords somewhere safe (a password manager), and
# never commit them — android/.gitignore excludes both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEYSTORE="$ROOT/android/finatrix-upload.jks"
PROPS="$ROOT/android/keystore.properties"
ALIAS="finatrix-upload"

if [[ -e "$KEYSTORE" || -e "$PROPS" ]]; then
  echo "An upload keystore already exists ($KEYSTORE). Refusing to overwrite it." >&2
  exit 1
fi

#   scripts/android-keystore.sh                     # choose the password yourself
#   scripts/android-keystore.sh --generate-password # 32 random bytes, never printed
# The generated password exists only in android/keystore.properties (mode 600),
# which is exactly where a typed one ends up too — back up that file with the .jks.
if [[ "${1:-}" == "--generate-password" ]]; then
  STOREPASS="$(openssl rand -base64 32 | tr -d '\n=+/')"
  [[ ${#STOREPASS} -ge 32 ]] || { echo "Could not generate a password." >&2; exit 1; }
else
  read -r -s -p "Choose a keystore password (min 6 chars): " STOREPASS; echo
  read -r -s -p "Repeat it: " STOREPASS2; echo
  [[ "$STOREPASS" == "$STOREPASS2" && ${#STOREPASS} -ge 6 ]] || { echo "Passwords differ or are too short." >&2; exit 1; }
fi

# Passwords go through the environment (:env), never argv, so they do not
# show up in `ps` while keytool runs.
export FX_KS_PASS="$STOREPASS"
umask 077
keytool -genkeypair \
  -keystore "$KEYSTORE" -storetype PKCS12 \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass:env FX_KS_PASS -keypass:env FX_KS_PASS \
  -dname "CN=FinatriX, O=FinatriX, C=IN"

cat > "$PROPS" <<EOF
storeFile=finatrix-upload.jks
storePassword=$STOREPASS
keyAlias=$ALIAS
keyPassword=$STOREPASS
EOF

echo
echo "Created $KEYSTORE and $PROPS (both gitignored)."
echo "Back up the .jks and the password now. Upload-key fingerprint:"
keytool -list -v -keystore "$KEYSTORE" -storepass:env FX_KS_PASS -alias "$ALIAS" | grep -E "SHA256:"
