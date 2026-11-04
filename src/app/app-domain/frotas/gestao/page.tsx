import Link from "next/link";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { fleetScope } from "@/lib/frotas/service";
import { fleetDatabase } from "@/db/repositories/fleet/records";
import { fleetManagementOptions } from "@/db/repositories/fleet/page-data";
import { queryFleetControl } from "@/lib/frotas/control-queries";
import { fleetControlForms } from "./forms";
import type { FleetControlOperation } from "@/lib/frotas/control-policy";
import { FleetControlForm } from "./FleetControlForm";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { fleetControlReports } from "@/lib/frotas/control-report";

export const dynamic = "force-dynamic";
const areas = [
  ["cadastro", "Cadastro / marcadores"],
  ["debitos", "Débitos / obrigações"],
  ["motoristas", "Motoristas / CNH"],
  ["agenda", "Agenda"],
  ["destinos", "Destinos"],
  ["guarita", "Viagens / guarita"],
  ["abastecimento", "Autorizações de combustível"],
  ["saldos", "Saldos contratuais"],
  ["autorizacoes", "Serviços / oficinas"],
  ["componentes", "Pneus / baterias"],
  ["multas", "Multas / pagamentos"],
  ["sinistros", "Ocorrências / sinistros"],
  ["catalogos", "Catálogos FIPE / CTB"],
  ["infracoes", "Tabela de infrações CTB"],
  ["modelos", "Modelos FIPE"],
  ["tiposMaquina", "Tipos de máquina"],
  ["anexos", "Anexos"],
  ["relatorios", "Dossiê / análises"],
];
const areaGuidance: Record<string, string> = {
  cadastro: "Para veículo, máquina ou equipamento já tombado, selecione o Bem de origem. Setor e responsável passam a vir do Patrimônio; uma transferência patrimonial é refletida automaticamente na Frota.",
  debitos: "Registre licenciamento, seguro obrigatório, IPVA, taxas e demais obrigações. Acompanhe vencimentos, alertas e parcelas pagas sem confundir cumprimento administrativo com quitação financeira.",
  componentes: "Cadastre a identificação e a marca da bateria ou pneu; a instalação em uma posição encerra automaticamente o componente anterior do mesmo tipo, preservando a troca e o gasto.",
  abastecimento: "Emita a autorização, entregue o código ao posto quando for externo e confirme o volume efetivamente abastecido. A confirmação cria consumo e gasto sem duplicidade.",
  autorizacoes: "A autorização de serviço cria a respectiva Ordem de Serviço. Inicie a OS, confira o serviço e conclua a execução para apropriar o gasto de manutenção.",
  agenda: "Programe viagem, serviço, conserto ou obrigação com veículo, setor, motorista, período, motivo e finalidade. Conflitos de agenda são bloqueados.",
  guarita: "Registre saída e retorno da garagem. O sistema conserva horários, motorista, checklist e leituras do marcador, e impede mais de uma posse aberta para veículo ou condutor.",
  anexos: "Anexe fotos e documentos ao veículo, multa, pagamento, contrato, autorização ou ocorrência. São aceitos PNG, BMP, JPG, GIF, DOC/DOCX, PPT/PPTX, XLS/XLSX, PDF, ODT, ODS e DWG.",
  multas: "Consulte multas a qualquer momento e registre auto, cidade, enquadramento CTB, condutor, vencimento, comprovante e cada parcela paga. O saldo e o gasto são atualizados automaticamente.",
  infracoes: "A tabela apresenta os enquadramentos CTB da versão publicada, com artigo, natureza, pontos, penalidade, vigência e fonte oficial. Use-a ao registrar uma multa.",
  modelos: "Pesquise e vincule o modelo FIPE versionado na ficha complementar da unidade; o vínculo preserva a versão de origem usada no cadastro.",
  relatorios: "O dossiê e os relatórios consolidados usam a fonte única de gastos da Frota, incluindo combustível, manutenção, componentes, multas e demais despesas registradas.",
};
const operations: Record<string, FleetControlOperation[]> = {
  cadastro: ["unitControl"],
  motoristas: ["driver"],
  agenda: ["booking", "destination", "cancelBooking"],
  guarita: ["depart", "arrive"],
  abastecimento: ["fuelAuthorization", "confirmFuel", "quota", "fuelAgreement", "provider", "cancelAuthorization", "renewCredential"],
  autorizacoes: ["serviceAuthorization", "reviewWorkshop", "executeService", "provider", "renewCredential", "cancelAuthorization"],
  componentes: ["component", "installComponent", "removeComponent"],
  debitos: ["debtSettings", "debtDocument", "payDebt", "reverseDebtPayment"],
  multas: ["fine", "payFine", "reverseFinePayment", "fineStatus"],
  sinistros: ["occurrence", "claim", "claimStatus"],
  catalogos: ["catalog"],
  tiposMaquina: ["machineType"],
  destinos: ["destination"],
  saldos: ["fuelAgreement"],
  anexos: [],
  relatorios: [],
};
const managementColumns: OperationalColumn[] = [
  { key: "label", label: "Registro", type: "identifier", initialWidth: 260, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 130, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "detail", label: "Dados, origens e histórico", type: "text", initialWidth: 380, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 260, minWidth: 180, resizable: false, sortable: false, details: "none" },
];

export default async function FleetManagementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("FROTAS"),
    scope = fleetScope(context);
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? (key === "unitIds" ? value.join(",") : value[0]) : value]),
  );
  const result = await queryFleetControl(context, raw),
    operation =
      typeof raw.operation === "string" && (operations[result.query.area] || []).includes(raw.operation as FleetControlOperation)
        ? (raw.operation as FleetControlOperation)
        : null;
  const selected = typeof raw.edit === "string" ? result.rows.find((row) => row.id === raw.edit) : undefined;
  const canEdit = canPerformModuleOperation(context.user, "FROTAS", "update"),
    canCreate = canPerformModuleOperation(context.user, "FROTAS", "create");
  const filters = {
    area: result.query.area,
    q: result.query.q,
    unitId: result.query.unitId,
    unitIds: result.query.unitIds,
    departmentId: result.query.departmentId,
    driverId: result.query.driverId,
    catalogVersionId: result.query.catalogVersionId,
    nature: result.query.nature,
    from: result.query.from,
    to: result.query.to,
    status: result.query.status,
  };
  const { departments, unitOptions, catalogOptions } = await fleetManagementOptions(
    fleetDatabase(context),
    scope,
    result.query.departmentId,
    result.query.area === "infracoes",
  );
  const drivers = (await queryFleetControl(context, { area: "motoristas", departmentId: result.query.departmentId }, true)).rows;

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Gestão e Controle de Frotas (CF19)</p>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Gestão e controle operacional da Frota</h1>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Cadastro patrimonial permanece na origem. Autorizar, executar, registrar despesa e confirmar pagamento são etapas distintas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/frotas/cadastros" className="cf-portal-btn-secondary">Cadastros da Frota</Link>
            <Link href="/frotas/movimentos" className="cf-portal-btn-secondary">Movimentos e Importações</Link>
            <Link href="/frotas" className="cf-portal-btn-secondary">← Painel da Frota</Link>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xs" aria-label="Rotinas da Frota">
        {areas.map(([id, label]) => (
          <Link
            key={id}
            href={`/frotas/gestao?area=${id}`}
            aria-current={result.query.area === id ? "page" : undefined}
            className={
              result.query.area === id
                ? "rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs"
                : "rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100"
            }
          >
            {label}
          </Link>
        ))}
      </nav>

      {areaGuidance[result.query.area] && (
        <aside className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs leading-5 text-blue-950" aria-label="Como funciona esta rotina">
          {areaGuidance[result.query.area]}
        </aside>
      )}

      <form action="/frotas/gestao" method="get" className="cf-portal-form grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-4">
        <input type="hidden" name="area" value={result.query.area} />
        <label className="text-xs">
          Buscar
          <input name="q" defaultValue={result.query.q} placeholder="Código, nome, finalidade, artigo ou cidade" className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-xs">
          Situação
          <input name="status" defaultValue={result.query.status} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-xs">
          Departamento
          <select name="departmentId" defaultValue={result.query.departmentId} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
            <option value="">Todos os departamentos autorizados</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>
        {result.query.area === "relatorios" ? (
          <label className="text-xs sm:col-span-2">
            Veículos/máquinas do dossiê
            <select
              name="unitIds"
              multiple
              size={Math.min(6, Math.max(3, unitOptions.length))}
              defaultValue={result.query.unitIds.split(",").filter(Boolean)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2"
            >
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} · {unit.name}{unit.plate ? ` · ${unit.plate}` : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">Selecione um ou vários (Ctrl/⌘). Sem seleção: todas as unidades do filtro autorizado.</span>
          </label>
        ) : (
          <label className="text-xs">
            Veículo / máquina
            <select name="unitId" defaultValue={result.query.unitId} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
              <option value="">Todas as unidades autorizadas</option>
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} · {unit.name}{unit.plate ? ` · ${unit.plate}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs">
          Motorista
          <select name="driverId" defaultValue={result.query.driverId} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
            <option value="">Todos os condutores autorizados</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          De
          <input name="from" type="date" defaultValue={result.query.from} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-xs">
          Até
          <input name="to" type="date" defaultValue={result.query.to} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        {result.query.area === "infracoes" && (
          <>
            <label className="text-xs">
              Edição CTB
              <select name="catalogVersionId" defaultValue={result.query.catalogVersionId} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
                <option value="">Última edição publicada</option>
                {catalogOptions.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>{catalog.reference}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Natureza
              <select name="nature" defaultValue={result.query.nature} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
                <option value="">Todas</option>
                {["LEVE", "MEDIA", "GRAVE", "GRAVISSIMA"].map((nature) => (
                  <option key={nature}>{nature}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="flex items-end">
          <button className="cf-portal-btn">Consultar</button>
        </div>
      </form>

      {result.debtSummary && (
        <section className="cf-portal-card text-xs">
          <h2 className="text-sm font-bold text-slate-900">Resumo integral do filtro de débitos</h2>
          <p className="mt-1.5 text-slate-700">
            Pendências conhecidas: <strong>R$ {result.debtSummary.outstandingKnown}</strong> · Valores não informados: <strong>{result.debtSummary.unknownValues}</strong> · Pagamentos registrados: <strong>R$ {result.debtSummary.payments}</strong>
          </p>
          <p className="mt-1 text-slate-500">
            Cumprimentos administrativos: {result.debtSummary.administrativeClosures}. O saldo somente é quitado por parcelas financeiras registradas.
          </p>
        </section>
      )}

      {result.catalog && (
        <section className="cf-portal-card text-xs">
          <h2 className="text-sm font-bold text-slate-900">
            {result.catalog.reference} · {result.catalog.records} enquadramentos
          </h2>
          <p className="mt-1 text-slate-600">
            {result.catalog.complete ? "Catálogo integral da edição declarada" : "Catálogo parcial/amostra"} · {result.catalog.sourceReference}
          </p>
        </section>
      )}

      {(canCreate || canEdit) && (operations[result.query.area] || []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(operations[result.query.area] || []).map((name) => (
            <Link
              key={name}
              href={`/frotas/gestao?${new URLSearchParams({ area: result.query.area, operation: name, unitId: result.query.unitId })}`}
              className={operation === name ? "cf-portal-btn" : "cf-portal-btn-secondary"}
            >
              {fleetControlForms[name].title}
            </Link>
          ))}
        </div>
      )}

      {operation && (canCreate || canEdit) && (
        <FleetControlForm
          key={`${operation}:${selected?.id || "new"}`}
          operation={operation}
          initial={selected?.data || { unitId: result.query.unitId }}
          departmentId={scope.departmentId || ""}
        />
      )}

      <OperationalTablePanel title={`Gestão de Frotas — ${result.query.area}`} triggerLabel={`Consultar ${result.total} registros em tabela`}>
        <OperationalListFrame
          toolbar={<p className="text-xs font-semibold text-slate-600">Filtro aplicado: {result.query.q || "todos"} · {result.total} registros</p>}
          pagination={<OperationalLinkPagination pathname="/frotas/gestao" page={result.page} total={result.total} values={filters} />}
        >
          <OperationalTable
            preferenceId={`frotas-gestao-${result.query.area}`}
            caption={`Gestão de Frotas — ${result.query.area}`}
            columns={managementColumns}
            rows={result.rows.map((row) => ({
              id: row.id,
              label: row.label,
              values: {
                label: row.label,
                status: row.status,
                detail: Object.entries({
                  ...row.detail,
                  ...(row.type === "DRIVER" && row.data.firstLicenseAt ? { "Primeira habilitação": String(row.data.firstLicenseAt) } : {}),
                })
                  .map(([label, value]) => `${label}: ${value}`)
                  .join("\n"),
              },
              actions: (
                <div className="flex flex-wrap gap-2 text-xs">
                  {canEdit && row.type === "UNIT_CONTROL" && (
                    <Link href={`/frotas/gestao?area=cadastro&operation=unitControl&edit=${row.id}&unitId=${row.unitId}`} className="font-semibold text-blue-700 underline">
                      Configurar ficha
                    </Link>
                  )}
                  {row.type === "UNIT_CONTROL" && typeof row.data.assetId === "string" && row.data.assetId && (
                    <Link href={`/patrimonio/bens/${encodeURIComponent(row.data.assetId)}`} className="font-semibold text-blue-700 underline">
                      Abrir bem no Patrimônio
                    </Link>
                  )}
                  {canEdit && row.type === "DRIVER" && (
                    <Link href={`/frotas/gestao?area=motoristas&operation=driver&edit=${row.id}`} className="font-semibold text-blue-700 underline">
                      Editar CNH/política
                    </Link>
                  )}
                  {canEdit && row.type === "MACHINE_TYPE" && (
                    <Link href={`/frotas/gestao?area=tiposMaquina&operation=machineType&edit=${row.id}`} className="font-semibold text-blue-700 underline">
                      Editar configuração de campos
                    </Link>
                  )}
                  {canEdit && row.type === "BOOKING" && row.status === "AGENDADO" && (
                    <Link href={`/frotas/gestao?area=agenda&operation=booking&edit=${row.id}&unitId=${row.unitId}`} className="font-semibold text-blue-700 underline">
                      Reprogramar com histórico
                    </Link>
                  )}
                  {row.type === "AUTHORIZATION" && (
                    <a href={`/api/frotas/controle/relatorios?documentType=authorization&documentId=${row.id}&format=pdf`} className="font-semibold text-blue-700 underline">
                      Imprimir autorização
                    </a>
                  )}
                  {row.type === "TRIP" && (
                    <a href={`/api/frotas/controle/relatorios?documentType=trip&documentId=${row.id}&format=pdf`} className="font-semibold text-blue-700 underline">
                      Planilha de acompanhamento
                    </a>
                  )}
                  {row.type === "FINE" && (
                    <a href={`/api/frotas/controle/relatorios?documentType=fineTerm&documentId=${row.id}&format=pdf`} className="font-semibold text-blue-700 underline">
                      Termo de desconto da multa
                    </a>
                  )}
                  {row.type === "ATTACHMENT" && (
                    <a href={`/api/frotas/controle/anexos/${row.id}`} className="font-semibold text-blue-700 underline">
                      Baixar arquivo protegido
                    </a>
                  )}
                  {row.unitId && (
                    <Link href={`/frotas?unitId=${row.unitId}`} className="font-semibold text-blue-700 underline">
                      Origem na Frota
                    </Link>
                  )}
                </div>
              ),
            }))}
          />
        </OperationalListFrame>
      </OperationalTablePanel>

      {!result.rows.length && result.query.area !== "relatorios" && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-600">
          Nenhum registro encontrado nos filtros e na repartição autorizada.
        </p>
      )}

      {result.query.area === "relatorios" && (
        <section className="cf-portal-card flex flex-wrap gap-2">
          {fleetControlReports.map((report) => (
            <a
              key={report}
              href={`/api/frotas/controle/relatorios?${new URLSearchParams({ ...filters, report, format: "pdf" })}`}
              className="cf-portal-btn-secondary"
            >
              {{
                quilometragem: "Quilometragem",
                custoKm: "Gastos por km",
                consumo: "Planilha de consumo",
                cnh: "Vencimentos de CNH",
                pontuacao: "Pontuação de CNH",
                incorporacoes: "Incorporações / desincorporações",
                pneusBaixados: "Pneus baixados",
                combustivel: "Combustível / empenhos",
                escolar: "Combustível escolar",
                hospitalar: "Combustível hospitalar",
                requisicoesEncerradas: "Requisições finalizadas / canceladas",
                comunidade: "Solicitações da comunidade",
              }[report]}
            </a>
          ))}
        </section>
      )}

      <section className="cf-portal-card flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="text-slate-600">Exportações e impressos operacionais:</span>
        {["pdf", "xlsx", "csv", "txt", "print"].map((format) => (
          <a key={format} href={`/api/frotas/controle/relatorios?${new URLSearchParams({ ...filters, format })}`} className="cf-portal-btn-secondary">
            {format === "print" ? "Imprimir filtro" : `Relatório ${format.toUpperCase()}`}
          </a>
        ))}
        <a href="/api/frotas/controle/relatorios?documentType=blankFuel&format=pdf" className="cf-portal-btn-secondary">
          Autorização de abastecimento em branco
        </a>
        <a href="/api/frotas/controle/relatorios?documentType=blankTrip&format=pdf" className="cf-portal-btn-secondary">
          Planilha de viagem em branco
        </a>
        <a href={`/api/frotas/controle/relatorios?${new URLSearchParams({ ...filters, area: "relatorios", format: "pdf" })}`} className="cf-portal-btn-secondary">
          Dossiê das unidades selecionadas
        </a>
      </section>

      {result.query.area === "anexos" && (
        <Link href="/frotas/gestao/anexos" className="cf-portal-btn">
          Anexar arquivo ao registro da Frota
        </Link>
      )}
      <p className="text-xs leading-5 text-slate-500">
        FIPE/CTB importados como amostra ficam identificados como parciais. Não há remessa SAGRES/TCE-PB nem alteração do Portal geral nesta integração.
      </p>
    </main>
  );
}
