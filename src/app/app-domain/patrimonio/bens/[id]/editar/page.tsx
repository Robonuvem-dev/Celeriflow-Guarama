import { notFound, redirect } from "next/navigation";

export default async function EditarBemPatrimonialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  redirect(`/patrimonio/bens/editar?id=${encodeURIComponent(id)}`);
}
