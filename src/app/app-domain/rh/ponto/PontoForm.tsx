"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { savePonto } from "./actions";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import type { AttendanceRecord, Employee } from "@/lib/contracts/personnel-pages";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { ErpPageTitle as PageHeader } from "@/components/app-ui/erp/ErpPageTitle";

export function PontoForm({ data, employees = [] }: { data?: AttendanceRecord, employees?: Employee[] }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [entryTime, setEntryTime] = useState(data?.entryTime ? new Date(data.entryTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "");
  const [exitTime, setExitTime] = useState(data?.exitTime ? new Date(data.exitTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "");
  const [employeeId, setEmployeeId] = useState<string>(data?.employeeId || "");
  const [status, setStatus] = useState<string>(data?.status || "Presente");
  const [punchType, setPunchType] = useState<string>("MANUAL");
  const [occurrenceType, setOccurrenceType] = useState<string>("");
  const [clockLocation, setClockLocation] = useState<string>("Sede Administrativa / Apontamento Manual");
  const [justification, setJustification] = useState<string>("");
  const [documentRef, setDocumentRef] = useState<string>("");

  async function handleSubmit(formData: FormData) {
    if ((punchType === "MANUAL" || occurrenceType || status === "Falta" || status === "Atraso" || data) && justification.trim().length < 5) {
      alert("A digitação do histórico da justificativa é obrigatória para lançamento manual do ponto ou cadastro de ocorrência (Requisito 20.14).");
      return;
    }

    setIsSaving(true);
    formData.set("entryTime", entryTime);
    formData.set("exitTime", exitTime);
    formData.set("punchType", punchType);
    formData.set("occurrenceType", occurrenceType);
    formData.set("clockLocation", clockLocation);
    formData.set("justification", justification);
    formData.set("documentRef", documentRef);

    const result = await savePonto(formData);
    setIsSaving(false);
    
    if (result.success) {
      router.push("/rh/ponto");
    } else {
      alert(result.error);
    }
  }

  // Helper to format date for input[type="date"] (YYYY-MM-DD)
  const formatDateForInput = (dateString?: string | Date) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toISOString().split("T")[0];
  };

  const calculatedHours = useMemo(() => {
    if (entryTime && exitTime) {
      const [eh, em] = entryTime.split(":").map(Number);
      const [xh, xm] = exitTime.split(":").map(Number);
      let diff = (xh * 60 + xm) - (eh * 60 + em);
      if (diff < 0) diff += 24 * 60; // crossed midnight
      return (diff / 60).toFixed(2);
    }
    return "0.00";
  }, [entryTime, exitTime]);

  return (
    <PageFrame className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
      <PageHeader
        title={data ? "Editar Ponto" : "Registrar Ponto"}
        action={<Link href="/rh/ponto">
          <Button variant="outline" size="icon-sm" aria-label="Voltar para registro de ponto">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>}
      />

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <Card size="sm" className="rounded-none border-0 bg-transparent shadow-none">
        <CardHeader className="border-b pb-2">
          <CardTitle>Registro Diário de Ponto</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <form action={handleSubmit} className="space-y-4">
            {data && <input type="hidden" name="id" value={data.id} />}
            
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employeeId">Servidor</Label>
                <Select name="employeeId" value={employeeId} onValueChange={(v) => setEmployeeId(v || "")} required>
                  <SelectTrigger>
                    <span className="flex-1 text-left line-clamp-1">
                      {employeeId ? (employees.find(e => e.id === employeeId)?.name || "Selecione o servidor") : "Selecione o servidor"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Data do Registro</Label>
                <Input type="date" id="date" name="date" defaultValue={formatDateForInput(data?.date || new Date())} required />
              </div>
            </div>

            <div className="grid gap-3 rounded-md border bg-slate-50/50 p-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="entryTime">Hora de Entrada</Label>
                <Input type="time" id="entryTime" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exitTime">Hora de Saída</Label>
                <Input type="time" id="exitTime" value={exitTime} onChange={(e) => setExitTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Horas Trabalhadas (Calculadas)</Label>
                <div className="text-2xl font-bold text-slate-700 h-10 flex items-center">
                  {calculatedHours}h
                </div>
              </div>
            </div>

            <div className="space-y-2 max-w-sm">
              <Label htmlFor="extraHours">Horas extras reconhecidas pelo RH</Label>
              <Input id="extraHours" name="extraHours" type="number" min="0" max="24" step="0.0001" defaultValue={data?.extraHours || 0} />
              <p className="text-xs text-muted-foreground">A integração usa a regra aprovada e o contrato escolhido. As horas extras não são inferidas dos horários de entrada/saída.</p>
            </div>
            <div className="space-y-2 max-w-sm">
              <Label htmlFor="bankHours">Banco de horas reconhecido (+ crédito / − débito)</Label>
              <Input id="bankHours" name="bankHours" type="number" min="-24" max="24" step="0.0001" defaultValue={data?.bankHours || 0} />
              <p className="text-xs text-muted-foreground">O registro exige política e lançamento no extrato de direitos. Não é convertido automaticamente em pagamento.</p>
            </div>
            <div className="space-y-2 max-w-sm">
              <Label htmlFor="status">Status</Label>
              <Select name="status" value={status} onValueChange={(v) => setStatus(v || "Presente")}>
                <SelectTrigger>
                  <span className="flex-1 text-left line-clamp-1">{status}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Presente">Presente</SelectItem>
                  <SelectItem value="Falta">Falta</SelectItem>
                  <SelectItem value="Atraso">Atraso</SelectItem>
                  <SelectItem value="Férias">Férias</SelectItem>
                  <SelectItem value="Licença">Licença</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Requisito 20.14 & 20.20 & 20.23: Tipo de Ponto, Ocorrência, Local/Relógio e Justificativa Obrigatória */}
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-3">
              <div className="font-semibold text-xs text-amber-900">
                Informações Complementares e Ocorrência de Ponto (Requisitos 20.14, 20.20, 20.23)
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="punchType">Tipo de Ponto do Servidor (20.23)</Label>
                  <select
                    id="punchType"
                    value={punchType}
                    onChange={(e) => setPunchType(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white text-xs"
                  >
                    <option value="MANUAL">Ponto Manual (Folha de Frequência / Livro Ponto)</option>
                    <option value="ELETRONICO">Ponto Eletrônico (REP Biométrico / Digital)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="occurrenceType">Tipo de Ocorrência de Ponto</Label>
                  <select
                    id="occurrenceType"
                    value={occurrenceType}
                    onChange={(e) => setOccurrenceType(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white text-xs"
                  >
                    <option value="">Sem ocorrência excepcional (Marcação normal)</option>
                    <option value="Falta Justificada">Falta Justificada</option>
                    <option value="Atraso Justificado">Atraso Justificado</option>
                    <option value="Saída Antecipada Justificada">Saída Antecipada Justificada</option>
                    <option value="Esquecimento de Crachá/Biometria">Esquecimento de Crachá / Biometria</option>
                    <option value="Declaração Médica / Consulta">Declaração Médica / Consulta</option>
                    <option value="Serviço Externo / Diligência">Serviço Externo / Diligência</option>
                    <option value="Convocação Judicial / Eleitoral">Convocação Judicial / Eleitoral</option>
                    <option value="Ajuste de Batida Manual">Ajuste de Batida Manual</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="clockLocation">Relógio / Local de Batida (20.20)</Label>
                  <Input
                    id="clockLocation"
                    value={clockLocation}
                    onChange={(e) => setClockLocation(e.target.value)}
                    placeholder="Ex: REP 01 Sede Administrativa / Apontamento Manual"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="documentRef">Comprovante / Atestado / Doc. GED</Label>
                  <Input
                    id="documentRef"
                    value={documentRef}
                    onChange={(e) => setDocumentRef(e.target.value)}
                    placeholder="Ex: Atestado Médico nº 1092 / Memorando RH"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="justification" className="text-amber-950 font-semibold">
                  Histórico da Justificativa * (Digitação Obrigatória - Requisito 20.14)
                </Label>
                <textarea
                  id="justification"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Digite detalhadamente a justificativa e histórico do apontamento manual ou da ocorrência..."
                  rows={3}
                  className="w-full rounded border border-amber-300 bg-white p-2 text-xs focus:ring-1 focus:ring-amber-500"
                  required
                />
                <p className="text-[10px] text-amber-700">
                  * A digitação do histórico da justificativa é exigência legal e obrigatória para lançamento manual do ponto e ocorrências.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Link href="/rh/ponto">
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
