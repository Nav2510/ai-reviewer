import axios from "axios";
import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";
import { context } from "@actions/github";

import { updatePRDescription } from "./summarize";
import { createLineComments } from "./comments";
import { createLineSpecificReviewAndSummary } from "./openai";

(async () => {
  // GitHub token is automatically provided by GitHub Actions
  const token = process.env.GITHUB_TOKEN;
  const includedFiles = process.env.SRC_FOLDER_PATTERN;

  // Axios instance for GitHub API
  const githubApi = axios.create({
    baseURL: "https://api.github.com",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  // Get the context of the pull request
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request?.number || -1;

  try {
    // Fetch the list of files changed in the pull request
    const { data: files } = await githubApi.get(
      `/repos/${owner}/${repo}/pulls/${pull_number}/files`
    );

    const commit_id = await getLatestCommitSHA();

    for (const file of files) {
      const filePath = path.resolve(file.filename);
      if (!isIncludedFilePath(filePath, includedFiles)) {
        continue;
      }

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        if (content.trim().length === 0) {
          continue;
        }

        const { changes, summarized_code } =
          await createLineSpecificReviewAndSummary(content);
        createLineComments(file, commit_id, changes);
        updatePRDescription(file, filePath, summarized_code);
      }
    }
  } catch (err) {
    console.error("Error fetching pull request files:", err);
  }

  async function getLatestCommitSHA() {
    try {
      const { data: commits } = await githubApi.get(
        `/repos/${owner}/${repo}/pulls/${pull_number}/commits`
      );
      return commits[commits.length - 1].sha;
    } catch (err) {
      console.error("Error fetching commits:", err);
      throw err;
    }
  }

  function isIncludedFilePath(filePath: string, patterns = "**/*.js") {
    const patternList = patterns.split(",");
    return patternList.reduce((prev, pattern) => {
      return prev || minimatch(filePath, pattern.trim());
    }, false);
  }
})();
