const path = require('path');
const util = require('util');
const async = require('async');

const github = require('@actions/github');
const core = require('@actions/core');

const exec = util.promisify(require('child_process').exec);

const octokit = github.getOctokit(
  process.env.GITHUB_TOKEN
);

// Gets

const getContributors = async (owner, repo) => {
  let list = await octokit.rest.repos.listContributors({
    owner: owner,
    repo: repo
  });
  return list;
};

const getTeamNames = async (owner, repo) => {
  let teams = [];

  let list = await octokit.rest.repos.listTeams({
    owner: owner,
    repo: repo
  });

  let data = list.data;

  async.map(data, (value, fn) => {
    fn(null, value);
  }, (err, res) => {
    for(let item in res){
      teams.push({res[item].slug: res[item].permissions});
    }
  });
  console.log(teams)
  return teams;
};

const getRepoInfo = async (owner, repo) => {
  let info = octokit.rest.repos.get({
    owner: owner,
    repo: repo
  });
  return info;
};

const getRepoTemplate = async (info) => {
  let templateInfo;
  if (info.template_repository) {
    let template = info.template_repository;
    templateInfo = {
      owner: template.owner.login,
      repo: template.name,
      clone: template.clone_url
    }
  }
  return templateInfo;
};

const getBranches = async(owner, repo) => {
  let info = await octokit.rest.repos.listBranches({
    owner,
    repo,
    protected: false
  });
  return info;
};

const getCommits = async(owner, repo) => {
  let info = await octokit.rest.repos.listCommits({
    owner: owner,
    repo: repo
  });
  return info;
};

// Set

const setBranchProtection = async (owner, repo, teams) => {
  let branches = JSON.parse(core.getInput('branches'));
  let override = core.getInput('enforce-admins');
  let approvals = parseInt(core.getInput('min-approvals'));
  branches = branches.map((branch) => {
    return {
      name: branch,
      restrictions: null,
      approvals: approvals
    }
  });
  for (let branch of branches) {
    try {
        octokit.rest.repos.updateBranchProtection({
          owner: owner,
          repo: repo,
          branch: branch.name,
          required_status_checks: null,
          enforce_admins: override == 'true' ? true : null,
          restrictions: branch.restrictions,
          required_pull_request_reviews: {
            required_approving_review_count: branch.approvals,
            dismiss_stale_reviews: true,
          }
        });
    } catch(err) {
        console.log(`ERROR PROTECTING ${branch}...`);
    }
  }
}

const setTeamRepoPermissions = async (owner, repo, teams) => {
  for(let team in teams){
    octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
      org: owner,
      team_slug: teams[team],
      owner: owner,
      repo: repo,
      permission: 'push'
    });
  }
}

const setGit = async() => {
  await execRun(`git config --global user.name "github-classroom[bot]"`);
  await execRun(`git config --global user.email "github-classroom[bot]@users.noreply.github.com"`);
}

const setRemote = async(template) => {
  let info = await getBranches(template.owner, template.repo);
  let branches = info.data;
  info = await setGit();
  let response = await execRun(`git remote add template ${template.clone}`);
  response = await(execRun(`git fetch template`));
  for (let branch of branches) {
    try {
        response = await execRun(`git checkout -b ${branch.name} template/${branch.name}`)
        response = await execRun(`git push origin ${branch.name}`);
        response = await execRun(`git checkout main`);
    } catch (err)  {
        console.log(`ERROR SETTING REMOTE FOR ${branch}...`);
    }
  }
  response = await execRun(`git branch`);
}

// Runner

const execRun = async(cmd) => {
  let { stdout, stderr } = await exec(`${cmd}`);
  return {
    stdout: stdout,
    strerr: stderr
  }
}

const run = async () => {

  // Constants
  const repo = github.context.payload.repository.name;
  const owner = github.context.payload.repository.owner.login;

  // Properties
  const info = await getRepoInfo(owner, repo);
  const teams = await getTeamNames(owner, repo);
  console.log(teams)
  // Facts
  const template = await getRepoTemplate(info.data);
  const commits = await getCommits(owner, repo);
  const lastAuthor = commits.data[0].author;

  // Check for forced branch protection
  let force = (core.getInput('force-protect') === 'true');

  // Set protections
  if (template || force) setBranchProtection(owner, repo, teams);
  if (template) setTeamRepoPermissions(owner, repo, teams);

  // If repo has a template and this is the last bot commit
  if (template && lastAuthor == 'github-classroom[bot]') setRemote(template);

  // If repo is not a template and not an assignment
  if (!template && lastAuthor != 'github-classroom[bot]' && !force) console.log("MAIN TEMPLATE: No action taken.");

};

run();
