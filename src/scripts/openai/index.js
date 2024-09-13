import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";
import { Octokit } from "@octokit/rest";
import { context } from "@actions/github";

import { updatePRDescription } from "./summarize.js";
import { createLineComments } from "./comments.js";
import { createLineSpecificReviewAndSummary } from "./openai.js";

// GitHub token is automatically provided by GitHub Actions
const token = process.env.GITHUB_TOKEN;
const includedFiles = process.env.SRC_FOLDER_PATTERN;
const octokit = new Octokit({ auth: token });

// Get the context of the pull request
const { owner, repo } = context.repo;
const pull_number = context.payload.pull_request.number;

// Fetch the list of files changed in the pull request
octokit.pulls
  .listFiles({
    owner,
    repo,
    pull_number,
  })
  .then(async (files) => {
    const commit_id = await getLatestCommitSHA();
    files.data.forEach(async (file) => {
      const filePath = path.resolve(file.filename);
      if (!isIncludedFilePath(filePath, includedFiles)) {
        return;
      }
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        const { changes, summarized_code } =
          await createLineSpecificReviewAndSummary(content);
        createLineComments(file, commit_id, changes);
        updatePRDescription(file, filePath, summarized_code);
      }
    });
  })
  .catch((err) => {
    console.error("Error fetching pull request files:", err);
  });

async function getLatestCommitSHA() {
  const { data: commits } = await octokit.pulls.listCommits({
    owner,
    repo,
    pull_number,
  });
  return commits[commits.length - 1].sha;
}

function isIncludedFilePath(filePath, patterns = "**/*.js") {
  const patternList = patterns.split(",");
  return patternList.reduce((prev, pattern) => {
    return prev || minimatch(filePath, pattern.trim());
  }, false);
}
