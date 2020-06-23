#!/usr/bin/env bash

set -euo pipefail

k="$(cat $SSH_KEY)"
echo "$k" > "$SSH_KEY"
set -x
chmod 400 "$SSH_KEY"
git config core.sshCommand "ssh -o StrictHostKeyChecking=no -i $SSH_KEY"
git remote add github "git@github.com:$GITHUB_REPOSITORY.git" 2> /dev/null || true
git fetch github
git checkout "$FROM"

julia -e "
  pushfirst!(LOAD_PATH, \"@.\")
  using Pkg
  Pkg.instantiate()
  using $PACKAGE: weave_file
  weave_file(\"$FOLDER\", \"$FILE\")"

if [[ -z "$(git status -suno)" ]]; then
  echo "No changes"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "actions@github.com"
git stash -u
git checkout "$TO" 2> /dev/null || git checkout -b "$TO"
git pull github "$TO" 2> /dev/null || true
git stash pop
git commit -am "Rebuild $FOLDER/$FILE"
git push github "$TO"
