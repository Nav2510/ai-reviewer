import axios from "axios";
import { context } from "@actions/github";

export const createLineComments = async (file: any, commit_id: string, reviewList: any[]) => {
  try {
    // Get the context of the pull request
    const token = process.env.GITHUB_TOKEN;
    const { owner, repo } = context.repo;
    const prNumber = context.payload.pull_request?.number || -1;

    // Axios instance for GitHub API
    const githubApi = axios.create({
      baseURL: "https://api.github.com",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    for (const review of reviewList) {
      await githubApi.post(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
        path: file.filename,
        line: review.original_line,
        commit_id: commit_id,
        body: `
#### Type: _**${review.type}**_

**Suggested Change**
\`\`\`
${review.suggested_change}
\`\`\`

**Explanation**
${review.explantions}
`,
      });
    }

    console.log("Comments created successfully.");
  } catch (error) {
    console.error("Error while creating Comments", error);
  }
};
