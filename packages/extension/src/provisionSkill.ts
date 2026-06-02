import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// The /visualise Claude skill is the engine that processes tasks. Claude discovers
// user-level skills at ~/.claude/skills/<name>/SKILL.md (verified: the skill then appears
// in the init event's "skills"/"slash_commands"), regardless of the launch cwd. We bundle
// the skill in the .vsix (esbuild copies skills/ -> dist/skills) and copy it onto the
// machine here, so the extension works with zero per-user setup.

// Default locations: the bundled source sits next to extension.js (dist/skills/...), and
// the install target is the user-level Claude skills directory.
export function bundledSkillPath(): string {
  return path.join(__dirname, "skills", "visualise", "SKILL.md");
}

export function installedSkillPath(): string {
  return path.join(os.homedir(), ".claude", "skills", "visualise", "SKILL.md");
}

export function provisionSkill(log: (message: string) => void): void {
  copySkill(bundledSkillPath(), installedSkillPath(), log);
}

// Idempotent copy: write only when the installed copy is missing or differs from the
// bundled one, so upgrades propagate and unchanged runs are a no-op. Never throws — a
// failed provision must not break activation; we only log.
export function copySkill(source: string, dest: string, log: (message: string) => void): void {
  let bundled: string;
  try {
    bundled = fs.readFileSync(source, "utf8");
  } catch (error) {
    log(`skill provision skipped: bundled skill not found at ${source} (${asMessage(error)})`);
    return;
  }

  try {
    if (fs.existsSync(dest) && fs.readFileSync(dest, "utf8") === bundled) {
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bundled, "utf8");
    log(`skill provisioned -> ${dest}`);
  } catch (error) {
    log(`skill provision failed: ${asMessage(error)}`);
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
