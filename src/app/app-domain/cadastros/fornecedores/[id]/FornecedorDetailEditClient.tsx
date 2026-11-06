"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, ExternalLink, FileText, RefreshCw, Save, ShieldCheck, Trash2, User } from "lucide-react";
import { activateSupplier, deactivateSupplier, updateSupplier } from "../../actions";
import type { SupplierListItem } from "../supplier-types";
import { certificationStatus, dateInputValue, formatCnpj, formatCpf } from "../supplier-utils";
import { supplierRegularityLinks } from "../supplier-regularity";

const formControlClass =
  "min-h-10 w-full rounded border border-slate-300 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-fuchsia-600 focus:ring-2 focus:ring-fuchsia-600/15 disabled:bg-slate-100 disabled:text-slate-400 sm:h-9 sm:min-h-0 sm:text-xs";
const fieldLabelClass = "mb-1 block text-xs font-semibold text-slate-700";

export default function FornecedorDetailEditClient({
  supplier,
  canUpdate,
  referenceDate,
}: {
  supplier: SupplierListItem;
  canUpdate: boolean;
  referenceDate: string;
}) {
  const isPj = Boolean(supplier.company);
  const name = supplier.person
    ? supplier.person.fullName
    : supplier.company
      ? supplier.company.corporateName
      : "Identidade não informada";
  const tradeName = supplier.company?.tradeName || "—";
  const document = supplier.person?.cpf
    ? formatCpf(supplier.person.cpf)
    : supplier.company?.cnpj
      ? formatCnpj(supplier.company.cnpj)
      : "Não informado";
  const documents = supplier.person?.documents ?? supplier.company?.documents ?? [];

  const [category, setCategory] = useState(supplier.category || "");
  const [businessBranch, setBusinessBranch] = useState(supplier.businessBranch || "");
  const [certificationsValidUntil, setCertificationsValidUntil] = useState(
    dateInputValue(supplier.certificationsValidUntil),
  );
  const [bankData, setBankData] = useState(supplier.bankData || "");
  const [notes, setNotes] = useState(supplier.notes || "");
  const [primaryCnae, setPrimaryCnae] = useState(supplier.company?.primaryCnae || "");
  const [secondaryCnaes, setSecondaryCnaes] = useState(supplier.company?.secondaryCnaes || "");
  const [status, setStatus] = useState(supplier.status);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  const certInfo = certificationStatus(certificationsValidUntil || supplier.certificationsValidUntil, referenceDate);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!canUpdate || pending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        const result = await updateSupplier(supplier.id, {
          category,
          businessBranch,
          certificationsValidUntil,
          bankData,
          notes,
          ...(isPj ? { primaryCnae, secondaryCnaes } : {}),
        });
        if (result.error) {
          setError(result.error);
        } else {
          setSuccess("Dados cadastrais do fornecedor atualizados com sucesso.");
        }
      } catch {
        setError("Não foi possível atualizar os dados do fornecedor.");
      }
    });
  }

  function handleToggleStatus() {
    if (!canUpdate || pending) return;
    const nextAction = status === "Ativo" ? "inativar" : "reativar";
    if (!confirm(`Deseja realmente ${nextAction} este fornecedor?`)) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        const result =
          status === "Ativo"
            ? await deactivateSupplier(supplier.id)
            : await activateSupplier(supplier.id);
        if (result.error) {
          setError(result.error);
        } else {
          const nextStatus = status === "Ativo" ? "Inativo" : "Ativo";
          setStatus(nextStatus);
          setSuccess(`Situação do fornecedor alterada para ${nextStatus}.`);
        }
      } catch {
        setError("Não foi possível alterar a situação do fornecedor.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSave}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 sm:p-4">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            {success}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fuchsia-700">
              {isPj ? <Building2 className="size-4" /> : <User className="size-4" />}
              Identificação e Vínculo Cadastral ({isPj ? "Pessoa Jurídica" : "Pessoa Física"})
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  status === "Ativo"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {status}
              </span>
              {canUpdate ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleToggleStatus}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {status === "Ativo" ? (
                    <>
                      <Trash2 className="size-3.5 text-red-600" />
                      Inativar
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-3.5 text-emerald-600" />
                      Reativar
                    </>
                  )}
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <span className="block text-[11px] font-semibold uppercase text-slate-500">
                {isPj ? "Razão Social" : "Nome Completo"}
              </span>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{name}</p>
            </div>
            {isPj ? (
              <div>
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Nome Fantasia
                </span>
                <p className="mt-0.5 text-sm text-slate-800">{tradeName}</p>
              </div>
            ) : null}
            <div>
              <span className="block text-[11px] font-semibold uppercase text-slate-500">
                {isPj ? "CNPJ" : "CPF"}
              </span>
              <p className="mt-0.5 font-mono text-sm font-medium text-slate-800">{document}</p>
            </div>
            {isPj ? (
              <div>
                <span className="block text-[11px] font-semibold uppercase text-slate-500">
                  Enquadramento (Porte ME/EPP)
                </span>
                <p className="mt-0.5 text-sm text-slate-800">
                  {supplier.company?.companyType || "Não informado"}
                </p>
              </div>
            ) : null}
            <div>
              <span className="block text-[11px] font-semibold uppercase text-slate-500">
                Situação das Certidões
              </span>
              <p className="mt-0.5 text-sm font-medium text-slate-800">{certInfo.label}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
          <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-fuchsia-700">
            <ShieldCheck className="size-4" />
            Dados Cadastrais e Habilitação do Fornecedor
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="category" className={fieldLabelClass}>
                Categoria de fornecimento
              </label>
              <select
                id="category"
                value={category}
                disabled={!canUpdate || pending}
                onChange={(e) => setCategory(e.target.value)}
                className={formControlClass}
              >
                <option value="">Selecione...</option>
                <option value="Materiais">Materiais Diversos</option>
                <option value="Serviços">Prestação de Serviços</option>
                <option value="Obras">Obras e Engenharia</option>
                <option value="Equipamentos">Equipamentos</option>
                <option value="Tecnologia">Tecnologia da Informação</option>
              </select>
            </div>

            <div>
              <label htmlFor="businessBranch" className={fieldLabelClass}>
                Ramo de atividade
              </label>
              <input
                id="businessBranch"
                type="text"
                value={businessBranch}
                disabled={!canUpdate || pending}
                onChange={(e) => setBusinessBranch(e.target.value)}
                placeholder="Ex.: Comércio atacadista, Engenharia civil..."
                className={formControlClass}
              />
            </div>

            {isPj ? (
              <>
                <div>
                  <label htmlFor="primaryCnae" className={fieldLabelClass}>
                    CNAE principal
                  </label>
                  <input
                    id="primaryCnae"
                    type="text"
                    value={primaryCnae}
                    disabled={!canUpdate || pending}
                    onChange={(e) => setPrimaryCnae(e.target.value)}
                    placeholder="Código e descrição do CNAE principal"
                    className={formControlClass}
                  />
                </div>
                <div>
                  <label htmlFor="secondaryCnaes" className={fieldLabelClass}>
                    CNAEs secundários
                  </label>
                  <input
                    id="secondaryCnaes"
                    type="text"
                    value={secondaryCnaes}
                    disabled={!canUpdate || pending}
                    onChange={(e) => setSecondaryCnaes(e.target.value)}
                    placeholder="Separe múltiplos CNAEs por ponto e vírgula"
                    className={formControlClass}
                  />
                </div>
              </>
            ) : null}

            <div>
              <label htmlFor="certificationsValidUntil" className={fieldLabelClass}>
                Validade das certidões (habilitação)
              </label>
              <input
                id="certificationsValidUntil"
                type="date"
                value={certificationsValidUntil}
                disabled={!canUpdate || pending}
                onChange={(e) => setCertificationsValidUntil(e.target.value)}
                className={formControlClass}
              />
            </div>

            <div>
              <label htmlFor="bankData" className={fieldLabelClass}>
                Dados bancários
              </label>
              <input
                id="bankData"
                type="text"
                value={bankData}
                disabled={!canUpdate || pending}
                onChange={(e) => setBankData(e.target.value)}
                placeholder="Banco, Agência, Conta Corrente / PIX..."
                className={formControlClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="notes" className={fieldLabelClass}>
                Observações cadastrais
              </label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                disabled={!canUpdate || pending}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre habilitação, histórico ou restrições..."
                className={`${formControlClass} h-auto py-2`}
              />
            </div>
          </div>
        </section>

        {supplier.taxInfo ? (
          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-700">
              <ShieldCheck className="size-4" />
              Consulta e Dados Tributários
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              <div>
                <span className="block font-semibold uppercase text-slate-500 text-[10px]">Inscrição Municipal</span>
                <p className="mt-0.5 text-slate-900 font-mono">{supplier.taxInfo.municipalInsc || "Não informada"}</p>
              </div>
              <div>
                <span className="block font-semibold uppercase text-slate-500 text-[10px]">Inscrição Estadual</span>
                <p className="mt-0.5 text-slate-900 font-mono">{supplier.taxInfo.stateInsc || "Não informada"}</p>
              </div>
              <div>
                <span className="block font-semibold uppercase text-slate-500 text-[10px]">Regime Tributário</span>
                <p className="mt-0.5 text-slate-900">{supplier.taxInfo.taxRegime || "Não informado"}</p>
              </div>
              <div>
                <span className="block font-semibold uppercase text-slate-500 text-[10px]">Tipo de Contribuinte</span>
                <p className="mt-0.5 text-slate-900">{supplier.taxInfo.taxpayerType || "Geral"}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="block font-semibold uppercase text-slate-500 text-[10px]">Atividades Econômicas Cadastradas</span>
                <p className="mt-0.5 text-slate-900">{supplier.taxInfo.economicActivities || (supplier.company?.primaryCnae ? `${supplier.company.primaryCnae}; ${supplier.company.secondaryCnaes || ""}` : "Não informadas")}</p>
              </div>
              {supplier.taxInfo.fiscalNotes && (
                <div className="sm:col-span-3">
                  <span className="block font-semibold uppercase text-slate-500 text-[10px]">Notas Fiscais / Observações Tributárias</span>
                  <p className="mt-0.5 text-slate-900">{supplier.taxInfo.fiscalNotes}</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {supplier.representatives.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-700">
              <User className="size-4" />
              Representantes Legais ({supplier.representatives.length})
            </div>
            <ul className="space-y-1.5 text-xs">
              {supplier.representatives.map((rep) => (
                <li key={rep.id} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1.5">
                  <div>
                    <span className="font-semibold text-slate-900">{rep.name}</span>
                    {rep.cpf && <span className="ml-2 font-mono text-slate-500">CPF: {formatCpf(rep.cpf)}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{rep.representationType}</span>
                    <span className="text-emerald-700 font-semibold">{rep.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-700">
              <FileText className="size-4" />
              Evidências e Documentos Vinculados ({documents.length})
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhum documento probatório cadastrado para a identidade vinculada.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs text-slate-700">
                {documents.map((doc, idx) => (
                  <li
                    key={`${doc.title}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">{doc.title}</span>{" "}
                      <span className="text-slate-500">({doc.documentType})</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                        {doc.status}
                      </span>
                      <span className="text-slate-500">
                        {certificationStatus(doc.validUntil, referenceDate).label}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-700">
              <ExternalLink className="size-4" />
              Consultas Externas de Regularidade Fiscal
            </div>
            <div className="space-y-1.5 text-xs">
              {supplierRegularityLinks.map((link) => (
                <div
                  key={link.label}
                  className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1.5"
                >
                  <div>
                    <span className="font-semibold text-slate-800">{link.label}</span>
                    <p className="text-[11px] text-slate-500">{link.description}</p>
                  </div>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-fuchsia-50 px-2 py-1 text-[11px] font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
                  >
                    Consultar
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <Link
            href="/cadastros/fornecedores"
            className="inline-flex min-h-9 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:h-8 sm:min-h-0"
          >
            Voltar para Fornecedores
          </Link>
          <Link
            href="/compras/contratos"
            className="inline-flex min-h-9 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:h-8 sm:min-h-0"
          >
            Ir para Contratos
          </Link>
        </div>
        {canUpdate ? (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded bg-fuchsia-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-fuchsia-700 disabled:opacity-50 sm:h-8 sm:min-h-0"
          >
            <Save className="size-3.5" />
            {pending ? "Salvando..." : "Salvar Alterações"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
