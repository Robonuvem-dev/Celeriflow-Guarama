"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Phone, Save, Search, UserRound } from "lucide-react";
import { MaskedInput } from "@/components/ui/MaskedInput";
import { createPersonWithFeedback } from "../../actions";

function maskCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export default function NovaPessoaFisicaForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [streetName, setStreetName] = useState("");
  const [complement, setComplement] = useState("");
  const [cityStateInfo, setCityStateInfo] = useState("");
  const [searchingCep, setSearchingCep] = useState(false);
  const [cepMessage, setCepMessage] = useState("");
  const cepRequest = useRef<AbortController | null>(null);

  async function lookupCep(rawCep?: string) {
    const digits = (rawCep ?? zipCode).replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepMessage("Informe um CEP válido com 8 dígitos para consultar.");
      return;
    }
    cepRequest.current?.abort();
    const controller = new AbortController();
    cepRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setSearchingCep(true);
    setCepMessage("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (cepRequest.current !== controller) return;
      if (data.erro) {
        setCepMessage("CEP não encontrado na base nacional. Preencha o logradouro manualmente.");
        return;
      }
      if (data.logradouro) {
        const formattedStreet = data.bairro ? `${data.logradouro} - ${data.bairro}` : data.logradouro;
        setStreetName(formattedStreet);
      }
      if (data.complemento && !complement) {
        setComplement(data.complemento);
      }
      if (data.localidade || data.uf) {
        setCityStateInfo([data.localidade, data.uf].filter(Boolean).join(" / "));
      }
      setCepMessage(
        data.localidade
          ? `Endereço localizado (${data.localidade}/${data.uf}). Confira o logradouro e informe o número.`
          : "CEP localizado. Confira o endereço e preencha o número residencial.",
      );
    } catch {
      if (cepRequest.current === controller) {
        setCepMessage("Não foi possível consultar o CEP no momento. Preencha o endereço manualmente.");
      }
    } finally {
      clearTimeout(timeout);
      if (cepRequest.current === controller) setSearchingCep(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const formData = new FormData(e.currentTarget);
      const result = await createPersonWithFeedback(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.push("/cadastros/pessoas-fisicas");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao cadastrar pessoa física.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-sm">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#0e4c7e]/10 text-[#0e4c7e]">
            <UserRound className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">1. Identificação e Dados Pessoais</h2>
            <p className="text-xs text-slate-500">Informações civis obrigatórias para o cadastro único municipal.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
          <label className="field md:col-span-2 lg:col-span-2">
            <span>Nome completo <span className="text-red-600">*</span></span>
            <input name="fullName" required placeholder="Digite o nome civil completo" className="input" />
          </label>

          <label className="field">
            <span>CPF <span className="text-red-600">*</span></span>
            <MaskedInput maskType="cpf" name="cpf" required placeholder="000.000.000-00" className="input" />
          </label>

          <label className="field">
            <span>Data de nascimento <span className="text-red-600">*</span></span>
            <input name="birthDate" type="date" required className="input" />
          </label>

          <label className="field">
            <span>Sexo <span className="text-red-600">*</span></span>
            <select name="gender" required defaultValue="" className="input">
              <option value="" disabled>Selecione</option>
              <option value="Feminino">Feminino</option>
              <option value="Masculino">Masculino</option>
              <option value="Outro">Outro</option>
              <option value="Não informado">Não informado</option>
            </select>
          </label>

          <label className="field">
            <span>Raça/cor <span className="text-red-600">*</span></span>
            <select name="raceColor" required defaultValue="" className="input">
              <option value="" disabled>Selecione</option>
              <option value="Branca">Branca</option>
              <option value="Preta">Preta</option>
              <option value="Parda">Parda</option>
              <option value="Amarela">Amarela</option>
              <option value="Indígena">Indígena</option>
              <option value="Não informada">Não informada</option>
            </select>
          </label>

          <label className="field md:col-span-2 lg:col-span-2">
            <span>Nome da mãe <span className="text-red-600">*</span></span>
            <input name="motherName" required placeholder="Nome completo da filiação materna" className="input" />
          </label>

          <label className="field">
            <span>Estado civil</span>
            <select name="maritalStatus" defaultValue="" className="input">
              <option value="">Não informado</option>
              <option value="Solteiro(a)">Solteiro(a)</option>
              <option value="Casado(a)">Casado(a)</option>
              <option value="União estável">União estável</option>
              <option value="Separado(a)">Separado(a)</option>
              <option value="Divorciado(a)">Divorciado(a)</option>
              <option value="Viúvo(a)">Viúvo(a)</option>
            </select>
          </label>

          <label className="field">
            <span>Nacionalidade</span>
            <input name="nationality" maxLength={100} defaultValue="Brasileira" placeholder="Ex.: Brasileira" className="input" />
          </label>

          <label className="field">
            <span>Situação cadastral</span>
            <select name="status" defaultValue="Ativo" className="input">
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#0e4c7e]/10 text-[#0e4c7e]">
            <Phone className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">2. Canais de Contato</h2>
            <p className="text-xs text-slate-500">Meios de comunicação para notificações e acompanhamento de protocolos.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
          <label className="field md:col-span-2 lg:col-span-1">
            <span>E-mail</span>
            <input name="email" type="email" placeholder="cidadao@exemplo.com" className="input" />
          </label>

          <label className="field">
            <span>Telefone principal</span>
            <MaskedInput maskType="phone" name="phonePrimary" placeholder="(00) 00000-0000" className="input" />
          </label>

          <label className="field">
            <span>Telefone secundário</span>
            <MaskedInput maskType="phone" name="phoneSecondary" placeholder="(00) 0000-0000" className="input" />
          </label>

          <label className="field">
            <span>WhatsApp</span>
            <MaskedInput maskType="phone" name="whatsapp" placeholder="(00) 00000-0000" className="input" />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#0e4c7e]/10 text-[#0e4c7e]">
            <MapPin className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">3. Endereço Residencial</h2>
            <p className="text-xs text-slate-500">Informe o CEP para preenchimento automático do logradouro via API.</p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5 lg:col-span-4">
              <label htmlFor="person-zipCode" className="field">
                <span>CEP residencial <span className="text-red-600">*</span></span>
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="person-zipCode"
                  name="zipCode"
                  type="text"
                  required
                  value={zipCode}
                  onChange={(e) => {
                    cepRequest.current?.abort();
                    cepRequest.current = null;
                    setSearchingCep(false);
                    setCepMessage("");
                    const masked = maskCep(e.target.value);
                    setZipCode(masked);
                    if (masked.replace(/\D/g, "").length === 8) {
                      void lookupCep(masked);
                    }
                  }}
                  onBlur={() => {
                    if (zipCode.replace(/\D/g, "").length === 8 && !streetName) {
                      void lookupCep(zipCode);
                    }
                  }}
                  placeholder="00000-000"
                  inputMode="numeric"
                  maxLength={9}
                  className="input flex-1"
                />
                <button
                  type="button"
                  disabled={searchingCep}
                  onClick={() => void lookupCep()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  <Search className="size-3.5 text-[#0e4c7e]" />
                  {searchingCep ? "Buscando..." : "Buscar CEP"}
                </button>
              </div>
              {cepMessage && (
                <p role="status" className="mt-1.5 text-xs font-medium text-[#0e4c7e]">
                  {cepMessage}
                </p>
              )}
            </div>

            <label className="field md:col-span-7 lg:col-span-5">
              <span>Logradouro residencial <span className="text-red-600">*</span></span>
              <input
                name="streetName"
                required
                value={streetName}
                onChange={(e) => setStreetName(e.target.value)}
                placeholder="Rua, Avenida, Travessa e Bairro"
                className="input"
              />
            </label>

            <label className="field md:col-span-4 lg:col-span-3">
              <span>Número <span className="text-red-600">*</span></span>
              <input name="number" required placeholder="Ex.: 120 ou S/N" className="input" />
            </label>

            <label className="field md:col-span-8 lg:col-span-8">
              <span>Complemento / Ponto de referência</span>
              <input
                name="complement"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Apto, bloco, casa, lote ou referência próxima"
                className="input"
              />
            </label>

            <label className="field md:col-span-4 lg:col-span-4">
              <span>Município / UF (conferência CEP)</span>
              <input
                type="text"
                value={cityStateInfo}
                onChange={(e) => setCityStateInfo(e.target.value)}
                placeholder="Preenchido automaticamente pelo CEP"
                className="input bg-slate-50 text-slate-600"
              />
            </label>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
        <span className="text-xs text-slate-500">
          Campos marcados com <span className="font-bold text-red-600">*</span> são de preenchimento obrigatório.
        </span>
        <div className="flex items-center gap-2.5">
          <Link
            href="/cadastros/pessoas-fisicas"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="size-3.5" />
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="portal-btn h-9 cursor-pointer disabled:opacity-50"
          >
            <Save className="size-4" />
            {loading ? "Salvando cadastro..." : "Salvar pessoa"}
          </button>
        </div>
      </div>
    </form>
  );
}
