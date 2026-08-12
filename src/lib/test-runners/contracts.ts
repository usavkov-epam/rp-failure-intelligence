import type { CypressRunRequest } from "../cypress-run-request";
import type { CANCELLATION_RESULT, TestRunnerKind } from "../domain-constants";
import type { CypressRunDetails, CypressRunRecord } from "../types";
import type { CypressProfileSecret } from "../user-settings-schema";

export interface TestRunnerDescriptor {
  kind: TestRunnerKind;
  label: string;
  executionDescription: string;
  supportsCancellation: boolean;
  hasExternalRunPage: boolean;
}

export interface RunDispatchContext {
  ownerKey: string;
  requestId: string;
  request: CypressRunRequest;
  requestedBy: string;
  applicationBaseUrl: string;
  profileName: string;
  profile: CypressProfileSecret;
}

export type ArtifactDownload =
  | { kind: "redirect"; url: string }
  | { kind: "file"; content: Buffer; fileName: string };

export type CancellationResult = typeof CANCELLATION_RESULT[keyof typeof CANCELLATION_RESULT];

/**
 * Provider-neutral execution boundary used by API routes and pages.
 * New runners implement this interface and are registered in `index.ts`.
 */
export interface TestRunner {
  readonly descriptor: TestRunnerDescriptor;
  initialRunUrl(ownerKey: string): Promise<string>;
  dispatch(context: RunDispatchContext): Promise<void>;
  reconcile(runs: CypressRunRecord[]): Promise<boolean>;
  getDetails(ownerKey: string, run: CypressRunRecord): Promise<CypressRunDetails | null>;
  getArtifact(ownerKey: string, run: CypressRunRecord, artifactId: number): Promise<ArtifactDownload | null>;
  cancel(run: CypressRunRecord): Promise<CancellationResult>;
}
