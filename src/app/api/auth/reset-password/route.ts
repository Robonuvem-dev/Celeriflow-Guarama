import { NextResponse } from "next/server";
import { z } from "zod";
import { NotificationDispatcher } from "@/lib/notifications/notification-dispatcher";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { email } = requestSchema.parse(json);

    const baseUrl = process.env.CELERIFLOW_PUBLIC_BASE_URL || "https://guarama.celeriflow.com.br";
    const link = `${baseUrl.replace(/\/$/, "")}/login`;

    await NotificationDispatcher.sendBancosPasswordReset({
      to: email,
      nome: email.split("@")[0] || "Usuário",
      link,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API Reset Password Error]", error);
    return NextResponse.json({ success: true }); // Always return success for security
  }
}
