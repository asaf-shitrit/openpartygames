#!/bin/sh
# Refreshes the Linux visual baselines for a pushed branch: runs the Visual baselines workflow
# on it (or reuses a finished run), copies the regenerated PNGs into
# e2e/layout/visual.spec.ts-snapshots/, and lists the diff images for the baselines that changed.
# Read those diffs, not the full snapshots, then commit only the PNGs that should have changed.
#
# Usage: scripts/pull-visual-baselines.sh <branch> [run-id]
set -eu

branch=${1:?usage: scripts/pull-visual-baselines.sh <branch> [run-id]}
run=${2:-}
snapshots=e2e/layout/visual.spec.ts-snapshots
out=.verify/visual

if [ -z "$run" ]; then
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run visual-baselines.yml --ref "$branch"
  while [ -z "$run" ]; do
    sleep 5
    run=$(gh run list --workflow visual-baselines.yml --branch "$branch" --event workflow_dispatch \
      --limit 1 --json databaseId,createdAt --jq ".[] | select(.createdAt >= \"$since\") | .databaseId")
  done
fi
echo "run $run"
# The run fails when the regenerated baselines are not stable; its artifacts are still worth reading.
gh run watch "$run" --exit-status >/dev/null || echo "run $run did not pass; see: gh run view $run"

rm -rf "$out"
gh run download "$run" --name visual-snapshots --dir "$out/snapshots"
gh run download "$run" --name visual-report --dir "$out/report" || true
cp "$out"/snapshots/*.png "$snapshots"/

echo "Baselines that changed:"
git status --short "$snapshots"
echo "Diff images against the committed baselines (changed pixels in red):"
find "$out/report/diffs-before" -name '*-diff.png' | sort
