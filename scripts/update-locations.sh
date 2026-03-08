#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_FILE="${1:-$ROOT_DIR/data/locations.yaml}"
OUTPUT_FILE="${2:-$ROOT_DIR/data/locations.js}"

node "$ROOT_DIR/scripts/generate-locations.js" \
  --input "$INPUT_FILE" \
  --output "$OUTPUT_FILE"
