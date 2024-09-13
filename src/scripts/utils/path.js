import * as path from "path";
import { fileURLToPath } from "url";

// Get the current module's directory
const __filename = fileURLToPath(import.meta.url);
export const __altDirname = path.dirname(__filename);