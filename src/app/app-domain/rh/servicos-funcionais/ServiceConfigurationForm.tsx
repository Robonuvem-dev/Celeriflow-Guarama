"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFunctionalServiceAction } from "./actions";

type ServiceValues = { id: string; ruleSetId: string; code: string; name: string; description: string; requirements: string; steps: string; deadline: string; isActive: boolean; configuration: unknown };
export function ServiceConfigurationForm({ values, ruleSets }: { values?: ServiceValues; ruleSets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try {
      const result = await saveFunctionalServiceAction({ id: values?.id, ruleSetId: String(data.get("ruleSetId")), code: String(data.get("code")), name: String(data.get("name")), description: String(data.get("description")), requirements: String(data.get("requirements") || ""), steps: String(data.get("steps") || ""), deadline: String(data.get("deadline") || ""), isActive: data.get("isActive") === "on", configuration: JSON.parse(String(data.get("configuration"))) });
      if (result.error) { setError(result.error); return; }
      router.push("/rh/servicos-funcionais"); router.refresh();
    } catch (failure) { setError(failure instanceof SyntaxError ? "Confira a estrutura JSON da configuração funcional." : "Não foi possível salvar o serviço."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-3 rounded border border-slate-300 bg-white p-4 text-sm"><fieldset disabled={pending} className="grid gap-3 md:grid-cols-2">
    <div className="grid gap-1"><Label htmlFor="service-ruleset">Configuração RH</Label><select id="service-ruleset" name="ruleSetId" required defaultValue={values?.ruleSetId} className="h-9 rounded border px-2">{ruleSets.map(rule => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select></div>
    <div className="grid gap-1"><Label htmlFor="service-code">Código estável</Label><Input id="service-code" name="code" required defaultValue={values?.code || "PORTAL_SERVICO_"} readOnly={Boolean(values)} pattern="PORTAL_SERVICO_[A-Z0-9_]{1,48}" /></div>
    <div className="grid gap-1 md:col-span-2"><Label htmlFor="service-name">Nome do serviço</Label><Input id="service-name" name="name" required minLength={3} maxLength={160} defaultValue={values?.name} /></div>
    {[{ name: "description", label: "Descrição", required: true }, { name: "requirements", label: "Requisitos" }, { name: "steps", label: "Etapas de atendimento" }].map(field => <div key={field.name} className="grid gap-1 md:col-span-2"><Label htmlFor={`service-${field.name}`}>{field.label}</Label><textarea id={`service-${field.name}`} name={field.name} required={field.required} maxLength={4000} rows={3} defaultValue={values?.[field.name as "description" | "requirements" | "steps"]} className="rounded border border-slate-300 p-2" /></div>)}
    <div className="grid gap-1"><Label htmlFor="service-deadline">Orientação de prazo</Label><Input id="service-deadline" name="deadline" maxLength={500} defaultValue={values?.deadline} /></div><label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={values?.isActive} />Publicar o serviço</label>
    <div className="grid gap-2 md:col-span-2"><Label htmlFor="service-configuration">Formulário, público e vinculação processual</Label><p className="text-xs text-slate-500">Informe UG responsável pela análise, grupo, tipo/assunto, operação, público, campos, documentos e termo. Utilize IDs dos cadastros administrativos. Lista de público vazia atende a todos os servidores ativos.</p><textarea id="service-configuration" name="configuration" required rows={16} className="rounded border border-slate-300 p-2 font-mono text-xs" defaultValue={JSON.stringify(values?.configuration || { budgetUnitId: "", group: "Recursos Humanos", processTypeId: "", subjectId: "", operation: "SOLICITACAO_RH", employeeIds: [], fields: [], requiredDocuments: [], acceptance: "" }, null, 2)} /></div>
  </fieldset>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button disabled={pending}>{pending ? "Salvando…" : "Salvar serviço"}</Button></form>;
}
