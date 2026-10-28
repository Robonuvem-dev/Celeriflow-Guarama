import { readFileSync } from "node:fs";
import { createSstClinicalFixture } from "./sst-clinical-fixture";

export async function createSstAccidentFixture() {
  const local = await createSstClinicalFixture(), db = local.database;
  try {
    for (const name of ["20261011030000_add_sst_accidents", "20261011100000_complete_sst_cat_layout"]) await db.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    const seedCat = async () => {
      await db.exec(`INSERT INTO "SstCat" (id,"budgetUnitId","employeeId","occurredAt",kind,source,data,snapshot,"createdById","submissionKey","requestHash") VALUES ('cat','ug','employee','2026-10-01 12:00','TYPICAL','SST','{"generatingStatus":"INITIAL","location":"Oficina","agent":"Máquina","bodyParts":["Mão"]}','{"employeeName":"Canonical employee","registration":"123"}','user','seed-cat','hash')`);
      return "cat";
    };
    const seedRestriction = async () => {
      await db.exec(`INSERT INTO "SstRestriction" (id,"budgetUnitId","employeeId","professionalRoleId","startsAt","endsAt",data,"createdById","submissionKey","requestHash") VALUES ('restriction','ug','employee','role','2026-01-01','2027-01-01','{}','user','seed-restriction','hash');
        INSERT INTO "SstRestrictionEmailOutbox" (id,"restrictionId",recipient,"dueAt") VALUES ('outbox','restriction','responsible@example.invalid','2026-01-01')`);
    };
    return { ...local, db, seedCat, seedRestriction };
  } catch (error) { await local.close(); throw error; }
}
