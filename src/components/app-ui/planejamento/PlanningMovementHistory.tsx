import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import type { PlanningContext } from "@/lib/planejamento/access";
import { getPlanningMovementHistory } from "@/lib/planejamento/revisions";

export async function PlanningMovementHistory({ context, instrumentId, pathname, asOf, page, linePage }: {
  context: PlanningContext; instrumentId: string; pathname: string; asOf: string; page?: string; linePage: number;
}) {
  const data = await getPlanningMovementHistory(context, instrumentId, page);
  const values = { asOf, page: String(linePage) };
  const href = (movementPage: number) => `${pathname}?${new URLSearchParams({ ...values, movementPage: String(movementPage) })}`;
  return <Card><CardHeader><CardTitle>Histórico de alterações legais</CardTitle></CardHeader><CardContent>
    <Table><TableHeader><TableRow><TableHead>Vigência</TableHead><TableHead>Previsão</TableHead><TableHead>Ato legal</TableHead><TableHead>Alteração (R$)</TableHead><TableHead>Fundamento</TableHead></TableRow></TableHeader><TableBody>
      {data.records.map((row) => <TableRow key={row.id}><TableCell>{row.effectiveAt.toISOString().slice(0, 10)}</TableCell><TableCell>{row.line.code} · {row.line.description}</TableCell><TableCell>{row.legalActNumber}</TableCell><TableCell>{row.value.toFixed(2)}</TableCell><TableCell><details><summary className="cursor-pointer">{row.reason}</summary><p className="whitespace-pre-wrap text-xs">{row.legalText}</p><p className="text-xs text-muted-foreground">Registrado em {row.createdAt.toISOString()} · Responsável: {row.createdById}</p></details></TableCell></TableRow>)}
      {!data.records.length && <TableRow><TableCell colSpan={5} className="py-6 text-center">Nenhuma alteração legal registrada.</TableCell></TableRow>}
    </TableBody></Table><ErpPagination page={data.page} total={data.total} pageSize={20} previousHref={href(data.page - 1)} nextHref={href(data.page + 1)} />
    {data.total > 20 && <form action={pathname} method="get" className="mt-2 flex items-center gap-2 text-xs"><input type="hidden" name="asOf" value={asOf} /><input type="hidden" name="page" value={linePage} /><label>Ir para página do histórico<input type="number" name="movementPage" min="1" max={Math.ceil(data.total / 20)} defaultValue={data.page} className="ml-2 w-16 rounded border bg-background p-1" /></label><button className="rounded border px-2 py-1">Ir</button></form>}
  </CardContent></Card>;
}
