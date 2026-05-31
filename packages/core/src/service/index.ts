export * from "./types";
export * from "./api";
export { CoreService } from "./CoreService";

import { CoreService } from "./CoreService";
import type { FileOpener } from "./types";

export function createCoreService(
  rootDirectory: string,
  onGraphChange: (() => void) | null,
  fileOpener: FileOpener | null = null
): CoreService {
  return new CoreService(rootDirectory, onGraphChange, fileOpener);
}
