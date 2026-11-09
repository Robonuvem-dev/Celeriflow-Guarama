"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Save, AlertCircle, CheckCircle2, Search, Barcode, MapPin, Building2, User, FileText, Phone, HelpCircle } from "lucide-react";
import { createProtocol } from "../../actions";

interface SubjectItem {
  id: string;
  name: string;
  processTypeId: string;
}

interface TypeItem {
  id: string;
  name: string;
  subjects: SubjectItem[];
}

interface PersonItem {
  id: string;
  fullName: string;
  cpf: string | null;
}

interface CompanyItem {
  id: string;
  corporateName: string;
  cnpj: string;
}

interface DepartmentItem {
  id: string;
  name: string;
}

interface ReferenceItem {
  id: string;
  name: string;
  description: string | null;
  subjectId: string | null;
}

// 19.100: Validação de CPF com módulo 11
function isValidCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(clean.charAt(10), 10);
}

export default function NewProtocolForm({
  tiposProcesso,
  pessoas,
  empresas,
  departamentos,
  otherApplicants,
  requiredDocuments,
  subassuntos,
  returnTo,
}: {
  tiposProcesso: TypeItem[];
  pessoas: PersonItem[];
  empresas: CompanyItem[];
  departamentos: DepartmentItem[];
  otherApplicants: { id: string; name: string }[];
  requiredDocuments: ReferenceItem[];
  subassuntos: ReferenceItem[];
  returnTo: string;
}) {
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [manualNumberEnabled, setManualNumberEnabled] = useState(false);
  const [manualNumber, setManualNumber] = useState("");

  // 19.65: Validação e preenchimento automático de endereço via CEP
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "valid" | "invalid">("idle");

  // 19.100: Validação de CPF avulso/digitado
  const [customCpf, setCustomCpf] = useState("");
  const isCpfValid = useMemo(() => {
    if (!customCpf.trim()) return null;
    return isValidCpf(customCpf);
  }, [customCpf]);

  // Available subjects for the selected process type
  const availableSubjects = useMemo(() => {
    if (!selectedTypeId) return tiposProcesso.flatMap(t => t.subjects);
    const found = tiposProcesso.find(t => t.id === selectedTypeId);
    return found ? found.subjects : [];
  }, [selectedTypeId, tiposProcesso]);

  // 19.43 / 19.85 / 19.89: Pertinent required documents for the selected subject
  const pertinentDocuments = useMemo(() => {
    if (!selectedSubjectId) return [];
    return requiredDocuments.filter(d => d.subjectId === selectedSubjectId || !d.subjectId);
  }, [selectedSubjectId, requiredDocuments]);

  // 19.4: Subassuntos for the selected subject
  const pertinentSubassuntos = useMemo(() => {
    if (!selectedSubjectId) return [];
    return subassuntos.filter(s => s.subjectId === selectedSubjectId);
  }, [selectedSubjectId, subassuntos]);

  // 19.65: CEP auto-lookup
  async function handleCepLookup(value: string) {
    const clean = value.replace(/\D/g, "");
    setCep(clean);
    if (clean.length === 8) {
      setCepStatus("loading");
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (data.erro) {
          setCepStatus("invalid");
        } else {
          setLogradouro(data.logradouro || "");
          setBairro(data.bairro || "");
          setCidade(`${data.localidade || ""} / ${data.uf || ""}`);
          setCepStatus("valid");
        }
      } catch {
        setCepStatus("invalid");
      }
    } else {
      setCepStatus("idle");
    }
  }

  // Preview protocol number for barcode (19.71)
  const currentProtocolPreview = manualNumberEnabled && manualNumber.trim()
    ? manualNumber.trim()
    : `PROC-${new Date().getFullYear()}-XXXXXX`;

  return (
    <form action={createProtocol} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-6 p-4 md:p-6">
        
        {/* Seção 1: Identificação e Atendimento */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              1. Identificação do Interessado e Tipo de Atendimento
            </h3>
            {/* 19.71: Código de barras visual no cadastramento */}
            <div className="hidden sm:flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1">
              <Barcode className="w-5 h-5 text-slate-700" />
              <div className="text-right">
                <span className="block text-[10px] font-bold uppercase text-slate-500">Código de Barras (19.71)</span>
                <span className="font-mono text-xs font-bold text-slate-800">{currentProtocolPreview}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {/* 19.12: Tipo de Atendimento */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                Tipo de Atendimento * (19.12)
              </label>
              <select
                name="attendanceType"
                required
                defaultValue="Presencial"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="Presencial">Presencial (Balcão de Atendimento)</option>
                <option value="Telefone">Telefone (Central de Atendimento)</option>
                <option value="Via Web">Via Web (Portal de Serviços)</option>
                <option value="E-mail">E-mail / Eletrônico</option>
                <option value="Ofício">Ofício / Correspondência Oficial</option>
              </select>
              <p className="text-[10px] text-slate-500">Canal pelo qual a solicitação foi recepcionada.</p>
            </div>

            {/* Pessoa Física com CPF */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Interessado (Pessoa Física)
              </label>
              <select
                name="personId"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Selecione um interessado cadastrado</option>
                {pessoas.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName} (CPF: {p.cpf || "não informado"})</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500">Pessoa física titular do requerimento.</p>
            </div>

            {/* Pessoa Jurídica com CNPJ */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Interessado (Pessoa Jurídica)
              </label>
              <select
                name="companyId"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Selecione uma empresa</option>
                {empresas.map(e => (
                  <option key={e.id} value={e.id}>{e.corporateName} (CNPJ: {e.cnpj})</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500">Empresa requerente, se aplicável.</p>
            </div>

            {/* Outro Requerente */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Outro Requerente (Órgão / Entidade)
              </label>
              <select
                name="otherApplicantId"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Sem outro requerente</option>
                {otherApplicants.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {/* Representante Legal */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Representante do Requerente (Procurador)
              </label>
              <select
                name="representativePersonId"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Sem procurador/representante</option>
                {pessoas.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName} (CPF: {p.cpf || "não informado"})</option>
                ))}
              </select>
            </div>

            {/* 19.100: Validação de CPF para criação ou conferência */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Conferência de CPF (19.100)
              </label>
              <input
                type="text"
                maxLength={14}
                value={customCpf}
                onChange={e => setCustomCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              />
              {isCpfValid === true && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> CPF Válido (Módulo 11 aprovado)
                </span>
              )}
              {isCpfValid === false && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600">
                  <AlertCircle className="w-3 h-3" /> CPF com dígitos verificadores inválidos!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 19.65: Validação de Endereço via CEP */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            Endereço do Requerente / Imóvel (19.65 — Preenchimento Automático via CEP)
          </h4>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">CEP</label>
              <div className="relative">
                <input
                  name="cep"
                  maxLength={9}
                  value={cep}
                  onChange={e => handleCepLookup(e.target.value)}
                  placeholder="00000-000"
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
                />
                {cepStatus === "loading" && (
                  <span className="absolute right-2 top-2 text-[10px] text-slate-400">Buscando...</span>
                )}
                {cepStatus === "valid" && (
                  <span className="absolute right-2 top-2 text-[10px] font-bold text-emerald-600">✓ Válido</span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Logradouro</label>
              <input
                name="logradouro"
                value={logradouro}
                onChange={e => setLogradouro(e.target.value)}
                placeholder="Rua, Avenida, etc."
                className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Bairro</label>
              <input
                name="bairro"
                value={bairro}
                onChange={e => setBairro(e.target.value)}
                placeholder="Bairro"
                className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Cidade / UF</label>
              <input
                name="cidade"
                value={cidade}
                onChange={e => setCidade(e.target.value)}
                placeholder="Município / UF"
                className="w-full rounded-md border border-slate-300 p-2 text-xs bg-white"
              />
            </div>
          </div>
        </div>

        {/* Seção 2: Classificação e Workflow */}
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600" />
            2. Classificação, Numeração e Roteiro do Processo
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {/* Tipo de Processo */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Tipo de Processo *</label>
              <select
                name="processTypeId"
                required
                value={selectedTypeId}
                onChange={e => {
                  setSelectedTypeId(e.target.value);
                  setSelectedSubjectId("");
                }}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Selecione o tipo de processo</option>
                {tiposProcesso.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Assunto */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Assunto *</label>
              <select
                name="subjectId"
                required
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Selecione o assunto</option>
                {availableSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Prioridade */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Prioridade</label>
              <select
                name="priority"
                defaultValue="Normal"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="Normal">Normal</option>
                <option value="Alta">Alta</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>

            {/* Setor Inicial */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Setor Inicial de Destino</label>
              <select
                name="initialDepartmentId"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              >
                <option value="">Usar setor padrão configurado no assunto/tipo</option>
                {departamentos.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Valor Declarado */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Valor Declarado (R$)</label>
              <input
                name="declaredValue"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {/* 19.32: Número de Processo Externo */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Nº Processo Externo (19.32)
              </label>
              <input
                name="externalProcessNumber"
                maxLength={60}
                placeholder="Ex: 5001234-56.2026.8.21.0001 (Judicial / TCE)"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {/* 19.33: Número de Processo Anterior */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Nº Processo Anterior (19.33)
              </label>
              <input
                name="previousProcessNumber"
                maxLength={60}
                placeholder="Ex: PROC-2025-004321 / Físico 145/2024"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            {/* 19.29: Preenchimento manual do número do processo */}
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualNumberEnabled}
                  onChange={e => setManualNumberEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                Preenchimento manual do número do processo (19.29)
              </label>

              {manualNumberEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    name="manualProtocolNumber"
                    required={manualNumberEnabled}
                    maxLength={40}
                    value={manualNumber}
                    onChange={e => setManualNumber(e.target.value)}
                    placeholder="Ex: PROC-2026-999999 ou 001/2026"
                    className="w-full rounded-md border border-slate-300 p-2 text-xs focus:ring-1 focus:ring-emerald-600"
                  />
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    Será validado contra duplicidade no sistema.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 19.4 / 19.43 / 19.85 / 19.89: Documentação e Subassuntos Vinculados */}
        {selectedSubjectId && (pertinentDocuments.length > 0 || pertinentSubassuntos.length > 0) && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
            <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              Documentação Pertinente e Subassuntos do Assunto (19.4, 19.43, 19.85, 19.89)
            </h4>

            {pertinentSubassuntos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-indigo-950 mb-1.5">Subassuntos vinculados (19.4):</p>
                <div className="flex flex-wrap gap-1.5">
                  {pertinentSubassuntos.map(s => (
                    <span key={s.id} className="rounded-md bg-white border border-indigo-200 px-2.5 py-1 text-xs text-indigo-900 shadow-2xs font-medium">
                      {s.name} {s.description ? `— ${s.description}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {pertinentDocuments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-indigo-950 mb-1.5">Relação de Documentos Obrigatórios / Pertinentes (19.43, 19.85):</p>
                <ul className="space-y-1 text-xs text-slate-700 bg-white rounded-lg border border-indigo-100 p-3">
                  {pertinentDocuments.map(d => (
                    <li key={d.id} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                      <span className="font-semibold">{d.name}</span>
                      {d.description && <span className="text-slate-500 text-[11px]">({d.description})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Seção 3: Descrição Inicial */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 block">
            Descrição Inicial do Requerimento
          </label>
          <textarea
            name="description"
            rows={4}
            placeholder="Descreva a finalidade, embasamento e detalhes da abertura do protocolo..."
            className="w-full rounded-lg border border-slate-300 p-3 text-xs focus:ring-1 focus:ring-emerald-600"
          />
        </div>

      </div>

      {/* Botões do Rodapé */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-4">
        <Link
          href={returnTo}
          className="text-xs font-semibold text-slate-600 hover:text-slate-800"
        >
          Cancelar e Voltar
        </Link>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition"
        >
          <Save className="w-4 h-4" />
          Gerar Protocolo e Roteiro
        </button>
      </div>
    </form>
  );
}
