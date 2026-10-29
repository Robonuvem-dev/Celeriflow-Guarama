import Link from "next/link";
import { Decimal } from "@/db/decimal";
import { z } from "zod";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { PlanningWorkspace } from "./PlanningWorkspace";
import { PlanningList, planningColumn as col } from "./PlanningList";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningBasePath } from "@/lib/planejamento/policy";
import { readPlanningVersion } from "@/lib/planejamento/versions";
import { planningDateSchema } from "@/lib/planejamento/revisions";

export async function PlanningVersionPage({ context, id, kind, number, asOf, pageInput }: { context: PlanningContext; id: string; kind: string; number: number; asOf?: string; pageInput?: string }) {
  const version = await readPlanningVersion(context, id, number);
  const date = asOf ? planningDateSchema.parse(asOf) : new Date().toISOString().slice(0, 10);
  const snapshot = z.object({ piece: z.object({ title: z.string(), kind: z.string() }), lines: z.array(z.object({ id: z.string(), code: z.string(), description: z.string(), year: z.number(), originalValue: z.string(), physicalTarget: z.string(), budgetUnit: z.object({ name: z.string() }), resourceSource: z.object({ name: z.string() }), movements: z.array(z.object({ value: z.string(), effectiveAt: z.string() })) })) }).parse(version.snapshot);
  const piece = snapshot.piece;
  if (piece.kind.toLowerCase() !== kind) throw new Error("Versão de outro tipo de peça.");
  const lines = snapshot.lines;
  const requested = Number(pageInput ?? "1"); const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(lines.length / OPERATIONAL_PAGE_SIZE)));
  const base = `${planningBasePath(context.jurisdiction)}/${kind}/${id}`;
  return <PlanningWorkspace><Link href={base} className="text-xs underline">← Posição atual</Link><PageHeader title={`${piece.title} · versão ${number}`} /><p className="text-xs text-muted-foreground">Ato {version.legalActNumber} · Vigência {version.effectiveAt.toISOString().slice(0, 10)} · Conteúdo imutável · Hash {version.hash}</p>
    <section data-table-area="version" aria-label={`Versão ${number}`}><PlanningList id={`planning:${context.jurisdiction}:version`} label={`Previsões da versão ${number}`} pathname={base} page={page} total={lines.length} values={{ version: number, asOf: date }}
      toolbar={<form method="get" className={styles.searchForm}><input type="hidden" name="version" value={number} /><input aria-label="Data de corte" name="asOf" type="date" defaultValue={date} required className={styles.searchInput} /><button className={styles.dialogButton}>Consultar corte</button></form>}
      columns={[col("code", "Código", 70, 100), col("description", "Previsão", 120, 280), col("year", "Exercício", 76, 90), col("unit", "Unidade", 100, 180), col("source", "Fonte", 100, 180), col("original", "Original", 100, 130, { align: "right" }), col("updated", "Atualizado no corte", 140, 170, { align: "right" })]}
      rows={lines.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(line => ({ id: line.id, label: line.code, values: { code: line.code, description: line.description, year: String(line.year), unit: line.budgetUnit.name, source: line.resourceSource.name, original: line.originalValue, updated: line.movements.filter(row => row.effectiveAt.slice(0, 10) <= date).reduce((sum, row) => sum.plus(row.value), new Decimal(line.originalValue)).toFixed(2) } }))} /></section>
    <Link href={`${base}/gestao/relatorios`} className="text-xs underline">Relatórios da peça — selecione esta versão na emissão</Link></PlanningWorkspace>;
}
