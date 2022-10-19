const core = require('@actions/core');
const async = require('async');
const github = require('@actions/github');

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
  if (info.template_repository) {
    let template = info.template_repository;
    let templateInfo = {
      owner: template.owner.login,
      repo: template.name
    }
    console.log(templateInfo);
    return templateInfo;
  }
  return undefined;
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

const fetchBranches = async (owner, repo) => {

}

const cloneBranches = async (owner, repo) => {
  console.log(owner);
  console.log(repo);
}

const run = async () => {

  // Constants
  const repo = github.context.payload.repository.name;
  const owner = github.context.payload.repository.owner.login;

  // Properties
  const info = await getRepoInfo(owner, repo);
  const teams = await getTeamNames(owner, repo);

  // Facts
  const template = getRepoTemplate(info.data);

  // Set protections
  setBranchProtection(owner, repo, teams);
  setTeamRepoPermissions(owner, repo, teams);

  // If repo has a template
  if (template) cloneBranches(template.owner, template.repo);

};

run();
