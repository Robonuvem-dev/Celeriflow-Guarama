import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppContext } from "@/lib/platform/tenant-context";
import { saveFamily, TerritoryError } from "@/lib/saude/territory-service";

function fixture(candidate: { id: string; responsiblePersonId: string | null; healthProfile: { id: string } | null } | null) {
  const writes: { kind: string; data: Record<string, unknown> }[] = [];
  const tx = {
    family: {
      findUnique: async () => candidate,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ kind: "master-update", data });
        return { id: where.id };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ kind: "master-create", data });
        return { id: "new-master" };
      },
    },
    familyMember: { upsert: async () => ({ id: "member" }) },
    healthFamily: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ kind: "health-create", data });
        return { id: "health-family" };
      },
    },
  };
  const context = {
    prisma: {
      person: { findUnique: async () => ({ id: "responsible" }) },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    },
  } as unknown as AppContext;
  return { context, writes };
}

test("health rejects an explicit family code owned by another responsible person before writing", async () => {
  const { context, writes } = fixture({ id: "existing", responsiblePersonId: "other-person", healthProfile: null });
  await assert.rejects(() => saveFamily(context, { familyCode: "FAM-001", responsiblePersonId: "responsible" }), TerritoryError);
  assert.equal(writes.length, 0);
});

test("health rejects a family code already assigned to a health profile", async () => {
  const { context, writes } = fixture({ id: "existing", responsiblePersonId: "responsible", healthProfile: { id: "other-health" } });
  await assert.rejects(() => saveFamily(context, { familyCode: "FAM-001", responsiblePersonId: "responsible" }), TerritoryError);
  assert.equal(writes.length, 0);
});

test("health reuses an explicit canonical code and preserves its responsible person when omitted", async () => {
  const { context, writes } = fixture({ id: "existing", responsiblePersonId: "responsible", healthProfile: null });
  await saveFamily(context, { familyCode: "FAM-001" });
  const health = writes.find(write => write.kind === "health-create")!;
  assert.equal(health.data.masterFamilyId, "existing");
  assert.equal(health.data.responsiblePersonId, "responsible");
});

test("health creates a canonical family without guessing a social match from its responsible person", async () => {
  const { context, writes } = fixture(null);
  await saveFamily(context, { responsiblePersonId: "responsible" });
  assert.ok(writes.some(write => write.kind === "master-create"));
  assert.equal(writes.find(write => write.kind === "health-create")!.data.masterFamilyId, "new-master");
});
