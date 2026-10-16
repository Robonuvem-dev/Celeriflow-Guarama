import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { machineFieldsSchema } from "@/lib/frotas/control-policy";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await getTenantContextForModule("FROTAS"), { id } = await params; const item = await context.prisma.fleetMachineType.findFirst({ where: { id, active: true }, select: { fields: true, name: true } }); if (!item) return Response.json({ error: "Tipo não disponível." }, { status: 404 }); return Response.json({ name: item.name, fields: machineFieldsSchema.parse(item.fields) }); }
  catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível consultar o tipo de máquina." }, { status: error instanceof AccessError ? error.status : 500 }); }
}
