"use client";

import { useState, useTransition } from "react";
import { saveDiscountAmnestyAction, deleteDiscountAmnestyAction } from "./actions";
import { TaxOperationalTable } from "../../TaxOperationalTable";
import { Printer, Plus, Trash2, Pencil, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type DiscountAmnesty = {
  id: string;
  name: string;
  scopeType: string;
  originType: string;
  debtStatus: string;
  validFrom: string;
  validUntil: string;
  dueDateLimit: string | null;
  referenceMessage: string | null;
  principalDiscountPercent: number;
  penaltyDiscountPercent: number;
  interestDiscountPercent: number;
  correctionDiscountPercent: number;
  active: boolean;
  legalReference: string;
  version: number;
  createdAt: string;
};

const scopeOptions = [
  { value: "TODOS", label: "Todos os Tipos de Pasta" },
  { value: "IMOBILIARIO", label: "Cadastro Imobiliário (IPTU/Taxas)" },
  { value: "ECONOMICO", label: "Cadastro Econômico (ISS/Taxas)" },
  { value: "DIVERSOS", label: "Diversos / Outras Receitas" }
];

const originOptions = [
  { value: "DIVIDA_DO_ANO", label: "Dívida do Ano (Exercício Corrente)" },
  { value: "DIVIDA_ATIVA", label: "Dívida Ativa Inscrita" },
  { value: "DIVIDA_AJUIZADA", label: "Dívida Ajuizada / Execução Fiscal" },
  { value: "SEGUNDA_VIA", label: "2ª Via de Guias" },
  { value: "PORTAL", label: "Portal do Contribuinte / Autoatendimento" }
];

const debtStatusOptions = [
  { value: "TODOS", label: "Todas as Situações" },
  { value: "EM_ABERTO", label: "Em Aberto" },
  { value: "VENCIDO", label: "Vencido" },
  { value: "PARCELADO", label: "Parcelado" },
  { value: "AJUIZADO", label: "Ajuizado" }
];

export default function DescontosAnistiasClient(props: { rules: DiscountAmnesty[] }) {
  const [rules, setRules] = useState<DiscountAmnesty[]>(props.rules);
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [editingRule, setEditingRule] = useState<DiscountAmnesty | null>(null);
  const [viewingRule, setViewingRule] = useState<DiscountAmnesty | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const field = "mt-1 w-full rounded border p-1.5 text-xs";

  const filtered = rules.filter(r => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.legalReference.toLowerCase().includes(search.toLowerCase()) ||
      (r.referenceMessage ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesOrigin = !originFilter || r.originType === originFilter;
    const matchesScope = !scopeFilter || r.scopeType === scopeFilter;
    return matchesSearch && matchesOrigin && matchesScope;
  });

  async function handleDelete(id: string) {
    if (!confirm("Deseja realmente inativar/excluir esta regra de desconto/anistia?")) return;
    startTransition(async () => {
      const res = await deleteDiscountAmnestyAction(id);
      if (res.error) {
        setNotice(res.error);
      } else {
        setRules(prev => prev.filter(r => r.id !== id));
        setNotice("Regra de desconto/anistia excluída com sucesso.");
      }
    });
  }

  return (
    <div className="h-full space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Parametrização de Descontos e Anistias</h1>
          <p className="text-xs text-slate-500">
            Configuração de políticas de anistia e descontos para emissão de guias (Dívida do Ano, Ativa, Ajuizada, 2ª via e Portal), limites por vencimento, pastas e percentuais incidentes sobre principal, multa, juros e correção monetária.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/tributacao/cobranca/descontos-anistias/relatorio${originFilter ? `?origin=${originFilter}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="size-3.5" />
            Imprimir Relatório
          </a>
          <button
            onClick={() => {
              setEditingRule(null);
              setIsCreating(true);
            }}
            className="inline-flex h-8 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="size-3.5" />
            Nova Parametrização
          </button>
        </div>
      </div>

      {notice && <p role="status" className="rounded border bg-amber-50 p-2 text-sm">{notice}</p>}

      <TaxOperationalTable
        id="tabela-descontos-anistias"
        resetKey={`${search}:${originFilter}:${scopeFilter}`}
        emptyMessage="Nenhuma parametrização de desconto ou anistia encontrada."
        toolbar={
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              aria-label="Buscar parametrização"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, lei municipal ou mensagem"
              className="h-8 min-w-0 flex-1 rounded border px-2 text-[13px]"
            />
            <select
              value={originFilter}
              onChange={e => setOriginFilter(e.target.value)}
              className="h-8 rounded border px-2 text-xs"
            >
              <option value="">Todas as origens</option>
              {originOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={scopeFilter}
              onChange={e => setScopeFilter(e.target.value)}
              className="h-8 rounded border px-2 text-xs"
            >
              <option value="">Todas as pastas</option>
              {scopeOptions.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        }
        columns={[
          ["name", "Regra / Programa", 150, 200, "identifier"],
          ["scope", "Pasta", 100, 120],
          ["origin", "Origem", 120, 150],
          ["discounts", "Descontos (P / M / J / C)", 140, 170],
          ["validity", "Validade", 130, 150],
          ["status", "Status", 75, 85, "status"],
          ["actions", "Ações", 90, 110, "actions"]
        ]}
        rows={filtered.map(r => ({
          id: r.id,
          label: r.name,
          values: {
            name: r.name,
            scope: r.scopeType,
            origin: originOptions.find(o => o.value === r.originType)?.label.split(" (")[0] ?? r.originType,
            discounts: `P: ${r.principalDiscountPercent}% · M: ${r.penaltyDiscountPercent}% · J: ${r.interestDiscountPercent}% · C: ${r.correctionDiscountPercent}%`,
            validity: `${r.validFrom} a ${r.validUntil}`,
            status: r.active ? "Ativo" : "Inativo"
          },
          actions: (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewingRule(r)}
                title="Visualizar"
                className="text-slate-600 hover:text-slate-900"
              >
                <Eye className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditingRule(r);
                  setIsCreating(false);
                }}
                title="Editar"
                className="text-emerald-700 hover:text-emerald-900"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => handleDelete(r.id)}
                title="Excluir"
                className="text-rose-600 hover:text-rose-800"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        }))}
      />

      {/* Modal de Criação / Edição */}
      <Dialog
        open={isCreating || editingRule !== null}
        onOpenChange={open => {
          if (!open) {
            setIsCreating(false);
            setEditingRule(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? `Editar Regra: ${editingRule.name}` : "Nova Parametrização de Descontos e Anistias"}
            </DialogTitle>
          </DialogHeader>

          <form
            action={form => startTransition(async () => {
              const res = await saveDiscountAmnestyAction({
                id: editingRule?.id,
                name: String(form.get("name")),
                scopeType: String(form.get("scopeType")) as any,
                originType: String(form.get("originType")) as any,
                debtStatus: String(form.get("debtStatus")) as any,
                validFrom: String(form.get("validFrom")),
                validUntil: String(form.get("validUntil")),
                dueDateLimit: String(form.get("dueDateLimit") || "") || null,
                referenceMessage: String(form.get("referenceMessage") || "").trim() || null,
                principalDiscountPercent: Number(form.get("principalDiscountPercent") ?? 0),
                penaltyDiscountPercent: Number(form.get("penaltyDiscountPercent") ?? 0),
                interestDiscountPercent: Number(form.get("interestDiscountPercent") ?? 0),
                correctionDiscountPercent: Number(form.get("correctionDiscountPercent") ?? 0),
                active: form.get("active") === "on",
                legalReference: String(form.get("legalReference")),
                reason: String(form.get("reason"))
              });

              if (res.error) {
                setNotice(res.error);
              } else {
                setNotice("Parametrização salva com sucesso.");
                setIsCreating(false);
                setEditingRule(null);
                window.location.reload();
              }
            })}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="text-xs font-medium sm:col-span-2">Nome do Programa / Regra
              <input
                name="name"
                required
                defaultValue={editingRule?.name}
                placeholder="Ex: REFIS 2026 - Pagamento à Vista com 100% de Anistia"
                className={field}
              />
            </label>

            <label className="text-xs font-medium">Pasta de Aplicação
              <select
                name="scopeType"
                defaultValue={editingRule?.scopeType ?? "TODOS"}
                className={field}
              >
                {scopeOptions.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium">Origem do Débito
              <select
                name="originType"
                defaultValue={editingRule?.originType ?? "DIVIDA_DO_ANO"}
                className={field}
              >
                {originOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium">Situação do Débito
              <select
                name="debtStatus"
                defaultValue={editingRule?.debtStatus ?? "TODOS"}
                className={field}
              >
                {debtStatusOptions.map(st => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium">Limite por Data de Vencimento
              <input
                name="dueDateLimit"
                type="date"
                defaultValue={editingRule?.dueDateLimit ?? ""}
                className={field}
              />
            </label>

            <label className="text-xs font-medium">Início da Validade
              <input
                name="validFrom"
                type="date"
                required
                defaultValue={editingRule?.validFrom ?? new Date().toISOString().slice(0, 10)}
                className={field}
              />
            </label>

            <label className="text-xs font-medium">Fim da Validade
              <input
                name="validUntil"
                type="date"
                required
                defaultValue={editingRule?.validUntil ?? ""}
                className={field}
              />
            </label>

            <div className="sm:col-span-2 rounded border bg-slate-50 p-3">
              <h4 className="text-xs font-bold text-slate-700 mb-2">Percentuais de Desconto e Anistia (%)</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="text-xs font-medium">Principal (%)
                  <input
                    name="principalDiscountPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={editingRule?.principalDiscountPercent ?? 0}
                    className={field}
                  />
                </label>
                <label className="text-xs font-medium">Multa (%)
                  <input
                    name="penaltyDiscountPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={editingRule?.penaltyDiscountPercent ?? 100}
                    className={field}
                  />
                </label>
                <label className="text-xs font-medium">Juros (%)
                  <input
                    name="interestDiscountPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={editingRule?.interestDiscountPercent ?? 100}
                    className={field}
                  />
                </label>
                <label className="text-xs font-medium">Correção (%)
                  <input
                    name="correctionDiscountPercent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={editingRule?.correctionDiscountPercent ?? 0}
                    className={field}
                  />
                </label>
              </div>
            </div>

            <label className="text-xs font-medium sm:col-span-2">Mensagem de Referência para Guia / Portal
              <textarea
                name="referenceMessage"
                rows={2}
                defaultValue={editingRule?.referenceMessage ?? ""}
                placeholder="Ex: Desconto concedido conforme Lei Municipal de Recuperação Fiscal nº 1.450/2026."
                className={field}
              />
            </label>

            <label className="text-xs font-medium sm:col-span-2">Fundamento Legal / Decreto Regulamentador
              <input
                name="legalReference"
                required
                defaultValue={editingRule?.legalReference}
                placeholder="Ex: Art. 15 da Lei nº 1.450/2026 e Decreto nº 88/2026"
                className={field}
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium sm:col-span-2">
              <input
                name="active"
                type="checkbox"
                defaultChecked={editingRule?.active ?? true}
              />
              Regra Ativa para Aplicação na Cobrança
            </label>

            <label className="text-xs font-medium sm:col-span-2">Motivo / Justificativa Administrativa
              <textarea
                name="reason"
                required
                defaultValue="Parametrização de programa de incentivo à arrecadação e anistia fiscal"
                className={field}
              />
            </label>

            <div className="flex justify-end gap-2 sm:col-span-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setEditingRule(null);
                }}
                className="h-8 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                disabled={pending}
                className="h-8 rounded bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {editingRule ? "Atualizar Regra" : "Salvar Regra"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Visualização */}
      <Dialog
        open={viewingRule !== null}
        onOpenChange={open => {
          if (!open) setViewingRule(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Parametrização</DialogTitle>
          </DialogHeader>

          {viewingRule && (
            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-500">Nome:</span>
                <p className="text-sm font-bold text-slate-800">{viewingRule.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded">
                <div>
                  <span className="font-semibold text-slate-500">Origem:</span>
                  <p>{originOptions.find(o => o.value === viewingRule.originType)?.label}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Pasta:</span>
                  <p>{scopeOptions.find(s => s.value === viewingRule.scopeType)?.label}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Situação:</span>
                  <p>{viewingRule.debtStatus}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Vigência:</span>
                  <p>{viewingRule.validFrom} até {viewingRule.validUntil}</p>
                </div>
              </div>

              <div className="rounded border bg-emerald-50/50 p-2">
                <span className="font-semibold text-emerald-900 block mb-1">Percentuais de Desconto Aplicáveis:</span>
                <div className="grid grid-cols-4 gap-1 text-center font-mono font-bold text-slate-800">
                  <div className="bg-white p-1 rounded border">Princ: {viewingRule.principalDiscountPercent}%</div>
                  <div className="bg-white p-1 rounded border">Multa: {viewingRule.penaltyDiscountPercent}%</div>
                  <div className="bg-white p-1 rounded border">Juros: {viewingRule.interestDiscountPercent}%</div>
                  <div className="bg-white p-1 rounded border">Corr: {viewingRule.correctionDiscountPercent}%</div>
                </div>
              </div>

              {viewingRule.referenceMessage && (
                <div>
                  <span className="font-semibold text-slate-500">Mensagem de Referência:</span>
                  <p className="mt-0.5 rounded border bg-slate-50 p-2 text-slate-700">{viewingRule.referenceMessage}</p>
                </div>
              )}

              <div>
                <span className="font-semibold text-slate-500">Fundamento Legal:</span>
                <p className="text-slate-700">{viewingRule.legalReference}</p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setViewingRule(null)}
                  className="h-8 rounded border px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
