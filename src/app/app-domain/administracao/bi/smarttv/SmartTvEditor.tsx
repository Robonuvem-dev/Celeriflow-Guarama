"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, ExternalLink, ImagePlus, Plus, Save, Trash2, Upload } from "lucide-react";
import { displayConfigSchema, displayMetrics, metricKeys, newDisplaySlide, type DisplayConfig, type DisplayEditorState, type DisplaySlide, type PublicDisplay } from "@/lib/bi/display-model";
import DisplayPlayer from "@/components/bi/DisplayPlayer";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { registryColumns } from "../../../cadastros/operational-registry";
import { saveSmartTv, previewSmartTv } from "./actions";
import operational from "@/components/app-ui/operational/operational.module.css";
import styles from "./smarttv-editor.module.css";

const columns = registryColumns([["order", "Ordem", 55, 45], ["title", "Página", 260, 90], ["kind", "Tipo", 100, 70], ["duration", "Exibição", 85, 60], ["actions", "Ações", 180, 180, "actions"]]);
const kindLabels = { dashboard: "Dashboard", indicators: "Indicadores", image: "Imagem", mixed: "Mista" };
const localDatetime = (value: string) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";

export default function SmartTvEditor({ initial, canEdit, canPublish }: { initial: DisplayEditorState; canEdit: boolean; canPublish: boolean }) {
  const [state, setState] = useState(initial);
  const [config, setConfig] = useState(initial.config);
  const [selectedId, setSelectedId] = useState(initial.config.slides[0].id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<PublicDisplay | null>(null);
  const [tab, setTab] = useState<"page" | "settings">("page");
  const selected = config.slides.find(slide => slide.id === selectedId) ?? config.slides[0];
  const selectedIndex = config.slides.indexOf(selected);
  const dirty = JSON.stringify(config) !== JSON.stringify(state.config);

  function updateConfig(values: Partial<DisplayConfig>) { setConfig(value => ({ ...value, ...values })); setPreview(null); setMessage(""); }
  function updateSlide(values: Partial<DisplaySlide>) { updateConfig({ slides: config.slides.map(slide => slide.id === selected.id ? { ...slide, ...values } : slide) }); }
  function addSlide(kind: DisplaySlide["kind"] = "dashboard") {
    if (config.slides.length >= 40) return;
    const next = { ...newDisplaySlide(crypto.randomUUID()), title: `Página ${config.slides.length + 1}`, kind, ...(kind === "image" ? { metrics: [], chart: "none" as const } : {}) };
    updateConfig({ slides: [...config.slides, next] }); setSelectedId(next.id); setTab("page");
  }
  function move(id: string, delta: number) {
    const next = [...config.slides]; const index = next.findIndex(slide => slide.id === id);
    if (index + delta < 0 || index + delta >= next.length) return;
    [next[index], next[index + delta]] = [next[index + delta], next[index]]; updateConfig({ slides: next });
  }
  async function save(operation: "save" | "publish" | "withdraw" | "restore", versionId?: string) {
    if (operation !== "restore" && operation !== "withdraw") {
      const parsed = displayConfigSchema.safeParse(config);
      if (!parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).slice(0, 3).join(" · ")); return; }
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await saveSmartTv({ operation, revision: state.revision, config, versionId });
      if (result.error || !result.state) { setError(result.error ?? "Não foi possível salvar."); return; }
      setState(result.state); setConfig(result.state.config); setPreview(null);
      setMessage(operation === "publish" ? "Programação publicada. A TV receberá a nova versão automaticamente." : operation === "withdraw" ? "Programação retirada da visualização pública." : operation === "restore" ? "Versão recuperada como rascunho. Publique para atualizar a TV." : "Rascunho salvo.");
    } catch { setError("Falha de conexão. Confira o estado salvo antes de repetir."); }
    finally { setBusy(false); }
  }
  async function showPreview() {
    const validation = displayConfigSchema.safeParse(config);
    if (!validation.success) { setError(validation.error.issues[0].message); return; }
    setBusy(true); setError("");
    try { const result = await previewSmartTv(config); if (result.display) setPreview(result.display); else setError(result.error ?? "Prévia indisponível."); }
    catch { setError("Não foi possível carregar a prévia."); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("Selecione uma imagem de até 8 MiB."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/administracao/bi/smarttv/imagens", { method: "POST", headers: { "Content-Type": file.type, "x-file-name": encodeURIComponent(file.name) }, body: file });
      const result = await response.json();
      if (!response.ok || !result.asset) throw new Error(result.error ?? "Falha no envio.");
      setState(value => ({ ...value, assets: [result.asset, ...value.assets] }));
      updateSlide({ imageId: result.asset.id }); setMessage("Imagem enviada. Salve ou publique a página para utilizá-la.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível enviar a imagem."); }
    finally { setBusy(false); }
  }
  return <section className={styles.editor}>
    <header className={styles.header}><div><small>INTELIGÊNCIA E BI</small><h1>Smart TV</h1><p>Programação pública do município · {state.publishedVersionId ? "Publicada" : "Sem publicação"}{dirty ? " · Alterações no rascunho" : ""}</p></div>
      <div className={styles.actions}>
        <a href="/Smarttv" target="_blank" rel="noreferrer"><ExternalLink />Abrir link público</a>
        <button type="button" disabled={busy} onClick={() => void showPreview()}><Eye />Prévia</button>
        <button type="button" disabled={busy || !canEdit} onClick={() => void save("save")}><Save />Salvar rascunho</button>
        <button type="button" className={styles.primary} disabled={busy || !canPublish || !canEdit} onClick={() => void save("publish")}><Upload />Publicar</button>
      </div>
    </header>
    {(error || message) && <div className={error ? styles.error : styles.message} role={error ? "alert" : "status"}>{error || message}</div>}
    {preview ? <div className={styles.previewArea}><button type="button" onClick={() => setPreview(null)}>Voltar à edição</button><div className={styles.preview}><DisplayPlayer key={preview.validatedAt} initial={preview} live={false} /></div></div> : <>
      <div className={styles.toolbar}>
        <button type="button" aria-pressed={tab === "page"} onClick={() => setTab("page")}>Conteúdo das páginas</button>
        <button type="button" aria-pressed={tab === "settings"} onClick={() => setTab("settings")}>Identidade e publicação</button>
        <OperationalTablePanel title="Páginas da programação" triggerLabel={`Organizar páginas (${config.slides.length})`}>
          <OperationalListFrame label="Páginas da programação" toolbar={<><span>Ordem de exibição da programação pública</span><button type="button" className={operational.filterButton} disabled={busy || !canEdit || config.slides.length >= 40} onClick={() => addSlide()}><Plus />Adicionar página</button></>}
            pagination={<OperationalPagination page={Math.min(page, Math.ceil(config.slides.length / 20))} total={config.slides.length} pending={busy} onPageChange={setPage} />}>
            <OperationalTable columns={columns} preferenceId="bi-smarttv-paginas" caption="Páginas da programação municipal" rows={config.slides.slice((Math.min(page, Math.ceil(config.slides.length / 20)) - 1) * 20, Math.min(page, Math.ceil(config.slides.length / 20)) * 20).map((slide, offset) => {
              const index = (Math.min(page, Math.ceil(config.slides.length / 20)) - 1) * 20 + offset;
              return { id: slide.id, label: slide.title, values: { order: String(index + 1), title: slide.title, kind: kindLabels[slide.kind], duration: `${slide.duration} s` }, actions: <div className={operational.rowActions}>
                <button type="button" className={operational.iconButton} aria-label={`Editar ${slide.title}`} onClick={() => { setSelectedId(slide.id); setTab("page"); }}><Eye /></button>
                <button type="button" className={operational.iconButton} aria-label={`Subir ${slide.title}`} disabled={busy || !canEdit || index === 0} onClick={() => move(slide.id, -1)}><ArrowUp /></button>
                <button type="button" className={operational.iconButton} aria-label={`Descer ${slide.title}`} disabled={busy || !canEdit || index === config.slides.length - 1} onClick={() => move(slide.id, 1)}><ArrowDown /></button>
              </div> };
            })} />
          </OperationalListFrame>
        </OperationalTablePanel>
      </div>
      <fieldset disabled={!canEdit || busy} className={styles.form}>
        {tab === "settings" ? <div className={styles.settings}>
          <h2>Identidade e atualização</h2>
          <label>Nome da programação<input maxLength={90} value={config.title} onChange={event => updateConfig({ title: event.target.value })} /></label>
          <label>Nome do município na tela<input maxLength={100} placeholder="Usar nome do cadastro institucional" value={config.municipalityLabel} onChange={event => updateConfig({ municipalityLabel: event.target.value })} /></label>
          <p>A logo é a mesma de Dados da Prefeitura. Nome e logo permanecem visíveis durante a apresentação.</p>
          <label>Rodapé institucional<textarea maxLength={200} value={config.footer} onChange={event => updateConfig({ footer: event.target.value })} /></label>
          <label>Atualização dos dados (minutos)<input type="number" min={1} max={60} value={config.refreshSeconds / 60} onChange={event => updateConfig({ refreshSeconds: Number(event.target.value) * 60 })} /></label>
          <p>Link público: <a href="/Smarttv" target="_blank" rel="noreferrer">/Smarttv</a>. A programação muda somente ao publicar. Conteúdo sem vigência ativa não é exibido.</p>
          <h2>Histórico de publicações</h2>
          <label>Recuperar versão como rascunho<select defaultValue="" onChange={event => { if (event.target.value) void save("restore", event.target.value); event.target.value = ""; }}><option value="">Selecione uma versão</option>{state.versions.map(version => <option key={version.id} value={version.id}>Versão {version.number} · {new Date(version.createdAt).toLocaleString("pt-BR")} · {version.title}</option>)}</select></label>
        </div> : <>
          <div className={styles.pageSelector}><label>Página em edição<select value={selected.id} onChange={event => setSelectedId(event.target.value)}>{config.slides.map((slide, index) => <option key={slide.id} value={slide.id}>{index + 1}. {slide.title}</option>)}</select></label>
            <div className={styles.actions}>
              <button type="button" disabled={config.slides.length >= 40} onClick={() => addSlide()}><Plus />Página</button>
              <button type="button" disabled={config.slides.length >= 40} onClick={() => { const next = { ...selected, id: crypto.randomUUID(), title: `${selected.title.slice(0, 80)} (cópia)` }; updateConfig({ slides: [...config.slides, next] }); setSelectedId(next.id); }}><Copy />Duplicar</button>
              <button type="button" disabled={config.slides.length <= 1} onClick={() => updateConfig({ slides: config.slides.filter(slide => slide.id !== selected.id) })}><Trash2 />Remover</button>
              <button type="button" aria-label="Subir página atual" disabled={selectedIndex === 0} onClick={() => move(selected.id, -1)}><ArrowUp /></button>
              <button type="button" aria-label="Descer página atual" disabled={selectedIndex === config.slides.length - 1} onClick={() => move(selected.id, 1)}><ArrowDown /></button>
            </div>
          </div>
          <div className={styles.fields}>
            <label>Título da página<input maxLength={90} value={selected.title} onChange={event => updateSlide({ title: event.target.value })} /></label>
            <label>Tipo de página<select value={selected.kind} onChange={event => updateSlide({ kind: event.target.value as DisplaySlide["kind"] })}>{Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Subtítulo<input maxLength={160} value={selected.subtitle} onChange={event => updateSlide({ subtitle: event.target.value })} /></label>
            <label>Tempo de exibição (segundos)<input type="number" min={10} max={120} value={selected.duration} onChange={event => updateSlide({ duration: Number(event.target.value) })} /></label>
            {selected.kind !== "image" && <>
              <label>Período das demandas<select value={selected.period} onChange={event => updateSlide({ period: event.target.value as DisplaySlide["period"] })}><option value="year">Ano atual</option><option value="month">Mês atual</option><option value="all">Todo o histórico</option></select></label>
              <label>Secretaria<select value={selected.secretariatId} onChange={event => updateSlide({ secretariatId: event.target.value })}><option value="">Prefeitura inteira</option>{state.secretariats.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <div className={styles.indicatorSelector}><h2>Indicadores visíveis · até 6</h2><div>{metricKeys.map(key => <label key={key}><input type="checkbox" checked={selected.metrics.includes(key)} disabled={!selected.metrics.includes(key) && selected.metrics.length >= 6} onChange={event => updateSlide({ metrics: event.target.checked ? [...selected.metrics, key] : selected.metrics.filter(value => value !== key) })} />{displayMetrics[key]}</label>)}</div></div>
              <label>Gráfico<select aria-label="Gráfico" value={selected.chart} onChange={event => updateSlide({ chart: event.target.value as DisplaySlide["chart"] })}><option value="none">Sem gráfico</option><option value="demands">Demandas por secretaria</option><option value="employees">Servidores por secretaria</option><option value="timeline">Demandas por mês</option></select></label>
              <p>Estrutura e equipe refletem a posição atual. Resolução e cancelamento são indicadores separados. Comparativos extensos geram páginas adicionais na TV.</p>
            </>}
            {(selected.kind === "image" || selected.kind === "mixed") && <>
              <label>Imagem institucional<select value={selected.imageId} onChange={event => updateSlide({ imageId: event.target.value })}><option value="">Selecione uma imagem</option>{state.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
              <label className={styles.upload}><ImagePlus />Enviar imagem para divulgação<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /><span>PNG, JPG ou WebP · até 8 MiB / 16 megapixels</span></label>
              <label>Enquadramento<select value={selected.imageFit} onChange={event => updateSlide({ imageFit: event.target.value as DisplaySlide["imageFit"] })}><option value="contain">Imagem inteira (sem cortes)</option><option value="cover">Preencher área (pode cortar)</option></select></label>
            </>}
            <label>Legenda / mensagem importante<textarea maxLength={240} value={selected.caption} onChange={event => updateSlide({ caption: event.target.value })} /></label>
            <label>Fonte / crédito<input maxLength={120} value={selected.source} onChange={event => updateSlide({ source: event.target.value })} /></label>
            <label>Exibir a partir de (opcional)<input type="datetime-local" value={localDatetime(selected.startsAt)} onChange={event => updateSlide({ startsAt: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label>
            <label>Exibir até (opcional)<input type="datetime-local" value={localDatetime(selected.endsAt)} onChange={event => updateSlide({ endsAt: event.target.value ? new Date(event.target.value).toISOString() : "" })} /></label>
          </div>
        </>}
      </fieldset>
      {tab === "settings" && <button type="button" className={styles.withdraw} disabled={busy || !canPublish || !state.publishedVersionId} onClick={() => void save("withdraw")}>Retirar programação pública</button>}
    </>}
  </section>;
}
