# AI Reviewer

AI Reviewer is an intelligent tool designed to automate the review process of pull requests (PRs). It reviews the changes in each PR, generates summaries per file, adds relevant comments, suggestions, and highlights areas that need fixing. This ensures code quality and faster reviews.

## Features

- **Automated Workflow Creation**: Automatically creates a workflow on installation.
- **PR Review Automation**: Reviews pull requests and provides detailed feedback.
- **File-based Summaries**: Summarize each files in short description.
- **Comments & Suggestions**: Add comments and suggestions on areas of improvement.
- **Fix Recommendations**: Suggest potential fixes for code issues.
- **Improves Code Quality**: Helps maintain high coding standards with automated reviews.

## Installation

To install `aireviewer` and set up the workflow, use the following command:

```bash
npm install aireviewer --save-dev
```

## Usage

Once installed, `aireviewer` will automatically create a workflow file in your repository.

## Adding OpenAI API Key to GitHub Secrets and setting permissions for GITHUB_TOKEN

In order for AI Reviewer to leverage OpenAI's API to provide intelligent comments, suggestions, and summaries, you need to add your OpenAI API key to GitHub Secrets and allow workflow read, write permissions

### Adding OpenAI API Key

1. **Obtain Your OpenAI API Key:**
    - Go to [OpenAI]("https://platform.openai.com/api-keys") and generate your API key.

2. **Add the Key to GitHub Secrets:**
    - Go to your GitHub repository.
    - Navigate to `Settings` > `Secrets and variables` > `Actions` > `New repository secret`.
    - Add a new secret with the following details:
        - Name: `OPENAI_API_KEY`
        - Value: Your OpenAI API key (**copied from the OpenAI dashboard**).

3. **Accessing the API Key in Your Workflow:** In your GitHub Actions workflow, ensure that the OpenAI key is used by referencing the secret:


    ```yaml
    jobs:
    review:
        runs-on: ubuntu-latest
        steps:
        # Job Previous Steps...
            env:
            OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    ```

This ensures that the AI Reviewer tool has access to your OpenAI API key to generate intelligent code reviews.

### Setting Permissions for GITHUB_TOKEN

1. **Navigate to Your Repository on GitHub:**
    - Go to GitHub and open your repository.

2. **Open Actions Settings:**
    - Navigate to `Settings` > `Actions` > `General`.
    - Scroll down to the `Workflow permissions` section.

3. **Modify Workflow Permissions:**
    - Select `Read and write permissions`.
    - Click the `Save` button to apply the changes.

## Workflow Configuration

The workflow file created by `aireviewer` will be located in the `.github/workflows` directory. You can customize it as needed. 

Here is an example of what the workflow file might look like:

``` yml
name: OpenAI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  ai-review:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run AI Review and Summary
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SRC_FOLDER_PATTERN: "**/src/**/*.js, **/src/**/*.ts, **/src/**/*.html, **/src/**/*.scss"
          AI_MODEL: "gpt-4o-mini"
        run: node node_modules/aireviewer/src/scripts/openai/index.js
```


## Contact

For any questions or feedback, please email us on `navdeep.singh@solugenix.com`.