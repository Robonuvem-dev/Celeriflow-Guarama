"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { addBenefitToEmployee, removeBenefitFromEmployee } from "./benefitActions";
import type { BenefitConfig, Employee, PayrollBenefit } from "@/lib/contracts/personnel-pages";
import { RhTablePanel } from "../_components/RhTablePanel";
import { rhColumn } from "../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

type EmployeeWithBenefits = Pick<Employee, "id"> & {
  benefits?: (PayrollBenefit & { benefitConfig: BenefitConfig })[];
};

export function EmployeeBenefitsCard({ employee, benefitConfigs }: { employee: EmployeeWithBenefits, benefitConfigs: BenefitConfig[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const handleAdd = async (formData: FormData) => {
    setIsSaving(true);
    formData.set("employeeId", employee.id);
    const result = await addBenefitToEmployee(formData);
    setIsSaving(false);
    if (result.success) {
      setIsOpen(false);
    } else {
      alert(result.error);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (confirm(`Remover o benefício ${name}?`)) {
      const result = await removeBenefitFromEmployee(id, employee.id);
      if (!result.success) alert(result.error);
    }
  };

  return (
    <Card size="sm" className="mt-1 rounded-md shadow-none md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Benefícios Concedidos</CardTitle>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 px-3 text-xs">
            <Plus className="mr-2 h-4 w-4" /> Conceder Benefício
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conceder Benefício ao Servidor</DialogTitle>
            </DialogHeader>
            <form action={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Benefício</Label>
                <Select name="benefitConfigId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o benefício..." />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    {benefitConfigs.map(bc => (
                      <SelectItem key={bc.id} value={bc.id}>{bc.name} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bc.baseValue)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor Customizado (R$)</Label>
                <Input name="customValue" type="number" step="0.01" placeholder="Opcional. Se vazio, usará o valor base." />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? "Salvando..." : "Conceder"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </CardHeader>
      <CardContent>
        <RhTablePanel title="Benefícios concedidos ao servidor" triggerLabel="Consultar benefícios em tela cheia" description="Fechar esta consulta preserva os dados ainda não salvos na ficha funcional." preferenceId="rh-servidor-beneficios"
          columns={[rhColumn("name", "Benefício", 300, 150), rhColumn("type", "Tipo", 180, 100), rhColumn("value", "Valor concedido", 180, 120, "text", "right"), rhColumn("actions", "Ações", 70, 60, "actions")]}
          rows={(employee.benefits || []).map(ben => ({ id: ben.id, label: ben.benefitConfig.name, values: { name: ben.benefitConfig.name, type: ben.benefitConfig.type, value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(ben.customValue !== null ? ben.customValue : ben.benefitConfig.baseValue) }, actions: <button type="button" className={styles.iconButton} aria-label={`Remover benefício ${ben.benefitConfig.name}`} onClick={() => void handleRemove(ben.id, ben.benefitConfig.name)}><Trash2 /></button> }))}
          emptyMessage="Nenhum benefício concedido para este servidor." />
      </CardContent>
    </Card>
  );
}
