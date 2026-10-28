import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { boardPositions, cabinets, committees, committeeMembers, councilors, hearings, laws, legislatures, minutes, propositions, sessions } from "@/db/schema/chamber";
import type { BoardPosition, Cabinet, ChamberSession, Committee, CommitteeMember, Councilor, Hearing, Law, Legislature, Proposition, SessionMinutes } from "@/lib/contracts/chamber";

export async function listLegislatures(db: DatabaseExecutor): Promise<Array<Legislature & { _count: { vereadores: number } }>> {
  const [rows, totals] = await Promise.all([db.select().from(legislatures).orderBy(desc(legislatures.numero)), db.select({ id: councilors.legislaturaId, value: count() }).from(councilors).groupBy(councilors.legislaturaId)]);
  return rows.map(row => ({ ...row, _count: { vereadores: totals.find(total => total.id === row.id)?.value ?? 0 } }));
}
export async function listCouncilors(db: DatabaseExecutor): Promise<Array<Councilor & { gabinete: Cabinet | null; cargosMesa: BoardPosition[]; legislatura: Legislature }>> {
  const [rows, rooms, positions] = await Promise.all([
    db.select({ councilor: councilors, legislature: legislatures }).from(councilors).innerJoin(legislatures, eq(councilors.legislaturaId, legislatures.id)).orderBy(asc(councilors.nomeParlamentar)),
    db.select().from(cabinets), db.select().from(boardPositions),
  ]);
  return rows.map(row => ({ ...row.councilor, gabinete: rooms.find(room => room.vereadorId === row.councilor.id) ?? null, cargosMesa: positions.filter(position => position.vereadorId === row.councilor.id), legislatura: row.legislature }));
}
export async function listChamberSessions(db: DatabaseExecutor): Promise<Array<ChamberSession & { proposicoes: Proposition[]; ata: SessionMinutes | null }>> {
  const [rows, proposals, records] = await Promise.all([db.select().from(sessions).orderBy(desc(sessions.data)), db.select().from(propositions), db.select().from(minutes)]);
  return rows.map(row => ({ ...row, proposicoes: proposals.filter(proposal => proposal.sessaoId === row.id), ata: records.find(record => record.sessaoId === row.id) ?? null }));
}
export async function listCommittees(db: DatabaseExecutor): Promise<Array<Committee & { membros: CommitteeMember[] }>> {
  const [rows, members] = await Promise.all([
    db.select().from(committees).orderBy(asc(committees.nome)),
    db.select({ member: committeeMembers, councilor: councilors }).from(committeeMembers).innerJoin(councilors, eq(committeeMembers.vereadorId, councilors.id)),
  ]);
  return rows.map(row => ({ ...row, membros: members.filter(member => member.member.comissaoId === row.id).map(member => ({ ...member.member, vereador: member.councilor })) }));
}
export async function listPropositions(db: DatabaseExecutor): Promise<Array<Proposition & { autor: Councilor; sessao: ChamberSession | null }>> {
  const rows = await db.select({ proposition: propositions, author: councilors, session: sessions }).from(propositions).innerJoin(councilors, eq(propositions.autorId, councilors.id)).leftJoin(sessions, eq(propositions.sessaoId, sessions.id)).orderBy(desc(propositions.createdAt));
  return rows.map(row => ({ ...row.proposition, autor: row.author, sessao: row.session }));
}
export async function listServingCouncilors(db: DatabaseExecutor): Promise<Councilor[]> {
  return db.select().from(councilors).where(eq(councilors.status, "Em Exercício")).orderBy(asc(councilors.nomeParlamentar));
}
export async function listLaws(db: DatabaseExecutor): Promise<Array<Law & { proposicao: (Proposition & { autor: Councilor }) | null }>> {
  const rows = await db.select({ law: laws, proposition: propositions, author: councilors }).from(laws).leftJoin(propositions, eq(laws.proposicaoId, propositions.id)).leftJoin(councilors, eq(propositions.autorId, councilors.id)).orderBy(desc(laws.dataPublicacao));
  return rows.map(row => ({ ...row.law, proposicao: row.proposition && row.author ? { ...row.proposition, autor: row.author } : null }));
}
export async function listHearings(db: DatabaseExecutor): Promise<Array<Hearing & { sessao: ChamberSession | null; legislatura: Legislature | null }>> {
  const rows = await db.select({ hearing: hearings, session: sessions, legislature: legislatures }).from(hearings).leftJoin(sessions, eq(hearings.sessaoId, sessions.id)).leftJoin(legislatures, eq(hearings.legislaturaId, legislatures.id)).orderBy(desc(hearings.data));
  return rows.map(row => ({ ...row.hearing, sessao: row.session, legislatura: row.legislature }));
}
export async function getChamberTotals(db: DatabaseExecutor): Promise<[number, number, number, number, number, number]> {
  const results = await Promise.all([
    db.select({ value: count() }).from(councilors).where(eq(councilors.status, "Em Exercício")), db.select({ value: count() }).from(sessions),
    db.select({ value: count() }).from(propositions), db.select({ value: count() }).from(committees).where(eq(committees.status, "Ativa")),
    db.select({ value: count() }).from(laws), db.select({ value: count() }).from(hearings),
  ]);
  return [results[0][0].value, results[1][0].value, results[2][0].value, results[3][0].value, results[4][0].value, results[5][0].value];
}
export async function getChamberPortal(db: DatabaseExecutor): Promise<[number, number, number, ChamberSession[]]> {
  const [members, proposals, norms, upcoming] = await Promise.all([
    db.select({ value: count() }).from(councilors).where(and(eq(councilors.active, true), eq(councilors.status, "Em Exercício"))),
    db.select({ value: count() }).from(propositions), db.select({ value: count() }).from(laws).where(eq(laws.status, "Vigente")),
    db.select().from(sessions).where(inArray(sessions.status, ["Agendada", "Em Preparação"])).orderBy(asc(sessions.data)).limit(3),
  ]);
  return [members[0].value, proposals[0].value, norms[0].value, upcoming];
}
