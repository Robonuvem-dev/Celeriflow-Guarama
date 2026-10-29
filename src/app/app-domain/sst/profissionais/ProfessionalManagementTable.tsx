"use client";

import { useState } from "react";
import { OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
import { usePanelPage, type PanelPage, type PanelReply } from "../_components/usePanelPage";
import { SstForm } from "../SstForm";
import { inactivateSstProfessional } from "./actions";

type Professional = { id: string; name: string; discipline: string; council: string; period: string; active: boolean };
export function ProfessionalManagementTable({ initial, loadPageAction, canInactivate, initialSelectedId }: { initial: PanelPage<Professional>; loadPageAction: (page: number) => Promise<PanelReply<Professional>>; canInactivate: boolean; initialSelectedId?: string }) {
  const { data, pending, error, changePage, retry } = usePanelPage(initial, loadPageAction);
  const [selected, setSelected] = useState<Professional | null>(() => initial.rows.find(item => item.id === initialSelectedId && item.active) || null);
  return <section className="space-y-3">
    <SstTablePanel title="Gestão das habilitações profissionais" preferenceId="sst-profissionais-gestao" description="Selecione a habilitação e feche a consulta para inativar; os formulários de cadastro e autorização permanecem montados."
      columns={[sstColumn("name", "Profissional", 260, 150), sstColumn("discipline", "Atuação", 160, 100), sstColumn("council", "Conselho", 180, 100), sstColumn("period", "Vigência", 220, 140), sstColumn("status", "Situação", 110, 85), sstColumn("actions", "Ações", 100, 90, "actions")]}
      rows={data.rows.map(item => ({ id: item.id, label: item.name, values: { name: item.name, discipline: item.discipline, council: item.council, period: item.period, status: item.active ? "Ativa" : "Inativa" }, actions: canInactivate && item.active ? <button type="button" onClick={() => setSelected(item)}>Selecionar</button> : undefined }))}
      toolbar={error && <><span role="alert">{error}</span><button type="button" onClick={retry}>Tentar novamente</button></>}
      pagination={<OperationalPagination page={data.page} total={data.total} pending={pending} onPageChange={page => void changePage(page)} />} />
    {selected && canInactivate && <section id={`professional-${selected.id}`}><h2 className="font-semibold">{selected.name}</h2><p>{selected.discipline} · {selected.council} · {selected.period}</p><SstForm action={async form => { const result = await inactivateSstProfessional(form); if (!result.error) { setSelected(null); await changePage(data.page); } return result; }} label="Inativar"><input type="hidden" name="id" value={selected.id} /></SstForm></section>}
  </section>;
}
