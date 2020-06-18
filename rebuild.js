const { readFileSync } = require("fs");

const core = require('@actions/core');
const fetch = require("node-fetch");
const github = require("@actions/github");

const BRANCH = process.GITHUB_REF.slice(11);
const CLIENT = github.getOctokit(core.getInput("token"));
const EVENT = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));

exports.main = () => {
  switch (process.env.GITHUB_EVENT_NAME) {
  case "issue_comment":
    onIssueComment();
    break;
  case "push":
    onPush();
    break;
  case "schedule":
    onSchedule();
    break;
  case "status":
    onStatus();
    break;
  }
};

const onIssueComment = async () => {
  // TODO: Access control (author.owner_association).
  if (!isFork() && EVENT.comment.body.startsWith("!rebuild")) {
    const options = parseComment();
    const resp = await triggerJob(options);
    body = JSON.parse(resp.body.read());

  }
};

const parseComment = () => {
  const options = {};
  const tokens = EVENT.comment.body.split("\r\n")[0].split(/\s/);
  if (tokens.length > 1) {
    const targets = tokens[1].split("/");
    switch (targets.length) {
    case 1:
      options.folder = targets[0];
      break;
    case 2:
      options.folder = targets[0];
      options.file = targets[1];
      break;
    }
  }
  if (isPullRequest()) {
    options.from = BRANCH;
    options.to = BRANCH;
  }
  return options;
};

const isFork = () => isPullRequest && EVENT.issue.pull_request.head !== undefined;

const isPullRequest = () => EVENT.issue.pull_request !== undefined;

const onPush = () => {
  if (process.env.GITHUB_REF.startsWith("refs/heads/rebuild/")) {
    openPR();
  }
};

const onSchedule = () => triggerJob();

const onStatus = () => {
  if (EVENT.context === "ci/gitlab/gitlab.com" && EVENT.state === "failure") {
    updateStatus();
  }
};

const randomId = () => {
  let s = Math.round(0xffffffff * Math.random()).toString(16);
  while (s.length < 8) {
    s = `0${s}`;
  }
  return s;
}

const triggerJob = async options => {
  options = options || {};
  const form = new URLSearchParams();
  form.append("ref", EVENT.repository.default_branch);
  form.append("token", process.env.GITLAB_TOKEN);
  form.append("variables[FILE]", options.file || "");
  form.append("variables[FOLDER]", options.folder || "");
  form.append("variables[FROM]", options.from || EVENT.repository.default_branch);
  form.append("variables[TO]", options.to || `rebuild/${randomId()}`);
  const project = process.env.GITLAB_PROJECT;
  const url = `https://gitlab.com/api/v4/projects/${project}/trigger/pipeline`;
  const resp = await fetch(url, { method: "POST", body: form });
  return JSON.parse(resp.body.read);
};

const openPR = async () => {
  const prs = await CLIENT.pulls.list({
    owner: EVENT.repository.owner,
    repo: EVENT.repository.repo,
    head: `${EVENT.repository.owner}:${BRANCH}`,
  });
  if (prs.length === 0) {
    console.log("Creating PR")
    CLIENT.pulls.create({
      owner: EVENT.repository.owner,
      repo: EVENT.repository.repo,
      title: "Rebuild content",
      head: BRANCH,
      base: "master",
    });
  } else {
    console.log("PR already exists")
  }
}

const updateStatus = () => {
  console.log("Updating commit status");
  CLIENT.repos.createCommitStatus({
    owner: EVENT.repository.owner,
    repo: EVENT.repository.repo,
    sha: EVENT.sha,
    state: "success",
    context: EVENT.context,
    description: "This status can be ignored",
    target_url: EVENT.target_url,
  });
};

if (!module.parent) {
  main();
}
