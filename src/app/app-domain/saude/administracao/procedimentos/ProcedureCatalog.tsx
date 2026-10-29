"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { healthColumn } from "../../operational-columns";
import { HealthReadTable } from "../../HealthReadTable";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";

export type ProcedureRow = {
  id: string;
  source: string;
  competence: string;
  code: string;
  description: string;
  group: string;
  subgroup: string;
  complexity: string;
  registrationInstrument: string;
  unitValue: string | null;
  minimumAge: number | null;
  maximumAge: number | null;
  allowedSex: string;
  financing: string;
  cidCodes: string;
  cboCodes: string;
  serviceCodes: string;
  classificationCodes: string;
  isActive: boolean;
  origin: string;
  fileName: string;
  versions: { id: string; competence: string; isCurrent: boolean; createdAt: string; origin: string; fileName: string }[];
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ProcedureCatalog({ rows }: { rows: ProcedureRow[] }) {
  const [detail, setDetail] = useState<ProcedureRow | null>(null);
  return (
    <>
      <OperationalTable preferenceId="saude-admin-procedimentos" caption="Procedimentos ambulatoriais" columns={[healthColumn("code", "Código", 130, 95, "identifier"), healthColumn("description", "Descrição", 300, 130), healthColumn("group", "Grupo", 180, 100), healthColumn("complexity", "Complexidade", 150, 110), healthColumn("competence", "Competência", 130, 100), healthColumn("status", "Situação", 100, 80, "status"), healthColumn("actions", "Ações", 48, 48, "actions", "right", 64)]} rows={rows.map(row => ({ id: row.id, label: row.code, values: { code: row.code, description: row.description, group: row.group || "—", complexity: row.complexity || "—", competence: row.competence, status: row.isActive ? "Ativo" : "Inativo" }, actions: <button onClick={() => setDetail(row)} aria-label={`Detalhar procedimento ${row.code}`}><Eye className="size-4" /></button> }))} />
      <Dialog open={Boolean(detail)} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader><DialogTitle>{detail?.code} · {detail?.description}</DialogTitle><DialogDescription>{detail?.source} · competência {detail?.competence}</DialogDescription></DialogHeader>
          {detail && <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Grupo", detail.group], ["Subgrupo", detail.subgroup], ["Complexidade", detail.complexity], ["Instrumento de registro", detail.registrationInstrument],
              ["Valor unitário", detail.unitValue === null ? "Não informado" : currency.format(Number(detail.unitValue))],
              ["Idade permitida", detail.minimumAge === null && detail.maximumAge === null ? "Não informada" : `${detail.minimumAge ?? 0} a ${detail.maximumAge ?? "sem limite"}`],
              ["Sexo permitido", detail.allowedSex], ["Financiamento", detail.financing], ["CIDs relacionados", detail.cidCodes], ["CBOs relacionados", detail.cboCodes],
              ["Serviços relacionados", detail.serviceCodes], ["Classificações relacionadas", detail.classificationCodes], ["Origem registrada", detail.origin], ["Arquivo", detail.fileName],
            ].map(([label, value]) => <div key={String(label)} className={String(value).length > 80 ? "sm:col-span-2" : ""}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-slate-800">{value || "Não informado"}</dd></div>)}
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">Versões registradas</dt><dd><OperationalTablePanel title={`Versões registradas · ${detail.code}`} triggerLabel={`Consultar ${detail.versions.length} versões`} description="Histórico integral de origem e arquivo.">
              <HealthReadTable key={detail.id} id="saude-procedimento-versoes" label="Versões registradas" columns={[healthColumn("competence", "Competência", 150, 100), healthColumn("status", "Situação", 120, 90, "status"), healthColumn("origin", "Origem", 260, 120), healthColumn("file", "Arquivo", 300, 130)]} rows={detail.versions.map(version => ({ id: version.id, label: version.competence, values: { competence: version.competence, status: version.isCurrent ? "Atual" : "Histórica", origin: version.origin, file: version.fileName } }))} />
            </OperationalTablePanel></dd></div>
          </dl>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDetail(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
