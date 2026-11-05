"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, EyeOff, FileText, Lock, MessageSquareWarning, Save, UserRound } from "lucide-react";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { createOmbudsmanWithFeedback } from "@/app/app-domain/atendimento/actions";

export type CatalogItem = {
  id: string;
  kind: string;
  requestType: string;
  name: string;
  subjectId: string | null;
  serviceInformation?: string | null;
};

type Props = {
  originModule?: "ATENDIMENTO" | "PROCESSOS";
  backHref: string;
  channels: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  catalog: CatalogItem[];
};

const OMBUDSMAN_TYPES = [
  { value: "Solicitação", label: "Solicitação (Serviços urbanos, manutenção, providências)" },
  { value: "Reclamação", label: "Reclamação (Insatisfação com serviço ou atendimento)" },
  { value: "Denúncia", label: "Denúncia (Irregularidade ou infração)" },
  { value: "Sugestão", label: "Sugestão (Melhoria de serviços públicos)" },
  { value: "Elogio", label: "Elogio (Reconhecimento de bom atendimento)" },
  { value: "Ocorrência", label: "Ocorrência (Comunicação de fato operacional)" },
];

export default function NovaManifestacaoForm({
  originModule = "ATENDIMENTO",
  backHref,
  channels,
  departments,
  catalog,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedType, setSelectedType] = useState("Denúncia");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedSubsubject, setSelectedSubsubject] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isConfidential, setIsConfidential] = useState(true);

  const availableSubjects = useMemo(() => {
    const byType = catalog.filter(
      (item) => item.kind === "SUBJECT" && item.requestType === selectedType,
    );
    return byType.length > 0 ? byType : catalog.filter((item) => item.kind === "SUBJECT");
  }, [catalog, selectedType]);

  const activeSubjectRecord = useMemo(
    () =>
      availableSubjects.find(
        (item) => item.name.toLowerCase() === selectedSubject.trim().toLowerCase(),
      ) ?? null,
    [availableSubjects, selectedSubject],
  );

  const availableSubsubjects = useMemo(() => {
    if (!activeSubjectRecord) return [];
    return catalog.filter(
      (item) => item.kind === "SUBSUBJECT" && item.subjectId === activeSubjectRecord.id,
    );
  }, [catalog, activeSubjectRecord]);

  const activeSubsubjectRecord = useMemo(
    () =>
      availableSubsubjects.find(
        (item) => item.name.toLowerCase() === selectedSubsubject.trim().toLowerCase(),
      ) ?? null,
    [availableSubsubjects, selectedSubsubject],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const formData = new FormData(e.currentTarget);
      const result = await createOmbudsmanWithFeedback(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (result?.redirectUrl) {
        router.push(result.redirectUrl);
        router.refresh();
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a manifestação.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {originModule === "PROCESSOS" && <input type="hidden" name="originModule" value="PROCESSOS" />}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-sm">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#0e4c7e]/10 text-[#0e4c7e]">
            <MessageSquareWarning className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">1. Classificação e Canal de Entrada</h2>
            <p className="text-xs text-slate-500">
              Selecione a natureza da manifestação. Os campos complementares são ajustados automaticamente conforme o tipo.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
          <label className="field">
            <span>Tipo de manifestação <span className="text-red-600">*</span></span>
            <select
              name="type"
              required
              value={selectedType}
              onChange={(e) => {
                const nextType = e.target.value;
                setSelectedType(nextType);
                setSelectedSubsubject("");
                if (nextType === "Denúncia") setIsConfidential(true);
              }}
              className="input"
            >
              {OMBUDSMAN_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Canal de atendimento <span className="text-red-600">*</span></span>
            <select name="channelId" required className="input">
              {channels.length > 0 ? (
                channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))
              ) : (
                <option value="default">Atendimento Ouvidoria</option>
              )}
            </select>
          </label>

          <label className="field">
            <span>Prioridade inicial</span>
            <select name="priority" defaultValue="Normal" className="input">
              <option value="Baixa">Baixa</option>
              <option value="Normal">Normal</option>
              <option value="Alta">Alta</option>
              <option value="Urgente">Urgente</option>
            </select>
          </label>

          <label className="field">
            <span>Setor inicial de destino</span>
            <select name="departmentId" defaultValue="" className="input">
              <option value="">Manter em triagem da Ouvidoria</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field md:col-span-2">
            <span>Assunto principal <span className="text-red-600">*</span></span>
            <input
              name="subject"
              required
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setSelectedSubsubject("");
              }}
              list="ombudsman-subjects-datalist"
              autoComplete="off"
              placeholder="Digite ou selecione um assunto do catálogo (ex.: Rua e Bairro, Lixo e Limpeza)"
              className="input"
            />
            <datalist id="ombudsman-subjects-datalist">
              {availableSubjects.map((row) => (
                <option key={row.id} value={row.name}>
                  {row.requestType}
                </option>
              ))}
            </datalist>
          </label>

          {availableSubsubjects.length > 0 && (
            <label className="field md:col-span-2 lg:col-span-3">
              <span>Subassunto / Serviço específico</span>
              <select
                name="subsubject"
                value={selectedSubsubject}
                onChange={(e) => setSelectedSubsubject(e.target.value)}
                className="input"
              >
                <option value="">Selecione um detalhamento (opcional)</option>
                {availableSubsubjects.map((sub) => (
                  <option key={sub.id} value={sub.name}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedType === "Reclamação" && (
            <label className="field md:col-span-2 lg:col-span-3">
              <span>Equipe ou unidade reclamada (opcional)</span>
              <input
                name="complaintTeam"
                maxLength={160}
                placeholder="Informe a equipe, turno ou setor alvo da reclamação, se aplicável"
                className="input"
              />
            </label>
          )}
        </div>

        {activeSubsubjectRecord?.serviceInformation && (
          <div className="mx-5 mb-5 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-slate-700">
            <strong className="font-bold text-[#0e4c7e]">Orientação para este serviço: </strong>
            {activeSubsubjectRecord.serviceInformation}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#0e4c7e]/10 text-[#0e4c7e]">
            <FileText className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">2. Relato / Descrição da Manifestação</h2>
            <p className="text-xs text-slate-500">
              Descreva os fatos com clareza, incluindo endereço, data, horário ou pontos de referência relevantes.
            </p>
          </div>
        </div>

        <div className="p-5">
          <label className="field">
            <span>Descrição detalhada <span className="text-red-600">*</span></span>
            <textarea
              name="description"
              required
              rows={5}
              placeholder="Relate detalhadamente a solicitação, reclamação, denúncia, elogio ou sugestão..."
              className="input resize-y"
            />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#0e4c7e]/10 text-[#0e4c7e]">
            {isAnonymous ? <EyeOff className="size-4" /> : <UserRound className="size-4" />}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">3. Sigilo e Identificação do Manifestante</h2>
            <p className="text-xs text-slate-500">
              A identidade é armazenada em tabela apartada (LGPD) e nunca é copiada automaticamente para processos externos.
            </p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 transition-colors hover:bg-slate-100/70">
              <input
                type="checkbox"
                name="isAnonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-[#0e4c7e]"
              />
              <span className="text-xs">
                <strong className="block font-bold text-slate-900">Manifestação anônima</strong>
                <span className="text-slate-600">
                  Oculta os campos de nome e CPF. Nenhum vínculo pessoal será exigido ou gravado.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 transition-colors hover:bg-slate-100/70">
              <input
                type="checkbox"
                name="isConfidential"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-[#0e4c7e]"
              />
              <span className="text-xs">
                <strong className="flex items-center gap-1 font-bold text-slate-900">
                  <Lock className="size-3.5 text-amber-600" />
                  Manifestação confidencial (Sigilo LGPD)
                </strong>
                <span className="text-slate-600">
                  Restringe o acesso à identidade e ao relato apenas à Ouvidoria e usuários expressamente autorizados.
                </span>
              </span>
            </label>
          </div>

          {!isAnonymous ? (
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 md:grid-cols-2">
              <label className="field">
                <span>Nome do manifestante <span className="text-red-600">*</span></span>
                <input
                  name="fullName"
                  required={!isAnonymous}
                  placeholder="Nome completo do cidadão"
                  className="input bg-white"
                />
              </label>
              <label className="field">
                <span>CPF do manifestante <span className="text-red-600">*</span></span>
                <MaskedInput
                  maskType="cpf"
                  name="cpf"
                  required={!isAnonymous}
                  placeholder="000.000.000-00"
                  className="input bg-white"
                />
              </label>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Modo <strong>Anônimo</strong> selecionado: os campos de identificação pessoal foram ocultados e a manifestação será registrada sem dados nominativos.
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
        <span className="text-xs text-slate-500">
          Campos marcados com <span className="font-bold text-red-600">*</span> são obrigatórios.
        </span>
        <div className="flex items-center gap-2.5">
          <Link
            href={backHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="size-3.5" />
            Voltar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="portal-btn h-9 cursor-pointer disabled:opacity-50"
          >
            <Save className="size-4" />
            {loading ? "Registrando..." : "Registrar manifestação"}
          </button>
        </div>
      </div>
    </form>
  );
}
