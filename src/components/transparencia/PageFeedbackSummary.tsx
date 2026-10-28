import { db } from "@/db/client";
import { readPageFeedbackRatings } from "@/db/repositories/platform/transparency-statistics";
import { pageFeedbackRetentionDays } from "@/lib/transparencia/page-feedback";

export async function PageFeedbackSummary({ year }: { year: number }) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - pageFeedbackRetentionDays);
  const periodStart = new Date(Date.UTC(year, 0, 1));
  const ratings = await readPageFeedbackRatings(db, periodStart > cutoff ? periodStart : cutoff, new Date(Date.UTC(year + 1, 0, 1)));
  const total = ratings.reduce((sum, row) => sum + row._count, 0);
  const mean = total ? ratings.reduce((sum, row) => sum + row.rating * row._count, 0) / total : null;
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Satisfação com as páginas do portal</h2><p className="mt-2 text-sm">{total} avaliação(ões) no exercício {year} dentro do período de retenção. Média: {mean === null ? "Sem avaliações" : `${mean.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} / 5`}.</p><dl className="mt-4 flex flex-wrap gap-5">{[1, 2, 3, 4, 5].map(rating => <div key={rating}><dt className="text-sm">Nota {rating}</dt><dd className="font-bold">{ratings.find(row => row.rating === rating)?._count || 0}</dd></div>)}</dl><p className="mt-3 text-sm leading-6 text-slate-600">Avaliações de usabilidade, independentes do atendimento e-SIC/Ouvidoria. Comentários individuais não são divulgados. Retenção de até 365 dias.</p></section>;
}
