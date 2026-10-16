"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function PanelDisplay({ title, news, calls }: { title: string; news: string; calls: { id: string; message: string; time: string }[] }) {
  const router = useRouter();
  useEffect(() => { const interval = setInterval(() => router.refresh(), 5000); return () => clearInterval(interval); }, [router]);
  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-slate-950 p-6 text-white"><h1 className="text-3xl font-bold">{title}</h1>{calls.map((call, index) => <div key={call.id} className={`rounded border p-5 ${index === 0 ? "bg-emerald-700 text-3xl" : "bg-slate-900 text-xl"}`}><p>{call.message}</p><p className="mt-2 text-sm">{call.time}</p></div>)}<footer className="mt-auto whitespace-pre-wrap rounded bg-slate-900 p-4 text-lg">{news}</footer></div>;
}
