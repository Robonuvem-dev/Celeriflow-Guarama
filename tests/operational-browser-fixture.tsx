// Browser-only fixture. No route page, server action, auth client or DB connection is imported.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Pencil, History, Download, Trash2 } from "lucide-react";
import { OperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { operationalModules } from "@/components/app-ui/operational/modules";
import { unitColumns } from "@/app/app-domain/saneamento/unidades/columns";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
// The runner extracts these declarations from the current domain source with the TS AST.
// @ts-expect-error virtual esbuild module
import { columns as materialColumns } from "fixture:material-columns";
// @ts-expect-error virtual esbuild module
import { columns as summaryFields } from "fixture:summary-columns";
// @ts-expect-error virtual esbuild module
import { configure } from "fixture:tax-configuration";

type Options = { module: string; schema?: "unit" | "material" | "summary"; long?: boolean; total?: number };
const summaryColumns: OperationalColumn[] = configure(summaryFields.map(([key, label]: [string, string]) => [key, label, key === "name" ? 80 : 40, key === "name" ? 160 : 80, "text", key === "name" ? "left" : "right"]));
const fullValue = "Ação e vínculo — São João; 👨‍👩‍👧‍👦, e\u0301, 漢字, العربية, 🏳️‍🌈.\n\n".repeat(100) + "Fim com espaços preservados.  ";
let serial = 0;
const root = createRoot(document.getElementById("root")!);

function List({ columns, options, panel = false }: { columns: readonly OperationalColumn[]; options: Options; panel?: boolean }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"ready" | "loading" | "error">("ready");
  const [empty, setEmpty] = useState(false);
  const [actions, setActions] = useState(0);
  const total = empty ? 0 : options.total ?? 21;
  const rows: OperationalRow[] = Array.from({ length: Math.min(20, Math.max(0, total - (page - 1) * 20)) }, (_, i) => {
    const n = (page - 1) * 20 + i + 1;
    return {
      id: String(n), label: `Registro ${n}`,
      values: Object.fromEntries(columns.map(c => [c.key, c.key === "identifier" ? `UC-${String(n).padStart(4, "0")}`
        : c.key === "street" ? options.long && n === 1 ? fullValue : "Rua das Flores, 123"
        : c.key === "owner" ? "João da Conceição" : c.key === "postalCode" ? "99900-000"
        : c.type === "status" ? "Ativa" : c.key === "category" ? "Pública" : `${c.label} ${n}`])),
      actions: <div className={styles.rowActions} data-action-count={actions}>
        <button type="button" className={styles.iconButton} aria-label={`Editar registro ${n}`} onClick={() => setActions(v => v + 1)}><Pencil /></button>
        <button type="button" className={styles.iconButton} aria-label={`Histórico do registro ${n}`} onClick={() => setActions(v => v + 1)}><History /></button>
        {options.schema === "material" && <button type="button" className={styles.iconButton} aria-label={`Excluir registro ${n}`} onClick={() => setActions(v => v + 1)}><Trash2 /></button>}
      </div>,
    };
  });
  return <OperationalListFrame label={panel ? "Painel de teste" : "Base de teste"}
    toolbar={<><input className={styles.searchInput} aria-label="Busca controlada" placeholder="Buscar" />
      <OperationalFilters label="Filtros de teste"><label>Estado<select aria-label="Estado controlado" value={state} onChange={e => setState(e.target.value as typeof state)}><option value="ready">Pronto</option><option value="loading">Carregando</option><option value="error">Erro</option></select></label>
        <button type="button" onClick={() => { setEmpty(v => !v); setPage(1); }}>Alternar vazio</button></OperationalFilters></>}
    actions={<><button type="button" className={styles.iconButton} aria-label="Ação de cabeçalho" onClick={() => setActions(v => v + 1)}><Download /></button>
      {!panel && <OperationalTablePanel title="Painel de teste" triggerLabel="Painel"><List columns={columns} options={options} panel /></OperationalTablePanel>}</>}
    pagination={<OperationalPagination page={page} total={total} pending={state === "loading"} onPageChange={setPage} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId={`browser:${panel ? "panel" : "main"}:${options.schema ?? "unit"}`} state={state} onRetry={() => setState("ready")} />
  </OperationalListFrame>;
}

function Fixture({ options }: { options: Options }) {
  const mod = operationalModules.find(m => m.key === options.module)!;
  const columns = options.schema === "material" ? materialColumns : options.schema === "summary" ? summaryColumns : unitColumns;
  return <OperationalWorkspace title={mod.routes[0]?.title ?? mod.moduleTitle} moduleTitle={mod.moduleTitle} moduleCaption={mod.moduleCaption} moduleIcon={mod.moduleIcon}
    institutionName="Município — massa controlada" userId="browser-fixture" userName="Operador de teste" userRole="Leitura isolada" navigation={mod.navigation} onLogout={async () => {}}>
    <List columns={columns} options={options} />
  </OperationalWorkspace>;
}

Object.assign(window, {
  __operationalTest: {
    modules: operationalModules.map(m => ({ key: m.key, title: m.moduleTitle, links: m.navigation.reduce((n, g) => n + g.items.length, 0), path: m.routes[0]?.pathname })),
    fullValue,
    schemas: { unit: unitColumns, material: materialColumns, summary: summaryColumns },
    show(options: Options) {
      (window as unknown as { __fixturePath: string }).__fixturePath = operationalModules.find(m => m.key === options.module)!.routes[0]?.pathname ?? "/";
      root.render(<Fixture key={++serial} options={options} />);
    },
  },
});
