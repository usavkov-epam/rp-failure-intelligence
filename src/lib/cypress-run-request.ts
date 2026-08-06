import { z } from "zod";

const specPath = z.string()
  .max(300)
  .regex(/^cypress\/e2e\/[A-Za-z0-9_./-]+\.cy\.(?:js|ts)$/, "Invalid Cypress spec path");

export const cypressRunRequestSchema = z.object({
  specs: z.array(specPath).min(1).max(25).transform((specs) => [...new Set(specs)]),
  runs: z.number().int().min(1).max(20),
  threads: z.number().int().min(1).max(4),
  browser: z.enum(["chrome", "electron"]),
  timeoutSeconds: z.number().int().min(60).max(1_200),
});

export type CypressRunRequest = z.infer<typeof cypressRunRequestSchema>;