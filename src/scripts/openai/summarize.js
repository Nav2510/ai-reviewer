import { Octokit } from "@octokit/rest";
import { context } from "@actions/github";

// Function to update PR description
export async function updatePRDescription(file, filePath, summary) {
  // Get the context of the pull request
  const token = process.env.GITHUB_TOKEN;
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request.number;

  const octokit = new Octokit({
    auth: token,
  });

  // Fetch the current PR description
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const path = `### File: [${removeFirstNDirectories(filePath, 5)}](${file.blob_url})`
  const updatedBody = `${path}\n${summary}\n\n${pr.body}`;

  // Update the PR description
  await octokit.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    body: updatedBody,
  });

  console.log(`Updated PR #${prNumber} description with summary.`);
}

function removeFirstNDirectories(filePath, n) {
  const parts = filePath.split('/');  // Split the path into parts
  const newPath = parts.slice(n).join('/');  // Remove the first n parts and rejoin the remaining
  return newPath;
}