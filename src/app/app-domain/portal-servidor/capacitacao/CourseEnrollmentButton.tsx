"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enrollMyCourse } from "./actions";

export function CourseEnrollmentButton({ courseId }: { courseId: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function enroll() { setPending(true); setError(""); try { const result = await enrollMyCourse({ courseId }); if (result.error) setError(result.error); else router.refresh(); } catch { setError("Não foi possível registrar a inscrição."); } finally { setPending(false); } }
  return <div className="mt-3 space-y-2"><Button disabled={pending} onClick={enroll}>{pending ? "Inscrevendo…" : "Inscrever-me"}</Button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</div>;
}
