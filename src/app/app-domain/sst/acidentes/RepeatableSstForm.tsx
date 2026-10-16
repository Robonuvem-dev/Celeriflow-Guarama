"use client";
import { useState, type ComponentProps } from "react";
import { SstForm } from "../SstForm";

/** Retain retry identity on errors; start a fresh form only after confirmed success. */
export function RepeatableSstForm({ action, ...props }: ComponentProps<typeof SstForm>) {
  const [revision, setRevision] = useState(0);
  return <><SstForm key={revision} {...props} action={async form => {
    const result = await action(form);
    if (!result.error) setRevision(current => current + 1);
    return result;
  }} />{revision > 0 && <p role="status" className="text-emerald-700">Registro salvo. Formulário pronto para um novo registro.</p>}</>;
}
