"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  FilePlus2,
  Info,
  MapPin,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserX,
  Volume2,
  Wrench,
} from "lucide-react";
import {
  mergeWithDefaultPublicCatalog,
  publicOmbudsmanTypes,
  type PublicOmbudsmanReference,
} from "@/lib/attendance/public-ombudsman-types";

type Receipt = { protocol: string; token: string; centralProtocolNumber?: string | null };
type Result = {
  protocol: string;
  type: string;
  status: string;
  situation?: string | null;
  subject: string;
  response: string | null;
  dueAt: string;
  respondedAt: string | null;
  outcome: string | null;
  extensionReason: string | null;
  appeals: { level: number; status: string; response: string | null; dueAt: string }[];
};

type FlowMode = "create" | "consult";

export function CitizenRequestForm({
  type = "ESIC",
  publicCatalog = [],
}: {
  type?: string;
  publicCatalog?: PublicOmbudsmanReference[];
}) {
  const isEsicDefault = type === "ESIC";
  const catalog = mergeWithDefaultPublicCatalog(publicCatalog);

  // Etapa Principal: Criar Novo Manifesto vs Consultar Protocolo
  const [flowMode, setFlowMode] = useState<FlowMode>("create");
  // Subetapas do assistente de criação (1: Assunto/Serviço, 2: Subassunto/Local, 3: Relato e Identificação)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [credentials, setCredentials] = useState<Receipt | null>(null);
  const [requestKey] = useState(() => crypto.randomUUID());

  // Estado controlado do formulário para preservar valores entre subetapas
  const [requestType, setRequestType] = useState(isEsicDefault ? "ESIC" : "SOLICITACAO");
  const [entity, setEntity] = useState<"prefeitura" | "camara">("prefeitura");
  const [subjectId, setSubjectId] = useState("");
  const [subsubjectId, setSubsubjectId] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [street, setStreet] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const currentTypeLabel =
    requestType === "ESIC"
      ? "Pedido de acesso à informação (e-SIC)"
      : publicOmbudsmanTypes[requestType as keyof typeof publicOmbudsmanTypes] || "Solicitação";

  const subjects = catalog.filter(
    (entry) =>
      entry.kind === "SUBJECT" &&
      entry.requestType === publicOmbudsmanTypes[requestType as keyof typeof publicOmbudsmanTypes],
  );
  const subsubjects = catalog.filter(
    (entry) =>
      entry.kind === "SUBSUBJECT" &&
      entry.subjectId === subjectId &&
      entry.requestType === publicOmbudsmanTypes[requestType as keyof typeof publicOmbudsmanTypes],
  );
  const selectedSubject = subjects.find((entry) => entry.id === subjectId);
  const selectedSubsubject = subsubjects.find((entry) => entry.id === subsubjectId);

  const streetSubject = catalog.find(
    (entry) => entry.kind === "SUBJECT" && entry.name.toLowerCase() === "rua e bairro",
  );
  const cleaningSubject = catalog.find(
    (entry) => entry.kind === "SUBJECT" && entry.name.toLowerCase() === "lixo e limpeza",
  );

  const send = async (data: Record<string, unknown>) => {
    const response = await fetch("/api/transparencia/cidadao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Operação não concluída.");
    return body;
  };

  function handleQuickSelectUrbanSubject(targetSubjectId: string, targetSubsubjectId?: string) {
    setRequestType("SOLICITACAO");
    setSubjectId(targetSubjectId);
    setSubsubjectId(targetSubsubjectId || "");
    setAnonymous(false);
    setMessage("");
    setStep(targetSubsubjectId ? 3 : 2);
  }

  function canAdvanceFromStep1() {
    if (requestType === "ESIC") return true;
    if (subjects.length > 0) return Boolean(subjectId);
    return true;
  }

  function canAdvanceFromStep2() {
    if (requestType === "ESIC") {
      return customSubject.trim().length >= 5;
    }
    if (subsubjects.length > 0 && !subsubjectId) {
      return false;
    }
    if (subjects.length === 0 && customSubject.trim().length < 5) {
      return false;
    }
    return true;
  }

  const resolvedSubjectText = selectedSubject
    ? selectedSubsubject
      ? `${selectedSubject.name} — ${selectedSubsubject.name}`
      : selectedSubject.name
    : customSubject.trim();

  return (
    <div className="space-y-5">
      {/* ETAPA INICIAL: Escolha entre Criar Novo Manifesto ou Consultar Protocolo */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0e4c7e]">
              Atendimento Digital ao Cidadão
            </span>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">Como podemos ajudar você hoje?</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Selecione uma opção para iniciar
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setFlowMode("create");
              setMessage("");
            }}
            className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition ${
              flowMode === "create"
                ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <div
              className={`rounded-xl p-2.5 ${
                flowMode === "create" ? "bg-[#0e4c7e] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <FilePlus2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold">
                {isEsicDefault ? "Nova Solicitação de Informação" : "Criar Novo Manifesto / Solicitação"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {isEsicDefault
                  ? "Registre um novo pedido de acesso à informação pública (e-SIC)."
                  : "Registre solicitação de Rua e Bairro, Lixo e Limpeza, reclamação, denúncia, sugestão ou elogio."}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setFlowMode("consult");
              setMessage("");
            }}
            className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition ${
              flowMode === "consult"
                ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <div
              className={`rounded-xl p-2.5 ${
                flowMode === "consult" ? "bg-[#0e4c7e] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold">Consultar Protocolo / Acompanhar Situação</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Acompanhe via internet a situação, o prazo e a resposta oficial dos manifestos criados.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* FLUXO 1: CRIAR NOVO MANIFESTO / SOLICITAÇÃO (MULTIETAPAS) */}
      {flowMode === "create" && (
        <form
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            const location = [
              street.trim() && `Rua/local: ${street.trim()}`,
              neighborhood.trim() && `Bairro: ${neighborhood.trim()}`,
            ]
              .filter(Boolean)
              .join("\n");

            const payload: Record<string, unknown> = {
              type: requestType,
              entity,
              subject: resolvedSubjectText,
              ...(subjectId ? { subjectId } : {}),
              ...(subsubjectId ? { subsubjectId } : {}),
              name: anonymous && requestType !== "ESIC" ? "" : name.trim(),
              email: anonymous && requestType !== "ESIC" ? "" : email.trim(),
              message: [description.trim(), location].filter(Boolean).join("\n\n"),
              requestKey,
            };

            try {
              const created = await send(payload);
              setReceipt(created);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Conexão interrompida.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {/* Barra de Progresso das Subetapas */}
          <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {[
                { num: 1 as const, label: "1. Assunto ou Categoria" },
                { num: 2 as const, label: "2. Detalhamento do Serviço" },
                { num: 3 as const, label: "3. Relato e Identificação" },
              ].map((item) => {
                const isCurrent = step === item.num;
                const isDone = step > item.num || Boolean(receipt);
                return (
                  <button
                    key={item.num}
                    type="button"
                    disabled={
                      Boolean(receipt) ||
                      (item.num === 2 && !canAdvanceFromStep1()) ||
                      (item.num === 3 && (!canAdvanceFromStep1() || !canAdvanceFromStep2()))
                    }
                    onClick={() => setStep(item.num)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isCurrent
                        ? "bg-[#0e4c7e] text-white shadow-2xs"
                        : isDone
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-white text-slate-500 border border-slate-200"
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6">
            {receipt ? (
              <div
                role="status"
                className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-6 text-emerald-950"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-7 w-7 text-emerald-700" />
                  <div>
                    <h3 className="text-lg font-bold">Manifesto registrado com sucesso!</h3>
                    <p className="text-xs text-emerald-800">
                      Guarde o protocolo e a chave privada abaixo para acompanhar a situação pela internet.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 rounded-xl border border-emerald-200 bg-white p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-500">Protocolo do Canal</p>
                    <p className="mt-1 font-mono text-base font-bold text-slate-900">
                      Registrado: {receipt.protocol}
                    </p>
                  </div>
                  {receipt.centralProtocolNumber && (
                    <div>
                      <p className="text-[11px] font-bold uppercase text-slate-500">Protocolo Central</p>
                      <p className="mt-1 font-mono text-base font-bold text-slate-900">
                        {receipt.centralProtocolNumber}
                      </p>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-bold uppercase text-slate-500">
                      Chave Privada de Acompanhamento
                    </p>
                    <p className="mt-1 break-all rounded-lg bg-slate-50 p-2.5 font-mono text-xs font-semibold text-slate-800">
                      {receipt.token}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0e4c7e] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#0b3d66]"
                    onClick={() => {
                      const blob = new Blob(
                        [
                          `Protocolo do canal: ${receipt.protocol}\nProtocolo central: ${
                            receipt.centralProtocolNumber || "Referência anterior"
                          }\nChave: ${receipt.token}\nAcompanhe em ${
                            isEsicDefault ? "/portal/acesso-informacao" : "/portal/ouvidoria"
                          }`,
                        ],
                        { type: "text/plain" },
                      );
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `protocolo-${receipt.protocol}.txt`;
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Baixar comprovante
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFlowMode("consult");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                  >
                    <Search className="h-4 w-4" />
                    Acompanhar situação agora
                  </button>
                </div>
              </div>
            ) : (
              <fieldset disabled={busy} className="space-y-5">
                {/* SUBETAPA 1: ESCOLHA DO ASSUNTO PRINCIPAL OU TIPO DE MANIFESTAÇÃO */}
                {step === 1 && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Etapa 1 — Escolha o assunto ou tipo de manifesto
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        Selecione diretamente um dos serviços urbanos em destaque ou escolha outra modalidade de manifestação.
                      </p>
                    </div>

                    {!isEsicDefault && (streetSubject || cleaningSubject) && (
                      <div className="space-y-2.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#0e4c7e]">
                          Serviços Urbanos Rápidos (Clique para selecionar)
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {streetSubject && (
                            <div
                              className={`rounded-xl border p-4 transition ${
                                requestType === "SOLICITACAO" && subjectId === streetSubject.id
                                  ? "border-[#0e4c7e] bg-[#0e4c7e]/5 ring-2 ring-[#0e4c7e]/15"
                                  : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleQuickSelectUrbanSubject(streetSubject.id)}
                                className="flex w-full items-start gap-3 text-left"
                              >
                                <div className="rounded-lg bg-[#0e4c7e] p-2 text-white">
                                  <Wrench className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">Assunto: Rua e Bairro</p>
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    Tapa-buraco, zeladoria da cidade, limpeza de bueiros/boca de lobo e poluição sonora.
                                  </p>
                                </div>
                              </button>
                              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200/70 pt-2.5">
                                {catalog
                                  .filter(
                                    (sub) =>
                                      sub.kind === "SUBSUBJECT" && sub.subjectId === streetSubject.id,
                                  )
                                  .map((sub) => (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      onClick={() =>
                                        handleQuickSelectUrbanSubject(streetSubject.id, sub.id)
                                      }
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#0e4c7e] hover:text-[#0e4c7e]"
                                    >
                                      {sub.name.includes("sonora") && <Volume2 className="h-3 w-3" />}
                                      {sub.name}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}

                          {cleaningSubject && (
                            <div
                              className={`rounded-xl border p-4 transition ${
                                requestType === "SOLICITACAO" && subjectId === cleaningSubject.id
                                  ? "border-[#0e4c7e] bg-[#0e4c7e]/5 ring-2 ring-[#0e4c7e]/15"
                                  : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handleQuickSelectUrbanSubject(cleaningSubject.id)}
                                className="flex w-full items-start gap-3 text-left"
                              >
                                <div className="rounded-lg bg-[#0e4c7e] p-2 text-white">
                                  <Trash2 className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">Assunto: Lixo e Limpeza</p>
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    Varrição, coleta de lixo domiciliar, coleta reciclável e remoção de entulho em via pública.
                                  </p>
                                </div>
                              </button>
                              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200/70 pt-2.5">
                                {catalog
                                  .filter(
                                    (sub) =>
                                      sub.kind === "SUBSUBJECT" && sub.subjectId === cleaningSubject.id,
                                  )
                                  .map((sub) => (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      onClick={() =>
                                        handleQuickSelectUrbanSubject(cleaningSubject.id, sub.id)
                                      }
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#0e4c7e] hover:text-[#0e4c7e]"
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      {sub.name}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="field">
                        <span>Tipo de manifestação *</span>
                        <select
                          name="type"
                          value={requestType}
                          onChange={(event) => {
                            setRequestType(event.target.value);
                            setSubjectId("");
                            setSubsubjectId("");
                            setAnonymous(false);
                          }}
                          className="input"
                        >
                          <option value="ESIC">Pedido de acesso à informação (e-SIC)</option>
                          {Object.entries(publicOmbudsmanTypes).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Entidade destinatária *</span>
                        <select
                          name="entity"
                          value={entity}
                          onChange={(e) => setEntity(e.target.value as "prefeitura" | "camara")}
                          className="input"
                        >
                          <option value="prefeitura">Prefeitura Municipal</option>
                          <option value="camara">Câmara Municipal</option>
                        </select>
                      </label>

                      {requestType !== "ESIC" && subjects.length > 0 && (
                        <label className="field sm:col-span-2">
                          <span>Assunto principal *</span>
                          <select
                            name="subjectId"
                            required
                            value={subjectId}
                            onChange={(event) => {
                              setSubjectId(event.target.value);
                              setSubsubjectId("");
                              setAnonymous(false);
                            }}
                            className="input"
                          >
                            <option value="">Selecione o assunto (ex: Rua e Bairro, Lixo e Limpeza)...</option>
                            {subjects.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>

                    <div className="flex items-center justify-end border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        disabled={!canAdvanceFromStep1()}
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0e4c7e] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#0b3d66] disabled:opacity-50"
                      >
                        <span>Continuar para Subassunto e Local</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* SUBETAPA 2: SUBASSUNTO E LOCALIZAÇÃO CONDICIONAL */}
                {step === 2 && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          Etapa 2 — Especifique o Subassunto e o Local
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-600">
                          Modalidade selecionada: <strong>{currentTypeLabel}</strong>
                          {selectedSubject ? ` · ${selectedSubject.name}` : ""}
                        </p>
                      </div>
                    </div>

                    {subsubjects.length > 0 ? (
                      <div className="space-y-3">
                        <label className="field">
                          <span>Selecione o Subassunto específico *</span>
                          <select
                            name="subsubjectId"
                            required
                            value={subsubjectId}
                            onChange={(event) => {
                              setSubsubjectId(event.target.value);
                              setAnonymous(false);
                            }}
                            className="input"
                          >
                            <option value="">Selecione a opção desejada...</option>
                            {subsubjects.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        {/* Cartões rápidos dos subassuntos para facilitar o clique */}
                        <div className="grid gap-2 sm:grid-cols-2">
                          {subsubjects.map((entry) => {
                            const active = subsubjectId === entry.id;
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => {
                                  setSubsubjectId(entry.id);
                                  setAnonymous(false);
                                }}
                                className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                                  active
                                    ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                                    : "border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-white"
                                }`}
                              >
                                <span className="text-xs font-bold">{entry.name}</span>
                                {entry.serviceInformation && (
                                  <span className="mt-1 text-[11px] text-slate-500">
                                    {entry.serviceInformation}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      !selectedSubject && (
                        <label className="field">
                          <span>Assunto resumido da manifestação *</span>
                          <input
                            required
                            name="subject"
                            minLength={5}
                            maxLength={250}
                            value={customSubject}
                            onChange={(e) => setCustomSubject(e.target.value)}
                            placeholder="Descreva em poucas palavras o tema da solicitação"
                            className="input"
                          />
                        </label>
                      )
                    )}

                    {selectedSubsubject?.serviceInformation && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-[#0e4c7e]/20 bg-[#0e4c7e]/[0.04] p-3.5 text-xs leading-relaxed text-slate-700">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0e4c7e]" />
                        <div>
                          <strong className="text-[#0e4c7e]">Orientação ao cidadão: </strong>
                          {selectedSubsubject.serviceInformation}
                        </div>
                      </div>
                    )}

                    {requestType !== "ESIC" && (
                      <div className="grid gap-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <MapPin className="h-3.5 w-3.5 text-[#0e4c7e]" />
                            Localização da Ocorrência ou Serviço Urbano
                          </span>
                        </div>
                        <label className="field">
                          <span>Rua, número ou ponto de referência</span>
                          <input
                            name="street"
                            maxLength={250}
                            value={street}
                            onChange={(e) => setStreet(e.target.value)}
                            placeholder="Ex: Rua Sete de Setembro, em frente ao nº 120"
                            className="input"
                          />
                        </label>
                        <label className="field">
                          <span>Bairro / Comunidade</span>
                          <input
                            name="neighborhood"
                            maxLength={150}
                            value={neighborhood}
                            onChange={(e) => setNeighborhood(e.target.value)}
                            placeholder="Ex: Centro"
                            className="input"
                          />
                        </label>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Voltar
                      </button>

                      <button
                        type="button"
                        disabled={!canAdvanceFromStep2()}
                        onClick={() => setStep(3)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0e4c7e] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#0b3d66] disabled:opacity-50"
                      >
                        <span>Continuar para Relato e Envio</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* SUBETAPA 3: DESCRIÇÃO E IDENTIFICAÇÃO CONDICIONAL */}
                {step === 3 && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                      <div>
                        <span className="font-bold text-[#0e4c7e]">{currentTypeLabel}:</span>{" "}
                        <span className="font-semibold text-slate-800">{resolvedSubjectText}</span>
                        {(street || neighborhood) && (
                          <span className="text-slate-500">
                            {" "}
                            · {[street, neighborhood].filter(Boolean).join(" - ")}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="font-bold text-[#0e4c7e] hover:underline"
                      >
                        Alterar assunto/local
                      </button>
                    </div>

                    <label className="field">
                      <span className="inline-flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-[#0e4c7e]" />
                        Descrição detalhada do pedido ou manifestação (mínimo 20 caracteres) *
                      </span>
                      <textarea
                        required
                        name="message"
                        minLength={20}
                        maxLength={11400}
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={
                          selectedSubsubject?.serviceInformation ||
                          "Descreva com clareza os fatos, horários, pontos de referência ou informações solicitadas..."
                        }
                        className="input py-2.5"
                      />
                    </label>

                    {requestType !== "ESIC" && (
                      <div className="space-y-3">
                        <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                          Forma de Identificação
                        </span>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setAnonymous(false)}
                            className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                              !anonymous
                                ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <UserCheck className="h-4 w-4 shrink-0" />
                            <div>
                              <p className="text-xs font-bold">Manifestação Identificada</p>
                              <p className="text-[11px] text-slate-500">
                                Seus dados permanecem protegidos por sigilo (LGPD).
                              </p>
                            </div>
                          </button>

                          {selectedSubsubject?.isAnonymous !== false && (
                            <button
                              type="button"
                              onClick={() => setAnonymous(true)}
                              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                                anonymous
                                  ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <UserX className="h-4 w-4 shrink-0" />
                              <div>
                                <p className="text-xs font-bold">Manifestação Anônima</p>
                                <p className="text-[11px] text-slate-500">
                                  Oculta nome e e-mail. Você acompanha pela chave privada.
                                </p>
                              </div>
                            </button>
                          )}
                        </div>
                        {selectedSubsubject?.isAnonymous === false && (
                          <p className="text-xs font-medium text-amber-800">
                            Este serviço exige identificação do solicitante.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Campos de Nome e E-mail ocultados automaticamente quando Anônimo está selecionado */}
                    {(!anonymous || requestType === "ESIC") && (
                      <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
                        <label className="field">
                          <span>Nome completo *</span>
                          <input
                            required
                            name="name"
                            maxLength={200}
                            autoComplete="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Informe seu nome completo"
                            className="input"
                          />
                        </label>
                        <label className="field">
                          <span>E-mail para contato *</span>
                          <input
                            required
                            name="email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="seu.email@exemplo.com.br"
                            className="input"
                          />
                        </label>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Voltar
                      </button>

                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0e4c7e] px-6 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-[#0b3d66] disabled:opacity-50"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>{busy ? "Registrando manifesto…" : "Registrar Manifesto"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </fieldset>
            )}
          </div>
        </form>
      )}

      {/* FLUXO 2: CONSULTAR PROTOCOLO / ACOMPANHAR SITUAÇÃO VIA INTERNET */}
      {flowMode === "consult" && (
        <div className="space-y-4">
          <form
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setMessage("");
              setResult(null);
              const data = Object.fromEntries(new FormData(event.currentTarget));
              try {
                const response = await send({ ...data, operation: "consultar" });
                setResult(response);
                setCredentials({ protocol: String(data.protocol), token: String(data.token) });
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Consulta não concluída.");
                setCredentials(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="border-b border-slate-100 pb-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Search className="h-5 w-5 text-[#0e4c7e]" />
                Acompanhar Situação, Resposta e Prazo do Manifesto
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Informe o número do protocolo do canal e a chave privada gerada no momento do registro.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Número do Protocolo *</span>
                <input
                  required
                  name="protocol"
                  defaultValue={receipt?.protocol || ""}
                  placeholder="Ex: 2026-A1B2C3D4E5F6"
                  className="input font-mono"
                />
              </label>
              <label className="field">
                <span>Chave de Acompanhamento *</span>
                <input
                  required
                  name="token"
                  type="password"
                  defaultValue={receipt?.token || ""}
                  autoComplete="off"
                  placeholder="Cole sua chave privada de 64 caracteres"
                  className="input font-mono"
                />
              </label>
            </div>

            <div className="flex items-center justify-end">
              <button
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0e4c7e] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#0b3d66] disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                {busy ? "Consultando…" : "Consultar Protocolo"}
              </button>
            </div>

            {result && (
              <div
                aria-live="polite"
                className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <span className="font-mono text-base font-bold text-slate-900">{result.protocol}</span>
                  <span className="rounded-full bg-[#0e4c7e]/10 px-3 py-1 text-xs font-bold text-[#0e4c7e]">
                    {result.status}
                  </span>
                </div>

                {result.situation && (
                  <p className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-950">
                    Situação da solicitação: {result.situation}
                  </p>
                )}

                <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                  <p>
                    <strong>Assunto:</strong> {result.subject}
                  </p>
                  <p>
                    <strong>Prazo legal de resposta:</strong> {result.dueAt?.slice(0, 10)}
                  </p>
                </div>

                {result.extensionReason && (
                  <p className="text-xs text-amber-800">
                    <strong>Prorrogação:</strong> {result.extensionReason}
                  </p>
                )}

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase text-slate-500">Parecer / Resposta Oficial</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">
                    {result.response || "Aguardando análise/resposta da equipe técnica responsável."}
                  </p>
                </div>

                {result.appeals?.map((appeal) => (
                  <div
                    key={appeal.level}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700"
                  >
                    <strong>Recurso {appeal.level}</strong> · {appeal.status} · Prazo{" "}
                    {appeal.dueAt.slice(0, 10)} · {appeal.response || "Aguardando análise"}
                  </div>
                ))}
              </div>
            )}
          </form>

          {result?.status === "RESPONDIDO" && credentials && (
            <div className="grid gap-4 md:grid-cols-2">
              {result.type === "ESIC" && (
                <form
                  className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setMessage("");
                    const data = Object.fromEntries(new FormData(event.currentTarget));
                    try {
                      await send({ ...credentials, ...data, operation: "recorrer" });
                      setMessage("Recurso registrado. Consulte o protocolo para acompanhar.");
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Falha no recurso.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <h3 className="text-sm font-bold text-slate-900">Apresentar Recurso</h3>
                  <p className="text-xs text-slate-600">
                    Prazo de apresentação: 10 dias da resposta; decisão em 5 dias.
                  </p>
                  <label className="field">
                    <span>Fundamentação do recurso *</span>
                    <textarea
                      required
                      name="message"
                      minLength={20}
                      maxLength={12000}
                      rows={4}
                      className="input py-2"
                    />
                  </label>
                  <button
                    disabled={busy}
                    className="rounded-xl bg-[#0e4c7e] px-4 py-2 text-xs font-bold text-white"
                  >
                    Registrar recurso
                  </button>
                </form>
              )}

              <form
                className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  setMessage("");
                  const data = Object.fromEntries(new FormData(event.currentTarget));
                  try {
                    await send({
                      ...credentials,
                      comment: data.comment,
                      rating: {
                        serviceScore: Number(data.serviceScore),
                        qualityScore: Number(data.qualityScore),
                        deadlineScore: Number(data.deadlineScore),
                      },
                      operation: "avaliar",
                    });
                    setMessage("Avaliação registrada. Somente os resultados agregados são publicados.");
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Falha na avaliação.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3 className="text-sm font-bold text-slate-900">Avaliar o Atendimento</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["serviceScore", "Satisfação com o serviço"],
                    ["qualityScore", "Qualidade do atendimento"],
                    ["deadlineScore", "Prazo e compromisso"],
                  ].map(([fieldName, label]) => (
                    <label key={fieldName} className="field">
                      <span>{label}</span>
                      <select required name={fieldName} className="input">
                        <option value="">Nota (1 a 5)</option>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <option key={score} value={score}>
                            {score}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="field">
                  <span>Comentário (restrito à equipe da Ouvidoria)</span>
                  <textarea name="comment" maxLength={2000} rows={2} className="input py-2" />
                </label>
                <button
                  disabled={busy}
                  className="rounded-xl bg-[#0e4c7e] px-4 py-2 text-xs font-bold text-white"
                >
                  Registrar avaliação
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {message && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900"
        >
          {message}
        </p>
      )}
    </div>
  );
}
