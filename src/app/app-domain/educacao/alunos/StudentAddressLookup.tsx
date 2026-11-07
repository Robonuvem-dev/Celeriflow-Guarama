"use client";

import { useState, useTransition } from "react";
import { MapPin, Search, Check, Copy, Loader2 } from "lucide-react";
import { searchEducationAddressAction, type AddressLookupResult } from "../s1-actions";

export function StudentAddressLookup() {
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [results, setResults] = useState<AddressLookupResult[]>([]);
  const [selected, setSelected] = useState<AddressLookupResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setSelected(null);
    startTransition(async () => {
      const res = await searchEducationAddressAction({ cep, street });
      if (res.error) {
        setMessage(res.error);
        setResults([]);
      } else if (res.results) {
        setResults(res.results);
        if (res.results.length === 1) {
          setSelected(res.results[0]);
        }
      }
    });
  };

  const handleCopy = (address: AddressLookupResult) => {
    const text = `${address.streetName}, Bairro ${address.neighborhood}, ${address.city}/${address.state} — CEP ${address.zipCode}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <details className="rounded-lg border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer px-3.5 py-2.5 text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          Pesquisar Endereço por CEP ou Logradouro (Preenchimento Automático)
        </span>
      </summary>
      <div className="border-t border-slate-100 p-3.5 dark:border-slate-800">
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700 dark:text-slate-300">CEP</span>
            <input
              type="text"
              placeholder="Ex: 85420-000"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              className="h-8 w-32 rounded-md border border-slate-200 bg-white px-2.5 text-xs focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="flex flex-1 min-w-[200px] flex-col gap-1">
            <span className="font-medium text-slate-700 dark:text-slate-300">Ou Logradouro (Rua, Avenida, etc.)</span>
            <input
              type="text"
              placeholder="Digite o nome da rua ou avenida..."
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <button
            type="submit"
            disabled={pending || (!cep.trim() && !street.trim())}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Buscar endereço
          </button>
        </form>

        {message && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="status">
            {message}
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Endereços encontrados ({results.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {results.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelected(item)}
                  className={`cursor-pointer rounded-md border p-2.5 text-xs transition-colors ${
                    selected === item
                      ? "border-blue-500 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-950/30"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{item.streetName}</p>
                      <p className="text-slate-600 dark:text-slate-400">
                        {item.neighborhood ? `Bairro ${item.neighborhood} · ` : ""}
                        {item.city}/{item.state}
                      </p>
                      <p className="text-[11px] text-slate-500">CEP: {item.zipCode || "Geral do município"}</p>
                    </div>
                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {item.source === "viacep" ? "ViaCEP" : "Cadastro local"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-emerald-900 dark:text-emerald-300">
                Endereço selecionado para cadastro:
              </span>
              <button
                type="button"
                onClick={() => handleCopy(selected)}
                className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
              >
                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copied ? "Copiado!" : "Copiar dados completos"}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <span className="block text-[10px] text-slate-500">Logradouro:</span>
                <span className="font-medium text-slate-900 dark:text-white">{selected.streetName}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500">Bairro:</span>
                <span className="font-medium text-slate-900 dark:text-white">{selected.neighborhood || "Centro"}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500">Cidade/UF:</span>
                <span className="font-medium text-slate-900 dark:text-white">{selected.city}/{selected.state}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500">CEP:</span>
                <span className="font-medium text-slate-900 dark:text-white">{selected.zipCode}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
