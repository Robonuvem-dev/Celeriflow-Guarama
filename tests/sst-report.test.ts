import test from "node:test";
import assert from "node:assert/strict";
import { certificateReport } from "../src/lib/sst/report-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";

test("absence report includes planned workers without certificates in its denominator", async () => {
  const date = (value: string) => new Date(`2026-10-10T${value}:00Z`);
  const records = [{ id: "c", employeeId: "absent", startsAt: date("08:00"), endsAt: date("12:00"), status: "APPROVED", cidCodes: ["M54.5"], employeeName: "Ausente", birthDate: null, functionalPeriodId: "historical-period" }];
  const planned = [{ employeeId: "absent", startsAt: date("08:00"), endsAt: date("16:00"), employeeName: "Ausente" }, { employeeId: "present", startsAt: date("08:00"), endsAt: date("16:00"), employeeName: "Presente" }];
  const context = {
    user: { id: "u", profileCode: "OPERADOR", allowedBudgetUnitIds: ["ug"], modulePermissions: [], permissions: JSON.stringify({ modules: { SST: { blocked: false, issueReports: true } } }) },
    prisma: {
      sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true }) },
      $queryRaw: async (query: Prisma.Sql) => query.text.includes("range_agg") ? [{ total: 0 }] : query.text.includes('FROM "SstPlannedShift"') ? query.text.includes("count(*)") ? [{ total: 2 }] : planned : query.text.includes("count(*)") ? [{ total: 1 }] : records,
    },
  } as unknown as AppContext;
  const report = await certificateReport(context, { budgetUnitId: "ug", from: date("00:00"), until: date("23:59") });
  assert.equal(report.statistics.length, 2);
  assert.equal(report.statistics.reduce((sum, item) => sum + item.plannedMinutes, 0), 960);
  assert.equal(report.statistics.reduce((sum, item) => sum + item.absentMinutes, 0), 240);
  assert.equal(report.statistics.find((item) => item.employeeId === "present")?.certificateCount, 0);
});
