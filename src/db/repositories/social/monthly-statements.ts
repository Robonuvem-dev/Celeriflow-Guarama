import { and, eq, gte, lt } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import * as s from "../../schema/social";
import * as w from "../../schema/social-workflows";
import { monthlyIndicatorDefinitions, type SocialMonthlySnapshot } from "@/lib/social/municipal-contract";
import { readSocialParameters } from "./parameters";

export async function calculateSocialMonthly(database: DatabaseExecutor, unitId: string, competence: string, declared: Record<string, number>): Promise<SocialMonthlySnapshot> {
  const [unit] = await database.select().from(s.socialUnits).where(eq(s.socialUnits.id, unitId));
  if (!unit || !["CRAS", "CREAS"].includes(unit.type)) throw new Error("O relatório mensal exige unidade CRAS ou CREAS.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) throw new Error("Competência inválida.");
  const first = `${competence}-01`, next = new Date(`${first}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const end = new Date(next); end.setUTCDate(end.getUTCDate() - 1);
  const last = end.toISOString().slice(0, 10), fromInstant = new Date(`${first}T00:00:00-03:00`), nextInstant = new Date(`${next.toISOString().slice(0, 10)}T00:00:00-03:00`);
  const [followups, attendances, referrals, visits, settings] = await Promise.all([
    database.select().from(w.socialFollowups).where(eq(w.socialFollowups.unitId, unitId)),
    database.select().from(s.socialAttendances).where(and(eq(s.socialAttendances.unitId, unitId), eq(s.socialAttendances.isActive, true), gte(s.socialAttendances.date, fromInstant), lt(s.socialAttendances.date, nextInstant))),
    database.select({ referral: s.socialReferrals, detail: w.socialReferralDetails, destination: s.socialNetworkOrganizations.organizationType }).from(s.socialReferrals).leftJoin(w.socialReferralDetails, eq(w.socialReferralDetails.referralId, s.socialReferrals.id)).innerJoin(s.socialNetworkOrganizations, eq(s.socialNetworkOrganizations.id, s.socialReferrals.destinationOrganizationId)).where(and(eq(s.socialReferrals.unitId, unitId), gte(s.socialReferrals.referredAt, new Date(`${first}T00:00:00Z`)), lt(s.socialReferrals.referredAt, new Date(`${next.toISOString().slice(0, 10)}T00:00:00Z`)))),
    database.select().from(s.socialVisits).where(and(eq(s.socialVisits.unitId, unitId), eq(s.socialVisits.status, "Realizada"), gte(s.socialVisits.realizedDate, fromInstant), lt(s.socialVisits.realizedDate, nextInstant))),
    readSocialParameters(database),
  ]);
  const relevant = followups.filter(f => f.service === (unit.type === "CRAS" ? "PAIF" : "PAEFI"));
  const key = (f: typeof relevant[number]) => f.familyId || f.personId!;
  const countCases = (rows: typeof relevant) => new Set(rows.map(key)).size;
  const auto: Record<string, number> = { A1: countCases(relevant.filter(f => f.startsAt <= last && (!f.endsAt || f.endsAt >= first))), A2: countCases(relevant.filter(f => f.startsAt >= first && f.startsAt <= last)) };
  const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (unit.type === "CRAS") {
    auto.C1 = attendances.length; auto.C6 = visits.length;
    auto.C2 = referrals.filter(r => r.destination.toUpperCase() === "CADUNICO" && norm(r.detail?.referralType || "").includes("INCLUSAO")).length;
    auto.C3 = referrals.filter(r => r.destination.toUpperCase() === "CADUNICO" && norm(r.detail?.referralType || "").includes("ATUALIZACAO")).length;
    auto.C4 = referrals.filter(r => norm(r.detail?.referralType || "").includes("BPC")).length;
    const destinations = await database.select().from(s.socialUnits).where(eq(s.socialUnits.type, "CREAS"));
    auto.C5 = referrals.filter(r => destinations.some(u => u.id === r.detail?.destinationUnitId)).length;
  } else {
    auto.M1 = attendances.length; auto.M4 = visits.length;
    const destinations = await database.select().from(s.socialUnits).where(eq(s.socialUnits.type, "CRAS"));
    auto.M3 = referrals.filter(r => destinations.some(u => u.id === r.detail?.destinationUnitId)).length;
  }
  const definitions = monthlyIndicatorDefinitions(unit.type);
  if (Object.keys(declared).some(code => !definitions.some(([key]) => key === code))) throw new Error("Indicador incompatível com o tipo da unidade.");
  const totals={...auto,...declared};
  for(const [code] of definitions.filter(([code])=>!code.includes("."))){const children=definitions.filter(([child])=>child.startsWith(code+"."));if(children.length&&children.every(([child])=>declared[child]!==undefined)){const sum=children.reduce((value,[child])=>value+declared[child],0);if(declared[code]!==undefined&&declared[code]!==sum)throw new Error(`O total ${code} deve corresponder à soma dos perfis por sexo e idade.`);totals[code]=sum;}}
  if(unit.type==="CREAS")for(const [all,la,psc] of [["J1","J2","J3"],["J4","J5","J6"]])if(totals[all]!==undefined&&totals[la]!==undefined&&totals[psc]!==undefined&&(totals[all]<Math.max(totals[la],totals[psc])||totals[all]>totals[la]+totals[psc]))throw new Error(`Confira ${all}, ${la} e ${psc}: os conjuntos podem se sobrepor, mas devem respeitar seus totais.`);
  return { title: settings.parameters.monthlyTitle, modelVersion: settings.parameters.modelVersion, unitType: unit.type, competence, indicators: definitions.map(([code, block, label]) => ({ code, block, label, value: totals[code] ?? null, source: declared[code] !== undefined ? "DECLARED" : totals[code] !== undefined ? "CALCULATED" : "UNINFORMED" })) };
}
