"use client";
import { useState } from "react";
import { catLayoutFields, catLayoutCodeOptions, catLayoutProvenance } from "@/lib/sst/accident-layout-policy";
import { RepeatableSstForm } from "./RepeatableSstForm";
import { saveInssCatLayout } from "./layout-actions";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
export function CatLayoutForm({ catId, version, fields, medicalFields, clinical, attendances, medicalEvidenceId }: { catId: string; version: number; fields: Record<string,string>; medicalFields: Record<string,string>; clinical: boolean; attendances: { id: string; label: string }[]; medicalEvidenceId: string }) {
  const [medicalId,setMedicalId] = useState(medicalEvidenceId);
  const definitions = catLayoutFields.filter(f => f.kind !== "signature" && (!f.clinical || clinical));
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(definitions.map(field => [field.key, (field.clinical ? medicalFields : fields)[field.key] || ""])));
  const [selectedKey, setSelectedKey] = useState(definitions[0]?.key || "");
  const field = definitions.find(item => item.key === selectedKey) || definitions[0];
  const options = field ? catLayoutCodeOptions[field.key] || (field.kind === "yn" ? ["S", "N"] : null) : null;
  return <RepeatableSstForm action={async form => {
    const administrative: Record<string,string> = {}, medical: Record<string,string> = {};
    for (const field of definitions) (field.clinical ? medical : administrative)[field.key] = String(form.get(`layout:${field.key}`) || "");
    form.set("fields",JSON.stringify(administrative)); form.set("medicalFields",JSON.stringify(medicalId ? medical : {}));
    return saveInssCatLayout(form);
  }} label="Salvar revisão do formulário INSS"><input type="hidden" name="catId" value={catId} /><input type="hidden" name="expectedVersion" value={version} />
    <p>Formulário original INSS, versão {catLayoutProvenance.version}. Campos não apurados ficam em branco na minuta. Identificação e dados da ocorrência são derivados do cadastro canônico. Assinaturas são colhidas no documento; salvar não transmite a CAT.</p>
    <label>Preenchimento<select name="mode" className="block border p-2"><option value="DRAFT">Minuta (permite dados incompletos)</option><option value="COMPLETE">Dados completos (valida campos obrigatórios e atendimento)</option></select></label>
    <label>Referência da CAT original (reabertura/óbito)<input name="originalReceipt" className="block w-full border p-2" /></label>
    {clinical && <label>Atendimento médico vinculado<select name="medicalEvidenceId" value={medicalId} onChange={e => setMedicalId(e.target.value)} className="block w-full border p-2"><option value="">Sem atestado médico — minuta</option>{attendances.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>}
    {definitions.map(item => <input key={item.key} type="hidden" name={`layout:${item.key}`} value={draft[item.key] || ""} />)}
    <SstTablePanel title="Campos do formulário INSS" preferenceId="sst-cat-layout-edicao" description="A minuta e o modo completo mantêm a validação do domínio. Todos os campos autorizados são enviados, inclusive de outras páginas."
      columns={[sstColumn("section", "Seção", 180, 100), sstColumn("label", "Campo INSS", 300, 160), sstColumn("kind", "Tipo", 100, 75), sstColumn("required", "Obrigatório", 110, 85), sstColumn("clinical", "Clínico", 90, 70), sstColumn("value", "Valor", 300, 140), sstColumn("actions", "Editar", 75, 65, "actions")]}
      rows={definitions.map(item => ({ id: item.key, label: item.pdf, values: { section: item.section, label: item.pdf, kind: item.kind, required: item.required ? "Sim" : "Não", clinical: item.clinical ? "Sim" : "Não", value: draft[item.key] || "" }, actions: <button type="button" onClick={() => setSelectedKey(item.key)}>Editar</button> }))} />
    {field && <label>{field.section} · {field.pdf}{field.required ? " *" : ""}{options ? <select value={draft[field.key] || ""} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} className="block w-full border p-2"><option value="">Não informado</option>{options.map(value => <option key={value} value={value}>{value === "S" ? "Sim" : value === "N" ? "Não" : value}</option>)}</select> : <input value={draft[field.key] || ""} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} type={field.kind === "date" ? "date" : field.kind === "time" ? "time" : "text"} maxLength={3000} placeholder={field.key === "employerDocument" ? "CNPJ 00000000000000" : field.kind === "money" ? "0.00" : ["cbo", "cnae", "cep", "nit"].includes(field.kind) ? "Somente dígitos" : undefined} className="block w-full border p-2" />}</label>}
    {!clinical && <p>O atestado médico só pode ser preenchido por Medicina com acesso clínico e habilitação do usuário.</p>}
  </RepeatableSstForm>;
}
