import os
import sys

from random import choice

import yaml


def env_list(k):
    return [s.strip() for s in os.getenv(k, "").split(",") if s]


folder = os.environ["FOLDER"]
file = os.environ["FILE"]
# TODO: If folder is set but not file, build everything in folder.
if not folder or not file:
    cwd = os.getcwd()
    os.chdir(os.environ["CONTENT_DIR"])
    exclude = env_list("EXCLUDE")
    dirs = [d for d in os.listdir() if os.path.isdir(d)]
    choices = [
        (d, f) for d in dirs for f in os.listdir(d)
        if f.endswith(".jmd") and f"{d}/{f}" not in exclude
    ]
    folder, file = choice(choices)
    os.chdir(cwd)

tags = env_list("TAGS")
if f"{folder}/{file}" in env_list("NEEDS_GPU"):
    tags.append("nvidia")

package = os.environ["GITHUB_REPOSITORY"].split("/")[1]
if package.endswith(".jl"):
    package = package[:-3]

script_env = {
    "FILE": file,
    "FOLDER": folder,
    "FROM": os.environ["FROM"],
    "PACKAGE": package,
    "TO": os.environ["TO"],
}
script = "\n".join(f"export {k}={v}" for (k, v) in script_env.items())
script += """
curl -LO https://raw.githubusercontent.com/SciML/RebuildAction/dev/gitlab/rebuild.sh
bash rebuild.sh
"""

pipeline = {
    "include": "https://raw.githubusercontent.com/SciML/RebuildAction/dev/gitlab/parent.yml",
    "rebuild": {
        "extends": ".julia:1.4",
        "variables": {
            "CI_APT_INSTALL": "curl gfortran git python3-dev texlive-science texlive-xetex",
            "JULIA_NUM_THREADS": 4,
        },
        "tags": tags,
        "script": script,
    },
}

yaml.dump(pipeline, sys.stdout)
