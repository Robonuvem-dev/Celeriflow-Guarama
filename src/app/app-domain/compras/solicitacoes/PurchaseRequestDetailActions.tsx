"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Ban, RotateCcw, Copy, UserCheck } from "lucide-react";
import { cancelPurchaseRequest, restorePurchaseRequest, clonePurchaseRequest, changePurchaseRequestRequester } from "./actions";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function PurchaseRequestDetailActions({
  id,
  status,
  canManage,
  secretariatId,
  departmentId,
  requesterId,
}: {
  id: string;
  status: string;
  canManage: boolean;
  secretariatId?: string;
  departmentId?: string;
  requesterId?: string;
}) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [isRequesterModalOpen, setIsRequesterModalOpen] = useState(false);
  const [newSec, setNewSec] = useState(secretariatId || "");
  const [newDept, setNewDept] = useState(departmentId || "");
  const [newReq, setNewReq] = useState(requesterId || "");

  async function handleCancel() {
    const reason = prompt("Informe a justificativa do cancelamento da SD (Item 12.33):");
    if (reason !== null) {
      setIsBusy(true);
      const res = await cancelPurchaseRequest(id, reason);
      setIsBusy(false);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Não foi possível cancelar a solicitação.");
      }
    }
  }

  async function handleRestore() {
    if (confirm("Deseja estornar o cancelamento desta SD (Item 12.34)?")) {
      setIsBusy(true);
      const res = await restorePurchaseRequest(id);
      setIsBusy(false);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Não foi possível estornar o cancelamento.");
      }
    }
  }

  async function handleClone() {
    if (confirm("Deseja clonar esta solicitação (Item 12.122)?")) {
      setIsBusy(true);
      const res = await clonePurchaseRequest(id);
      setIsBusy(false);
      if (res.success && res.id) {
        router.push(`/compras/solicitacoes/${res.id}`);
      } else {
        alert(res.error || "Não foi possível clonar a solicitação.");
      }
    }
  }

  async function handleChangeRequester(e: React.FormEvent) {
    e.preventDefault();
    if (!newSec.trim() || !newDept.trim() || !newReq.trim()) {
      alert("Preencha todos os campos do novo requisitante e unidade.");
      return;
    }
    setIsBusy(true);
    const res = await changePurchaseRequestRequester({
      id,
      secretariatId: newSec,
      departmentId: newDept,
      requesterId: newReq,
    });
    setIsBusy(false);
    if (res.success) {
      setIsRequesterModalOpen(false);
      router.refresh();
    } else {
      alert(res.error || "Erro ao alterar requisitante.");
    }
  }

  const isCancelled = status === "Cancelada";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClone}
        disabled={isBusy}
        title="Clonar requisição para nova administração ou registro (Item 12.122)"
      >
        <Copy className="size-3.5 text-sky-600" />
        <span className="hidden sm:inline">Clonar SD</span>
      </Button>

      {canManage && !isCancelled && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsRequesterModalOpen(true)}
          disabled={isBusy}
          title="Alterar requisitante da SD (Item 12.42)"
        >
          <UserCheck className="size-3.5 text-indigo-600" />
          <span className="hidden sm:inline">Alterar Requisitante</span>
        </Button>
      )}

      {canManage && !isCancelled && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isBusy}
          title="Cancelar SD (Item 12.33 / 12.119)"
        >
          <Ban className="size-3.5 text-amber-600" />
          <span className="hidden sm:inline">Cancelar SD</span>
        </Button>
      )}

      {canManage && isCancelled && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRestore}
          disabled={isBusy}
          title="Estornar Cancelamento da SD (Item 12.34 / 12.120)"
        >
          <RotateCcw className="size-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Estornar Cancelamento</span>
        </Button>
      )}

      {/* Modal 12.42: Alteração do requisitante da SD */}
      <Dialog open={isRequesterModalOpen} onOpenChange={setIsRequesterModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Requisitante da SD (Requisito 12.42)</DialogTitle>
            <DialogDescription>
              Atualize a unidade orçamentária, departamento/subunidade e servidor requisitante final vinculado a esta solicitação.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangeRequester} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="req-sec">ID da Nova Secretaria / Órgão</Label>
              <Input
                id="req-sec"
                value={newSec}
                onChange={(e) => setNewSec(e.target.value)}
                placeholder="Identificador da nova Secretaria"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="req-dept">ID do Novo Departamento / Subunidade</Label>
              <Input
                id="req-dept"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                placeholder="Identificador do novo Departamento"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="req-emp">ID do Novo Servidor Requisitante Final</Label>
              <Input
                id="req-emp"
                value={newReq}
                onChange={(e) => setNewReq(e.target.value)}
                placeholder="Identificador do Servidor Requisitante"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRequesterModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? "Salvando..." : "Confirmar Alteração"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
