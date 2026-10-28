import { sql } from "drizzle-orm";
import { listSstUnits, sstParameters } from "@/db/repositories/sst/scope";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { equipmentDto, equipmentItemDto, equipmentDeliveryDto, type EquipmentWire, type EquipmentItemWire, type EquipmentDeliveryWire } from "@/db/repositories/sst/equipment";
import { sstDatabase } from "./database";
import { assertBudgetUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

export function equipmentPageNumber(value: string | undefined, total: number) {
  const number = Number(value);
  return Math.min(Number.isFinite(number) ? Math.max(1, Math.trunc(number)) : 1, Math.max(1, Math.ceil(total / 20)));
}
export async function equipmentScope(context: AppContext, unitId?: string) {
  if (unitId) assertBudgetUnitAccess(context.user, unitId);
  const units = await listSstUnits(sstDatabase(context), context);
  const ids = unitId ? units.filter(u=>u.id===unitId).map(u=>u.id) : units.map(u=>u.id);
  return { units, ids, sql: sql`IN (${sstParameters(ids)})` };
}
export async function listEquipment(context: AppContext, params: { budgetUnitId?: string; q?: string; page?: string }) {
  const scope = await equipmentScope(context,params.budgetUnitId);
  const filter = sql`e."budgetUnitId" ${scope.sql} AND (m."name" ILIKE ${`%${params.q?.trim() || ""}%`} OR m."code" ILIKE ${`%${params.q?.trim() || ""}%`})`;
  const [count] = await sstRows<{ total: number }>(sstDatabase(context), sql`SELECT count(*)::int AS total FROM "SstEquipment" e JOIN "Material" m ON m."id"=e."materialId" WHERE ${filter}`);
  const page = equipmentPageNumber(params.page,count.total);
  const records = (await sstRows<EquipmentWire>(sstDatabase(context), sql`SELECT e.*,m."name",m."code" FROM "SstEquipment" e JOIN "Material" m ON m."id"=e."materialId" WHERE ${filter} ORDER BY e."createdAt" DESC,e."id" ASC LIMIT 20 OFFSET ${(page-1)*20}`)).map(equipmentDto);
  return {...scope,records,total:count.total,page};
}
export async function listEquipmentDeliveries(context: AppContext, params: { budgetUnitId?: string; q?: string; page?: string; due?: string }) {
  const scope = await equipmentScope(context,params.budgetUnitId);
  const due = params.due === "review" ? sql`AND i."quantity">i."writtenOffQuantity" AND i."nextReviewAt"<=CURRENT_TIMESTAMP` : params.due === "expiry" ? sql`AND i."quantity">i."writtenOffQuantity" AND i."expiresAt"<=CURRENT_TIMESTAMP` : sql``;
  const filter = sql`d."budgetUnitId" ${scope.sql} AND (i."snapshot"->>'employee' ILIKE ${`%${params.q?.trim() || ""}%`} OR i."snapshot"->>'equipment' ILIKE ${`%${params.q?.trim() || ""}%`}) ${due}`;
  const [count] = await sstRows<{ total:number }>(sstDatabase(context), sql`SELECT count(*)::int AS total FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE ${filter}`);
  const page=equipmentPageNumber(params.page,count.total);
  const records=(await sstRows<EquipmentItemWire>(sstDatabase(context), sql`SELECT i.*,d."budgetUnitId",d."deliveredAt" FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE ${filter} ORDER BY d."deliveredAt" DESC,i."id" ASC LIMIT 20 OFFSET ${(page-1)*20}`)).map(equipmentItemDto);
  return {...scope,records,total:count.total,page};
}
export async function getEquipmentDelivery(context: AppContext,id:string) {
  const scope=await equipmentScope(context);
  const [deliveryWire]=await sstRows<EquipmentDeliveryWire>(sstDatabase(context), sql`SELECT * FROM "SstEquipmentDelivery" WHERE "id"=${id} AND "budgetUnitId" ${scope.sql}`);
  const delivery=deliveryWire ? equipmentDeliveryDto(deliveryWire) : null;
  if(!delivery) return null;
  const items=(await sstRows<EquipmentItemWire>(sstDatabase(context), sql`SELECT i.*,d."budgetUnitId",d."deliveredAt" FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE i."deliveryId"=${id} ORDER BY i."snapshot"->>'employee',i."id"`)).map(equipmentItemDto);
  const events=(await sstRows<{id:string;itemId:string;kind:string;quantity:number;occurredAt:string;nextReviewAt:string|null;notes:string;responsible:string;createdAt:string}>(sstDatabase(context), sql`SELECT e.*,p."fullName" AS responsible FROM "SstEquipmentEvent" e JOIN "SstEquipmentDeliveryItem" i ON i."id"=e."itemId" JOIN "Person" p ON p."id"=e."responsiblePersonId" WHERE i."deliveryId"=${id} ORDER BY e."occurredAt",e."id"`)).map(row => ({ ...row, occurredAt: sstTimestamp(row.occurredAt), nextReviewAt: row.nextReviewAt === null ? null : sstTimestamp(row.nextReviewAt), createdAt: sstTimestamp(row.createdAt) }));
  return {delivery,items,events};
}

export type UsageReportRow={id:string;employee:string;equipment:string;quantity:number;writtenOff:number;deliveredAt:Date;averageDays:number|null;openDays:number;role:string;department:string;costCenter:string;ghe:string;writeOffs:{date:string;quantity:number}[]};
export async function equipmentUsageReport(context:AppContext,params:{budgetUnitId?:string;q?:string;page?:string;from?:string;to?:string;role?:string;department?:string;costCenter?:string;ghe?:string}) {
  const scope=await equipmentScope(context,params.budgetUnitId);
  const from=/^\d{4}-\d{2}-\d{2}$/.test(params.from||"")?new Date(`${params.from}T00:00:00-03:00`):null;
  const to=/^\d{4}-\d{2}-\d{2}$/.test(params.to||"")?new Date(`${params.to}T23:59:59.999-03:00`):null;
  const filter=sql`d."budgetUnitId" ${scope.sql}
    AND i."snapshot"->>'employee' ILIKE ${`%${params.q||""}%`}
    AND i."snapshot"->>'role' ILIKE ${`%${params.role||""}%`}
    AND i."snapshot"->>'department' ILIKE ${`%${params.department||""}%`}
    AND i."snapshot"->>'costCenter' ILIKE ${`%${params.costCenter||""}%`}
    AND (i."snapshot"->'ghe')::text ILIKE ${`%${params.ghe||""}%`}
    ${from ? sql`AND d."deliveredAt">=${from}`:sql``} ${to ? sql`AND d."deliveredAt"<=${to}`:sql``}`;
  const [count]=await sstRows<{total:number}>(sstDatabase(context), sql`SELECT count(*)::int AS total FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE ${filter}`);
  const page=equipmentPageNumber(params.page,count.total);
  const records=(await sstRows<Omit<UsageReportRow,"deliveredAt"> & {deliveredAt:string}>(sstDatabase(context), sql`SELECT i."id",i."snapshot"->>'employee' AS employee,i."snapshot"->>'equipment' AS equipment,i."quantity",i."writtenOffQuantity" AS "writtenOff",d."deliveredAt",i."snapshot"->>'role' AS role,i."snapshot"->>'department' AS department,i."snapshot"->>'costCenter' AS "costCenter",(i."snapshot"->'ghe')::text AS ghe,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-d."deliveredAt"))::float8/86400 AS "openDays",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date',to_char(e."occurredAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'quantity',e."quantity") ORDER BY e."occurredAt",e."id") FROM "SstEquipmentEvent" e WHERE e."itemId"=i."id" AND e."kind"='WRITE_OFF'),'[]'::jsonb) AS "writeOffs",
    (SELECT sum(e."quantity"*EXTRACT(EPOCH FROM (e."occurredAt"-d."deliveredAt"))::float8/86400)/NULLIF(sum(e."quantity"),0) FROM "SstEquipmentEvent" e WHERE e."itemId"=i."id" AND e."kind"='WRITE_OFF') AS "averageDays"
    FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE ${filter} ORDER BY d."deliveredAt" DESC,i."id" LIMIT 20 OFFSET ${(page-1)*20}`)).map(row => ({...row,deliveredAt:sstTimestamp(row.deliveredAt)}));
  const grouped=sql`FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" JOIN "SstEquipmentEvent" e ON e."itemId"=i."id" AND e."kind"='WRITE_OFF' WHERE ${filter}`;
  const [groupCount]=await sstRows<{total:number}>(sstDatabase(context), sql`SELECT count(*)::int AS total FROM (SELECT i."snapshot"->>'role',i."snapshot"->>'department',i."snapshot"->>'costCenter',(i."snapshot"->'ghe')::text ${grouped} GROUP BY 1,2,3,4) groups`);
  const summaryPage=equipmentPageNumber(params.page,groupCount.total);
  const summary=await sstRows<{role:string;department:string;costCenter:string;ghe:string;quantity:number;averageDays:number|null}>(sstDatabase(context), sql`SELECT i."snapshot"->>'role' AS role,i."snapshot"->>'department' AS department,i."snapshot"->>'costCenter' AS "costCenter",(i."snapshot"->'ghe')::text AS ghe,sum(e."quantity")::float8 AS quantity,sum(e."quantity"*EXTRACT(EPOCH FROM (e."occurredAt"-d."deliveredAt"))::float8/86400)/NULLIF(sum(e."quantity"),0) AS "averageDays" ${grouped} GROUP BY 1,2,3,4 ORDER BY 1,2,3,4 LIMIT 20 OFFSET ${(summaryPage-1)*20}`);
  return {...scope,records,summary,summaryTotal:groupCount.total,summaryPage,total:count.total,page};
}

export type RequirementReportRow={id:string;employee:string;groupName:string;recommendation:string;equipment:string|null;required:number|null;inUse:number;pending:number|null;program:string};
export async function equipmentRequirementsReport(context:AppContext,params:{budgetUnitId?:string;q?:string;page?:string;includeDeliveries?:string}) {
  const scope=await equipmentScope(context,params.budgetUnitId);
  // One UG per secretariat is required, just as for delivery; no ambiguous ownership is projected.
  const base=sql`FROM "SstProgramExposureGroup" pg
    JOIN "SstOccupationalProgram" p ON p."id"=pg."programId"
    JOIN "BudgetUnit" u ON u."id"=p."budgetUnitId"
    JOIN "Employee" emp ON emp."secretariatId"=u."secretariatId" AND emp."isActive"=true
    CROSS JOIN LATERAL (SELECT DISTINCT jsonb_array_elements_text(risk->'epis') AS recommendation FROM jsonb_array_elements(pg."risks") risk WHERE risk->>'epiApplicable'='true') rec
    LEFT JOIN "SstEquipmentRequirement" req ON req."programGroupId"=pg."id" AND req."recommendation"=rec.recommendation
    LEFT JOIN "SstEquipment" eq ON eq."id"=req."equipmentId"
    LEFT JOIN "Material" m ON m."id"=eq."materialId"
    LEFT JOIN LATERAL (SELECT COALESCE(sum(i."quantity"-i."writtenOffQuantity"),0)::float8 AS quantity FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE i."employeeId"=emp."id" AND i."equipmentId"=eq."id" AND d."budgetUnitId"=u."id" AND i."expiresAt">CURRENT_TIMESTAMP) usage ON true
    WHERE p."budgetUnitId" ${scope.sql} AND p."kind"='PGR' AND p."startsAt"<=CURRENT_TIMESTAMP AND p."endsAt">=CURRENT_TIMESTAMP
    AND NOT EXISTS (SELECT 1 FROM "SstOccupationalProgram" newer WHERE newer."budgetUnitId"=p."budgetUnitId" AND newer."kind"='PGR' AND newer."code"=p."code" AND newer."version">p."version" AND newer."startsAt"<=CURRENT_TIMESTAMP AND newer."endsAt">=CURRENT_TIMESTAMP)
    AND (SELECT count(*) FROM "BudgetUnit" other WHERE other."secretariatId"=u."secretariatId")=1
    AND (pg."groupSnapshot"->>'startsAt' IS NULL OR (pg."groupSnapshot"->>'startsAt')::timestamp<=CURRENT_TIMESTAMP)
    AND (pg."groupSnapshot"->>'endsAt' IS NULL OR (pg."groupSnapshot"->>'endsAt')::timestamp>=CURRENT_TIMESTAMP)
    AND (COALESCE(jsonb_array_length(NULLIF(pg."groupSnapshot"->'departmentIds','null'::jsonb)),0)=0 OR (pg."groupSnapshot"->'departmentIds') ? emp."departmentId")
    AND (COALESCE(jsonb_array_length(NULLIF(pg."groupSnapshot"->'roleIds','null'::jsonb)),0)=0 OR (pg."groupSnapshot"->'roleIds') ? emp."roleId")
    AND emp."name" ILIKE ${`%${params.q||""}%`}`;
  const [count]=await sstRows<{total:number}>(sstDatabase(context), sql`SELECT count(*)::int AS total ${base}`);
  const page=equipmentPageNumber(params.page,count.total);
  const records=await sstRows<RequirementReportRow>(sstDatabase(context), sql`SELECT pg."id"||':'||emp."id"||':'||rec.recommendation AS id, emp."name" AS employee,COALESCE(pg."groupSnapshot"->>'name',pg."groupSnapshot"->>'code') AS "groupName",rec.recommendation,m."name" AS equipment,req."quantity" AS required,usage.quantity AS "inUse",CASE WHEN req."id" IS NULL THEN NULL ELSE GREATEST(req."quantity"-usage.quantity,0)::float8 END AS pending,p."code"||' v'||p."version" AS program ${base} ORDER BY emp."name",emp."id",p."id",pg."id",rec.recommendation LIMIT 20 OFFSET ${(page-1)*20}`);
  return {...scope,records,total:count.total,page};
}
