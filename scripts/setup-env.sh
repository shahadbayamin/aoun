#!/usr/bin/env bash
# Creates .env with fresh random encryption keys (run once).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env already exists — leaving it unchanged"; exit 0; fi
k() { openssl rand -base64 32; }
sed -e "s#^STORAGE_ENCRYPTION_KEY=.*#STORAGE_ENCRYPTION_KEY=\"$(k)\"#" \
    -e "s#^IDENTITY_PEPPER=.*#IDENTITY_PEPPER=\"$(k)\"#" \
    -e "s#^SECRETS_ENCRYPTION_KEY=.*#SECRETS_ENCRYPTION_KEY=\"$(k)\"#" .env.example > .env
echo "Created .env with new random keys."
