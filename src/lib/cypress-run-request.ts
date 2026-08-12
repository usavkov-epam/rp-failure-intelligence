import { z } from "zod";

import { CYPRESS_BROWSER, RUN_LIMITS, VALIDATION_LIMITS } from "./domain-constants";
import { customCypressConfigSchema } from "./user-settings-schema";

const specPath = z.string()
  .max(VALIDATION_LIMITS.SPEC_PATH_LENGTH)
  .regex(/^cypress\/e2e\/[A-Za-z0-9_./-]+\.cy\.(?:js|ts)$/, "Invalid Cypress spec path");

export const cypressConfigOverridesSchema = customCypressConfigSchema;

export const cypressRunRequestSchema = z.object({
  launchName: z.string().trim().min(1).max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH),
  specs: z.array(specPath).min(1).max(RUN_LIMITS.MAX_SPECS).transform((specs) => [...new Set(specs)]),
  runs: z.number().int().min(RUN_LIMITS.MIN_REPETITIONS).max(RUN_LIMITS.MAX_REPETITIONS),
  threads: z.number().int().min(RUN_LIMITS.MIN_THREADS).max(RUN_LIMITS.MAX_THREADS),
  browser: z.enum([CYPRESS_BROWSER.CHROME, CYPRESS_BROWSER.ELECTRON]),
  timeoutSeconds: z.number().int().min(RUN_LIMITS.MIN_TIMEOUT_SECONDS).max(RUN_LIMITS.MAX_TIMEOUT_SECONDS),
  profileId: z.string().uuid(),
  cypressConfig: cypressConfigOverridesSchema.optional().default({}),
}).strict();

export type CypressRunRequest = z.infer<typeof cypressRunRequestSchema>;
export type CypressConfigOverrides = z.infer<typeof cypressConfigOverridesSchema>;
