// Tags a user's quick question/edit with the diff region it refers to, so the skill
// knows exactly which file + hunk to revise. e.g. "[src/Order.ts @@ -1,4 +1,5 @@] ..."
export function regionMessage(region: string, text: string): string {
  return `[${region.trim()}] ${text.trim()}`;
}
