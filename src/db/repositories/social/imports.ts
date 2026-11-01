import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../transaction";
import { people } from "../../schema/people";
import { addresses } from "../../schema/registry";
import { familyMembers } from "../../schema/master-data";
import * as s from "../../schema/social";
import * as w from "../../schema/social-workflows";
import { localCadunicoLayout, parseLocalCadunico } from "@/lib/social/cadunico-import";
import { saveSocialFamilyInTransaction } from "./operations";
import { recalculateSocialFamily } from "./workflow-operations";
import { insertAuditEvent } from "../platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { Decimal } from "../../decimal";
import { socialCadastreSnapshots, socialImportLayouts } from "../../schema/social-operation-models";
import { defaultImportLayout } from "@/lib/social/municipal-contract";

export async function previewSocialImport(tx: DatabaseTransaction, input: { unitId: string; filename: string; content: string; actorId: string; layoutId?: string }) {
  const [definition]=input.layoutId?await tx.select().from(socialImportLayouts).where(and(eq(socialImportLayouts.id,input.layoutId),eq(socialImportLayouts.isActive,true))):[];
  if(input.layoutId&&!definition)throw new Error("Layout de importação inexistente ou inativo.");
  const layoutKey=definition?`${definition.name} — ${definition.version} [${definition.id}]`:localCadunicoLayout;
  const rows = parseLocalCadunico(input.content,definition?.configuration||defaultImportLayout), sha256 = createHash("sha256").update(input.content).digest("hex");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`social-import:${input.unitId}:${sha256}`},0))`);
  const [previous] = await tx.select().from(w.socialImportBatches).where(and(eq(w.socialImportBatches.unitId, input.unitId), eq(w.socialImportBatches.sha256, sha256), eq(w.socialImportBatches.layout, layoutKey)));
  if (previous) return previous.id;
  const rejected = rows.filter(r => r.errors.length).length;
  const [batch] = await tx.insert(w.socialImportBatches).values({ unitId: input.unitId, filename: input.filename.slice(0, 250), sha256, layout: layoutKey, accepted: rows.length - rejected, rejected, createdBy: input.actorId }).returning();
  await tx.insert(w.socialImportRows).values(rows.map(row => ({ batchId: batch.id, line: row.line, payload: row })));
  await insertAuditEvent(tx, { actorUsuarioId: input.actorId, eventType: auditEventTypes.administrativeMutation, targetType: "SocialImportPreview", targetId: batch.id });
  return batch.id;
}
export async function applySocialImport(tx: DatabaseTransaction, batchId: string, actorId: string) {
  await tx.execute(sql`SELECT id FROM "SocialImportBatch" WHERE id=${batchId} FOR UPDATE`);
  const [batch] = await tx.select().from(w.socialImportBatches).where(eq(w.socialImportBatches.id, batchId));
  if (!batch) throw new Error("Lote inexistente.");
  if (batch.status === "APPLIED") return batch.id;
  const rows = await tx.select().from(w.socialImportRows).where(eq(w.socialImportRows.batchId, batchId)).orderBy(w.socialImportRows.line);
  const accepted = rows.filter(r => !r.payload.errors.length);
  if (!accepted.length) throw new Error("Lote sem linhas válidas.");
  const personIds = new Map<string, string>();
  for (const { payload: p, id } of accepted) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`social-cpf:${p.cpf}`},0))`);
    const matches=await tx.select().from(people).where(sql`regexp_replace(${people.cpf},'[^0-9]','','g')=${p.cpf}`).limit(2);
    if(matches.length>1)throw new Error(`Linha ${p.line}: há mais de um cadastro com este CPF; concilie antes da importação.`);
    const [existing] = matches;
    const [nisRecord] = p.nis?await tx.select().from(s.socialPersonProfiles).where(eq(s.socialPersonProfiles.nis, p.nis)):[];
    if (nisRecord && nisRecord.personId !== existing?.id) throw new Error(`Linha ${p.line}: NIS vinculado a outra pessoa. Nenhuma linha foi aplicada.`);
    const values = { fullName: p.name, cpf: p.cpf, birthDate: new Date(`${p.birthDate}T00:00:00Z`), phonePrimary: p.phone || existing?.phonePrimary || null };
    const [person] = existing ? await tx.update(people).set(values).where(eq(people.id, existing.id)).returning() : await tx.insert(people).values(values).returning();
    personIds.set(p.cpf, person.id);
    await tx.insert(s.socialPersonProfiles).values({ personId: person.id, nis: p.nis||null }).onConflictDoUpdate({ target: s.socialPersonProfiles.personId, set: p.nis?{nis:p.nis}:{lastReviewedAt:new Date()} });
    await tx.insert(w.socialBeneficiaryRegistrations).values({ personId: person.id, unitId: batch.unitId, registeredAt: new Date().toISOString().slice(0, 10) }).onConflictDoNothing();
    const composition = accepted.filter(r => r.payload.familyCode === p.familyCode).length, perCapita = new Decimal(p.income).div(composition).toDecimalPlaces(2);
    if(p.nis)await tx.insert(s.cadUnicoRecords).values({ nis: p.nis, cpf: p.cpf, nomeCompleto: p.name, rendaPerCapita: perCapita, composicaoFamiliar: composition, endereco: p.address, municipio: p.municipality, uf: p.uf }).onConflictDoUpdate({ target: s.cadUnicoRecords.nis, set: { cpf: p.cpf, nomeCompleto: p.name, rendaPerCapita: perCapita, composicaoFamiliar: composition, endereco: p.address, municipio: p.municipality, uf: p.uf, dataAtualizacao: new Date() } });
    const snapshot={cpf:p.cpf,personId:person.id,unitId:batch.unitId,nis:p.nis||null,name:p.name,familyCode:p.familyCode,perCapitaIncome:perCapita,composition,address:p.address,municipality:p.municipality,uf:p.uf,batchId:batch.id};
    await tx.insert(socialCadastreSnapshots).values(snapshot).onConflictDoUpdate({target:socialCadastreSnapshots.cpf,set:snapshot});
    await tx.update(w.socialImportRows).set({ personId: person.id }).where(eq(w.socialImportRows.id, id));
  }
  for (const code of new Set(accepted.map(r => r.payload.familyCode))) {
    const members = accepted.filter(r => r.payload.familyCode === code).map(r => r.payload), rep = members.find(r => r.kinship === "RESPONSAVEL")!;
    const representativeId = personIds.get(rep.cpf)!;
    const [existing] = await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.familyCode, code));
    if (existing && existing.representativeId !== representativeId) throw new Error(`Família ${code}: responsável divergente; concilie antes de aplicar.`);
    const family = await saveSocialFamilyInTransaction(tx, { representativeId, familyCode: code, nis: rep.nis, income: Number(rep.income) }, existing?.id);
    const current = await tx.select().from(s.socialFamilyMembers).where(eq(s.socialFamilyMembers.familyId, family.id));
    const imported = new Set(members.map(m => personIds.get(m.cpf)!));
    if (current.some(m => !imported.has(m.personId))) throw new Error(`Família ${code}: a composição local contém membros ausentes do arquivo. Concilie antes de aplicar.`);
    await tx.insert(w.socialFamilyRegistrations).values({ familyId: family.id, unitId: batch.unitId }).onConflictDoNothing();
    for (const member of members.filter(m => m.kinship !== "RESPONSAVEL")) {
      const personId = personIds.get(member.cpf)!;
      const [other] = await tx.select().from(s.socialFamilyMembers).where(eq(s.socialFamilyMembers.personId, personId));
      if (other && other.familyId !== family.id) throw new Error(`Linha ${member.line}: membro pertence a outra família.`);
      await tx.insert(s.socialFamilyMembers).values({ familyId: family.id, personId, kinship: member.kinship }).onConflictDoUpdate({ target: s.socialFamilyMembers.personId, set: { kinship: member.kinship } });
      await tx.insert(familyMembers).values({ familyId: family.masterFamilyId!, personId, kinship: member.kinship }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { kinship: member.kinship } });
    }
    if (rep.address) {
      const [address] = await tx.insert(addresses).values({ personId: representativeId, streetName: rep.address, addressType: "Residencial" }).returning();
      await tx.update(s.socialFamilies).set({ addressId: address.id }).where(eq(s.socialFamilies.id, family.id));
    }
    await recalculateSocialFamily(tx, family.id);
  }
  await tx.update(w.socialImportBatches).set({ status: "APPLIED", appliedAt: new Date() }).where(eq(w.socialImportBatches.id, batch.id));
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "SocialImportApplied", targetId: batch.id });
  return batch.id;
}
