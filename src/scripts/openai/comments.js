import { Octokit } from "@octokit/rest";
import { context } from "@actions/github";

export function createLineComments(file, commit_id, reviewList) {
  try {
    // Get the context of the pull request
    const token = process.env.GITHUB_TOKEN;
    const { owner, repo } = context.repo;
    const prNumber = context.payload.pull_request.number;

    const octokit = new Octokit({
      auth: token,
    });

    reviewList.forEach((review) => {
      octokit.pulls.createReviewComment({
        owner: owner,
        repo: repo,
        pull_number: prNumber,
        path: file.filename,
        line: review.original_line,
        commit_id: commit_id,
        body: `
          ${review.type}\n
          ${review.suggested_change}\n
          Explantion: ${review.explantions}
          `,
      });
    });
  } catch (error) {
    throw new Error("Error while creating Comments");
  }
}
