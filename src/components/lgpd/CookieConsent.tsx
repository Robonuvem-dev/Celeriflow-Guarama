"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const CONSENT_VERSION = 1;
const CONSENT_COOKIE_NAME = `celeriflow_lgpd_consent_v${CONSENT_VERSION}`;
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const REVIEW_CONSENT_EVENT = "celeriflow:review-cookie-consent";

type CookiePreference = "necessary" | "optional";
type ConsentSnapshot = CookiePreference | null | "loading";

type StoredConsent = {
  version: number;
  preference: CookiePreference;
};

function readStoredConsent(): CookiePreference | null {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${CONSENT_COOKIE_NAME}=`));

  if (!cookie) return null;

  try {
    const value = cookie.slice(cookie.indexOf("=") + 1);
    const consent = JSON.parse(decodeURIComponent(value)) as StoredConsent;
    if (
      consent.version === CONSENT_VERSION &&
      (consent.preference === "necessary" || consent.preference === "optional")
    ) {
      return consent.preference;
    }
  } catch {
    return null;
  }

  return null;
}

function storeConsent(preference: CookiePreference) {
  const value = encodeURIComponent(
    JSON.stringify({ version: CONSENT_VERSION, preference } satisfies StoredConsent),
  );
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function subscribeToConsent() {
  return () => undefined;
}

function getServerConsentSnapshot(): ConsentSnapshot {
  return "loading";
}

export function CookieConsent() {
  const pathname = usePathname();
  const storedPreference = useSyncExternalStore(
    subscribeToConsent,
    readStoredConsent,
    getServerConsentSnapshot,
  );
  const [selectedPreference, setSelectedPreference] = useState<CookiePreference | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isReady = storedPreference !== "loading";
  const preference = selectedPreference ?? (isReady ? storedPreference : null);
  const isOpen = isReady && (isReviewOpen || preference === null);

  function choose(nextPreference: CookiePreference) {
    storeConsent(nextPreference);
    setSelectedPreference(nextPreference);
    setIsReviewOpen(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function closeReview() {
    setIsReviewOpen(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  useEffect(() => {
    function openReview() {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIsReviewOpen(true);
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
    window.addEventListener(REVIEW_CONSENT_EVENT, openReview);
    return () => window.removeEventListener(REVIEW_CONSENT_EVENT, openReview);
  }, []);

  // The public TV player has no optional tracking or administrative session.
  if (!isReady || pathname === "/Smarttv" || pathname === "/smarttv") return null;

  return (
    <>
      {isOpen && (
        <section
          role="dialog"
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-description"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-h-[calc(100dvh-1.5rem)] max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:inset-x-6 sm:bottom-6 sm:p-6"
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-[#eef4f9] text-[#0e4c7e] sm:flex">
              <Cookie className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="cookie-consent-title" className="text-base font-bold sm:text-lg">
                    Privacidade e cookies
                  </h2>
                  <p id="cookie-consent-description" className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    Cookies necessários mantêm segurança, sessão e sua escolha de privacidade. Cookies opcionais seriam usados para medição de uso, mas nenhuma integração opcional está ativa hoje.
                  </p>
                </div>
                {preference !== null && (
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={closeReview}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e4c7e]"
                    aria-label="Fechar revisão de preferências"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <p className="font-bold text-emerald-900">Necessários</p>
                  <p className="mt-0.5 text-emerald-800">Sempre ativos para funções essenciais.</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="font-bold text-slate-900">Opcionais</p>
                  <p className="mt-0.5 text-slate-600">Sem scripts ou integrações ativas nesta etapa.</p>
                </div>
              </div>

              {preference !== null && (
                <p className="mt-3 text-xs text-slate-500" aria-live="polite">
                  Escolha atual: {preference === "optional" ? "opcionais aceitos" : "somente necessários"}.
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href="/portal/privacidade"
                  className="w-fit rounded text-sm font-bold text-[#0e4c7e] underline underline-offset-4 hover:text-[#0a3a5f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e4c7e]"
                >
                  Consultar política de privacidade
                </Link>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => choose("necessary")}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e4c7e]"
                  >
                    Manter somente necessários
                  </button>
                  <button
                    type="button"
                    onClick={() => choose("optional")}
                    className="rounded-lg bg-[#0e4c7e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a3a5f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e4c7e]"
                  >
                    Aceitar opcionais
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(REVIEW_CONSENT_EVENT))}
      className="mt-3 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#0e4c7e] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e4c7e]"
    >
      Revisar preferências de cookies
    </button>
  );
}
