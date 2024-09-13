import { promises as fs } from "fs";
import * as path from "path";
import { __altDirname } from "./path.js";

export const loadSchemaFile = async (fileName) => {
  try {
    const sourcePath = path.join(__altDirname,'../../schemas', fileName)
    const data = await fs.readFile(sourcePath, "utf8");
    const jsonData = JSON.parse(data);

    return jsonData;
  } catch (error) {
    console.error("Error reading JSON file:", error);
  }
};
