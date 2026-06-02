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

# Install dependencies so the test suite can run. The Three.js-dependent
# tests import the `three` package via js/three-context.js; without an
# install they silently fail to load. Fresh web containers start with no
# node_modules, so install on first session start.
if [ ! -d node_modules ]; then
  echo "Installing dependencies (npm ci)..."
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  echo "Dependencies installed."
fi

echo "Session start hook complete."
