"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PortalLoginCardProps = {
  audience: "citizen" | "employee";
  destination: string;
  initialError?: string;
  sessionEndpoint?: "/api/auth/session" | "/api/auth/construcao-civil/session" | "/api/auth/portal-servidor/session";
};

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function PortalLoginCard({ audience, destination, initialError = "", sessionEndpoint = "/api/auth/session" }: PortalLoginCardProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<"password" | "google" | null>(null);
  const [error, setError] = useState(initialError);
  const isCitizen = audience === "citizen";

  async function createLocalSession(credential: UserCredential) {
    const idToken = await credential.user.getIdToken();
    const response = await fetch(sessionEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      await signOut(auth).catch(() => undefined);
      throw new Error(typeof data.error === "string" ? data.error : "Não foi possível iniciar a sessão.");
    }

    router.push(destination);
    router.refresh();
  }

  async function handlePasswordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingMethod("password");
    setError("");

    try {
      await createLocalSession(await signInWithEmailAndPassword(auth, email, password));
    } catch (loginError) {
      setError(loginError instanceof Error && !loginError.message.startsWith("Firebase:")
        ? loginError.message
        : "E-mail ou senha inválidos, ou usuário sem acesso autorizado.");
    } finally {
      setPendingMethod(null);
    }
  }

  async function handleGoogleLogin() {
    setPendingMethod("google");
    setError("");

    try {
      await createLocalSession(await signInWithPopup(auth, googleProvider));
    } catch (loginError) {
      setError(loginError instanceof Error && !loginError.message.startsWith("Firebase:")
        ? loginError.message
        : "Não foi possível entrar com Google. Confirme a conta e tente novamente.");
    } finally {
      setPendingMethod(null);
    }
  }

  return (
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10">
      <div className={`h-1.5 ${isCitizen ? "bg-emerald-600" : "bg-sky-700"}`} />
      <div className="p-6 sm:p-8">
        <div className="mb-6">
          <div className={`mb-4 flex size-11 items-center justify-center rounded-xl ${isCitizen ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-800"}`}>
            <LockKeyhole className="size-5" aria-hidden="true" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            {isCitizen ? "Serviços ao cidadão" : "Acesso funcional"}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {isCitizen ? "Entrar na minha área" : "Portal do Servidor"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {isCitizen ? "Entre com e-mail e senha ou com sua conta Google para solicitar serviços e acompanhar seus processos. Use uma conta autorizada pela administração municipal." : "Use seu e-mail institucional cadastrado e sua senha. O acesso funcional é permitido enquanto seu cadastro estiver ativo."}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <p>{error}</p>
            {!isCitizen && <p className="mt-2">Em caso de dúvidas, contate o RH pelo e-mail <a href="mailto:rh@emailprefeitura.com" className="font-semibold underline underline-offset-2">rh@emailprefeitura.com</a>.</p>}
          </div>
        )}

        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${audience}-email`}>{isCitizen ? "E-mail" : "E-mail institucional cadastrado"}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                id={`${audience}-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 pl-9"
                placeholder={isCitizen ? "seuemail@exemplo.com" : "voce@prefeitura.gov.br"}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${audience}-password`}>Senha</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                id={`${audience}-password`}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 px-9"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="h-11 w-full" disabled={pendingMethod !== null}>
            {pendingMethod === "password" ? <Loader2 className="size-4 animate-spin" /> : <><span>Entrar com e-mail</span><ArrowRight className="size-4" /></>}
          </Button>
        </form>

        {!isCitizen && <Link href="/portal-servidor/recuperar-senha" className="mt-4 inline-flex text-sm font-semibold text-sky-800 hover:underline">Esqueci minha senha</Link>}
        {isCitizen && <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold"><Link href="/portal/cadastrar" className="text-emerald-800 hover:underline">Solicitar acesso / consultar solicitação</Link><Link href="/portal/recuperar-senha" className="text-emerald-800 hover:underline">Esqueci minha senha</Link></div>}

        {isCitizen && (
          <>
            <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              Outras formas de acesso
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="space-y-2.5">
              <Button type="button" variant="outline" className="h-11 w-full" onClick={handleGoogleLogin} disabled={pendingMethod !== null}>
                {pendingMethod === "google" ? <Loader2 className="size-4 animate-spin" /> : <><span className="text-base font-bold text-blue-600" aria-hidden="true">G</span>Entrar com Google</>}
              </Button>
              <ConfiguredProvider label="Entrar com gov.br" />
            </div>
          </>
        )}

        <p className="mt-5 text-xs leading-5 text-slate-500">
          O acesso não cria cadastro automaticamente. Sua conta precisa estar previamente autorizada no sistema.
        </p>
        <Link href="/portal" className="mt-5 inline-flex text-sm font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">
          Voltar ao portal institucional
        </Link>
      </div>
    </section>
  );
}

function ConfiguredProvider({ label }: { label: string }) {
  return (
    <Button type="button" variant="outline" className="h-11 w-full justify-between border-slate-200 bg-slate-100 text-slate-500 disabled:opacity-100" disabled aria-describedby="govbr-provider-status">
      <span>{label}</span>
      <span id="govbr-provider-status" className="text-xs font-normal">Em configuração</span>
    </Button>
  );
}
