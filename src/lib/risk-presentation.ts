import { RISK } from "./domain-constants";
import type { Risk } from "./types";

/** Shared risk palette for charts and categorical labels. */
export const RISK_BACKGROUND_CLASS: Record<Risk, string> = {
  [RISK.PERSISTENT]: "bg-destructive",
  [RISK.HIGH]: "bg-amber-600",
  [RISK.INTERMITTENT]: "bg-sky-600",
  [RISK.ISOLATED]: "bg-violet-600",
};
