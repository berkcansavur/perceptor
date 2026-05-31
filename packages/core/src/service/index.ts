export * from "./types";
export * from "./api";
export { CoreService } from "./CoreService";
export type { AnalyzerAssets } from "../core";

import { CoreService } from "./CoreService";
import type { AnalyzerAssets } from "../core";
import type { FileOpener } from "./types";

export function createCoreService(
  rootDirectory: string,
  onGraphChange: (() => void) | null,
  fileOpener: FileOpener | null,
  assets: AnalyzerAssets
): CoreService {
  return new CoreService(rootDirectory, onGraphChange, fileOpener, assets);
}
