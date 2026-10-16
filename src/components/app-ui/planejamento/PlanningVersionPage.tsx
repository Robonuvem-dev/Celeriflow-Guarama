import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningBasePath } from "@/lib/planejamento/policy";
import { readPlanningVersion } from "@/lib/planejamento/versions";
import { planningDateSchema } from "@/lib/planejamento/revisions";

export async function PlanningVersionPage({ context, id, kind, number, asOf, pageInput }: { context: PlanningContext; id: string; kind: string; number: number; asOf?: string; pageInput?: string }) {
  const version = await readPlanningVersion(context, id, number);
  const date = asOf ? planningDateSchema.parse(asOf) : new Date().toISOString().slice(0, 10);
  const piece = version.snapshot.piece as { title: string; kind: string };
  if (piece.kind.toLowerCase() !== kind) throw new Error("Versão de outro tipo de peça.");
  const lines = version.snapshot.lines as unknown as { id: string; code: string; description: string; year: number; originalValue: string; physicalTarget: string; budgetUnit: { name: string }; resourceSource: { name: string }; movements: { value: string; effectiveAt: string }[] }[];
  const requested = Number(pageInput ?? "1"); const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(lines.length / 20)));
  const base = `${planningBasePath(context.jurisdiction)}/${kind}/${id}`;
  const href = (value: number) => `${base}?${new URLSearchParams({ version: String(number), asOf: date, page: String(value) })}`;
  return <PageFrame className="space-y-3 p-3"><Link href={base} className="text-xs underline">← Posição atual</Link><PageHeader title={`${piece.title} · versão ${number}`} /><p className="text-xs text-muted-foreground">Ato {version.legalActNumber} · Vigência {version.effectiveAt.toISOString().slice(0, 10)} · Conteúdo imutável · Hash {version.hash}</p><form method="get" className="flex gap-2"><input type="hidden" name="version" value={number} /><input name="asOf" type="date" defaultValue={date} required className="rounded border bg-background p-2" /><button className="rounded border p-2 text-sm">Consultar corte</button></form><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Previsão</TableHead><TableHead>Exercício / unidade</TableHead><TableHead>Fonte</TableHead><TableHead>Original</TableHead><TableHead>Atualizado no corte</TableHead></TableRow></TableHeader><TableBody>{lines.slice((page - 1) * 20, page * 20).map((line) => <TableRow key={line.id}><TableCell>{line.code}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.year} · {line.budgetUnit.name}</TableCell><TableCell>{line.resourceSource.name}</TableCell><TableCell>{line.originalValue}</TableCell><TableCell>{line.movements.filter((row) => row.effectiveAt.slice(0, 10) <= date).reduce((sum, row) => sum.plus(row.value), new Prisma.Decimal(line.originalValue)).toFixed(2)}</TableCell></TableRow>)}</TableBody></Table><ErpPagination page={page} total={lines.length} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: base, values: { version: String(number), asOf: date } }} /><Link href={`${base}/gestao/relatorios`} className="text-xs underline">Relatórios da peça — selecione esta versão na emissão</Link></PageFrame>;
}
