import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { readDisplayImage } from "@/lib/bi/display-service";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("ADMINISTRACAO");
    const image = await readDisplayImage((await params).id, context);
    if (!image) return new Response(null, { status: 404 });
    return new Response(Buffer.from(image.split(",")[1], "base64"), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" } });
  } catch { return new Response(null, { status: 403 }); }
}
