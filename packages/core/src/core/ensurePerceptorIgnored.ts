import * as fs from "fs";
import * as path from "path";

const PERCEPTOR_IGNORE_ENTRY = ".perceptor/";
const LEGACY_SCRATCH_DIR = ".visualise";
const SCRATCH_DIR = ".perceptor";

// One-time rename of the old scratch directory so existing user data (coding
// preferences, task queue, results, summaries) survives the visualise→perceptor
// rename. Best-effort and idempotent: only moves when the legacy dir exists and
// the new one doesn't yet.
export function migrateLegacyScratchDir(rootDirectory: string): void {
  const legacy = path.join(rootDirectory, LEGACY_SCRATCH_DIR);
  const current = path.join(rootDirectory, SCRATCH_DIR);
  try {
    if (fs.existsSync(legacy) && !fs.existsSync(current)) {
      fs.renameSync(legacy, current);
    }
  } catch {
    /* best-effort — a failed migration must never break analysis */
  }
}

// Append a single entry to the analysed repo's .gitignore if it isn't already there.
// Only acts when the root is itself a git repo, so we never litter a plain folder with
// a stray .gitignore. Idempotent: a no-op once the entry (with or without a trailing
// slash) is present. Returns true if the entry is (now) ignored.
export function ensureGitignoreEntry(rootDirectory: string, entry: string): boolean {
  if (!fs.existsSync(path.join(rootDirectory, ".git"))) {
    return false;
  }
  const bare = entry.replace(/\/$/, "");
  const gitignore = path.join(rootDirectory, ".gitignore");
  let current = "";
  try {
    current = fs.readFileSync(gitignore, "utf8");
  } catch {
    current = "";
  }
  const alreadyIgnored = current
    .split(/\r?\n/)
    .some((line) => line.trim() === entry || line.trim() === bare);
  if (alreadyIgnored) {
    return true;
  }
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(gitignore, `${prefix}${entry}\n`);
  return true;
}

// The .perceptor directory is tooling scratch space (graph cache, the pending-actions
// queue, summaries) written into whatever repo is being analysed — it must never be
// committed.
export function ensurePerceptorIgnored(rootDirectory: string): void {
  ensureGitignoreEntry(rootDirectory, PERCEPTOR_IGNORE_ENTRY);
}
