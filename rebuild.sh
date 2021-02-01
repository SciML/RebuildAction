#!/usr/bin/env bash

set -euo pipefail

k="$(cat $SSH_KEY)"
echo "$k" > "$SSH_KEY"
set -x
chmod 400 "$SSH_KEY"
git config core.sshCommand "ssh -o StrictHostKeyChecking=no -i $SSH_KEY"
git remote add github "git@github.com:$GITHUB_REPOSITORY.git" 2> /dev/null || true
git fetch github
git config user.name "github-actions[bot]"
git config user.email "actions@github.com"

if [[ "${1:-}" == "done" ]]; then
  branch="$TO-done"
  git checkout -b "$branch"
  git commit --allow-empty -m "$BUILDKITE_BUILD_URL"
  git push github "$branch"
  sleep 10
  git push --delete github "$branch"
else
  git checkout "github/$FROM"

  julia --project -e 'using Pkg; Pkg.instantiate()'
  julia --project="$CONTENT_DIR/$FOLDER" -e 'using Pkg; Pkg.instantiate()'
  JULIA_LOAD_PATH="$(pwd):${JULIA_LOAD_PATH:-}" julia -e "
    using $PACKAGE: weave_file
    weave_file(\"$FOLDER\", \"$FILE\")"

  if [[ -z "$(git status -s)" ]]; then
    echo "No changes"
    exit 0
  fi

  branch="$(head -c8 /dev/urandom | md5sum | cut -d' ' -f1)"
  git stash -u
  git checkout -b "$branch" "github/$TO" 2> /dev/null || git checkout -b "$branch"
  git pull github "$TO" 2> /dev/null || true
  git stash pop
  git add .
  git commit -m "Rebuild $FOLDER/$FILE"
  git push github "$branch:$TO"
fi
