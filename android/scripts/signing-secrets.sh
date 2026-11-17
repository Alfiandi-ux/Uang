#!/usr/bin/env bash
# Cetak nilai yang dibutuhkan untuk GitHub Secrets.
# Jalankan dari mana saja: ./android/scripts/signing-secrets.sh
set -euo pipefail

cd "$(dirname "$0")/.."

KEYSTORE="keystore/release.jks"
PROPS="keystore.properties"

if [ ! -f "$KEYSTORE" ] || [ ! -f "$PROPS" ]; then
  echo "Keystore atau keystore.properties tidak ditemukan di android/." >&2
  echo "Buat dulu kuncinya, lalu isi android/keystore.properties." >&2
  exit 1
fi

get_prop() {
  grep -E "^$1=" "$PROPS" | head -n1 | cut -d= -f2-
}

STORE_PASSWORD="$(get_prop storePassword)"
KEY_ALIAS="$(get_prop keyAlias)"
KEY_PASSWORD="$(get_prop keyPassword)"

echo "UANG_KEYSTORE_BASE64=$(base64 -w0 "$KEYSTORE")"
echo "UANG_KEYSTORE_PASSWORD=$STORE_PASSWORD"
echo "UANG_KEY_ALIAS=$KEY_ALIAS"
echo "UANG_KEY_PASSWORD=$KEY_PASSWORD"
