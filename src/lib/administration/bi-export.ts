import ExcelJS from "exceljs";
import JSZip from "jszip";
import { summarizeAdministrationData, type AdministrationBiData } from "./bi-model";

type Cell = string | number | boolean | null;
type Dataset = { name: string; columns: string[]; rows: Cell[][] };

export function administrationExportDatasets(data: AdministrationBiData): Dataset[] {
  const summary = summarizeAdministrationData(data);
  const scope = data.rows.find(s => s.id === data.selection)?.name || "Prefeitura inteira";
  return [
    { name: "Indicadores", columns: ["instituicao", "visao", "atualizado_em", "secretarias_ativas", "gestores_vinculados", "servidores_ativos", "servidores_inativos_vinculados", "departamentos_ativos", "unidades_ativas", "demandas_total", "demandas_abertas", "demandas_finalizadas_canceladas", "demandas_vencidas", "servidores_sem_secretaria", "demandas_sem_secretaria"], rows: [[data.institution, scope, data.capturedAt, summary.secretariats, summary.managers, summary.employees, summary.inactiveEmployees, summary.departments, summary.units, summary.demands, summary.openDemands, summary.completedDemands, summary.overdueDemands, data.unassignedEmployees, data.unassignedDemands]] },
    { name: "Secretarias", columns: ["secretaria_id", "secretaria", "sigla", "ativa", "responsavel", "cargo_responsavel", "vinculo_responsavel_valido", "servidores_ativos", "servidores_inativos", "departamentos_ativos", "unidades_ativas", "demandas_total", "demandas_abertas", "demandas_finalizadas_canceladas", "demandas_vencidas"], rows: data.rows.map(s => [s.id, s.name, s.acronym, s.active, s.managerName, s.managerRole, s.managerValid, s.employees, s.inactiveEmployees, s.departments, s.units, s.demands, s.openDemands, s.completedDemands, s.overdueDemands]) },
    { name: "Cargos", columns: ["cargo", "servidores_ativos"], rows: data.roles.map(r => [r.name, r.employees]) },
    { name: "Departamentos", columns: ["departamento_id", "departamento", "servidores_ativos"], rows: data.departments.map(d => [d.id, d.name, d.employees]) },
    { name: "Demandas_mensais", columns: ["mes", "demandas_cadastradas"], rows: data.timeline.map(t => [t.month, t.demands]) },
  ];
}

export function datasetCsv(dataset: Dataset) {
  const escape = (value: Cell) => {
    const text = value === null ? "" : String(value);
    const safe = typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${[dataset.columns, ...dataset.rows].map(row => row.map(escape).join(";")).join("\r\n")}\r\n`;
}

export async function exportAdministrationBi(data: AdministrationBiData, format: "csv" | "xlsx" | "powerbi") {
  const datasets = administrationExportDatasets(data);
  if (format === "csv") return { body: new TextEncoder().encode(datasetCsv(datasets[1])), contentType: "text/csv; charset=utf-8", extension: "csv" };
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CeleriFlow";
    workbook.created = new Date(data.capturedAt);
    for (const dataset of datasets) {
      const sheet = workbook.addWorksheet(dataset.name);
      sheet.addRow(dataset.columns);
      sheet.addRows(dataset.rows);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
      sheet.columns.forEach(column => { column.width = 26; });
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, dataset.rows.length + 1), column: dataset.columns.length } };
    }
    return { body: new Uint8Array(await workbook.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  }
  const zip = new JSZip();
  for (const dataset of datasets) zip.file(`${dataset.name}.csv`, datasetCsv(dataset));
  zip.file("Importar_Secretarias.pq", `let\n    Pasta = "C:\\IndicadoresAurora",\n    Fonte = Csv.Document(File.Contents(Pasta & "\\Secretarias.csv"), [Delimiter=";", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),\n    Cabecalhos = Table.PromoteHeaders(Fonte, [PromoteAllScalars=true]),\n    Tipos = Table.TransformColumnTypes(Cabecalhos, {{"servidores_ativos", Int64.Type}, {"servidores_inativos", Int64.Type}, {"departamentos_ativos", Int64.Type}, {"unidades_ativas", Int64.Type}, {"demandas_total", Int64.Type}, {"demandas_abertas", Int64.Type}, {"demandas_finalizadas_canceladas", Int64.Type}, {"demandas_vencidas", Int64.Type}}, "pt-BR")\nin\n    Tipos\n`);
  zip.file("LEIA-ME.txt", `CeleriFlow — indicadores administrativos\nInstituição: ${data.institution}\nSeleção: ${data.rows.find(s => s.id === data.selection)?.name || "Prefeitura inteira"}\nExtração: ${data.capturedAt}\n\n1. Extraia o ZIP em uma pasta local.\n2. No Power BI Desktop: Obter dados > Texto/CSV > selecione Secretarias.csv. Use UTF-8 e delimitador ponto e vírgula.\n3. Repita para os demais CSVs, se necessário.\n4. Alternativa: cole Importar_Secretarias.pq no Editor Avançado do Power Query e altere a variável Pasta para a pasta extraída.\n\nEste pacote contém dados tabulares e uma consulta Power Query; não é um arquivo PBIX nem uma conexão automática ao banco.\nOs CSVs incluem todos os registros da seleção atual, inclusive outras páginas do comparativo.\nEstrutura e servidores refletem o cadastro atual. Demandas totalizam o histórico; demandas_mensais contém entradas dos últimos seis meses. Finalizadas inclui canceladas.\n`);
  return { body: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), contentType: "application/zip", extension: "zip" };
}
