"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { transitionBiddingStatus } from "./actions";
import { requiresBiddingStatusReason } from "@/lib/compras/bidding-status-reason";

type BiddingStatusControlsProps = {
  id: string;
  currentStatus: string;
  allowedStatuses: string[];
};

export function BiddingStatusControls({ id, currentStatus, allowedStatuses }: BiddingStatusControlsProps) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(allowedStatuses[0] ?? "");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const nextStatus = allowedStatuses.includes(selectedStatus) ? selectedStatus : allowedStatuses[0] ?? "";

  function handleTransition() {
    if (!nextStatus) return;
    setError("");
    startTransition(async () => {
      const result = await transitionBiddingStatus(id, nextStatus, reason);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setReason("");
      router.refresh();
    });
  }

  if (!allowedStatuses.length) {
    return <p className="text-sm text-muted-foreground">Não há transições disponíveis para a situação atual.</p>;
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="bidding-next-status">Alterar situação de {currentStatus}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={nextStatus} onValueChange={(value) => setSelectedStatus(value ?? "")}>
          <SelectTrigger id="bidding-next-status" className="w-full sm:max-w-xs">
            <SelectValue placeholder="Selecione a próxima situação" />
          </SelectTrigger>
          <SelectContent>
            {allowedStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" onClick={handleTransition} disabled={isPending || !nextStatus}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {isPending ? "Atualizando" : "Confirmar transição"}
        </Button>
      </div>
      <Label htmlFor="bidding-status-reason">Observação / justificativa{requiresBiddingStatusReason(nextStatus) ? " (obrigatória)" : ""}</Label>
      <textarea id="bidding-status-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={4000} required={requiresBiddingStatusReason(nextStatus)} className="min-h-20 w-full rounded border p-2" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
