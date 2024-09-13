import axios from "axios";
import { context } from "@actions/github";

// Function to update PR description
export const updatePRDescription = async (file: any, filePath: string, summary: unknown) => {
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

  try {
    // Fetch the current PR description
    const { data: pr } = await githubApi.get(
      `/repos/${owner}/${repo}/pulls/${prNumber}`
    );

    const path = `### 🗂️ File: [\`${removeFirstNDirectories(filePath, 6)}\`](${file.blob_url})`;

    const updatedBody = `
${path}
    
#### 📝 Summary: ${summary}
    
---    
${pr.body}
`;    

    // Update the PR description
    await githubApi.patch(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
      body: updatedBody,
    });

    console.log(`Updated PR #${prNumber} description with summary.`);
  } catch (err) {
    console.error("Error updating PR description:", err);
  }
};

function removeFirstNDirectories(filePath: string, nDirectories: number) {
  const parts = filePath.split("/"); // Split the path into parts
  return parts.slice(nDirectories).join("/"); // Remove the first n parts and rejoin the remaining
}
