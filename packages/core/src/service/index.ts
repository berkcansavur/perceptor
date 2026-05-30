export * from "./types";
export { CoreService } from "./CoreService";

import { CoreService } from "./CoreService";

export function createCoreService(rootDirectory: string, onGraphChange?: () => void): CoreService {
  return new CoreService(rootDirectory, onGraphChange);
}
