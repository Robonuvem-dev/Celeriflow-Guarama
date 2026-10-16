"use client";
import { useState } from "react";
import { catLayoutFields, catLayoutCodeOptions, catLayoutProvenance } from "@/lib/sst/accident-layout-policy";
import { RepeatableSstForm } from "./RepeatableSstForm";
import { saveInssCatLayout } from "./layout-actions";
export function CatLayoutForm({ catId, version, fields, medicalFields, clinical, attendances, medicalEvidenceId }: { catId: string; version: number; fields: Record<string,string>; medicalFields: Record<string,string>; clinical: boolean; attendances: { id: string; label: string }[]; medicalEvidenceId: string }) {
  const [medicalId,setMedicalId] = useState(medicalEvidenceId);
  const definitions = catLayoutFields.filter(f => f.kind !== "signature" && (!f.clinical || clinical));
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
    {[...new Set(definitions.map(f => f.section))].map(section => <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2" key={section}><legend className="font-semibold">{section}</legend>{definitions.filter(f => f.section === section).map(field => {
      const options = catLayoutCodeOptions[field.key] || (field.kind === "yn" ? ["S","N"] : null);
      return <label key={field.key}>{field.pdf}{field.required ? " *" : ""}{options ? <select name={`layout:${field.key}`} defaultValue={(field.clinical ? medicalFields : fields)[field.key] || ""} className="block w-full border p-2"><option value="">Não informado</option>{options.map(value => <option key={value} value={value}>{value === "S" ? "Sim" : value === "N" ? "Não" : value}</option>)}</select> : <input name={`layout:${field.key}`} defaultValue={(field.clinical ? medicalFields : fields)[field.key] || ""} type={field.kind === "date" ? "date" : field.kind === "time" ? "time" : "text"} maxLength={3000} placeholder={field.key === "employerDocument" ? "CNPJ 00000000000000" : field.kind === "money" ? "0.00" : ["cbo","cnae","cep","nit"].includes(field.kind) ? "Somente dígitos" : undefined} className="block w-full border p-2" />}</label>;
    })}</fieldset>)}
    {!clinical && <p>O atestado médico só pode ser preenchido por Medicina com acesso clínico e habilitação do usuário.</p>}
  </RepeatableSstForm>;
}
