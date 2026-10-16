import "server-only";
import type { PrismaClient } from "@prisma/client";
import { cemeteryProcessWhere, type CemeteryQuery } from "./query-policy";

export async function listCemeteryProcesses(db: PrismaClient, query: CemeteryQuery) {
  const where = cemeteryProcessWhere(query);
  const total = await db.cemeteryProcess.count({ where });
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await db.cemeteryProcess.findMany({ where, include: { deceased: { include: { cause: true } }, cemetery: true, chapel: true, grave: true }, orderBy: [{ scheduledAt: "desc" }, { id: "desc" }], take: 20, skip: (page - 1) * 20 });
  const [homes, declarants] = await Promise.all([db.taxFuneralHome.findMany({ where: { id: { in: rows.flatMap(r => r.funeralHomeId ? [r.funeralHomeId] : []) } } }), db.taxpayer.findMany({ where: { id: { in: rows.map(r => r.declarantTaxpayerId) } }, include: { person: true, company: true } })]);
  const items = rows.map(r => ({ ...r, funeralHome: homes.find(h => h.id === r.funeralHomeId) || null, declarant: declarants.find(t => t.id === r.declarantTaxpayerId) || null }));
  return { items, total, page, pageSize: 20 };
}

export async function cemeteryBurialReport(db: PrismaClient, query: CemeteryQuery) {
  const rows = await db.cemeteryProcess.findMany({ where: cemeteryProcessWhere(query, true), include: { deceased: { include: { cause: true } }, cemetery: true, grave: true }, orderBy: [{ performedAt: "asc" }, { id: "asc" }] });
  const homes = await db.taxFuneralHome.findMany({ where: { id: { in: rows.flatMap(r => r.funeralHomeId ? [r.funeralHomeId] : []) } } });
  return rows.map(r => ({ ...r, funeralHome: homes.find(h => h.id === r.funeralHomeId) || null }));
}
