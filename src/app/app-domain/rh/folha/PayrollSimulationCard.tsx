"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";
import { useState } from "react";
import { processPayroll } from "./actions";
import Link from "next/link";

export function PayrollSimulationCard({ payrollId, status }: { payrollId: string; status: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function postOrigins() {
    setPending(true);
    try {
      const result = await processPayroll(payrollId);
      setMessage(result.success ? "Origens integradas." : result.error || "Falha ao integrar.");
    } finally { setPending(false); }
  }
  return <Card size="sm">
    <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="size-4" />Cálculos e origens contratuais</CardTitle>
      <CardDescription>Simulações isoladas e cálculos por contrato. Planos de saúde mantêm a integração canônica recebida de SST.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-wrap gap-2">
      <Link href={`/rh/operacoes?tab=calculos&payrollId=${encodeURIComponent(payrollId)}`} className="rounded border px-3 py-2 text-sm">Cálculos e conferência</Link>
      <Button onClick={postOrigins} disabled={pending || status === "Fechada" || status === "Paga"}>{pending ? "Integrando…" : "Postar origens de planos"}</Button>
      {message && <p role="status" className="w-full text-sm">{message}</p>}
    </CardContent>
  </Card>;
}
