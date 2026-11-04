import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnTrainingEvaluation } from "@/lib/portal-servidor/training-evaluation";
import { TrainingEvaluationForm } from "./TrainingEvaluationForm";

export const dynamic = "force-dynamic";
export default async function TrainingEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p>Acesso funcional indisponível.</p>;
  const { id } = await params;
  const result = await readOwnTrainingEvaluation(access.context, id);
  return <div className="flex min-h-0 flex-1 flex-col gap-3 p-3"><h1 className="text-lg font-semibold">Avaliação do programa — {result.courseName}</h1><Link href="/portal-servidor/capacitacao">Voltar à capacitação</Link>{result.submitted ? <p>Avaliação enviada. As respostas originais foram preservadas.</p> : result.questions.length ? <TrainingEvaluationForm requestId={id} questions={result.questions} /> : <p>O questionário não está disponível na referência atual.</p>}</div>;
}
