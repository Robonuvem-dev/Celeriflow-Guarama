import type { Prisma } from "@prisma/client";

/** Administrative representation scope does not replace a current builder/professional qualification. */
export async function assertConstructionExternalCompany(tx: Prisma.TransactionClient, identityId: string, companyId: string | null, now = new Date()) {
  if (!companyId) return;
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const company = await tx.company.findFirst({ where: { id: companyId, status: "Ativo", constructionProfile: { is: { isActive: true, startsAt: { lte: today }, endsAt: { gte: today } } } }, select: { id: true } });
  if (!company) throw new Error("A construtora requerente precisa de habilitação vigente.");
  const identity = await tx.constructionPortalIdentity.findFirst({ where: { id: identityId, isActive: true, professional: { isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }], employers: { some: { companyId, isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }] } } } }, select: { id: true } });
  if (!identity) throw new Error("O profissional precisa de vínculo vigente à construtora, além da autorização de representação.");
}
