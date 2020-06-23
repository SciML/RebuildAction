#!/usr/bin/env bash

set -euxo pipefail

git checkout "$FROM"

julia -e "
  using Pkg
  Pkg.instantiate()
  using $PACKAGE: weave_file
  weave_file(\"$FOLDER\", \"$FILE\")"

if [[ -z "$(git status -suno)" ]]; then
  echo "No changes"
  exit 0
fi

k="$(cat $SSH_KEY)"
echo "$k" > "$SSH_KEY"
chmod 400 "$SSH_KEY"
git config core.sshCommand "ssh -o StrictHostKeyChecking=no -i $SSH_KEY"
git config user.name "github-actions[bot]"
git config user.email "actions@github.com"
git stash -u
git checkout "$TO" 2> /dev/null || git checkout -b "$TO"
git remote add github "git@github.com:$GITHUB_REPOSITORY.git"
git pull github "$TO" || true
git stash pop
git commit -am "Rebuild $FOLDER/$FILE"
git push github "$TO"
