"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="space-y-3 p-4" role="alert"><h1>Assine Agora indisponível</h1><p>Não foi possível carregar os cadastros. Tente novamente.</p><button type="button" className="rounded border px-3 py-2" onClick={reset}>Tentar novamente</button></section>; }
