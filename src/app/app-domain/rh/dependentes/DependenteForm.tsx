"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveDependente } from "./actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { ReferenceLookup } from "../operacoes/ReferenceLookup";
import type { Dependent, Employee } from "@prisma/client";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { ErpPageTitle as PageHeader } from "@/components/app-ui/erp/ErpPageTitle";

export function DependenteForm({ data, employees = [], defaultEmployeeId }: { data?: Dependent, employees?: Employee[], defaultEmployeeId?: string }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    const result = await saveDependente(formData);
    setIsSaving(false);
    
    if (result.success) {
      router.push("/rh/dependentes");
    } else {
      alert(result.error);
    }
  }

  const effectiveEmployeeId = data?.employeeId || defaultEmployeeId;
  const effectiveEmployee = effectiveEmployeeId ? employees.find(e => e.id === effectiveEmployeeId) : null;

  return (
    <PageFrame className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
      <PageHeader
        title={data ? "Editar Dependente" : "Cadastrar Dependente"}
        action={<Link href="/rh/dependentes">
          <Button variant="outline" size="icon-sm" aria-label="Voltar para dependentes">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>}
      />

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <Card size="sm" className="rounded-none border-0 bg-transparent shadow-none">
        <CardHeader className="border-b pb-2">
          <CardTitle>Dados do Dependente</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <form action={handleSubmit} className="space-y-4">
            {data && <input type="hidden" name="id" value={data.id} />}
            
            <div className="space-y-2">
              <Label htmlFor="employeeId">Servidor Titular</Label>
              {effectiveEmployeeId ? (
                <>
                  <input type="hidden" name="employeeId" value={effectiveEmployeeId} />
                  <Input 
                    value={effectiveEmployee?.name || "Servidor não encontrado"} 
                    readOnly 
                    className="bg-slate-100 cursor-not-allowed" 
                  />
                </>
              ) : (
                <Select name="employeeId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Pessoa física do dependente no Cadastro Único</Label>
              <ReferenceLookup name="personId" kind="person" initialValue={data?.personId || ""} required />
              <p className="text-xs text-muted-foreground">Nome, CPF e nascimento são obtidos do cadastro central. Documentos e validade devem ser mantidos na pessoa física.</p>
              {data && <p className="text-xs">Projeção atual: {data.name} · {data.cpf || "sem CPF"} · {data.birthDate?.toISOString().slice(0, 10) || "sem nascimento"}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="relationship">Parentesco</Label>
                <Select name="relationship" defaultValue={data?.relationship || "Filho(a)"} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o parentesco" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Filho(a)">Filho(a)</SelectItem>
                    <SelectItem value="Cônjuge">Cônjuge</SelectItem>
                    <SelectItem value="Pai/Mãe">Pai/Mãe</SelectItem>
                    <SelectItem value="Enteado(a)">Enteado(a)</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" name="irrfDependent" defaultChecked={data?.irrfDependent || false} />Candidato à dedução de IRRF</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="familyWage" defaultChecked={data?.familyWage || false} />Candidato ao salário-família</label>
              <p className="w-full text-muted-foreground">As marcações não garantem pagamento/dedução: a elegibilidade é apurada pela política vigente na competência.</p>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Link href="/rh/dependentes">
                <Button type="button" variant="outline">Cancelar</Button>
              </Link>
              <Button type="submit" disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" /> {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
    </PageFrame>
  );
}
