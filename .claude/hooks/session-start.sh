#!/bin/bash
set -euo pipefail

# Only run in Claude Code remote (web) sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Verify Node.js is available (required for tests and scripts)
if ! command -v node &>/dev/null; then
  echo "ERROR: node is not installed. Install Node.js >= 18 to run tests." >&2
  exit 1
fi

echo "Node.js $(node --version) available"
echo "Session start hook complete."
