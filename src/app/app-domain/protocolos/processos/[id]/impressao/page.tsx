import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { processPrintSettings, processReferenceCatalog } from "@/db/schema/process-reference-catalog";
import { readOperationalProcess } from "@/db/repositories/processes/details";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

// Helper to generate SVG Barcode for Code 128 representation (19.71)
function BarcodeSvg({ value }: { value: string }) {
  // Generate a deterministic pattern of bars based on characters in value
  const bars: { width: number; isSpace: boolean }[] = [];
  bars.push({ width: 3, isSpace: false }, { width: 1, isSpace: true }, { width: 2, isSpace: false }, { width: 2, isSpace: true }); // Start
  
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const w1 = (code % 3) + 1;
    const s1 = ((code >> 1) % 2) + 1;
    const w2 = ((code >> 2) % 3) + 1;
    const s2 = ((code >> 3) % 2) + 1;
    bars.push(
      { width: w1, isSpace: false },
      { width: s1, isSpace: true },
      { width: w2, isSpace: false },
      { width: s2, isSpace: true }
    );
  }
  bars.push({ width: 3, isSpace: false }, { width: 2, isSpace: true }, { width: 4, isSpace: false }); // Stop

  let x = 10;
  const rects: { x: number; width: number }[] = [];
  for (const bar of bars) {
    if (!bar.isSpace) {
      rects.push({ x, width: bar.width * 2 });
    }
    x += bar.width * 2;
  }

  return (
    <div className="flex flex-col items-center">
      <svg width={x + 20} height="50" viewBox={`0 0 ${x + 20} 50`} className="max-w-full">
        {rects.map((r, idx) => (
          <rect key={idx} x={r.x} y="2" width={r.width} height="46" fill="#000" />
        ))}
      </svg>
      <span className="font-mono text-xs tracking-widest text-slate-800 font-bold mt-1">*{value}*</span>
    </div>
  );
}

export default async function ProcessPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ view?: string; labelStyle?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) || {};
  const view = query.view || "capa-recibo";
  const selectedLabelStyle = query.labelStyle || "padrao";

  const context = await getProtocolContext();
  const database = context.database ?? db;
  const process = await readOperationalProcess(database, id, protocolScopeCondition(context));

  if (!process) notFound();

  const [settings] = await database
    .select()
    .from(processPrintSettings)
    .where(eq(processPrintSettings.processTypeId, process.processTypeId))
    .limit(1);

  const labelStyles = await database
    .select()
    .from(processReferenceCatalog)
    .where(and(eq(processReferenceCatalog.kind, "LABEL_STYLE"), eq(processReferenceCatalog.isActive, true)));

  const interessadoNome = process.person?.fullName || process.company?.corporateName || "Não informado";
  const interessadoDoc = process.person?.cpf || process.company?.cnpj || "Não informado";

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 text-black print:p-0 print:bg-white">
      {/* Barra superior de controle (oculta na impressão) */}
      <div className="mx-auto max-w-4xl mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/protocolos/processos/${id}`}
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 underline"
          >
            ← Voltar ao Processo
          </Link>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Processo: {process.protocolNumber}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Modelo de Documento */}
          <Link
            href={`/protocolos/processos/${id}/impressao?view=capa-recibo`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "capa-recibo"
                ? "bg-emerald-700 text-white font-bold"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Capa e Recibo Unificado (19.70)
          </Link>
          <Link
            href={`/protocolos/processos/${id}/impressao?view=etiqueta&labelStyle=${selectedLabelStyle}`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "etiqueta"
                ? "bg-emerald-700 text-white font-bold"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Etiqueta Térmica (19.56)
          </Link>
          <Link
            href={`/protocolos/processos/${id}/impressao?view=historico`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "historico"
                ? "bg-emerald-700 text-white font-bold"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Extrato de Tramitação
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* VIEW: ETIQUETA TÉRMICA CONFIGURÁVEL (19.56) */}
      {view === "etiqueta" && (
        <div className="mx-auto max-w-xl">
          <div className="mb-4 bg-white p-4 rounded-xl border border-slate-200 print:hidden space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase">
              Estilo da Etiqueta (19.56):
            </label>
            <div className="flex gap-2">
              <Link
                href={`/protocolos/processos/${id}/impressao?view=etiqueta&labelStyle=padrao`}
                className={`px-3 py-1 rounded text-xs ${selectedLabelStyle === "padrao" ? "bg-emerald-700 text-white" : "border"}`}
              >
                Padrão (100x50 mm)
              </Link>
              <Link
                href={`/protocolos/processos/${id}/impressao?view=etiqueta&labelStyle=compacta`}
                className={`px-3 py-1 rounded text-xs ${selectedLabelStyle === "compacta" ? "bg-emerald-700 text-white" : "border"}`}
              >
                Compacta (80x40 mm)
              </Link>
              <Link
                href={`/protocolos/processos/${id}/impressao?view=etiqueta&labelStyle=detalhada`}
                className={`px-3 py-1 rounded text-xs ${selectedLabelStyle === "detalhada" ? "bg-emerald-700 text-white" : "border"}`}
              >
                Detalhada (100x70 mm)
              </Link>
            </div>
            {labelStyles.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Estilos cadastrados no sistema: {labelStyles.map(s => s.name).join(", ")}
              </p>
            )}
          </div>

          <div
            className={`bg-white border-2 border-slate-900 mx-auto p-4 flex flex-col justify-between print:border-black ${
              selectedLabelStyle === "compacta"
                ? "w-[300px] h-[160px] text-xs"
                : selectedLabelStyle === "detalhada"
                ? "w-[380px] h-[260px] text-sm"
                : "w-[380px] h-[200px] text-xs"
            }`}
          >
            <div className="border-b border-black pb-1 flex justify-between items-center font-bold">
              <span>PREFEITURA MUNICIPAL</span>
              <span className="text-[10px] uppercase font-mono">CF19 PROTOCOLO</span>
            </div>

            <div className="py-2 text-center">
              <BarcodeSvg value={process.protocolNumber} />
            </div>

            <div className="space-y-0.5 border-t border-black pt-1">
              <p className="font-bold truncate">Interessado: {interessadoNome}</p>
              <p className="truncate">Assunto: {process.subject.name}</p>
              {selectedLabelStyle === "detalhada" && (
                <>
                  <p className="truncate">Setor Atual: {process.currentDepartment?.name || "Geral"}</p>
                  <p className="text-[10px]">Autuação: {process.createdAt.toLocaleString("pt-BR")}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CAPA DE PROCESSO E RECIBO DE PROTOCOLO UNIFICADO (19.70 & 19.71) */}
      {view === "capa-recibo" && (
        <div className="mx-auto max-w-4xl bg-white border border-slate-300 p-8 shadow-sm print:border-none print:shadow-none print:p-0 space-y-8">
          {/* SEÇÃO 1: CAPA DE PROCESSO (PARTE SUPERIOR) */}
          <div className="border-2 border-slate-800 p-6 rounded-lg space-y-6">
            <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600">ESTADO DO PARANÁ</p>
                <h1 className="text-2xl font-black text-slate-950 tracking-tight">PREFEITURA MUNICIPAL</h1>
                <p className="text-sm font-semibold text-slate-700">Sistema Celeriflow · Protocolo e Controle de Processos</p>
              </div>
              <div className="text-right">
                <span className="inline-block bg-slate-900 text-white text-xs font-bold uppercase px-3 py-1 rounded">
                  Capa de Processo
                </span>
                <p className="text-xs text-slate-500 mt-1">Via Autuação / Pasta</p>
              </div>
            </div>

            {/* Código de barras em destaque no cadastramento (19.71) */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50 p-4 rounded-md border border-slate-200">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Número do Protocolo</p>
                <p className="text-3xl font-black text-slate-950 font-mono tracking-wider">{process.protocolNumber}</p>
                <p className="text-xs text-slate-600">
                  Data de autuação: <strong>{process.createdAt.toLocaleDateString("pt-BR")}</strong> às{" "}
                  <strong>{process.createdAt.toLocaleTimeString("pt-BR")}</strong>
                </p>
              </div>
              <div className="bg-white p-3 rounded border border-slate-300">
                <BarcodeSvg value={process.protocolNumber} />
              </div>
            </div>

            {/* Dados Cadastrais do Processo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Interessado / Requerente</p>
                <p className="font-bold text-slate-900">{interessadoNome}</p>
                <p className="text-xs text-slate-600">Documento: {interessadoDoc}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Classificação</p>
                <p className="font-bold text-slate-900">{process.processType.name}</p>
                <p className="text-xs text-slate-600">Assunto: {process.subject.name}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Setor Inicial / Destino</p>
                <p className="font-bold text-slate-900">{process.currentDepartment?.name || "Protocolo Geral"}</p>
                <p className="text-xs text-slate-600">Prioridade: {process.priority}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase">Origem do Atendimento</p>
                <p className="font-bold text-slate-900">{process.portalOrigin || "Presencial / Balcão"}</p>
                <p className="text-xs text-slate-600">Documentos anexados: {process.documents.length}</p>
              </div>
            </div>

            {/* Descrição do Objeto */}
            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">Resumo / Objeto do Requerimento</p>
              <p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                {process.description || "Sem descrição detalhada informada na abertura."}
              </p>
            </div>

            {/* Termo de Autuação e Carimbo */}
            <div className="pt-4 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold text-slate-800">Servidor Responsável pela Autuação</p>
                <p>Matrícula / Assinatura</p>
              </div>
              <div className="border-t border-slate-400 pt-2">
                <p className="font-bold text-slate-800">Carimbo do Protocolo Geral</p>
                <p>Data e Rubrica</p>
              </div>
            </div>
          </div>

          {/* LINHA DE CORTE TRILHADA (Picote para separar Capa do Recibo) */}
          <div className="relative py-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-dashed border-slate-400"></div>
            </div>
            <span className="relative bg-white px-4 text-xs font-mono font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              ✂ Destaque aqui · Recibo de Protocolo do Requerente
            </span>
          </div>

          {/* SEÇÃO 2: RECIBO DE PROTOCOLO DO REQUERENTE (PARTE INFERIOR) (19.70) */}
          <div className="border-2 border-slate-800 p-6 rounded-lg space-y-5 bg-slate-50/50">
            <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">RECIBO DE PROTOCOLO</h2>
                <p className="text-xs text-slate-600">Comprovante de Entrega de Documentos e Abertura de Processo</p>
              </div>
              <div className="bg-white p-2 rounded border border-slate-300">
                <BarcodeSvg value={process.protocolNumber} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-semibold block">Protocolo nº:</span>
                <span className="font-mono text-base font-bold text-slate-900">{process.protocolNumber}</span>
              </div>
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-semibold block">Data e Hora:</span>
                <span className="font-bold text-slate-900">{process.createdAt.toLocaleString("pt-BR")}</span>
              </div>
              <div className="p-2.5 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-semibold block">Requerente:</span>
                <span className="font-bold text-slate-900 truncate block">{interessadoNome}</span>
              </div>
            </div>

            <div className="text-xs space-y-1 bg-white p-3 rounded border border-slate-200">
              <p><strong>Assunto:</strong> {process.processType.name} - {process.subject.name}</p>
              <p><strong>Encaminhamento Inicial:</strong> {process.currentDepartment?.name || "Protocolo Geral"}</p>
              <p className="text-slate-600 mt-2">
                <strong>Orientações ao Requerente:</strong> Acompanhe a tramitação deste processo pelo Portal de Serviços Online utilizando o número de protocolo acima ou comparecendo ao setor competente.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500">
              <span>Autenticação Digital: CF19-{process.id.slice(0, 8).toUpperCase()}-{new Date().getFullYear()}</span>
              <span>Emitido em: {new Date().toLocaleString("pt-BR")}</span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: EXTRATO DE TRAMITAÇÃO COMPLETO */}
      {view === "historico" && (
        <div className="mx-auto max-w-4xl bg-white border border-slate-300 p-8 shadow-sm print:border-none print:shadow-none space-y-6">
          <div className="border-b-2 border-slate-800 pb-4">
            <h1 className="text-2xl font-bold">Extrato Operacional do Processo {process.protocolNumber}</h1>
            <p className="text-sm text-slate-600">{process.processType.name} · {process.subject.name}</p>
          </div>

          {(settings?.includeOpening ?? true) && (
            <section className="space-y-2 border-b border-slate-200 pb-4">
              <h2 className="font-bold text-base text-slate-900">Abertura do Processo</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p><strong>Interessado:</strong> {interessadoNome}</p>
                <p><strong>Documento:</strong> {interessadoDoc}</p>
                <p><strong>Data de Abertura:</strong> {process.createdAt.toLocaleString("pt-BR")}</p>
                <p><strong>Situação Atual:</strong> {process.status}</p>
              </div>
              <p className="text-sm whitespace-pre-wrap mt-2 text-slate-700 bg-slate-50 p-3 rounded">
                {process.description || "Sem descrição."}
              </p>
            </section>
          )}

          {(settings?.includeMovements ?? true) && (
            <section className="space-y-3">
              <h2 className="font-bold text-base text-slate-900">Histórico de Movimentações</h2>
              {process.movements.map((movement) => (
                <article key={movement.id} className="break-inside-avoid border rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>{movement.fromDepartment?.name || "Abertura"} → {movement.toDepartment.name}</span>
                    <span className="text-xs text-slate-500">{movement.movedAt.toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="text-xs text-slate-600">Status: {movement.status}</p>
                  {movement.reason && <p className="text-xs italic text-slate-700 mt-1">&quot;{movement.reason}&quot;</p>}
                  {movement.receivedAt && (
                    <p className="text-xs text-emerald-700">Recebido em: {movement.receivedAt.toLocaleString("pt-BR")}</p>
                  )}
                </article>
              ))}
              {!process.movements.length && <p className="text-sm text-slate-500">Sem movimentações registradas.</p>}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
