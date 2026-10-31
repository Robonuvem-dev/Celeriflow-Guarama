"use client";

/* Native images support institutional data URLs and publication-checked media endpoints. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Pause, Play } from "lucide-react";
import { displayMetrics, displaySlideIsActive, type PublicDisplay, type PublicDisplaySlide } from "@/lib/bi/display-model";
import styles from "./display-player.module.css";

const formatNumber = (value: number) => value.toLocaleString("pt-BR");
const formatDate = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function DisplayContent({ slide }: { slide: PublicDisplaySlide }) {
  const dataset = slide.dataset;
  const values = dataset ? slide.metricOrder.filter(key => dataset.metrics[key] !== undefined).map(key => [key, dataset.metrics[key]!] as const) : [];
  const max = Math.max(1, dataset?.chartMax ?? 0, ...dataset?.chart.map(item => item.value) ?? []);
  return <div className={`${styles.content} ${slide.kind === "mixed" ? styles.mixed : ""}`}>
    {(slide.kind === "image" || slide.kind === "mixed") && <figure className={styles.image}>
      {slide.imageUrl ? <img key={slide.imageUrl} src={slide.imageUrl} alt={slide.caption || slide.title} style={{ objectFit: slide.imageFit }} onError={event => { event.currentTarget.style.display = "none"; }} /> : null}
      <span className={styles.imageFallback}>Informação institucional</span>
    </figure>}
    {slide.kind !== "image" && <div className={styles.data}>
      {!dataset ? <div className={styles.empty}>Dados temporariamente indisponíveis.</div> : <>
        {values.length > 0 && <div className={styles.metrics} data-count={values.length}>{values.map(([key, value]) => <article key={key} className={styles.metric}>
          <span>{displayMetrics[key as keyof typeof displayMetrics]}</span><strong>{formatNumber(value!)}</strong>
        </article>)}</div>}
        {slide.chart !== "none" && <section className={styles.chart} aria-label={slide.chart === "employees" ? "Servidores por secretaria" : slide.chart === "timeline" ? "Demandas por mês" : "Demandas por secretaria"}>
          <h3>{slide.chart === "employees" ? "Servidores por secretaria" : slide.chart === "timeline" ? "Demandas por mês" : "Demandas por secretaria"}</h3>
          {!dataset.chart.length ? <p>Nenhum registro neste período.</p> : dataset.chart.map((item, index) => <div className={styles.barRow} key={`${item.name}-${index}`}>
            <span>{item.name}</span><div className={styles.barTrack}><div style={{ width: `${item.value / max * 100}%` }} /></div><strong>{formatNumber(item.value)}</strong>
          </div>)}
        </section>}
      </>}
    </div>}
  </div>;
}

export default function DisplayPlayer({ initial, live = true }: { initial: PublicDisplay; live?: boolean }) {
  const [display, setDisplay] = useState(initial);
  const [position, setPosition] = useState(0);
  const [paused, setPaused] = useState(false);
  const [offline, setOffline] = useState(false);
  const [controls, setControls] = useState(!live);
  const [now, setNow] = useState(Date.parse(initial.validatedAt));
  const [fullscreenError, setFullscreenError] = useState("");
  const [compact, setCompact] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const currentVersion = useRef(initial.version);
  const pending = useRef<PublicDisplay | null>(null);
  const hideControls = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dead = live && now >= Date.parse(display.validUntil);
  const pages = dead ? [] : display.slides.filter(slide => displaySlideIsActive(slide, now)).flatMap(slide => {
    const total = slide.dataset?.chart.length ?? 0;
    const rowsPerPage = slide.kind === "mixed" ? (compact ? 1 : 2) : (compact ? 2 : 4);
    const metricsPerPage = slide.kind === "mixed" || compact ? 4 : 6;
    const chartPages = Math.max(1, Math.ceil(total / rowsPerPage));
    const metricPages = slide.dataset ? Math.max(1, Math.ceil(slide.metricOrder.length / metricsPerPage)) : 1;
    const count = Math.max(chartPages, metricPages);
    return Array.from({ length: count }, (_, index) => ({ ...slide,
      metricOrder: slide.metricOrder.slice(index % metricPages * metricsPerPage, (index % metricPages + 1) * metricsPerPage),
      subtitle: `${slide.subtitle}${count > 1 ? `${slide.subtitle ? " · " : ""}${metricPages > 1 ? "Conteúdo" : "Comparativo"} ${index + 1}/${count}` : ""}`,
      dataset: slide.dataset ? { ...slide.dataset, chart: slide.dataset.chart.slice(index % chartPages * rowsPerPage, (index % chartPages + 1) * rowsPerPage) } : null }));
  });
  const index = position % Math.max(1, pages.length);
  const original = pages[index];
  const dataExpired = live && original?.capturedAt && now - Date.parse(original.capturedAt) >= Math.max(1800, display.refreshSeconds * 2) * 1000;
  const slide = original && dataExpired ? { ...original, dataset: null } : original;
  const stale = slide?.capturedAt && now - Date.parse(slide.capturedAt) > display.refreshSeconds * 2000;

  const advance = useCallback((step: number) => {
    if (pending.current) {
      const next = pending.current; pending.current = null; currentVersion.current = next.version;
      setDisplay(next); setPosition(0);
    } else setPosition(value => value + (step > 0 ? 1 : Math.max(1, pages.length - 1)));
  }, [pages.length]);

  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    let fetching = false;
    async function poll() {
      if (fetching) return;
      fetching = true;
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 20_000);
      try {
        const response = await fetch("/api/public/bi/smarttv", { cache: "no-store", signal: requestController.signal });
        if (!response.ok) throw new Error("Indisponível");
        const next: PublicDisplay = await response.json();
        if (controller.signal.aborted) return;
        if (next.status === "empty" || next.version === currentVersion.current) {
          pending.current = null; currentVersion.current = next.version; setDisplay(next);
        } else pending.current = next;
        setOffline(false);
      } catch { if (!controller.signal.aborted) setOffline(true); }
      finally { clearTimeout(timeout); controller.signal.removeEventListener("abort", abort); fetching = false; }
    }
    void poll();
    const interval = setInterval(() => void poll(), 60_000);
    const online = () => void poll();
    window.addEventListener("online", online);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("online", online); };
  }, [live]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 700 || entry.contentRect.height < 550));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (live) root.current?.focus({ preventScroll: true }); }, [live]);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => advance(1), (slide?.duration ?? 20) * 1000);
    return () => clearTimeout(timer);
  }, [advance, paused, slide?.duration, position, display.version]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "ArrowRight") { event.preventDefault(); advance(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); advance(-1); }
      else if ((event.key === " " || event.key === "Enter") && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPaused(value => !value); }
    }
    const element = root.current;
    element?.addEventListener("keydown", key);
    return () => element?.removeEventListener("keydown", key);
  }, [advance]);
  useEffect(() => () => clearTimeout(hideControls.current), []);

  function revealControls() {
    setControls(true); clearTimeout(hideControls.current);
    if (live) hideControls.current = setTimeout(() => setControls(false), 5000);
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else throw new Error();
      setFullscreenError("");
    } catch { setFullscreenError("Use a opção de tela cheia do navegador da TV."); }
  }
  return <div ref={root} className={styles.player} data-smarttv-player tabIndex={0} onPointerMove={revealControls} onPointerDown={revealControls} onFocus={revealControls}>
    <header className={styles.header}>
      <div className={styles.brand}>
        {display.municipality.logoUrl && <img src={display.municipality.logoUrl} alt="Brasão do município" onError={event => { event.currentTarget.style.display = "none"; }} />}
        <div><small>ADMINISTRAÇÃO MUNICIPAL</small><strong>{display.municipality.name}</strong></div>
      </div>
      <span className={styles.programme}>{live ? display.title : `PRÉVIA · ${display.title}`}</span>
    </header>
    <main className={styles.main}>
      {slide ? <>
        <div className={styles.pageHeading}><div><h1>{slide.title}</h1>{slide.subtitle && <p>{slide.subtitle}</p>}</div><span>{slide.dataset?.periodLabel ?? (slide.kind === "image" ? "Informação institucional" : "")}</span></div>
        <DisplayContent slide={slide} />
      </> : <div className={styles.empty}><h1>{dead ? "Reconectando a programação" : "Informações municipais"}</h1><p>{dead ? "Aguardando uma atualização válida para continuar." : "A programação será exibida assim que houver páginas publicadas e vigentes."}</p></div>}
    </main>
    <footer className={styles.footer}>
      <div><strong>{slide?.caption || display.footer}</strong>{slide?.source && <span>Fonte: {slide.source}</span>}</div>
      <div className={styles.footerMeta}><span>{offline ? "Sem conexão · " : ""}{stale || dataExpired ? "Dados desatualizados · " : ""}{slide?.capturedAt && !dataExpired ? `Dados: ${formatDate(slide.capturedAt)}` : "Informação institucional"}</span><strong>{pages.length ? `Página ${index + 1} de ${pages.length}` : ""}</strong></div>
    </footer>
    <nav className={styles.controls} data-visible={controls || paused} aria-label="Controles da apresentação" onFocus={revealControls}>
      <button type="button" aria-label="Página anterior" onClick={() => advance(-1)}><ChevronLeft /></button>
      <button type="button" aria-label={paused ? "Retomar apresentação" : "Pausar apresentação"} onClick={() => setPaused(value => !value)}>{paused ? <Play /> : <Pause />}</button>
      <button type="button" aria-label="Próxima página" onClick={() => advance(1)}><ChevronRight /></button>
      <button type="button" aria-label="Tela cheia" onClick={() => void fullscreen()}><Maximize /></button>
      {fullscreenError && <span role="status">{fullscreenError}</span>}
    </nav>
  </div>;
}
