import type { JsonValue } from "@/db/json";

export type IntegrationConnectionRecord = {
  id: string;
  code: string;
  name: string;
  category: string;
  provider: string;
  environment: string;
  status: string;
  baseUrl: string | null;
  credentialReference: string | null;
  configuration: JsonValue;
  mockScenario: JsonValue;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IntegrationRunRecord = {
  id: string;
  connectionId: string;
  operation: string;
  environment: string;
  status: string;
  message: string;
  externalId: string | null;
  payload: JsonValue;
  createdAt: Date;
};

export type IntegrationConnectionWithRuns = IntegrationConnectionRecord & { runs: IntegrationRunRecord[] };

export type IntegrationConnectionInput = Pick<IntegrationConnectionRecord,
  "code" | "name" | "category" | "provider" | "environment" | "status" | "baseUrl" | "credentialReference"
> & { configuration?: JsonValue; mockScenario?: JsonValue };
