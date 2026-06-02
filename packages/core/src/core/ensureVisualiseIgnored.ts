import * as fs from "fs";
import * as path from "path";

const VISUALISE_IGNORE_ENTRY = ".visualise/";

// The .visualise directory is tooling scratch space (graph cache, the pending-actions
// queue, summaries) written into whatever repo is being analysed — it must never be
// committed. Make sure the analysed repo's .gitignore excludes it. Only acts when the
// root is itself a git repo, so we never litter a plain folder with a stray .gitignore.
// Idempotent: a no-op once the entry is already present.
export function ensureVisualiseIgnored(rootDirectory: string): void {
  if (!fs.existsSync(path.join(rootDirectory, ".git"))) {
    return;
  }
  const gitignore = path.join(rootDirectory, ".gitignore");
  let current = "";
  try {
    current = fs.readFileSync(gitignore, "utf8");
  } catch {
    current = "";
  }
  const alreadyIgnored = current
    .split(/\r?\n/)
    .some((line) => line.trim() === VISUALISE_IGNORE_ENTRY || line.trim() === ".visualise");
  if (alreadyIgnored) {
    return;
  }
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(gitignore, `${prefix}${VISUALISE_IGNORE_ENTRY}\n`);
}
