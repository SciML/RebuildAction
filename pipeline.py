import os
import sys

from random import choice

import yaml


def env_list(k):
    return [s.strip() for s in os.getenv(k, "").split(",") if s]


gpu_tag = os.getenv("GPU_TAG", "nvidia")
exclude = [x if x.endswith(".jmd") else f"{x}.jmd" for x in env_list("EXCLUDE")]
needs_gpu = [x if x.endswith(".jmd") else f"{x}.jmd" for x in env_list("NEEDS_GPU")]
tags = env_list("TAGS")

package = os.getenv("JULIA_PACKAGE")
if not package:
    package = os.environ["GITHUB_REPOSITORY"].split("/")[1]
    if package.endswith(".jl"):
        package = package[:-3]


def make_job(folder, file):
    job_tags = tags.copy()
    if f"{folder}/{file}" in needs_gpu:
        job_tags.append(gpu_tag)
    script_env = {
        "FILE": file,
        "FOLDER": folder,
        "FROM": os.environ["FROM"],
        "PACKAGE": package,
        "TO": os.environ["TO"],
    }
    script = "\n".join(f"export {k}={v}" for (k, v) in script_env.items())
    script += """
    wget https://raw.githubusercontent.com/SciML/RebuildAction/master/rebuild.sh
    bash rebuild.sh
    """
    return {
        "extends": ".julia:1.4",
        "variables": {
            "CI_APT_INSTALL": "gfortran git python3-dev texlive-full",
            "JULIA_NUM_THREADS": 4,
        },
        "tags": job_tags,
        "script": script,
    }


jobs = []
cwd = os.getcwd()
os.chdir(os.environ["CONTENT_DIR"])
folder = os.getenv("FOLDER")
file = os.getenv("FILE")
if folder and file:
    jobs.append((folder, file))
elif folder and not file:
    files = [
        f for f in os.listdir(folder)
        if f.endswith(".jmd") and f"{folder}/{f}" not in exclude
    ]
    jobs.extend((folder, f) for f in files)
else:
    dirs = [d for d in os.listdir() if os.path.isdir(d)]
    choices = [
        (d, f) for d in dirs for f in os.listdir(d)
        if f.endswith(".jmd") and f"{d}/{f}" not in exclude
    ]
    jobs.append(choice(choices))
os.chdir(cwd)


pipeline = {
    f"rebuild-{folder}-{file}": make_job(folder, file)
    for (folder, file) in jobs
}
pipeline["include"] = "https://raw.githubusercontent.com/JuliaGPU/gitlab-ci/master/templates/v6.yml"

yaml.dump(pipeline, sys.stdout)
