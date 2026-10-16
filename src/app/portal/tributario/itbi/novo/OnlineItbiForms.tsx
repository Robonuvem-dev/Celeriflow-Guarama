import type { z } from "zod";
import type { fiscalFieldSchema } from "@/lib/tributacao/configurable-cadastres";

export default function OnlineItbiForms({ forms }: { forms: { id: string; version: number; name: string; fields: z.infer<typeof fiscalFieldSchema>[] }[] }) {
  const style = "mt-1 w-full rounded border p-2 text-sm";
  return forms.map(form => <fieldset key={`${form.id}:${form.version}`} className="grid gap-3 rounded border p-3 sm:grid-cols-2">
    <legend className="text-sm font-semibold">{form.name}</legend>
    {form.fields.map(field => {
      const name = `additional.${form.id}.${field.key}`;
      return <label key={field.key} className="text-sm">{field.label}{field.required ? " *" : ""}
        {field.type === "BOOLEAN" ? <select name={name} required={field.required} className={style} defaultValue=""><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select>
          : field.type === "LIST" ? <select name={name} required={field.required} className={style} defaultValue=""><option value="">Selecione</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
            : <input name={name} type={field.type === "DATE" ? "date" : field.type === "NUMBER" ? "number" : "text"} step={field.type === "NUMBER" ? "any" : undefined} required={field.required} maxLength={4000} className={style}/>}
      </label>;
    })}
  </fieldset>);
}
