"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section role="alert" className="space-y-3 p-4"><h1>Registros indisponíveis</h1><p>Não foi possível carregar os registros de assinatura.</p><button type="button" className="rounded border px-3 py-2" onClick={reset}>Tentar novamente</button></section>; }
