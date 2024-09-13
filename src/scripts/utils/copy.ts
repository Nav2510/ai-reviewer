import {existsSync, mkdirSync, copyFileSync} from "fs";
import {join, resolve} from "path";

export const copyWorkflow = () => {
  try {
    // Path to the workflow file inside the npm package
    const sourcePath = join(__dirname, "review.yml");
    console.log("Source Path:", sourcePath); // Debugging info

    const projectRoot = resolve(process.cwd(), "../../");
    console.log("Project Root:", projectRoot); // Debugging info

    // Path to the destination in the consuming project
    const destDir = join(projectRoot, ".github", "workflows");
    const destPath = join(destDir, "review.yml");
    console.log("Destination Path:", destPath); // Debugging info

    // Create the directories if they don't exist
    if (!existsSync(destDir)) {
      console.log("Destination directory does not exist. Creating:", destDir);
      mkdirSync(destDir, { recursive: true });
    }

    // Copy the file
    copyFileSync(sourcePath, destPath);

    console.log("review.yml has been successfully copied to .github/workflows/review.yml");
  } catch (error) {
    console.error("Error occurred while copying the workflow file:", error);
  }
};
