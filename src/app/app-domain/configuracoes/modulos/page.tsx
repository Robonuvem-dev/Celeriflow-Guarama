import React from "react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ModulosClient from "./ModulosClient";
import { db } from "@/db/client";
import { listSystemModules } from "@/db/repositories/platform/system-administration";

export const dynamic = "force-dynamic";

export default async function ModulosPage() {
  const context = await getTenantContextForModule("CONFIGURACOES");
  
  const modulos = await listSystemModules(context.database ?? db);

  return <ModulosClient initialModulos={modulos.map(modulo => modulo.codigo === "OBRAS" ? { ...modulo, nome: "Obras e Construção Civil" } : modulo)} />;
}
