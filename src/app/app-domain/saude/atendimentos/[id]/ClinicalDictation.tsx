"use client";

import { useEffect, useRef, useState } from "react";

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void; onresult: ((event: { results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }> }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
type RecognitionConstructor = new () => Recognition;

export function ClinicalDictation() {
  const target = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const [message, setMessage] = useState("Selecione um campo de texto e use Ditar. Revise a transcrição antes de salvar.");
  const [listening, setListening] = useState(false);
  useEffect(() => {
    const focused = (event: FocusEvent) => {
      const element = event.target;
      if ((element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && ["text", "search", "tel", "email"].includes(element.type)) && element.closest('[data-health-clinical-record="true"]') && !element.disabled && !element.readOnly) target.current = element;
    };
    document.addEventListener("focusin", focused);
    return () => { document.removeEventListener("focusin", focused); recognition.current?.abort(); };
  }, []);
  function start() {
    const element = target.current;
    if (!element || !element.isConnected || element.disabled || element.readOnly) { setMessage("Selecione primeiro um campo de texto editável do atendimento."); return; }
    const api = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = api.SpeechRecognition || api.webkitSpeechRecognition;
    if (!Constructor) { setMessage("Este navegador não disponibiliza reconhecimento de voz. Use um navegador com esse recurso habilitado."); return; }
    const service = new Constructor(); recognition.current = service;
    service.lang = "pt-BR"; service.continuous = false; service.interimResults = false;
    service.onresult = event => {
      const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(" ");
      if (!transcript || !element.isConnected) return;
      const start = element.selectionStart ?? element.value.length, end = element.selectionEnd ?? start;
      const text = `${element.value.slice(0, start)}${start && !/\s$/.test(element.value.slice(0, start)) ? " " : ""}${transcript}${element.value.slice(end)}`;
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, text);
      element.dispatchEvent(new Event("input", { bubbles: true })); element.focus();
      setMessage("Transcrição inserida. Revise o texto antes de salvar o registro.");
    };
    service.onerror = event => { setMessage(event.error === "not-allowed" ? "Autorize o microfone para utilizar a digitação por voz." : "Não foi possível concluir a transcrição. Tente novamente."); setListening(false); };
    service.onend = () => setListening(false);
    try { service.start(); setListening(true); setMessage("Ouvindo o campo selecionado..."); } catch { setMessage("Não foi possível iniciar o microfone."); }
  }
  return <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-2 text-xs"><button type="button" onClick={listening ? () => recognition.current?.stop() : start} className="rounded border px-3 py-2 font-semibold">{listening ? "Parar ditado" : "Ditar no campo selecionado"}</button><span role="status">{message}</span></div>;
}
