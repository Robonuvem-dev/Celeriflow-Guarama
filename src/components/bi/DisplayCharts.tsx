import { ArrowUpRight, BarChart3, CalendarDays, ChartNoAxesCombined, PieChart } from "lucide-react";
import type { DisplayDataset, PublicDisplaySlide } from "@/lib/bi/display-model";
import styles from "./display-charts.module.css";

export const displayPalette = ["#147eb3", "#17a394", "#e7a124", "#8655b4", "#e3657d", "#547da5"];
const number = (value: number) => value.toLocaleString("pt-BR");
const percent = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
function category(name: string) {
  return name.replace(/^Secretaria Municipal (?:de |da |do |dos |das )?/i, "");
}
function monthLabel(name: string) {
  return /^\d{4}-\d{2}$/.test(name) ? new Date(`${name}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }) : name;
}

function Distribution({ dataset, unit }: { dataset: DisplayDataset; unit: string }) {
  const shown = dataset.chart.reduce((sum, item) => sum + item.value, 0);
  const total = dataset.chartTotal ?? shown;
  const remaining = Math.max(0, total - shown);
  const segments = [...dataset.chart.map((item, index) => ({ ...item, color: displayPalette[((dataset.chartOffset ?? 0) + index) % displayPalette.length] })), ...(remaining ? [{ name: "Outras secretarias", value: remaining, color: "#bccbd9" }] : [])];
  let offset = 0;
  return <section className={styles.card} data-display-chart="distribution">
    <div className={styles.cardHeading}><div><span className={styles.eyebrow}>DISTRIBUIÇÃO DO TOTAL</span><h3>Participação por secretaria</h3></div><PieChart aria-hidden="true" /></div>
    <div className={styles.distribution}>
      <div className={styles.ring}>
        <svg viewBox="0 0 160 160" role="img" aria-label={`Distribuição de ${number(total)} ${unit} por secretaria`}>
          <circle cx="80" cy="80" r="62" fill="none" stroke="#e9eff5" strokeWidth="22" />
          {segments.filter(segment => segment.value > 0).map(segment => {
            const size = total ? segment.value / total * 100 : 0;
            const start = offset; offset += size;
            return <circle key={segment.name} cx="80" cy="80" r="62" fill="none" stroke={segment.color} strokeWidth="22" pathLength="100" strokeDasharray={`${Math.max(0, size - (segments.filter(item => item.value > 0).length > 1 ? .65 : 0))} 100`} strokeDashoffset={-start} transform="rotate(-90 80 80)"><title>{`${segment.name}: ${number(segment.value)} (${percent(total ? segment.value / total * 100 : 0)}%)`}</title></circle>;
          })}
        </svg>
        <div className={styles.ringLabel}><strong>{number(total)}</strong><span>{unit}</span></div>
      </div>
      <div className={styles.legend}>{segments.map(segment => <div className={styles.legendRow} key={segment.name} title={segment.name}>
        <i style={{ background: segment.color }} /><span>{category(segment.name)}</span><strong>{number(segment.value)}</strong><small>{percent(total ? segment.value / total * 100 : 0)}%</small>
      </div>)}</div>
    </div>
    <p className={styles.note}>{total ? `Percentuais sobre o total do recorte.${remaining ? " Outras secretarias reúne as demais páginas." : ""}` : "Sem registros no recorte. Nenhum percentual de desempenho foi calculado."}</p>
  </section>;
}

function TimelineHighlights({ dataset }: { dataset: DisplayDataset }) {
  const total = dataset.chart.reduce((sum, item) => sum + item.value, 0);
  const peak = dataset.chart.reduce((best, item) => item.value > best.value ? item : best, { name: "", value: 0 });
  const active = dataset.chart.filter(item => item.value > 0).length;
  return <section className={`${styles.card} ${styles.highlights}`} data-display-chart="highlights">
    <div className={styles.cardHeading}><div><span className={styles.eyebrow}>LEITURA DO PERÍODO</span><h3>O que os dados mostram</h3></div><ChartNoAxesCombined aria-hidden="true" /></div>
    <div className={styles.highlight}><span><CalendarDays />Entradas nos meses exibidos</span><strong>{number(total)}</strong><small>{dataset.chart.length} {dataset.chart.length === 1 ? "mês representado" : "meses representados"}, incluindo meses sem entrada</small></div>
    <div className={styles.insight}><ArrowUpRight /><div><span>Maior volume de entradas</span><strong>{peak.value ? `${monthLabel(peak.name)} · ${number(peak.value)} demandas` : "Sem novas demandas"}</strong></div></div>
    <div className={styles.insight}><BarChart3 /><div><span>Meses com movimentação</span><strong>{active} de {dataset.chart.length}</strong></div></div>
    <p className={styles.note}>Contagem pela data de criação. Entradas não representam demandas resolvidas.</p>
  </section>;
}

export default function DisplayCharts({ slide }: { slide: PublicDisplaySlide }) {
  const dataset = slide.dataset;
  if (!dataset || slide.chart === "none") return null;
  const timeline = slide.chart === "timeline";
  const employees = slide.chart === "employees";
  const unit = employees ? "servidores" : "demandas";
  const total = dataset.chartTotal ?? dataset.chart.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(1, dataset.chartMax ?? 0, ...dataset.chart.map(item => item.value));
  const title = timeline ? "Entrada de demandas por mês" : employees ? "Servidores por secretaria" : "Demandas por secretaria";
  const start = (dataset.chartOffset ?? 0) + 1;
  return <div className={styles.charts} data-layout={slide.kind === "mixed" ? "mixed" : "full"}>
    <section className={styles.card} data-display-chart={timeline ? "timeline" : "ranking"} aria-label={title}>
      <div className={styles.cardHeading}><div><span className={styles.eyebrow}>{timeline ? "EVOLUÇÃO DAS ENTRADAS" : employees ? "DISTRIBUIÇÃO DA EQUIPE" : "VOLUME POR SECRETARIA"}</span><h3>{title}</h3></div><div className={styles.total}><strong>{number(total)}</strong><span>{unit} no recorte</span></div></div>
      {!dataset.chart.length ? <div className={styles.empty}><BarChart3 /><strong>Sem registros neste recorte</strong><span>Selecione outro período ou secretaria no editor.</span></div> : timeline ? <div className={styles.columnChart} role="img" aria-label={dataset.chart.map(item => `${monthLabel(item.name)}: ${item.value}`).join("; ")}>
        <div className={styles.gridLines} aria-hidden="true"><span>{number(max)}</span><span>{number(Math.round(max / 2))}</span><span>0</span></div>
        <div className={styles.columns}>{dataset.chart.map((item, index) => <div className={styles.column} key={item.name} title={`${monthLabel(item.name)}: ${number(item.value)} demandas`}>
          <div className={styles.columnSpace}><div className={styles.columnBar} data-zero={item.value === 0} style={{ height: `${item.value / max * 100}%`, background: displayPalette[index % displayPalette.length] }}><strong>{number(item.value)}</strong></div></div>
          <span>{monthLabel(item.name)}</span>
        </div>)}</div>
      </div> : <div className={styles.ranking}>
        {dataset.chart.map((item, index) => <div className={styles.rankRow} key={item.name} title={item.name}>
          <span className={styles.rankNumber}>{String(start + index).padStart(2, "0")}</span>
          <div className={styles.rankInfo}><div><span>{category(item.name)}</span><strong>{number(item.value)}</strong></div><div className={styles.track}><div style={{ width: `${item.value / max * 100}%`, background: displayPalette[((dataset.chartOffset ?? 0) + index) % displayPalette.length] }} /></div></div>
        </div>)}
        <div className={styles.scale}><span>0</span><span>Escala de volume · {unit}</span><span>{number(max)}</span></div>
      </div>}
      <div className={styles.chartFoot}><span><i style={{ background: timeline ? displayPalette[0] : "#17a394" }} />{employees ? "Servidores ativos · posição atual" : "Demandas criadas no período"}</span><span>{timeline ? `${dataset.chart.length} meses exibidos` : dataset.chart.length ? `${start}–${start + dataset.chart.length - 1} de ${dataset.chartCategories ?? dataset.chart.length} categorias` : "0 categorias"}</span></div>
    </section>
    {slide.kind === "dashboard" && (timeline ? <TimelineHighlights dataset={dataset} /> : <Distribution dataset={dataset} unit={unit} />)}
  </div>;
}
