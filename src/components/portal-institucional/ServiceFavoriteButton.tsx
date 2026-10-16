"use client";
import { useState } from "react";

export function ServiceFavoriteButton({ publicServiceId, initial = false }: { publicServiceId: string; initial?: boolean }) {
  const [favorite, setFavorite] = useState(initial), [pending, setPending] = useState(false), [error, setError] = useState("");
  return <div><button type="button" disabled={pending} aria-pressed={favorite} className="text-sm font-semibold text-amber-800 disabled:opacity-50" onClick={async () => {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/portal/servicos/favoritos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicServiceId, favorite: !favorite }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); setFavorite(!favorite);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Não foi possível salvar."); } finally { setPending(false); }
  }}>{favorite ? "★ Favorito" : "☆ Adicionar aos favoritos"}</button>{error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}</div>;
}
