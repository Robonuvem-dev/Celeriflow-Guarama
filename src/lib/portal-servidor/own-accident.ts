import { Prisma } from "@prisma/client";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import type { CatRow } from "@/lib/sst/accident-service";

export async function readOwnAccident(context: AppContext, id: string) {
  const employeeId = context.user.employeeId;
  if (!employeeId || !await context.prisma.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } })) throw new AccessError("Acesso funcional indisponível.", 403);
  const [cat] = await context.prisma.$queryRaw<CatRow[]>`SELECT * FROM "SstCat" WHERE id=${id} AND "employeeId"=${employeeId}`;
  if (!cat) throw new AccessError("Comunicação indisponível.", 404);
  const [state] = await context.prisma.$queryRaw<{ investigated: boolean; homologated: boolean }[]>`SELECT COALESCE(bool_or(kind='INVESTIGATION'),false) AS investigated, COALESCE(bool_or(kind='HOMOLOGATION'),false) AS homologated FROM "SstCatEvidence" WHERE "catId"=${cat.id}`;
  // The employee sees processing milestones, never clinical opinions or internal investigations.
  return { id: cat.id, occurredAt: cat.occurredAt, createdAt: cat.createdAt, kind: cat.kind, employeeName: cat.snapshot.employeeName || "", registration: cat.snapshot.registration || "", unitName: cat.snapshot.unitName || "", description: String(cat.data.description || ""), status: state?.homologated ? "HOMOLOGADA" : state?.investigated ? "EM_ANALISE" : "COMUNICADA" };
}

export async function ownAccidentStates(context: AppContext, ids: string[]) {
  if (!ids.length || !context.user.employeeId) return [];
  return context.prisma.$queryRaw<{ id: string; status: string }[]>`SELECT c.id, CASE WHEN bool_or(e.kind='HOMOLOGATION') THEN 'HOMOLOGADA' WHEN bool_or(e.kind='INVESTIGATION') THEN 'EM_ANALISE' ELSE 'COMUNICADA' END AS status FROM "SstCat" c LEFT JOIN "SstCatEvidence" e ON e."catId"=c.id WHERE c.id IN (${Prisma.join(ids)}) AND c."employeeId"=${context.user.employeeId} GROUP BY c.id`;
}
