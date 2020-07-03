const { readFileSync } = require("fs");

const core = require("@actions/core");
const fetch = require("node-fetch");
const { getOctokit } = require("@actions/github");

const CLIENT = getOctokit(core.getInput("token"));
const EVENT = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
const REPO = {
  owner: process.env.GITHUB_REPOSITORY.split("/")[0],
  repo: process.env.GITHUB_REPOSITORY.split("/")[1],
};

let BRANCH;

const main = async () => {
  if (isPullRequest()) {
    const pr = await CLIENT.pulls.get({
      ...REPO,
      pull_number: EVENT.issue.number,
    });
    BRANCH = pr.data.head.ref;
  } else {
    BRANCH = process.env.GITHUB_REF.slice(11);
  }

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
  }
};

const onIssueComment = async () => {
  if (!isFork() && EVENT.comment.body.startsWith("!rebuild")) {
    if (["OWNER", "MEMBER", "COLLABORATOR"].includes(EVENT.comment.author_association)) {
      const options = parseComment();
      const resp = await triggerJob(options);
      if (resp.ok) {
        const body = await resp.json();
        replyToComment(`Created pipeline: [see it here](${body.web_url}).`);
      } else {
        replyToComment("Triggering the pipeline failed.");
      }
    } else {
      replyToComment("You're not allowed to do that.");
    }
  } else {
    console.log("Ignoring irrelevant issue comment event");
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
    default:
      replyToComment("Your syntax seems incorrect.");
      break;
    }
  }
  if (isPullRequest()) {
    options.from = BRANCH;
    options.to = BRANCH;
  }
  return options;
};

const isFork = () => isPullRequest() && EVENT.issue.pull_request.head !== undefined;

const isPullRequest = () => EVENT.issue && EVENT.issue.pull_request !== undefined;

const onPush = () => {
  if (/^rebuild\/[a-f0-9]{8}-done$/.test(BRANCH)) {
    notifyPipelineDone();
  } else if (/^rebuild\/[a-f0-9]{8}$/.test(BRANCH)) {
    openOrUpdatePR();
  } else {
    console.log("Ignoring irrelevant push event");
  }
};

const onSchedule = () => triggerJob();

const randomId = () => {
  let s = Math.round(0xffffffff * Math.random()).toString(16);
  while (s.length < 8) {
    s = `0${s}`;
  }
  return s;
};

const triggerJob = options => {
  options = options || {};
  console.log(options);
  const form = new URLSearchParams();
  const ref = EVENT.repository && EVENT.repository.default_branch || BRANCH;
  form.append("ref", ref);
  form.append("token", process.env.GITLAB_TOKEN);
  form.append("variables[FILE]", options.file || "");
  form.append("variables[FOLDER]", options.folder || "");
  form.append("variables[FROM]", options.from || ref);
  form.append("variables[TO]", options.to || `rebuild/${randomId()}`);
  const project = process.env.GITLAB_PROJECT;
  const url = `https://gitlab.com/api/v4/projects/${project}/trigger/pipeline`;
  return fetch(url, { method: "POST", body: form });
};

const replyToComment = message => {
  console.log(`Replying to comment: ${message}`);
  CLIENT.issues.createComment({
    ...REPO,
    issue_number: EVENT.issue.number,
    body: message,
  });
};

const updatedContent = () => EVENT.head_commit.message.split(" ").slice(1).join(" ");

const getPR = async branch => {
  const prs = await CLIENT.pulls.list({
    ...REPO,
    head: `${REPO.owner}:${branch}`,
  });
  return prs.data.length === 0 ? undefined : prs.data[0];
};

const notifyPipelineDone = async () => {
  const pr = await getPR(BRANCH.slice(0, 16));
  const url = EVENT.head_commit.message;
  console.log("Pipeline is done, adding comment");
  CLIENT.issues.createComment({
    ...REPO,
    issue_number: pr.number,
    body: `Pipeline is finished: [see it here](${url}).`,
  });
};

const openOrUpdatePR = async () => {
  const pr = await getPR(BRANCH);
  if (pr) {
    console.log("Updating PR");
    CLIENT.pulls.update({
      ...REPO,
      pull_number: pr.number,
      title: `${pr.title}, ${updatedContent()}`,
    });
  } else {
    console.log("Creating PR");
    CLIENT.pulls.create({
      ...REPO,
      title: `Rebuild ${updatedContent()}`,
      body: "Pipeline is in progress, I'll comment here again when it's done.",
      head: BRANCH,
      base: EVENT.repository.default_branch,
    });
  }
};

if (!module.parent) {
  main();
}
