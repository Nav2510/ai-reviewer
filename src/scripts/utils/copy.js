import * as fs from "fs";
import * as path from "path";
import { __altDirname } from "./path.js";

export const copyWorkflow = () => {
  try {
    // Path to the workflow file inside the npm package
    const sourcePath = path.join(__altDirname, "../../workflows/review.yml");
    const projectRoot = path.resolve(process.cwd(), '../../');

    // Path to the destination in the consuming project
    const destDir = path.join(projectRoot, ".github", "workflows");
    const destPath = path.join(destDir, "review.yml");

    // Create the directories if they don't exist
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy the file
    fs.copyFileSync(sourcePath, destPath);

    console.log("review.yml has been copied to .github/workflows/review.yml");
  } catch (e) {
    console.log('Error copying file: ', e);
  }
};