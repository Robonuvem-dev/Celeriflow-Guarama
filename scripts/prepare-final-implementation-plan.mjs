import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// Create a separate execution queue. The original checklist/evidence baseline remains intact.
const baselinePath = "docs/poc-p0/CONTROLE_REQUISITOS.json";
const outputPath = "docs/poc-p0/CONTROLE_IMPLANTACAO_FINAL.json";
const contents = readFileSync(baselinePath, "utf8");
const baseline = JSON.parse(contents);
const requirements = baseline.requirements;
if (!Array.isArray(requirements) || requirements.length !== 1052 || new Set(requirements.map(row => row.id)).size !== 1052) throw new Error("A matriz original deve conter exatamente 1.052 IDs distintos.");
const fronts = {
  P1: ["02", "Fundação e classificação analítica"],
  P2: ["03", "Cadeia fiscal-financeira"],
  P3: ["04", "Execução, tesouraria e ciclo anual"],
  P4: ["05", "Produtores setoriais"],
  P5: ["06", "Jornadas internas e elaboração"],
  P6: ["07", "Custos e Controle Interno"],
  P7: ["08", "Motor fiscal, relatórios e publicação"],
  P8: ["11", "Verificação agrupada"],
  P9: ["10", "Intercâmbios por arquivo"],
  P10: ["10", "Conectores oficiais"],
  P11: ["12", "Implantação e aceite individual"],
};
const tasks = requirements.map(row => {
  const phases = row.phases.filter(phase => Object.hasOwn(fronts, phase));
  if (!phases.length) throw new Error(`Requisito sem fase executável: ${row.id}`);
  return {
    id: row.id, checklist: row.checklist, entity: row.entity, requirement: row.requirement,
    subcriteria: row.subcriteria.map(criterion => ({ index: criterion.index, text: criterion.text, implementation: "REVISAO_PENDENTE", verification: "NAO_EXECUTADA", evidence: [] })),
    fronts: phases.map(phase => ({ phase, order: fronts[phase][0], title: fronts[phase][1] })),
    implementation: "REVISAO_PENDENTE", sourceCandidates: [...new Set((row.evidence?.candidates ?? []).map(candidate => candidate.path))],
    review: { producer: null, consumers: [], commands: [], interface: [], persistence: [], reversal: [], scope: [], exactGap: null },
    externalDependencies: [], verification: [], acceptance: "NAO_EXECUTADO",
  };
});
const checklistCounts = Object.fromEntries([...new Set(tasks.map(task => task.checklist))].map(code => [code, tasks.filter(task => task.checklist === code).length]));
const result = { manifest: { generatedAt: new Date().toISOString(), baselinePath, baselineHash: createHash("sha256").update(contents).digest("hex"), planPath: "docs/PLANO_FINAL_IMPLANTACAO_MODULOS_INTEGRADOS.md", requirements: tasks.length, checklistCounts, meaning: "Fila de revisão individual; candidatos estáticos e fases históricas não são evidência de atendimento." }, tasks };
if (process.argv.includes("--write")) {
  if (existsSync(outputPath)) throw new Error("Controle de execução já existe; preserve as revisões e atualize tarefas individualmente.");
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({ mode: process.argv.includes("--write") ? "NEW_EXECUTION_QUEUE" : "READ_ONLY", requirements: tasks.length, checklistCounts, outputPath }, null, 2));
