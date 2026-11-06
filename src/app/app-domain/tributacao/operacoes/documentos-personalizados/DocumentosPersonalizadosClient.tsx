"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Printer,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Eye,
  ArrowLeft,
  X,
  FileCheck,
} from "lucide-react";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../../TaxOperationalTable";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";

type TaxpayerOption = {
  id: string;
  name: string;
  document: string;
  inscription: string;
};

type TemplateOption = {
  id: string;
  title: string;
};

type IssuedDocument = {
  id: string;
  documentType: string;
  number: string;
  year: number;
  taxpayerId: string;
  taxpayerName: string;
  taxpayerDocument: string;
  inscription: string;
  applicantType: "PROPRIO_CONTRIBUINTE" | "PROCURADOR" | "REPRESENTANTE_LEGAL";
  applicantName: string;
  applicantDocument: string;
  issuerUserName: string;
  issuedAt: string;
  status: "EXPEDIDO" | "RETIFICADO" | "CANCELADO";
  content: string;
  authCode: string;
};

const inputClass =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900";
const buttonClass =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";

export default function DocumentosPersonalizadosClient({
  taxpayers,
  documentTemplates,
  currentUser,
}: {
  taxpayers: TaxpayerOption[];
  documentTemplates: TemplateOption[];
  currentUser: { id: string; name: string };
}) {
  // Modelos pré-definidos padrão caso não haja no GED
  const defaultTemplates = [
    { id: "CERT_CAD", title: "Certidão de Regularidade Cadastral" },
    { id: "DEC_QUIT", title: "Declaração de Quitação Fiscal Especial" },
    { id: "NOT_LANC", title: "Termo de Notificação Personalizada de Lançamento" },
    { id: "AUT_FUNC", title: "Autorização Especial de Funcionamento Provisório" },
    { id: "TERM_COMP", title: "Termo de Comparecimento / Intimação Tributária" },
  ];
  const allTemplates = documentTemplates.length > 0 ? documentTemplates : defaultTemplates;

  // Lista simulada / persistida em memória inicial de expedidos
  const [issuedDocs, setIssuedDocs] = useState<IssuedDocument[]>([
    {
      id: "doc-1",
      documentType: allTemplates[0]?.title ?? "Certidão de Regularidade Cadastral",
      number: "0001",
      year: 2026,
      taxpayerId: taxpayers[0]?.id ?? "tp-1",
      taxpayerName: taxpayers[0]?.name ?? "Silva & Santos Comércio Ltda",
      taxpayerDocument: taxpayers[0]?.document ?? "12.345.678/0001-90",
      inscription: taxpayers[0]?.inscription || "102345",
      applicantType: "PROPRIO_CONTRIBUINTE",
      applicantName: taxpayers[0]?.name ?? "Silva & Santos Comércio Ltda",
      applicantDocument: taxpayers[0]?.document ?? "12.345.678/0001-90",
      issuerUserName: currentUser.name || "Auditor Fiscal",
      issuedAt: "2026-03-10T14:30:00.000Z",
      status: "EXPEDIDO",
      content:
        "Certificamos para os devidos fins que o contribuinte supracitado encontra-se em situação cadastral regular perante o fisco municipal nesta data.",
      authCode: "DOC-2026-98AB4C12",
    },
  ]);

  // Filtros
  const [filterDocType, setFilterDocType] = useState("");
  const [filterNumber, setFilterNumber] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterTaxpayer, setFilterTaxpayer] = useState("");
  const [filterInscription, setFilterInscription] = useState("");
  const [filterIssuer, setFilterIssuer] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Modais de emissão e visualização/reimpressão
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<IssuedDocument | null>(null);
  const [printingDoc, setPrintingDoc] = useState<IssuedDocument | null>(null);

  // Formulário de Nova Expedição
  const [newForm, setNewForm] = useState({
    documentType: allTemplates[0]?.title ?? "Certidão de Regularidade Cadastral",
    taxpayerId: taxpayers[0]?.id ?? "",
    applicantChoice: "PROPRIO", // "PROPRIO" ou "OUTRO"
    applicantName: "",
    applicantDocument: "",
    customContent:
      "Atestamos a conformidade das informações prestadas para efeito de comprovação cadastral perante a administração pública municipal.",
  });

  const selectedTaxpayer = taxpayers.find((t) => t.id === newForm.taxpayerId);

  // Filtragem
  const filtered = useMemo(() => {
    return issuedDocs.filter((row) => {
      if (filterDocType && !row.documentType.toLowerCase().includes(filterDocType.toLowerCase()))
        return false;
      if (filterNumber && !row.number.includes(filterNumber)) return false;
      if (filterYear && row.year.toString() !== filterYear) return false;
      if (
        filterTaxpayer &&
        !row.taxpayerName.toLowerCase().includes(filterTaxpayer.toLowerCase()) &&
        !row.taxpayerDocument.includes(filterTaxpayer)
      )
        return false;
      if (filterInscription && !row.inscription.includes(filterInscription)) return false;
      if (filterIssuer && !row.issuerUserName.toLowerCase().includes(filterIssuer.toLowerCase()))
        return false;
      if (filterStartDate) {
        const docDate = row.issuedAt.slice(0, 10);
        if (docDate < filterStartDate) return false;
      }
      if (filterEndDate) {
        const docDate = row.issuedAt.slice(0, 10);
        if (docDate > filterEndDate) return false;
      }
      return true;
    });
  }, [
    issuedDocs,
    filterDocType,
    filterNumber,
    filterYear,
    filterTaxpayer,
    filterInscription,
    filterIssuer,
    filterStartDate,
    filterEndDate,
  ]);

  const handleIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxpayer) return;

    const currentYear = new Date().getFullYear();
    const nextNum = (issuedDocs.length + 1).toString().padStart(4, "0");
    const isSelf = newForm.applicantChoice === "PROPRIO";

    const newDoc: IssuedDocument = {
      id: `doc-${Date.now()}`,
      documentType: newForm.documentType,
      number: nextNum,
      year: currentYear,
      taxpayerId: selectedTaxpayer.id,
      taxpayerName: selectedTaxpayer.name,
      taxpayerDocument: selectedTaxpayer.document,
      inscription: selectedTaxpayer.inscription,
      applicantType: isSelf ? "PROPRIO_CONTRIBUINTE" : "PROCURADOR",
      applicantName: isSelf ? selectedTaxpayer.name : newForm.applicantName || selectedTaxpayer.name,
      applicantDocument: isSelf
        ? selectedTaxpayer.document
        : newForm.applicantDocument || selectedTaxpayer.document,
      issuerUserName: currentUser.name || "Auditor Fiscal",
      issuedAt: new Date().toISOString(),
      status: "EXPEDIDO",
      content: newForm.customContent,
      authCode: `DOC-${currentYear}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    };

    setIssuedDocs([newDoc, ...issuedDocs]);
    setIsModalOpen(false);
    setPrintingDoc(newDoc); // abre imediatamente para visualização/impressão oficial
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        aria-label="Filtro por Tipo de Documento"
        placeholder="Documento..."
        value={filterDocType}
        onChange={(e) => setFilterDocType(e.target.value)}
        className="h-7 w-32 rounded border px-2 text-[12px]"
      />
      <input
        aria-label="Filtro por Número"
        placeholder="Número..."
        value={filterNumber}
        onChange={(e) => setFilterNumber(e.target.value)}
        className="h-7 w-20 rounded border px-2 text-[12px]"
      />
      <input
        aria-label="Filtro por Ano"
        placeholder="Ano (ex: 2026)"
        value={filterYear}
        onChange={(e) => setFilterYear(e.target.value)}
        className="h-7 w-20 rounded border px-2 text-[12px]"
      />
      <input
        aria-label="Filtro por Contribuinte"
        placeholder="Contribuinte / CPF / CNPJ..."
        value={filterTaxpayer}
        onChange={(e) => setFilterTaxpayer(e.target.value)}
        className="h-7 min-w-36 flex-1 rounded border px-2 text-[12px]"
      />
      <input
        aria-label="Filtro por Inscrição"
        placeholder="Inscrição Municipal..."
        value={filterInscription}
        onChange={(e) => setFilterInscription(e.target.value)}
        className="h-7 w-28 rounded border px-2 text-[12px]"
      />
      <input
        aria-label="Filtro por Usuário Expedidor"
        placeholder="Expedidor..."
        value={filterIssuer}
        onChange={(e) => setFilterIssuer(e.target.value)}
        className="h-7 w-28 rounded border px-2 text-[12px]"
      />
      <div className="flex items-center gap-1 text-xs">
        <span className="text-slate-500">De:</span>
        <input
          type="date"
          aria-label="Data inicial"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
          className="h-7 rounded border px-1 text-[12px]"
        />
        <span className="text-slate-500">Até:</span>
        <input
          type="date"
          aria-label="Data final"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
          className="h-7 rounded border px-1 text-[12px]"
        />
      </div>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded bg-emerald-700 px-2.5 text-xs font-bold text-white hover:bg-emerald-800"
      >
        <Plus className="size-3.5" />
        Expedir Documento
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-7 items-center gap-1 rounded border bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Printer className="size-3.5" />
        Relatório Impresso
      </button>
      <Link
        href="/tributacao/operacoes"
        className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="size-3.5" />
        Voltar a Operações
      </Link>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-emerald-700" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Expedição e Consulta de Documentos Personalizados
            </h1>
            <p className="text-xs text-slate-500">
              Expedição, controle, consulta e reimpressão de documentos fiscais e cadastrais personalizados, com filtros completos e suporte a requerente.
            </p>
          </div>
        </div>
      </div>

      <TaxOperationalTable
        id="documentos-personalizados"
        resetKey={`${filterDocType}:${filterNumber}:${filterYear}:${filterTaxpayer}:${filterInscription}:${filterIssuer}:${filterStartDate}:${filterEndDate}`}
        toolbar={toolbar}
        actions={actions}
        emptyMessage="Nenhum documento personalizado localizado com os filtros informados."
        columns={[
          ["documentType", "Documento", 120, 200],
          ["numberYear", "Número / Ano", 70, 95, "identifier"],
          ["taxpayer", "Contribuinte", 130, 220],
          ["inscription", "Inscrição Municipal", 80, 120, "identifier"],
          ["applicant", "Requerente", 100, 180],
          ["issuer", "Usuário Expedidor", 80, 130],
          ["issuedAt", "Data / Período", 75, 110],
          ["status", "Situação", 60, 85, "status"],
          ["actions", "Ações", 75, 75, "actions"],
        ]}
        rows={filtered.map((doc) => ({
          id: doc.id,
          label: `${doc.documentType} nº ${doc.number}/${doc.year}`,
          values: {
            documentType: doc.documentType,
            numberYear: `${doc.number}/${doc.year}`,
            taxpayer: `${doc.taxpayerName} (${doc.taxpayerDocument})`,
            inscription: doc.inscription || "Geral",
            applicant:
              doc.applicantType === "PROPRIO_CONTRIBUINTE"
                ? `${doc.applicantName} (Próprio)`
                : `${doc.applicantName} (Procurador/Rep.)`,
            issuer: doc.issuerUserName,
            issuedAt: new Date(doc.issuedAt).toLocaleDateString("pt-BR"),
            status: doc.status,
          },
          actions: (
            <TaxRowActions label={`Documento ${doc.number}/${doc.year}`}>
              <TaxRowAction onClick={() => setViewingDoc(doc)}>
                Visualizar formulário
              </TaxRowAction>
              <TaxRowAction onClick={() => setPrintingDoc(doc)}>
                Reimpressão oficial
              </TaxRowAction>
            </TaxRowActions>
          ),
        }))}
      />

      {/* Modal Nova Expedição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <form
            onSubmit={handleIssue}
            className="w-full max-w-2xl rounded-lg border bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="mb-3 flex items-center justify-between border-b pb-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <FileCheck className="size-4 text-emerald-700" />
                Expedição de Documento Personalizado
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Tipo de Documento</label>
                <select
                  className={inputClass}
                  value={newForm.documentType}
                  onChange={(e) => setNewForm({ ...newForm, documentType: e.target.value })}
                >
                  {allTemplates.map((item) => (
                    <option key={item.id} value={item.title}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">Contribuinte / Inscrição</label>
                <select
                  className={inputClass}
                  value={newForm.taxpayerId}
                  onChange={(e) => setNewForm({ ...newForm, taxpayerId: e.target.value })}
                  required
                >
                  {taxpayers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.document} · IM: {t.inscription || "S/N"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seletor de Requerente com opção do próprio contribuinte */}
              <div className="rounded border bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <label className="mb-2 block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Identificação do Requerente
                </label>
                <div className="flex gap-4 mb-2 text-xs">
                  <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="applicantChoice"
                      value="PROPRIO"
                      checked={newForm.applicantChoice === "PROPRIO"}
                      onChange={() => setNewForm({ ...newForm, applicantChoice: "PROPRIO" })}
                    />
                    O próprio contribuinte
                  </label>
                  <label className="flex items-center gap-1.5 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="applicantChoice"
                      value="OUTRO"
                      checked={newForm.applicantChoice === "OUTRO"}
                      onChange={() => setNewForm({ ...newForm, applicantChoice: "OUTRO" })}
                    />
                    Procurador / Terceiro representante
                  </label>
                </div>

                {newForm.applicantChoice === "PROPRIO" ? (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    O documento será expedido tendo como requerente o próprio titular:{" "}
                    <b>{selectedTaxpayer?.name}</b> ({selectedTaxpayer?.document}).
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-[11px] font-semibold">Nome do Requerente / Procurador</label>
                      <input
                        className={inputClass}
                        placeholder="Nome completo"
                        value={newForm.applicantName}
                        onChange={(e) => setNewForm({ ...newForm, applicantName: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold">CPF / Documento do Requerente</label>
                      <input
                        className={inputClass}
                        placeholder="000.000.000-00"
                        value={newForm.applicantDocument}
                        onChange={(e) => setNewForm({ ...newForm, applicantDocument: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">Texto / Conteúdo Personalizado</label>
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  value={newForm.customContent}
                  onChange={(e) => setNewForm({ ...newForm, customContent: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-8 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button type="submit" className={buttonClass}>
                Confirmar Expedição e Visualizar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Visualização do Formulário */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl rounded-lg border bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between border-b pb-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Eye className="size-4 text-emerald-700" />
                Visualização do Formulário Expedido
              </h2>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-2 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <span className="font-semibold text-slate-500">Documento:</span>
                  <p className="font-bold">{viewingDoc.documentType}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Número/Ano:</span>
                  <p className="font-mono">{viewingDoc.number}/{viewingDoc.year}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <span className="font-semibold text-slate-500">Contribuinte:</span>
                  <p>{viewingDoc.taxpayerName}</p>
                  <p className="font-mono text-slate-500">{viewingDoc.taxpayerDocument}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Inscrição Municipal:</span>
                  <p className="font-mono">{viewingDoc.inscription || "Geral"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b pb-2">
                <div>
                  <span className="font-semibold text-slate-500">Requerente:</span>
                  <p>{viewingDoc.applicantName}</p>
                  <p className="text-slate-500 text-[10px]">
                    {viewingDoc.applicantType === "PROPRIO_CONTRIBUINTE"
                      ? "Próprio contribuinte"
                      : `Procurador/Rep. (${viewingDoc.applicantDocument})`}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Expedido por:</span>
                  <p>{viewingDoc.issuerUserName}</p>
                  <p className="text-slate-500 text-[10px]">
                    {new Date(viewingDoc.issuedAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              <div className="pt-1">
                <span className="font-semibold text-slate-500">Teor do Documento:</span>
                <p className="mt-1 rounded bg-slate-50 p-2.5 text-slate-700 leading-relaxed border">
                  {viewingDoc.content}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-between items-center border-t pt-3">
              <span className="font-mono text-[10px] text-slate-500">Código de Autenticação: {viewingDoc.authCode}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const doc = viewingDoc;
                    setViewingDoc(null);
                    setPrintingDoc(doc);
                  }}
                  className={buttonClass}
                >
                  <Printer className="size-3.5" />
                  Reimprimir em Formato Oficial
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reimpressão em Formato Oficial */}
      {printingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-3xl rounded-lg border bg-white p-6 shadow-2xl max-h-[92vh] overflow-auto">
            <div className="flex justify-between items-center border-b pb-3 print:hidden">
              <span className="text-sm font-bold text-slate-800">
                Pré-visualização do Formato Oficial de Reimpressão
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-7 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  <Printer className="size-3.5" />
                  Imprimir Agora
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingDoc(null)}
                  className="h-7 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Layout do Documento Oficial para Impressão */}
            <div className="p-8 border border-slate-300 mt-4 bg-white rounded text-slate-900 space-y-6">
              <div className="text-center border-b-2 border-slate-900 pb-4">
                <h1 className="text-lg font-black uppercase tracking-wider">
                  MUNICÍPIO DE GUARARÁ
                </h1>
                <p className="text-xs font-bold text-slate-700">
                  SECRETARIA MUNICIPAL DE FAZENDA E TRIBUTAÇÃO
                </p>
                <p className="text-[11px] text-slate-500">
                  DEPARTAMENTO DE GESTÃO TRIBUTÁRIA E ARRECADAÇÃO
                </p>
                <div className="mt-3 inline-block rounded border border-slate-900 bg-slate-50 px-4 py-1.5 text-sm font-black uppercase tracking-wide">
                  {printingDoc.documentType} Nº {printingDoc.number}/{printingDoc.year}
                </div>
              </div>

              <div className="text-xs space-y-3 leading-relaxed">
                <p className="indent-6 text-justify">
                  O Diretor de Administração Tributária do Município de Guarará, no uso de suas atribuições legais e regimentais, com base nos registros fiscais e cadastrais municipais, faz saber e expede o presente documento:
                </p>

                <div className="rounded border border-slate-300 p-3 bg-slate-50 space-y-1">
                  <p><b>Contribuinte:</b> {printingDoc.taxpayerName}</p>
                  <p><b>CPF/CNPJ:</b> {printingDoc.taxpayerDocument}</p>
                  <p><b>Inscrição Municipal:</b> {printingDoc.inscription || "Geral"}</p>
                  <p><b>Requerente:</b> {printingDoc.applicantName} ({printingDoc.applicantType === "PROPRIO_CONTRIBUINTE" ? "O Próprio Contribuinte" : `Procurador / Representante: ${printingDoc.applicantDocument}`})</p>
                </div>

                <div className="py-2">
                  <p className="font-semibold mb-1">Teor e Declaração Oficial:</p>
                  <p className="text-justify border-l-2 border-slate-900 pl-3 italic text-slate-800">
                    &ldquo;{printingDoc.content}&rdquo;
                  </p>
                </div>

                <p className="text-justify">
                  A presente certidão/documento é expedida eletronicamente a pedido do requerente e sua validade e autenticidade podem ser confirmadas pelo código de segurança oficial abaixo.
                </p>
              </div>

              <div className="pt-6 border-t border-slate-300 flex justify-between items-end text-[11px] text-slate-600">
                <div>
                  <p><b>Expedido por:</b> {printingDoc.issuerUserName}</p>
                  <p><b>Data de Expedição:</b> {new Date(printingDoc.issuedAt).toLocaleString("pt-BR")}</p>
                  <p className="font-mono mt-1 text-[10px]">Autenticação: {printingDoc.authCode}</p>
                </div>
                <div className="text-center w-60 border-t border-slate-900 pt-1">
                  <p className="font-bold text-[10px] text-slate-800">Assinatura do Responsável Tributário</p>
                  <p className="text-[9px] text-slate-500">Chave Digital Validada</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
