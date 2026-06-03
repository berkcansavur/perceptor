import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { PayloadlessCommand } from "./Command";

type SkillInfo = {
  name: string;
  description: string;
};

export class ListSkillsCommand extends PayloadlessCommand<{ skills: SkillInfo[] }> {
  readonly action = "listSkills";

  constructor(private readonly rootProvider: () => string) {
    super();
  }

  protected run(): { skills: SkillInfo[] } {
    const skills: SkillInfo[] = [];
    const seen = new Set<string>();
    this.scanDirectory(path.join(this.rootProvider(), ".claude", "skills"), skills, seen);
    this.scanDirectory(path.join(os.homedir(), ".claude", "skills"), skills, seen);
    return { skills };
  }

  private scanDirectory(directory: string, skills: SkillInfo[], seen: Set<string>): void {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue;
      seen.add(entry.name);
      const description = this.readDescription(path.join(directory, entry.name, "SKILL.md"));
      skills.push({ name: entry.name, description });
    }
  }

  private readDescription(skillFile: string): string {
    if (!fs.existsSync(skillFile)) return "";
    const content = fs.readFileSync(skillFile, "utf8");
    const firstLine = content.split("\n").find((line) => line.trim() && !line.startsWith("#"));
    return firstLine?.trim().slice(0, 120) ?? "";
  }
}
