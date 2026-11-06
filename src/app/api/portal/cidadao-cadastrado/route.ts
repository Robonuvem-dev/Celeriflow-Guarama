import { NextResponse } from "next/server";
import { z } from "zod";
import { NotificationDispatcher } from "@/lib/notifications/notification-dispatcher";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { email, name } = requestSchema.parse(json);

    const baseUrl = process.env.CELERIFLOW_PUBLIC_BASE_URL || "https://guarama.celeriflow.com.br";
    const link = `${baseUrl.replace(/\/$/, "")}/portal/ouvidoria`;

    await NotificationDispatcher.sendOuvidoriaCadastroRealizado({
      to: email,
      nome: name || email.split("@")[0] || "Cidadão",
      link,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API Citizen Registered Notification Error]", error);
    return NextResponse.json({ success: true });
  }
}
