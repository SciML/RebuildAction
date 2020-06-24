# RebuildAction

A GitHub Action + GitLab CI pipeline for rebuilding content.

## Setup

First, import your project into JuliaGPU on GitLab as described [here](https://github.com/JuliaGPU/gitlab-ci).

Next, add a `.gitlab-ci.yml` file to your repository with the following contents:

```yml
include: https://raw.githubusercontent.com/SciML/RebuildAction/master/rebuild.yml
variables:
  CONTENT_DIR: mycontent  # Directory holding your source content.
  GITHUB_REPOSITORY: Owner/Repo  # GitHub user/repository name (no .git).
  # The following are optional.
  JULIA_PACKAGE: Repo  # Name of the Julia package if your package and repo names are different.
  EXCLUDE: folder/file1, folder/file2  # Content to not rebuild automatically.
  NEEDS_GPU: folder/file1, folder/file2  # Content that needs a GPU to build.
  GPU_TAG: gpu  # Tag added to GPU jobs (default is 'nvidia').
  TAGS: tag1, tag2  # Tags to add to all rebuild jobs.
```

Now, add a `.github/workflows/rebuild.yml` file with the following contents:

```yml
name: Rebuild Content
on:
  schedule:
    - cron: 0 0 */3 * *
  issue_comment:
    types:
      - created
  push:
env:
  GITLAB_PROJECT: ${{ secrets.GITLAB_PROJECT }}
  GITLAB_TOKEN: ${{ secrets.GITLAB_TOKEN }}
jobs:
  Rebuild:
    runs-on: ubuntu-latest
    steps:
      - uses: SciML/RebuildAction@master
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

Next, generate an SSH key pair with `ssh-keygen`.
Add the public key as a deploy key with write permissions to your GitHub repo.
Then, add the private key as a [File environment variable](https://docs.gitlab.com/ee/ci/variables/README.html#custom-environment-variables-of-type-file) with the name `SSH_KEY` in GitLab.

Now, find your GitLab project ID and add it as a GitHub secret called `GITLAB_PROJECT`.

Then create a Gitlab [pipeline trigger](https://docs.gitlab.com/ee/ci/triggers/#adding-a-new-trigger) and add the token as a GitHub secret called `GITLAB_TOKEN`.

Once all that is done, a random piece of content will be rebuilt and a PR will be opened
every 3 days. You can also manually rebuild by creating an issue comment:

```
!rebuild  # Rebuild a random piece of content.
!rebuild folder  # Rebuild all of the content in this folder.
!rebuild folder/file  # Rebuild just this one piece.
```

The updated contents will be pushed to a new branch and a pull request will be opened automatically.
If you make this comment on an open pull request, the updated content will be pushed to that branch.
