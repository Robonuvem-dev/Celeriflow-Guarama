import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

export const cemeteryLookupSchema = z.object({
  kind: z.enum(["taxpayer", "grave", "deceased", "document", "cemetery", "funeralHome", "cause", "chapel", "lot", "ossuary", "sector"]),
  q: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  cemeteryId: z.string().max(100).default(""),
  personOnly: z.enum(["true", "false"]).default("false"),
});
export type CemeteryLookupItem = { id: string; label: string };

export async function cemeteryLookup(db: PrismaClient, input: z.infer<typeof cemeteryLookupSchema>) {
  const skip = (input.page - 1) * 20;
  const scoped = input.cemeteryId ? { cemeteryId: input.cemeteryId } : {};
  const contains = { contains: input.q, mode: "insensitive" as const };
  let items: CemeteryLookupItem[] = [];
  let total = 0;
  if (input.kind === "taxpayer") {
    const where = { status: "Ativo", ...(input.personOnly === "true" ? { personId: { not: null } } : {}), ...(input.q ? { OR: [{ person: { fullName: contains } }, { person: { cpf: contains } }, { company: { corporateName: contains } }, { company: { cnpj: contains } }] } : {}) };
    total = await db.taxpayer.count({ where });
    items = (await db.taxpayer.findMany({ where, include: { person: true, company: true }, orderBy: { id: "asc" }, skip, take: 20 })).map(r => ({ id: r.id, label: r.person ? `${r.person.fullName} · ${r.person.cpf ?? "sem CPF"}` : `${r.company?.corporateName ?? r.id} · ${r.company?.cnpj ?? "sem CNPJ"}` }));
  } else if (input.kind === "grave") {
    const where = { ...scoped, ...(input.q ? { code: contains } : {}) };
    total = await db.taxGrave.count({ where });
    items = (await db.taxGrave.findMany({ where, include: { cemetery: true }, orderBy: [{ code: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: `${r.code} · ${r.cemetery.name} · ${r.occupantCount}/${r.capacity} · ${r.active ? r.status : "INATIVA"}` }));
  } else if (input.kind === "deceased") {
    const where = { ...scoped, ...(input.q ? { fullName: contains } : {}) };
    total = await db.taxDeceased.count({ where });
    items = (await db.taxDeceased.findMany({ where, orderBy: [{ fullName: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: `${r.fullName} · ${r.deathDate.toISOString().slice(0, 10)} · ${r.status}` }));
  } else if (input.kind === "document") {
    const where = { status: { in: ["Válido", "Pendente"] }, ...(input.q ? { title: contains } : {}) };
    total = await db.document.count({ where });
    items = (await db.document.findMany({ where, orderBy: [{ title: "asc" }, { id: "asc" }], skip, take: 20, select: { id: true, title: true } })).map(r => ({ id: r.id, label: r.title }));
  } else if (input.kind === "cemetery") {
    const where = input.q ? { name: contains } : {};
    total = await db.taxCemetery.count({ where });
    items = (await db.taxCemetery.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: r.name }));
  } else if (input.kind === "funeralHome") {
    const where = { active: true, ...(input.q ? { name: contains } : {}) };
    total = await db.taxFuneralHome.count({ where });
    items = (await db.taxFuneralHome.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: r.name }));
  } else if (input.kind === "cause") {
    const where = input.q ? { OR: [{ description: contains }, { code: contains }] } : {};
    total = await db.taxDeathCause.count({ where });
    items = (await db.taxDeathCause.findMany({ where, orderBy: [{ description: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: `${r.code} · ${r.description}` }));
  } else if (input.kind === "chapel") {
    const where = { ...scoped, ...(input.q ? { name: contains } : {}) };
    total = await db.cemeteryChapel.count({ where });
    items = (await db.cemeteryChapel.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: r.name }));
  } else if (input.kind === "sector") {
    const where = { ...scoped, ...(input.q ? { OR: [{ code: contains }, { name: contains }] } : {}) };
    total = await db.taxCemeterySector.count({ where });
    items = (await db.taxCemeterySector.findMany({ where, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: `${r.code} · ${r.name}` }));
  } else if (input.kind === "lot") {
    const where = { ...scoped, ...(input.q ? { identifier: contains } : {}) };
    total = await db.cemeteryLot.count({ where });
    items = (await db.cemeteryLot.findMany({ where, orderBy: [{ identifier: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: `${r.identifier} · ${r.active ? r.status : "INATIVO"}` }));
  } else {
    const where = { ...scoped, ...(input.q ? { code: contains } : {}) };
    total = await db.cemeteryOssuary.count({ where });
    items = (await db.cemeteryOssuary.findMany({ where, orderBy: [{ code: "asc" }, { id: "asc" }], skip, take: 20 })).map(r => ({ id: r.id, label: `${r.code} · ${r.occupantCount}/${r.capacity}` }));
  }
  return { items, total, page: input.page, pageSize: 20 };
}
