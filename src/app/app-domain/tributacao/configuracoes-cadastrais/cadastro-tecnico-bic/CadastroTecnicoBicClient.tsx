"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Printer, Sliders, Database, Eye, EyeOff, Lock, Unlock, Download } from "lucide-react";
import type { z } from "zod";
import type { fiscalCatalogSchema, fiscalFieldSchema } from "@/lib/tributacao/configurable-cadastres";
import { fiscalFieldTypeLabel } from "@/lib/tributacao/fiscal-field-definition";
import { publishFiscalCatalogAction } from "../actions";
import { FiscalFieldsEditor } from "../FiscalFieldsEditor";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../../TaxOperationalTable";

type Catalog = { id: string; version: number; data: z.infer<typeof fiscalCatalogSchema> };
type Field = z.infer<typeof fiscalFieldSchema>;

const targetKindMap = {
  IMOVEIS: ["BCI_TERRENO", "BCI_UNIDADE", "SITUACAO_IMOVEL"] as const,
  EMPRESAS: ["FORMULARIO_EMPRESA", "SITUACAO_EMPRESA", "TIPO_EMPRESA"] as const,
  RURAIS: ["BCI_RURAL"] as const,
};

export default function CadastroTecnicoBicClient({
  units,
  catalogs,
}: {
  units: { id: string; entityId: string; label: string }[];
  catalogs: Catalog[];
}) {
  const [bicType, setBicType] = useState<"IMOVEIS" | "EMPRESAS" | "RURAIS">("IMOVEIS");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");

  // Catálogos elegíveis para a aba selecionada
  const eligibleKinds: readonly string[] = targetKindMap[bicType];
  const eligibleCatalogs = catalogs.filter((c) => eligibleKinds.includes(c.data.kind));

  // Catálogo selecionado
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(
    eligibleCatalogs[0]?.id ?? ""
  );

  const activeCatalog =
    eligibleCatalogs.find((c) => c.id === selectedCatalogId) || eligibleCatalogs[0];

  // Campos em edição
  const [fields, setFields] = useState<Field[]>(activeCatalog?.data.fields ?? []);

  // Quando troca o tipo ou o catálogo
  const handleSelectCatalog = (catId: string) => {
    setSelectedCatalogId(catId);
    const cat = catalogs.find((c) => c.id === catId);
    setFields(cat?.data.fields ?? []);
  };

  const handleSwitchBicType = (type: "IMOVEIS" | "EMPRESAS" | "RURAIS") => {
    setBicType(type);
    const matching = catalogs.filter((c) => (targetKindMap[type] as readonly string[]).includes(c.data.kind));
    const firstId = matching[0]?.id ?? "";
    setSelectedCatalogId(firstId);
    setFields(matching[0]?.data.fields ?? []);
  };

  const updateField = (index: number, patch: Partial<Field>) => {
    setFields((current) =>
      current.map((f, i) => (i === index ? { ...f, ...patch } : f))
    );
  };

  const removeField = (index: number) => {
    setFields((current) => current.filter((_, i) => i !== index));
  };

  const addField = () => {
    const nextSeq = fields.length + 1;
    const newF: Field = {
      key: `campo_${nextSeq}`,
      label: `Novo Campo ${nextSeq}`,
      type: "TEXT",
      sequence: nextSeq,
      maxLength: 250,
      visible: true,
      enabled: true,
      required: false,
      options: [],
    };
    setFields((current) => [...current, newF]);
  };

  // Ações de visibilidade e bloqueio em lote/rápido
  const toggleVisible = (index: number) => {
    const f = fields[index];
    updateField(index, { visible: f.visible === false ? true : false });
  };

  const toggleEnabled = (index: number) => {
    const f = fields[index];
    updateField(index, { enabled: f.enabled === false ? true : false });
  };

  const saveCatalog = () => {
    if (!activeCatalog) {
      setNotice("Nenhum catálogo cadastrado para este tipo. Crie um catálogo inicial na tela de configurações cadastrais.");
      return;
    }
    const unit = units.find((u) => u.id === activeCatalog.data.budgetUnitId) || units[0];
    startTransition(async () => {
      const res = await publishFiscalCatalogAction({
        catalogId: activeCatalog.id,
        expectedVersion: activeCatalog.version,
        governmentEntityId: unit?.entityId ?? "",
        budgetUnitId: unit?.id ?? "",
        kind: activeCatalog.data.kind,
        code: activeCatalog.data.code,
        name: activeCatalog.data.name,
        active: activeCatalog.data.active,
        fields,
        legalBasis: activeCatalog.data.legalBasis || "Definição do Cadastro Técnico Municipal / BIC",
        neighborhoodId: activeCatalog.data.neighborhoodId,
        streetId: activeCatalog.data.streetId,
        landUnitValue: activeCatalog.data.landUnitValue,
        validatePartnerDebt: activeCatalog.data.validatePartnerDebt,
        zoningActivities: activeCatalog.data.zoningActivities,
      });
      setNotice(res.error ?? "Parâmetros do Cadastro Técnico (BIC) salvos e publicados com sucesso.");
    });
  };

  // CSV de relatório impresso
  const csvData = [
    ["Atributo", "Descrição", "Sequência", "Tipo Dado", "Tamanho", "Visível", "Habilitado", "Obrigatório", "Consulta em Tabela"],
    ...fields.map((f, i) => [
      f.key,
      f.label,
      String(f.sequence ?? i + 1),
      fiscalFieldTypeLabel(f),
      String(f.maxLength ?? 4000),
      f.visible === false ? "Não" : "Sim",
      f.enabled === false ? "Não (Bloqueado)" : "Sim",
      f.required ? "Sim" : "Não",
      f.type === "LIST" ? `Sim (${(f.options ?? []).join("; ")})` : "Não",
    ]),
  ];
  const csvContent = csvData.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 border-r pr-2">
        <button
          type="button"
          onClick={() => handleSwitchBicType("IMOVEIS")}
          className={`h-7 rounded px-2.5 text-xs font-semibold ${bicType === "IMOVEIS" ? "bg-emerald-700 text-white" : "border bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          BIC Imóveis
        </button>
        <button
          type="button"
          onClick={() => handleSwitchBicType("EMPRESAS")}
          className={`h-7 rounded px-2.5 text-xs font-semibold ${bicType === "EMPRESAS" ? "bg-emerald-700 text-white" : "border bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          BIC Empresas
        </button>
        <button
          type="button"
          onClick={() => handleSwitchBicType("RURAIS")}
          className={`h-7 rounded px-2.5 text-xs font-semibold ${bicType === "RURAIS" ? "bg-emerald-700 text-white" : "border bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          BIC Rural
        </button>
      </div>

      {eligibleCatalogs.length > 0 ? (
        <select
          value={activeCatalog?.id ?? ""}
          onChange={(e) => handleSelectCatalog(e.target.value)}
          className="h-7 rounded border px-2 text-[12px]"
        >
          {eligibleCatalogs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.data.name} ({c.data.kind}) · v{c.version}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-xs text-amber-700 font-medium">
          Nenhum modelo cadastrado para este tipo de BIC.
        </span>
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={addField}
        className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
      >
        <Plus className="size-3.5" />
        Incluir Campo
      </button>
      <button
        type="button"
        disabled={pending || !activeCatalog}
        onClick={saveCatalog}
        className="inline-flex h-7 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar Configuração"}
      </button>
      <a
        download={`parametrizacao-bic-${bicType.toLowerCase()}.csv`}
        href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + csvContent)}`}
        className="inline-flex h-7 items-center gap-1 rounded border bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Printer className="size-3.5" />
        Imprimir Relatório (CSV)
      </a>
      <Link
        href="/tributacao/configuracoes-cadastrais"
        className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="size-3.5" />
        Voltar a Configurações
      </Link>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <Sliders className="size-5 text-emerald-700" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Definição Parametrizada do Cadastro Técnico Municipal (BIC)
            </h1>
            <p className="text-xs text-slate-500">
              Parametrização do Boletim de Informações Cadastrais (BIC) para empresas, imóveis urbanos e rurais. Controle de atributos, tipos de dados, visibilidade, bloqueio e consulta em tabelas.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {notice}
        </p>
      )}

      <TaxOperationalTable
        id="cadastro-tecnico-bic"
        resetKey={`${bicType}:${selectedCatalogId}:${fields.length}`}
        toolbar={toolbar}
        actions={actions}
        emptyMessage="Nenhum campo cadastrado no modelo técnico selecionado."
        columns={[
          ["key", "Atributo", 80, 140, "identifier"],
          ["label", "Descrição", 120, 240],
          ["sequence", "Sequência", 65, 90, "text", "right"],
          ["type", "Tipo Dado", 80, 120],
          ["size", "Tamanho", 65, 85, "text", "right"],
          ["visible", "Visível", 60, 80],
          ["enabled", "Habilitado", 65, 95],
          ["required", "Obrigatório", 65, 90],
          ["lookup", "Consulta Tabela", 100, 220],
          ["actions", "Ações", 75, 75, "actions"],
        ]}
        rows={fields.map((f, index) => ({
          id: String(index),
          label: f.label || f.key,
          values: {
            key: f.key,
            label: f.label,
            sequence: String(f.sequence ?? index + 1),
            type: fiscalFieldTypeLabel(f),
            size: String(f.maxLength ?? 4000),
            visible: f.visible === false ? "Não (Oculto)" : "Sim",
            enabled: f.enabled === false ? "Não (Bloqueado)" : "Sim",
            required: f.required ? "Sim" : "Não",
            lookup: f.type === "LIST" ? (f.options?.join("; ") || "Sim (Lista)") : "Não aplicável",
          },
          cells: {
            key: (
              <input
                aria-label={`Atributo ${index + 1}`}
                value={f.key}
                onChange={(e) => updateField(index, { key: e.target.value })}
                className="h-6 w-full rounded border px-1 text-xs font-mono"
              />
            ),
            label: (
              <input
                aria-label={`Descrição ${index + 1}`}
                value={f.label}
                onChange={(e) => updateField(index, { label: e.target.value })}
                className="h-6 w-full rounded border px-1 text-xs"
              />
            ),
            sequence: (
              <input
                type="number"
                min={1}
                max={9999}
                value={f.sequence ?? index + 1}
                onChange={(e) => updateField(index, { sequence: Number(e.target.value) })}
                className="h-6 w-16 text-right rounded border px-1 text-xs"
              />
            ),
            type: (
              <select
                value={f.type === "NUMBER" ? f.numberType ?? "DECIMAL" : f.type}
                onChange={(e) => {
                  const val = e.target.value;
                  if (["INTEGER", "DECIMAL", "CURRENCY"].includes(val)) {
                    updateField(index, { type: "NUMBER", numberType: val as "INTEGER" | "DECIMAL" | "CURRENCY" });
                  } else {
                    updateField(index, { type: val as Field["type"], numberType: undefined });
                  }
                }}
                className="h-6 w-full rounded border px-1 text-[11px]"
              >
                <option value="TEXT">Alfanumérico</option>
                <option value="INTEGER">Inteiro</option>
                <option value="DECIMAL">Decimal</option>
                <option value="CURRENCY">Moeda</option>
                <option value="DATE">Data</option>
                <option value="BOOLEAN">Sim / Não</option>
                <option value="LIST">Consulta em Tabela / Lista</option>
              </select>
            ),
            size: (
              <input
                type="number"
                min={1}
                max={4000}
                value={f.maxLength ?? 4000}
                onChange={(e) => updateField(index, { maxLength: Number(e.target.value) })}
                className="h-6 w-16 text-right rounded border px-1 text-xs"
              />
            ),
            visible: (
              <button
                type="button"
                onClick={() => toggleVisible(index)}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${f.visible !== false ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
              >
                {f.visible !== false ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                {f.visible !== false ? "Visível" : "Oculto"}
              </button>
            ),
            enabled: (
              <button
                type="button"
                onClick={() => toggleEnabled(index)}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${f.enabled !== false ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"}`}
              >
                {f.enabled !== false ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                {f.enabled !== false ? "Habilitado" : "Bloqueado"}
              </button>
            ),
            required: (
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => updateField(index, { required: e.target.checked })}
              />
            ),
            lookup:
              f.type === "LIST" ? (
                <input
                  placeholder="Opções separadas por vírgula"
                  value={(f.options ?? []).join(", ")}
                  onChange={(e) => updateField(index, { options: e.target.value.split(",").map((s) => s.trim()) })}
                  className="h-6 w-full rounded border px-1 text-[11px]"
                />
              ) : (
                <span className="text-[11px] text-slate-400">—</span>
              ),
          },
          actions: (
            <TaxRowActions label={f.label || f.key}>
              <TaxRowAction onClick={() => toggleVisible(index)}>
                {f.visible !== false ? "Ocultar Campo" : "Tornar Visível"}
              </TaxRowAction>
              <TaxRowAction onClick={() => toggleEnabled(index)}>
                {f.enabled !== false ? "Bloquear Campo" : "Habilitar Campo"}
              </TaxRowAction>
              <TaxRowAction onClick={() => removeField(index)}>
                Excluir Campo
              </TaxRowAction>
            </TaxRowActions>
          ),
        }))}
      />
    </div>
  );
}
