const core = require('@actions/core');
const path = require('path');
const async = require('async');
const github = require('@actions/github');

const { exec } = require('child_process');

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
  let slugs = [];
  let list = await octokit.rest.repos.listTeams({
    owner: owner,
    repo: repo
  });
  let teams = list.data;
  async.map(teams, (value, fn) => {
    fn(null, value.slug);
  }, (err, res) => {
    for(let item in res){
      slugs.push(res[item]);
    }
  });
  return slugs;
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
    // console.log(template);
    templateInfo = {
      owner: template.owner.login,
      repo: template.name,
      clone: template.clone_url
    }
  }
  return templateInfo;
};

const fetchBranches = async(owner, repo) => {
  let info = await octokit.rest.repos.listBranches({
    owner,
    repo,
    protected: false
  });
  return info;
};

// Set

const setBranchProtection = async (owner, repo, teams) => {
  octokit.rest.repos.updateBranchProtection({
    owner: owner,
    repo: repo,
    branch: 'main',
    required_status_checks: null,
    enforce_admins: true,
    restrictions: null,
    required_pull_request_reviews: {
      required_approving_review_count: 3,
      dismiss_stale_reviews: true
    },
  });
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

const cloneBranches = async (template) => {
  let info = await fetchBranches(template.owner, template.repo);
  let branches = info.data;
  await exec(`git clone ${template.clone}`, {
    stdio: [0, 1, 2],
    cwd: path.resolve(__dirname, '')
  });
}

const run = async () => {

  // Constants
  const repo = github.context.payload.repository.name;
  const owner = github.context.payload.repository.owner.login;

  // Properties
  const info = await getRepoInfo(owner, repo);
  const teams = await getTeamNames(owner, repo);

  // Facts
  const template = await getRepoTemplate(info.data);

  // Set protections
  setBranchProtection(owner, repo, teams);
  setTeamRepoPermissions(owner, repo, teams);

  // If repo has a template
  if (template) cloneBranches(template);

};

run();
