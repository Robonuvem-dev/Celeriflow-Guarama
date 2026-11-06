"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBidding } from "./actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { BIDDING_MODALITIES, biddingStatusLabel } from "@/lib/compras/bidding-workflow";

type BiddingData = {
  id: string;
  processId: string;
  number: string;
  modality: string;
  status: string;
  publicationDate: Date | null;
  sessionDate: Date | null;
};

type ProcessOption = {
  id: string;
  number: string;
  object: string;
  estimatedValue: number | null;
  itemLabels?: string[];
};

type ExpenseRequestOption = {
  id: string;
  number: string;
  object: string;
  estimatedValue: number | null;
  status: string;
};

export function LicitacaoForm({
  data,
  processos = [],
  expenseRequests = [],
}: {
  data?: BiddingData;
  processos?: ProcessOption[];
  expenseRequests?: ExpenseRequestOption[];
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string>(data?.processId || (processos[0]?.id ?? ""));
  const [isNewProcess, setIsNewProcess] = useState<boolean>(!data && processos.length === 0);
  const [itemSearch, setItemSearch] = useState("");
  const [modality, setModality] = useState<string>(data?.modality || "Pregão Eletrônico");
  const [biddingCode, setBiddingCode] = useState<string>(data?.number ? data.number.split("/")[0] ?? "" : "");
  const [biddingYear, setBiddingYear] = useState<string>(data?.number && data.number.includes("/") ? data.number.split("/")[1] ?? "" : new Date().getFullYear().toString());
  const [processNumber, setProcessNumber] = useState<string>("");
  const [processYear, setProcessYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedExpenseRequests, setSelectedExpenseRequests] = useState<string[]>([]);

  const matchingProcesses = processos.filter(
    (process) =>
      process.id === selectedProcessId ||
      `${process.number} ${process.object} ${(process.itemLabels || []).join(" ")}`
        .toLocaleLowerCase("pt-BR")
        .includes(itemSearch.toLocaleLowerCase("pt-BR"))
  );

  const selectedProcess = processos.find((p) => p.id === selectedProcessId);
  const calculatedTotal = selectedProcess?.estimatedValue ?? 0;

  function handleAutoGenerateSequence() {
    const randomSeq = Math.floor(100 + Math.random() * 900);
    const currYear = new Date().getFullYear().toString();
    setBiddingCode(String(randomSeq));
    setBiddingYear(currYear);
    if (!processNumber) {
      setProcessNumber(`PRC-${randomSeq}`);
      setProcessYear(currYear);
    }
  }

  function toggleExpenseRequest(id: string) {
    setSelectedExpenseRequests((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    try {
      if (selectedExpenseRequests.length > 0) {
        formData.set("expenseRequestIds", JSON.stringify(selectedExpenseRequests));
      }
      const result = await saveBidding(formData);
      if (result.success) {
        router.push("/compras/licitacoes");
      } else {
        alert(result.error);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const isDirectContracting =
    modality === "Dispensa de Licitação" ||
    modality === "Inexigibilidade" ||
    modality.toLowerCase().includes("dispensa") ||
    modality.toLowerCase().includes("inexigibilidade");

  return (
    <PageFrame className="space-y-3">
      <PageHeader
        title={data ? "Editar Licitação / Certame" : "Novo Processo / Certame de Licitação"}
        action={
          <Link href="/compras/licitacoes" aria-label="Voltar">
            <Button variant="outline" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
        }
      />

      <Card className="max-w-4xl rounded-md">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Identificação e Parâmetros do Processo</span>
            {!data && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoGenerateSequence}
                className="text-xs h-7 gap-1"
                title="Geração automática sequencial de numeração"
              >
                <Sparkles className="size-3 text-amber-500" />
                Gerar Sequencial Automático
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <form action={handleSubmit} className="space-y-4">
            {data && <input type="hidden" name="id" value={data.id} />}

            {/* Modalidade e Tipo */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="modality" className="text-xs font-semibold">
                  Modalidade da Licitação *
                </Label>
                {data ? (
                  <>
                    <Input value={data.modality} disabled className="h-8 text-xs" />
                    <input type="hidden" name="modality" value={data.modality} />
                  </>
                ) : (
                  <Select
                    name="modality"
                    value={modality}
                    onValueChange={(val) => setModality(val || "Pregão Eletrônico")}
                    required
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione a modalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {BIDDING_MODALITIES.map((mod) => (
                        <SelectItem key={mod} value={mod} className="text-xs">
                          {mod}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biddingCode" className="text-xs font-semibold">
                  Código da Licitação
                </Label>
                <Input
                  id="biddingCode"
                  name="biddingCode"
                  value={biddingCode}
                  onChange={(e) => setBiddingCode(e.target.value)}
                  placeholder="Ex: 001, 102"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="biddingYear" className="text-xs font-semibold">
                  Ano da Licitação
                </Label>
                <Input
                  id="biddingYear"
                  name="biddingYear"
                  value={biddingYear}
                  onChange={(e) => setBiddingYear(e.target.value)}
                  placeholder="Ex: 2026"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Número do edital final consolidado */}
            <div className="space-y-1.5">
              <Label htmlFor="number" className="text-xs font-semibold">
                Número do Edital / Certame / Dispensa
              </Label>
              <Input
                id="number"
                name="number"
                defaultValue={data?.number || (biddingCode ? `${biddingCode}/${biddingYear}` : "")}
                placeholder="Auto-gerado se mantido vazio (ex: PE-001/2026)"
                className="h-8 text-xs"
              />
            </div>

            {/* Seção Dados do Processo Administrativo */}
            <div className="rounded-md border p-3 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Processo Administrativo / Instrução
                </h4>
                {!data && processos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsNewProcess(!isNewProcess)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {isNewProcess ? "Vincular a processo já cadastrado" : "Criar novo processo administrativo para este certame"}
                  </button>
                )}
              </div>

              {!isNewProcess && processos.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="processId" className="text-xs font-semibold">
                    Processo Vinculado
                  </Label>
                  <Input
                    aria-label="Buscar materiais ou serviços"
                    placeholder="Buscar processo por código, material ou objeto..."
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                    className="h-8 text-xs"
                  />
                  <Select
                    name="processId"
                    value={selectedProcessId}
                    onValueChange={(val) => setSelectedProcessId(val || "")}
                    required
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione o processo" />
                    </SelectTrigger>
                    <SelectContent>
                      {matchingProcesses.map((proc) => (
                        <SelectItem key={proc.id} value={proc.id} className="text-xs">
                          {proc.number} - {proc.object.substring(0, 45)}...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="processNumber" className="text-xs font-semibold">
                      Número do Processo *
                    </Label>
                    <Input
                      id="processNumber"
                      name="processNumber"
                      value={processNumber}
                      onChange={(e) => setProcessNumber(e.target.value)}
                      placeholder="Ex: 0145/2026"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="processYear" className="text-xs font-semibold">
                      Ano do Processo
                    </Label>
                    <Input
                      id="processYear"
                      name="processYear"
                      value={processYear}
                      onChange={(e) => setProcessYear(e.target.value)}
                      placeholder="Ex: 2026"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="processType" className="text-xs font-semibold">
                      Tipo de Processo
                    </Label>
                    <Input
                      id="processType"
                      name="processType"
                      defaultValue={isDirectContracting ? "Contratação Direta" : "Licitação Pública"}
                      placeholder="Ex: Administrativo, Compra"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Assunto, Sub-assunto, Rota do Processo */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-xs font-semibold">
                    Assunto
                  </Label>
                  <Input
                    id="subject"
                    name="subject"
                    placeholder="Ex: Aquisição de Bens de Consumo"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subSubject" className="text-xs font-semibold">
                    Sub Assunto
                  </Label>
                  <Input
                    id="subSubject"
                    name="subSubject"
                    placeholder="Ex: Material Médico-Hospitalar"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="processRoute" className="text-xs font-semibold">
                    Rota do Processo
                  </Label>
                  <Input
                    id="processRoute"
                    name="processRoute"
                    placeholder="Ex: Protocolo Geral -> Setor de Compras"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Requerente, Forma de Solicitação, Responsável */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="requester" className="text-xs font-semibold">
                    Requerente
                  </Label>
                  <Input
                    id="requester"
                    name="requester"
                    placeholder="Ex: Secretaria de Saúde"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="requestForm" className="text-xs font-semibold">
                    Forma de Solicitação
                  </Label>
                  <Input
                    id="requestForm"
                    name="requestForm"
                    placeholder="Ex: Memorando Digital, Ofício"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="responsible" className="text-xs font-semibold">
                    Responsável
                  </Label>
                  <Input
                    id="responsible"
                    name="responsible"
                    placeholder="Ex: Agente de Contratação / Pregoeiro"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Justificativa */}
              <div className="space-y-1.5">
                <Label htmlFor="justification" className="text-xs font-semibold">
                  Justificativa do Processo / Contratação
                </Label>
                <Textarea
                  id="justification"
                  name="justification"
                  placeholder="Justificativa da necessidade da contratação direta ou licitação..."
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Objeto da Licitação e Critério de Julgamento */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="biddingObject" className="text-xs font-semibold">
                  Objeto da Licitação *
                </Label>
                <Textarea
                  id="biddingObject"
                  name="biddingObject"
                  defaultValue={selectedProcess?.object || ""}
                  placeholder="Descrição sucinta e clara do objeto da contratação..."
                  rows={2}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="judgmentCriterion" className="text-xs font-semibold">
                  Critério de Julgamento
                </Label>
                <Select name="judgmentCriterion" defaultValue="Menor Preço">
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione o critério" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Menor Preço" className="text-xs">Menor Preço</SelectItem>
                    <SelectItem value="Maior Desconto" className="text-xs">Maior Desconto</SelectItem>
                    <SelectItem value="Melhor Técnica ou Conteúdo Artístico" className="text-xs">Melhor Técnica / Conteúdo</SelectItem>
                    <SelectItem value="Técnica e Preço" className="text-xs">Técnica e Preço</SelectItem>
                    <SelectItem value="Maior Lance" className="text-xs">Maior Lance (Leilão)</SelectItem>
                    <SelectItem value="Maior Retorno Econômico" className="text-xs">Maior Retorno Econômico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Portaria / Designação */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ordinanceCode" className="text-xs font-semibold">
                  Código da Portaria
                </Label>
                <Input
                  id="ordinanceCode"
                  name="ordinanceCode"
                  placeholder="Ex: Portaria nº 042"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ordinanceYear" className="text-xs font-semibold">
                  Ano da Portaria
                </Label>
                <Input
                  id="ordinanceYear"
                  name="ordinanceYear"
                  defaultValue={new Date().getFullYear().toString()}
                  placeholder="Ex: 2026"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Datas e Horários da Sessão e Entrega de Envelopes */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="publicationDate" className="text-xs font-semibold">
                  Data de Publicação
                </Label>
                <Input
                  id="publicationDate"
                  name="publicationDate"
                  type="date"
                  defaultValue={
                    data?.publicationDate ? format(new Date(data.publicationDate), "yyyy-MM-dd") : ""
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="envelopeDeliveryDateTime" className="text-xs font-semibold">
                  Data/Hora da Entrega dos Envelopes
                </Label>
                <Input
                  id="envelopeDeliveryDateTime"
                  name="envelopeDeliveryDateTime"
                  type="datetime-local"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="judgmentDateTime" className="text-xs font-semibold">
                  Data/Hora do Julgamento / Sessão
                </Label>
                <Input
                  id="judgmentDateTime"
                  name="judgmentDateTime"
                  type="datetime-local"
                  defaultValue={
                    data?.sessionDate ? format(new Date(data.sessionDate), "yyyy-MM-dd'T'HH:mm") : ""
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Seleção de Solicitação(ões) de Despesa(s) / Pedidos de Compra */}
            {expenseRequests.length > 0 && (
              <div className="space-y-2 rounded-md border p-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Solicitações de Despesa / Pedidos de Compra Vinculados
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedExpenseRequests.length} selecionada(s)
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-200 border rounded bg-white text-xs">
                  {expenseRequests.map((req) => {
                    const isChecked = selectedExpenseRequests.includes(req.id);
                    return (
                      <label
                        key={req.id}
                        className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleExpenseRequest(req.id)}
                          className="rounded border-slate-300 text-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800">
                            {req.number} · {req.status}
                          </p>
                          <p className="text-[11px] text-slate-600 truncate">{req.object}</p>
                        </div>
                        {req.estimatedValue ? (
                          <span className="font-mono text-[11px] font-medium text-slate-700 whitespace-nowrap">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(req.estimatedValue)}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
              <Link href="/compras/licitacoes">
                <Button type="button" variant="outline" size="sm">
                  Cancelar
                </Button>
              </Link>
              <Button type="submit" disabled={isSaving} size="sm">
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Salvando..." : "Salvar Certame / Processo"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageFrame>
  );
}
