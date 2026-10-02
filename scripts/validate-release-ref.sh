#!/usr/bin/env bash
# Run from the trusted workflow revision before checking out candidate code.
set -euo pipefail

candidate=${1:-}
if ! [[ "$candidate" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release revision must be a full, lowercase 40-character commit SHA." >&2
  exit 1
fi

resolved=$(git rev-parse --verify "${candidate}^{commit}")
if [ "$resolved" != "$candidate" ] || \
   ! git merge-base --is-ancestor "$resolved" refs/remotes/origin/main; then
  echo "Release revision must identify a commit already on origin/main." >&2
  exit 1
fi

# Never print user input before validation; callers use this in GITHUB_OUTPUT.
printf '%s\n' "$resolved"
