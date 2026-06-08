import * as fs from "fs";
import * as path from "path";
import { ensurePerceptorIgnored } from "../../core/ensurePerceptorIgnored";

// The auto-processing opt-in ("let Claude carry out tasks"), persisted to
// .perceptor/auto.json so the choice survives an editor reload. Without this the flag
// lived only in memory and silently reset to OFF every time the window reloaded, leaving
// the user opted-in in their head but opted-out in fact (the onboarding prompt, remembered
// per repo, never reappears to let them re-enable). Default OFF — it's the one feature
// that spends Claude tokens, so an absent/garbled file is always read as "not enabled".
export class AutoEnableStore {
  constructor(private readonly rootProvider: () => string) {}

  private file(): string {
    return path.join(this.rootProvider(), ".perceptor", "auto.json");
  }

  read(): boolean {
    const file = this.file();
    if (!fs.existsSync(file)) {
      return false;
    }
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8")) as { enabled?: unknown };
      return stored.enabled === true;
    } catch {
      return false;
    }
  }

  save(enabled: boolean): void {
    const file = this.file();
    ensurePerceptorIgnored(this.rootProvider());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ enabled }, null, 2));
  }
}
