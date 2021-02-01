import os
import sys

from random import choice

import yaml


def env_list(k):
    return [s.strip() for s in os.getenv(k, "").split(",") if s]


gpu_queue = os.getenv("GPU_QUEUE", "juliagpu")
exclude = [x if x.endswith(".jmd") else f"{x}.jmd" for x in env_list("EXCLUDE")]
needs_gpu = [x if x.endswith(".jmd") else f"{x}.jmd" for x in env_list("NEEDS_GPU")]
sh_url = "https://raw.githubusercontent.com/SciML/RebuildAction/master/rebuild.sh"
tags = env_list("TAGS")

package = os.getenv("JULIA_PACKAGE")
if not package:
    package = os.environ["GITHUB_REPOSITORY"].split("/")[1]
    if package.endswith(".jl"):
        package = package[:-3]


def make_job(folder, file):
    # job_tags = tags.copy()
    if f"{folder}/{file}" in needs_gpu:
        queue = os.getenv("GPU_QUEUE", "juliagpu")
    else:
        queue = os.getenv("CPU_QUEUE", "juliacpu")
    julia = os.environ["JULIA_VERSION"]
    return {
        "command": f"wget -O - {sh_url} | bash",
        "label": f"rebuild-{folder}-{file}",
        "agents": {
            "queue": queue,
        },
        "env": {
            "CI_APT_INSTALL": "build-essential gfortran git python3-dev texlive-full",
            "CONTENT_DIR": os.environ["CONTENT_DIR"],
            "JULIA_NUM_THREADS": 8,
            "PACKAGE": package,
            "FILE": file,
            "FOLDER": folder,
            "FROM": os.environ["FROM"],
            "TO": os.environ["TO"],
        },
        "plugins": [
            {
                "docker#v3.7.0": {
                    "image": f"julia:{julia}",
                    "volumes": [
                        ""
                    ],
                },
            },
        ],
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


pipeline = [make_job(folder, file) for (folder, file) in jobs]
pipeline.append({
    "wait": {
        "allow_dependency_failure": True,
    },
})
pipeline.append({
    "command": [
        "apt-get -y update",
        "apt-get -y install git wget",
        f"wget -O - {sh_url} | bash -s done",
    ],
    "plugins": [
        {
            "docker#v3.7.0": {
                "image": "ubuntu",
                "volumes": [
                    ""
                ],
            },
        },
    ],

    "image": "ubuntu",
        "script": [
            "apt-get -y update",
            "apt-get -y install git wget",
            f"wget -O - {sh_url} | bash -s done",
        ],
        "variables": {
            "TO": os.environ["TO"],
        },
    },
}

yaml.dump(pipeline, sys.stdout)
