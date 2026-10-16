"use client";

export default function EquipmentError({ reset }: { reset: () => void }) {
  return <section className="space-y-3 p-4" role="alert"><h1 className="font-semibold">Não foi possível carregar os equipamentos</h1><p>Confira o acesso à UG e a disponibilidade do serviço.</p><button className="rounded border p-2" onClick={reset}>Tentar novamente</button></section>;
}
