"use client";

import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { KeyRound, UserPlus, Globe, Search, ShieldCheck, ArrowRight } from "lucide-react";
import { auth } from "@/lib/firebase/client";

type AccessMode = "existing" | "new" | "google" | "consult";

const MODE_OPTIONS: Array<{
  id: AccessMode;
  title: string;
  subtitle: string;
  description: string;
  buttonLabel: string;
  icon: typeof KeyRound;
}> = [
  {
    id: "existing",
    title: "Já tenho conta",
    subtitle: "E-mail e senha verificados",
    description:
      "Acesse com sua conta de e-mail já verificada e informe seu CPF ou CNPJ para solicitar a liberação do vínculo municipal.",
    buttonLabel: "Entrar e Solicitar Vínculo",
    icon: KeyRound,
  },
  {
    id: "new",
    title: "Criar nova conta",
    subtitle: "Primeiro cadastro por e-mail",
    description:
      "Crie sua credencial de acesso com e-mail e senha. Enviaremos um link de confirmação para o seu endereço de e-mail.",
    buttonLabel: "Criar Conta e Enviar Verificação",
    icon: UserPlus,
  },
  {
    id: "google",
    title: "Conta Google",
    subtitle: "Autenticação rápida Google",
    description:
      "Utilize sua Conta Google verificada para autenticar sem precisar digitar senha e vincule seu CPF ou CNPJ.",
    buttonLabel: "Autenticar com Google e Solicitar",
    icon: Globe,
  },
  {
    id: "consult",
    title: "Consultar solicitação",
    subtitle: "Acompanhar protocolo de acesso",
    description:
      "Verifique o andamento da análise municipal da sua solicitação de acesso já protocolada.",
    buttonLabel: "Consultar Situação da Solicitação",
    icon: Search,
  },
];

export function CitizenRegistration() {
  const [mode, setMode] = useState<AccessMode>("existing");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);

  const activeConfig = MODE_OPTIONS.find((item) => item.id === mode) ?? MODE_OPTIONS[0];

  return (
    <form
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage("");
        setIsError(false);
        const form = new FormData(event.currentTarget);
        try {
          const selectedMode = (String(form.get("mode") || mode) as AccessMode) || "existing";
          const email = String(form.get("email") || "").trim();
          const password = String(form.get("password") || "");
          const confirmPassword = String(form.get("confirmPassword") || "");

          if (selectedMode === "new" && confirmPassword && password !== confirmPassword) {
            throw new Error("A confirmação de senha não confere com a senha informada.");
          }

          const credential =
            selectedMode === "google"
              ? await signInWithPopup(auth, new GoogleAuthProvider())
              : selectedMode === "new"
                ? await createUserWithEmailAndPassword(auth, email, password)
                : await signInWithEmailAndPassword(auth, email, password);

          if (!credential.user.emailVerified) {
            await sendEmailVerification(credential.user);
            setMessage(
              "Enviamos a verificação do e-mail. Confirme o endereço na sua caixa de entrada e retorne selecionando “Já tenho conta” para concluir a solicitação de acesso.",
            );
            return;
          }

          const response = await fetch("/api/portal/acesso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken: await credential.user.getIdToken(),
              document: String(form.get("document") || ""),
              ...(selectedMode === "consult" ? { operation: "consultar" } : {}),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setMessage(
            `${result.protocolNumber} — ${result.status}${
              result.reason ? `: ${result.reason}` : ". Aguarde a conferência municipal do vínculo."
            }`,
          );
        } catch (issue) {
          setIsError(true);
          setMessage(
            issue instanceof Error && !issue.message.startsWith("Firebase:")
              ? issue.message
              : "Não foi possível autenticar. Confira os dados da conta e tente novamente.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      {/* Cabeçalho e Seletor de Forma de Acesso */}
      <div className="border-b border-slate-100 bg-slate-50/70 p-6">
        <label className="block text-xs font-bold uppercase tracking-wider text-[#0e4c7e]">
          1. Escolha a Forma de Acesso
          <select
            name="mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as AccessMode);
              setMessage("");
              setIsError(false);
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-2xs outline-none focus:border-[#0e4c7e] focus:ring-2 focus:ring-[#0e4c7e]/15"
          >
            <option value="existing">Já tenho conta de e-mail/senha</option>
            <option value="new">Criar conta de e-mail/senha</option>
            <option value="google">Conta Google</option>
            <option value="consult">Consultar solicitação (e-mail/senha)</option>
          </select>
        </label>

        {/* Cartões visuais sincronizados com o select */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {MODE_OPTIONS.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  setMessage("");
                  setIsError(false);
                }}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    active ? "bg-[#0e4c7e] text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl border border-[#0e4c7e]/15 bg-[#0e4c7e]/[0.04] px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
          <strong className="text-[#0e4c7e]">{activeConfig.title}:</strong> {activeConfig.description}
        </div>
      </div>

      {/* Campos Dinâmicos conforme a Forma de Acesso selecionada */}
      <div className="space-y-4 p-6">
        {mode !== "google" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2">
              <span>E-mail de acesso *</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="seu.email@exemplo.com.br"
                className="input"
              />
            </label>

            <label className={mode === "new" ? "field" : "field sm:col-span-2"}>
              <span>{mode === "new" ? "Criar senha (mínimo 6 caracteres) *" : "Sua senha *"}</span>
              <input
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "new" ? "new-password" : "current-password"}
                placeholder="••••••••"
                className="input"
              />
            </label>

            {mode === "new" && (
              <label className="field">
                <span>Confirmar senha *</span>
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Repita a senha criada"
                  className="input"
                />
              </label>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
            Ao clicar no botão abaixo, uma janela segura do <strong>Google</strong> será aberta para autenticar sua conta. Em seguida, seu CPF/CNPJ será enviado para conferência cadastral.
          </div>
        )}

        {mode !== "consult" && (
          <label className="field">
            <span>
              CPF ou CNPJ para conferência municipal {mode === "new" ? "(opcional nesta etapa)" : "*"}
            </span>
            <input
              name="document"
              required={mode === "existing" || mode === "google"}
              maxLength={18}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              className="input"
            />
          </label>
        )}

        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs leading-relaxed text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0e4c7e]" />
          <p>
            Informar CPF/CNPJ não libera dados automaticamente. O município confere o vínculo cadastral e decide a autorização. A solicitação não cria permissões administrativas.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0e4c7e] px-5 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-[#0b3d66] disabled:opacity-50"
        >
          <span>{pending ? "Processando solicitação…" : activeConfig.buttonLabel}</span>
          <ArrowRight className="h-4 w-4" />
        </button>

        {message && (
          <div
            role="status"
            className={`rounded-xl border p-4 text-sm leading-relaxed whitespace-pre-wrap ${
              isError
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </form>
  );
}
