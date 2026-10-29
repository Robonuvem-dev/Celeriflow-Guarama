// Isolated React fixture: real dialogs, device policy and styles; no application routes/DB.
import { useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { OperationalContext } from "@/components/app-ui/operational/OperationalContext";
import type { OperationalDevice } from "@/lib/operational-devices";

type Options = { provider?: OperationalDevice; context?: boolean; standalone?: boolean; short?: boolean };
const root = createRoot(document.getElementById("root")!);
let serial = 0;

function Fixture({ options }: { options: Options }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, FormDataEntryValue>>({});
  const fields = <>
    <button type="button" onClick={() => setExtra(value => !value)}>Alternar contexto dinâmico</button>
    {extra && <p data-dynamic-context style={{ minHeight: 275 }}>Contexto inserido depois da abertura. Deve recalcular as partes sem perder campos.</p>}
    <p data-intro>Contexto completo: consulte todas as partes antes de aplicar. Valores não são retirados do formulário.</p>
    {Array.from({ length: options.short ? 2 : 80 }, (_, index) => {
      const name = `field${String(index + 1).padStart(2, "0")}`;
      return <label key={name} data-test-control-block style={{ display: "block", marginBottom: 13, lineHeight: "21px" }}>
        Campo {index + 1} {index % 9 === 0 && "— título extenso para testar a quebra e os limites entre partes"}
        <input name={name} aria-label={`Campo ${index + 1}`} required
          {...(index % 2 ? { defaultValue: `original-${index + 1}` } : { value: values[name] ?? `original-${index + 1}`, onChange: (event: ChangeEvent<HTMLInputElement>) => setValues(previous => ({ ...previous, [name]: event.target.value })) })}
          style={{ display: "block", width: "100%", border: "1px solid #64748b", padding: 4, height: index % 11 === 0 ? 73 : 29 }} />
      </label>;
    })}
    <button type="submit">Aplicar todos os campos</button>
  </>;
  const context = <>
    <button type="button" onClick={() => setExpanded(value => !value)}>Alterar geometria</button>
    <section data-long-context style={{ fontSize: expanded ? 20 : 14, lineHeight: expanded ? "30px" : "22px" }}>
      {Array.from({ length: 36 }, (_, index) => <p key={index} data-context-paragraph style={{ margin: "0 0 19px" }}>
        Bloco {index + 1}: {"Contexto integral para leitura explícita por partes, com acentos, 👨‍👩‍👧‍👦 e linhas que não podem desaparecer. ".repeat(7)}
      </p>)}
      <a href="#fim" onClick={event => event.preventDefault()}>Último controle do contexto</a>
    </section>
  </>;
  const content = options.context ? context : <form data-test-form onSubmit={event => {
    event.preventDefault(); event.stopPropagation();
    setSubmitted(Object.fromEntries(new FormData(event.currentTarget)));
  }}>{fields}</form>;
  const filters = <OperationalFilters label="Filtros extensos" activeCount={2}>{content}</OperationalFilters>;
  const surface = options.standalone ? <form data-test-form style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 32px)" }} onSubmit={event => {
    event.preventDefault(); event.stopPropagation(); setSubmitted(Object.fromEntries(new FormData(event.currentTarget)));
  }}><OperationalPagedContent device={options.provider ?? "desktop"} label="Formulário aninhado" footer={<button type="submit">Enviar pelo rodapé</button>}>{fields}</OperationalPagedContent></form> : filters;
  return <div style={{ padding: 16 }} onClick={() => { const node = document.querySelector("[data-outer-clicks]"); if (node) node.textContent = String(Number(node.textContent) + 1); }}>
    {options.standalone ? surface : <form onSubmit={event => { event.preventDefault(); document.querySelector("[data-outer-submits]")!.textContent = "1"; }}>
      {options.provider ? <OperationalContext.Provider value={{ userId: "test", device: options.provider, actionsHost: null }}>{surface}</OperationalContext.Provider> : surface}
    </form>}
    <output hidden data-submission>{JSON.stringify(submitted)}</output>
    <output hidden data-outer-submits>0</output><output hidden data-outer-clicks>0</output>
  </div>;
}

Object.assign(window, { __filtersTest: { show(options: Options = {}) { root.render(<Fixture key={++serial} options={options} />); } } });
