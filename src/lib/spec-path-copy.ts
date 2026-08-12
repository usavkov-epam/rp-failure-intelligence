import { SPEC_PATH_COPY_FORMAT, type SpecPathCopyFormat } from "./domain-constants";

const SPEC_PATH_SEPARATOR: Record<SpecPathCopyFormat, string> = {
  [SPEC_PATH_COPY_FORMAT.COMMA_SEPARATED]: ",",
  [SPEC_PATH_COPY_FORMAT.NEW_LINE_SEPARATED]: "\n",
};

export function formatSpecPaths(paths: string[], format: SpecPathCopyFormat) {
  return paths.join(SPEC_PATH_SEPARATOR[format]);
}
