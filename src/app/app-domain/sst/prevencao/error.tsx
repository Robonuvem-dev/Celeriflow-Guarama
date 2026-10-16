"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="space-y-3 p-4"><h2 role="alert">Não foi possível abrir a rotina de prevenção.</h2><button className="rounded border px-3 py-2" onClick={reset}>Tentar novamente</button></section>; }
