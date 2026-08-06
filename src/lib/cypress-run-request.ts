import { z } from "zod";

const specPath = z.string()
  .max(300)
  .regex(/^cypress\/e2e\/[A-Za-z0-9_./-]+\.cy\.(?:js|ts)$/, "Invalid Cypress spec path");

const environmentName = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_.-]+$/, "Invalid Cypress environment name");

export const cypressConfigOverridesSchema = z.object({
  viewportWidth: z.number().int().min(320).max(3_840).optional(),
  viewportHeight: z.number().int().min(320).max(2_160).optional(),
  defaultCommandTimeout: z.number().int().min(1_000).max(300_000).optional(),
  pageLoadTimeout: z.number().int().min(1_000).max(300_000).optional(),
  requestTimeout: z.number().int().min(1_000).max(300_000).optional(),
  responseTimeout: z.number().int().min(1_000).max(300_000).optional(),
  retries: z.number().int().min(0).max(5).optional(),
  video: z.boolean().optional(),
  screenshotOnRunFailure: z.boolean().optional(),
}).strict();

export const cypressRunRequestSchema = z.object({
  specs: z.array(specPath).min(1).max(25).transform((specs) => [...new Set(specs)]),
  runs: z.number().int().min(1).max(20),
  threads: z.number().int().min(1).max(4),
  browser: z.enum(["chrome", "electron"]),
  timeoutSeconds: z.number().int().min(60).max(1_200),
  environment: environmentName.optional(),
  cypressConfig: cypressConfigOverridesSchema.optional().default({}),
}).strict();

export type CypressRunRequest = z.infer<typeof cypressRunRequestSchema>;
export type CypressConfigOverrides = z.infer<typeof cypressConfigOverridesSchema>;
