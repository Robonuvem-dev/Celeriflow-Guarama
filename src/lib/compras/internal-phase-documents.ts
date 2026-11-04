import Decimal from "decimal.js";

export const internalPhaseDocumentTypes = ["PCA", "ETP", "TR"] as const;
export type InternalPhaseDocumentType = (typeof internalPhaseDocumentTypes)[number];

export const internalPhaseDocumentStatuses = ["RASCUNHO", "EM_ANALISE", "DEVOLVIDO", "APROVADO"] as const;
export type InternalPhaseDocumentStatus = (typeof internalPhaseDocumentStatuses)[number];

export const aiSuggestionDecisions = ["ACEITA", "EDITADA", "RECUSADA"] as const;
export type AiSuggestionDecision = (typeof aiSuggestionDecisions)[number];

export const aiSuggestionTypes = [
  "REDACAO_PARAMETRIZADA",
  "REAPROVEITAMENTO_DADOS",
  "CONSISTENCIA_NORMATIVA",
] as const;
export type AiSuggestionType = (typeof aiSuggestionTypes)[number];

export type PcaDocumentPayload = {
  exerciseYear: number;
  consolidatedJustification: string;
  ppaAlignmentSummary: string;
  collectivePurchaseAnalysis: string;
  budgetaryCompatibilitySummary: string;
  governanceConclusion: string;
};

export type EtpDocumentPayload = {
  problemDescription: string;
  pcaPpaAlignment: string;
  contractingRequirements: string;
  quantityEstimateAndMemory: string;
  marketAlternativesAnalysis: string;
  estimatedTotalValueBrl: string;
  solutionDescription: string;
  parcelingJustification: string;
  expectedResults: string;
  priorAdministrationMeasures: string;
  correlatedContractions: string;
  environmentalImpactsAndRisks: string;
  viabilityConclusion: "VIAVEL" | "VIAVEL_COM_RESSALVAS" | "INVIAVEL";
  viabilityJustification: string;
};

export type TrDocumentPayload = {
  objectDefinition: string;
  legalAndTechnicalFoundation: string;
  lifecycleSolutionSummary: string;
  contractingRequirements: string;
  executionModel: string;
  managementAndSupervisionModel: string;
  measurementAndPaymentCriteria: string;
  supplierSelectionCriteria: string;
  estimatedValueAndPricing: string;
  budgetAdequacy: string;
  contractorAndAdministrationObligations: string;
};

export type CoherenceReport = {
  coherent: boolean;
  warnings: string[];
  checkedAt: string;
};

export class InternalPhaseDocumentError extends Error {}

function requireText(value: unknown, label: string, maxLength = 4000): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new InternalPhaseDocumentError(`Preencha o campo obrigatório: ${label}.`);
  }
  if (normalized.length > maxLength) {
    throw new InternalPhaseDocumentError(`O campo "${label}" deve ter no máximo ${maxLength} caracteres.`);
  }
  return normalized;
}

export function normalizePcaPayload(input: Record<string, unknown>): PcaDocumentPayload {
  const yearNum = Number(input.exerciseYear);
  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
    throw new InternalPhaseDocumentError("Informe um exercício válido para o documento do PCA.");
  }
  return {
    exerciseYear: yearNum,
    consolidatedJustification: requireText(input.consolidatedJustification, "Justificativa consolidada da demanda no PCA"),
    ppaAlignmentSummary: requireText(input.ppaAlignmentSummary, "Alinhamento estratégico ao PPA e diretrizes"),
    collectivePurchaseAnalysis: requireText(input.collectivePurchaseAnalysis, "Análise de compras coletivas e ganho de escala"),
    budgetaryCompatibilitySummary: requireText(input.budgetaryCompatibilitySummary, "Compatibilidade orçamentária preliminar"),
    governanceConclusion: requireText(input.governanceConclusion, "Conclusão de governança para inclusão no PCA"),
  };
}

export function normalizeEtpPayload(input: Record<string, unknown>): EtpDocumentPayload {
  const rawVal = String(input.estimatedTotalValueBrl ?? "").trim().replace(",", ".");
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(rawVal) || Number(rawVal) <= 0) {
    throw new InternalPhaseDocumentError("Informe uma estimativa de valor válida (maior que zero) no ETP.");
  }
  const conclusion = String(input.viabilityConclusion ?? "VIAVEL").trim();
  if (conclusion !== "VIAVEL" && conclusion !== "VIAVEL_COM_RESSALVAS" && conclusion !== "INVIAVEL") {
    throw new InternalPhaseDocumentError("Posicionamento conclusivo de viabilidade do ETP inválido.");
  }
  return {
    problemDescription: requireText(input.problemDescription, "Descrição da necessidade da contratação (art. 18, § 1º, I)"),
    pcaPpaAlignment: requireText(input.pcaPpaAlignment, "Previsão no PCA e alinhamento ao planejamento (art. 18, § 1º, II)"),
    contractingRequirements: requireText(input.contractingRequirements, "Requisitos da contratação (art. 18, § 1º, III)"),
    quantityEstimateAndMemory: requireText(input.quantityEstimateAndMemory, "Estimativa das quantidades e memória de cálculo (art. 18, § 1º, IV)"),
    marketAlternativesAnalysis: requireText(input.marketAlternativesAnalysis, "Levantamento de mercado e análise de alternativas (art. 18, § 1º, V)"),
    estimatedTotalValueBrl: new Decimal(rawVal).toFixed(2),
    solutionDescription: requireText(input.solutionDescription, "Descrição da solução como um todo (art. 18, § 1º, VII)"),
    parcelingJustification: requireText(input.parcelingJustification, "Justificativas para o parcelamento ou não da contratação (art. 18, § 1º, VIII)"),
    expectedResults: requireText(input.expectedResults, "Demonstrativo dos resultados pretendidos (art. 18, § 1º, IX)"),
    priorAdministrationMeasures: requireText(input.priorAdministrationMeasures, "Providências prévias da Administração (art. 18, § 1º, X)"),
    correlatedContractions: requireText(input.correlatedContractions, "Contratações correlatas e/ou interdependentes (art. 18, § 1º, XI)"),
    environmentalImpactsAndRisks: requireText(input.environmentalImpactsAndRisks, "Impactos ambientais, riscos e medidas mitigadoras (art. 18, § 1º, XII)"),
    viabilityConclusion: conclusion,
    viabilityJustification: requireText(input.viabilityJustification, "Posicionamento conclusivo sobre a adequação da contratação (art. 18, § 1º, XIII)"),
  };
}

export function normalizeTrPayload(input: Record<string, unknown>): TrDocumentPayload {
  return {
    objectDefinition: requireText(input.objectDefinition, "Definição do objeto, quantitativos e prazo (art. 6º, XXIII, 'a')"),
    legalAndTechnicalFoundation: requireText(input.legalAndTechnicalFoundation, "Fundamentação da contratação e referência ao ETP/DFD (art. 6º, XXIII, 'b')"),
    lifecycleSolutionSummary: requireText(input.lifecycleSolutionSummary, "Descrição da solução considerando o ciclo de vida (art. 6º, XXIII, 'c')"),
    contractingRequirements: requireText(input.contractingRequirements, "Requisitos da contratação (art. 6º, XXIII, 'd')"),
    executionModel: requireText(input.executionModel, "Modelo de execução do objeto (art. 6º, XXIII, 'e')"),
    managementAndSupervisionModel: requireText(input.managementAndSupervisionModel, "Modelo de gestão e fiscalização do contrato (art. 6º, XXIII, 'f')"),
    measurementAndPaymentCriteria: requireText(input.measurementAndPaymentCriteria, "Critérios de medição e de pagamento (art. 6º, XXIII, 'g')"),
    supplierSelectionCriteria: requireText(input.supplierSelectionCriteria, "Forma e critérios de seleção do fornecedor (art. 6º, XXIII, 'h')"),
    estimatedValueAndPricing: requireText(input.estimatedValueAndPricing, "Estimativas do valor da contratação e preços referenciais (art. 6º, XXIII, 'i')"),
    budgetAdequacy: requireText(input.budgetAdequacy, "Adequação orçamentária e compatibilidade com o PCA (art. 6º, XXIII, 'j')"),
    contractorAndAdministrationObligations: requireText(input.contractorAndAdministrationObligations, "Obrigações da contratada, do contratante e regime de garantias"),
  };
}

export type PlanningUpstreamContext = {
  planningId: string;
  itemName: string;
  description: string | null;
  unit: string;
  quantity: number;
  expectedPeriodStartIso: string;
  expectedPeriodEndIso: string;
  estimatedValueDecimal: string;
  status: string;
  objectiveCodeAndDescription: string | null;
  originRequest: {
    id: string;
    number: string;
    object: string;
    justification: string;
    status: string;
  } | null;
  latestDfdVersion: {
    id: string;
    version: number;
    object: string;
    justification: string;
    secretariat: string | null;
    department: string | null;
    estimatedValue: number | null;
  } | null;
  latestEtpVersion: {
    id: string;
    version: number;
    status: InternalPhaseDocumentStatus;
    payload: EtpDocumentPayload;
  } | null;
};

export function buildInheritedPcaPayload(ctx: PlanningUpstreamContext): PcaDocumentPayload {
  const year = Number(ctx.expectedPeriodStartIso.slice(0, 4)) || new Date().getUTCFullYear();
  const originText = ctx.latestDfdVersion
    ? `Demanda originada no DFD v${ctx.latestDfdVersion.version} (Solicitação nº ${ctx.originRequest?.number ?? "-"}): ${ctx.latestDfdVersion.justification}`
    : ctx.originRequest
      ? `Demanda vinculada à Solicitação nº ${ctx.originRequest.number}: ${ctx.originRequest.justification}`
      : `Demanda de planejamento para ${ctx.itemName} (${ctx.quantity} ${ctx.unit}).`;

  return {
    exerciseYear: year,
    consolidatedJustification: `${originText} Período previsto: ${ctx.expectedPeriodStartIso} a ${ctx.expectedPeriodEndIso}.`,
    ppaAlignmentSummary: ctx.objectiveCodeAndDescription
      ? `Alinhado ao Objetivo Institucional do PPA: ${ctx.objectiveCodeAndDescription}.`
      : "Vinculação ao PPA pendente de detalhamento ou enquadrada em manutenção administrativa ordinária.",
    collectivePurchaseAnalysis: `Item "${ctx.itemName}" (${ctx.quantity} ${ctx.unit}) apto à consolidação no PCA ${year} para avaliação de compra compartilhada entre unidades administrativas.`,
    budgetaryCompatibilitySummary: `Valor estimado em R$ ${new Decimal(ctx.estimatedValueDecimal).toFixed(2)}, compatível com a programação orçamentária do exercício ${year}.`,
    governanceConclusion: `Favorável à consolidação da necessidade "${ctx.itemName}" no Plano de Contratações Anual (${year}), nos termos do art. 12, VII, da Lei nº 14.133/2021.`,
  };
}

export function buildInheritedEtpPayload(ctx: PlanningUpstreamContext): EtpDocumentPayload {
  const year = ctx.expectedPeriodStartIso.slice(0, 4);
  const dfdRef = ctx.latestDfdVersion
    ? `DFD v${ctx.latestDfdVersion.version} (Solicitação nº ${ctx.originRequest?.number ?? "-"})`
    : ctx.originRequest
      ? `Solicitação nº ${ctx.originRequest.number}`
      : `Planejamento ID ${ctx.planningId}`;
  const problemBase = ctx.latestDfdVersion?.justification
    ?? ctx.originRequest?.justification
    ?? ctx.description
    ?? `Atendimento da necessidade institucional referente a ${ctx.itemName}.`;

  return {
    problemDescription: `Conforme ${dfdRef}, identifica-se a necessidade de ${ctx.itemName}: ${problemBase}`,
    pcaPpaAlignment: ctx.objectiveCodeAndDescription
      ? `Demanda prevista no PCA ${year} e vinculada ao Objetivo do PPA ${ctx.objectiveCodeAndDescription} (art. 18, § 1º, II, da Lei nº 14.133/2021).`
      : `Demanda registrada no planejamento do exercício ${year} para consolidação no PCA municipal.`,
    contractingRequirements: `Fornecimento/execução de ${ctx.itemName} (${ctx.description ?? "conforme especificações técnicas do catálogo"}), em estrita observância às normas técnicas vigentes, padrões de qualidade, segurança e critérios de sustentabilidade ambiental.`,
    quantityEstimateAndMemory: `Quantidade estimada de ${ctx.quantity} ${ctx.unit} para o período de ${ctx.expectedPeriodStartIso} a ${ctx.expectedPeriodEndIso}, apurada a partir do histórico de consumo e da programação da unidade requisitante (${ctx.latestDfdVersion?.department ?? "Administração"}).`,
    marketAlternativesAnalysis: `Foram avaliadas as alternativas de mercado (aquisição direta, registro de preços compartilhado, locação/prestação de serviço ou execução indireta), identificando-se a contratação planejada como a opção de melhor relação custo-benefício para a Administração.`,
    estimatedTotalValueBrl: new Decimal(ctx.estimatedValueDecimal).toFixed(2),
    solutionDescription: `Solução integral contemplando o fornecimento/execução de ${ctx.quantity} ${ctx.unit} de ${ctx.itemName}, incluindo suporte, garantia legal e conformidade durante todo o ciclo de vida do objeto.`,
    parcelingJustification: `Avaliado o art. 40, § 2º e § 3º, da Lei nº 14.133/2021, a estruturação por item/lote preserva a economia de escala, amplia a competitividade e evita perda de integridade técnica.`,
    expectedResults: `Garantir a continuidade do serviço público, eficiência operacional, economicidade e melhor aproveitamento dos recursos humanos, materiais e financeiros disponíveis.`,
    priorAdministrationMeasures: `Designação de equipe de fiscalização e gestão contratual, confirmação de disponibilidade física/logística para recebimento e verificação das dotações orçamentárias antes da publicação do edital/instrumento convocatório.`,
    correlatedContractions: `Vinculada ao planejamento ${ctx.planningId} e à origem ${dfdRef}, sem impedimento por interdependência externa não equacionada.`,
    environmentalImpactsAndRisks: `Riscos de atraso logístico, variação de preços e descumprimento contratual mitigados por cláusulas de nível de serviço, exigência de logística reversa/descarte adequado quando aplicável e acompanhamento periódico pela fiscalização.`,
    viabilityConclusion: "VIAVEL",
    viabilityJustification: `Diante dos elementos técnicos, econômicos e normativos analisados nos termos do art. 18, § 1º, da Lei nº 14.133/2021, declara-se VIÁVEL e tecnicamente adequada a contratação de ${ctx.itemName}.`,
  };
}

export function buildInheritedTrPayload(ctx: PlanningUpstreamContext): TrDocumentPayload {
  const etp = ctx.latestEtpVersion?.payload;
  const dfdRef = ctx.latestDfdVersion
    ? `DFD v${ctx.latestDfdVersion.version}`
    : ctx.originRequest
      ? `Solicitação nº ${ctx.originRequest.number}`
      : `Planejamento ${ctx.planningId}`;
  const etpRef = ctx.latestEtpVersion ? `ETP v${ctx.latestEtpVersion.version}` : "ETP preliminar";
  const valueFormatted = etp?.estimatedTotalValueBrl ?? new Decimal(ctx.estimatedValueDecimal).toFixed(2);

  return {
    objectDefinition: `Contratação/aquisição de ${ctx.itemName}${ctx.description ? ` (${ctx.description})` : ""}, na quantidade de ${ctx.quantity} ${ctx.unit}, com execução prevista de ${ctx.expectedPeriodStartIso} a ${ctx.expectedPeriodEndIso}.`,
    legalAndTechnicalFoundation: `Fundamentada no ${dfdRef} e no ${etpRef}, nos termos do art. 6º, XXIII, e art. 40, § 1º, da Lei nº 14.133/2021. Necessidade: ${etp?.problemDescription ?? ctx.originRequest?.justification ?? ctx.itemName}`,
    lifecycleSolutionSummary: etp?.solutionDescription
      ?? `Solução completa para ${ctx.itemName} (${ctx.quantity} ${ctx.unit}), abrangendo entrega, garantia e suporte durante o ciclo de vida contratual.`,
    contractingRequirements: etp?.contractingRequirements
      ?? `Atendimento integral às especificações técnicas de ${ctx.itemName}, normas ABNT/INMETRO aplicáveis e requisitos de sustentabilidade socioambiental.`,
    executionModel: `Execução/entrega de ${ctx.quantity} ${ctx.unit} no período de ${ctx.expectedPeriodStartIso} a ${ctx.expectedPeriodEndIso}, mediante ordem de fornecimento/serviço emitida pela unidade gestora (${ctx.latestDfdVersion?.department ?? "Unidade Requisitante"}).`,
    managementAndSupervisionModel: `A execução será acompanhada e fiscalizada por fiscal técnico e gestor de contrato formalmente designados nos termos do art. 117 da Lei nº 14.133/2021, com registro próprio de ocorrências e ateste documental.`,
    measurementAndPaymentCriteria: `Recebimento provisório para verificação de conformidade e recebimento definitivo após ateste quantitativo e qualitativo, com pagamento em até 30 (trinta) dias após a liquidação regular da nota fiscal.`,
    supplierSelectionCriteria: `Seleção de fornecedor mediante processo competitivo nos termos da Lei nº 14.133/2021, adotando-se critério de julgamento de menor preço / maior vantajosidade e habilitação jurídica, fiscal, trabalhista, econômico-financeira e técnica pertinentes.`,
    estimatedValueAndPricing: `Valor total estimado em R$ ${valueFormatted} (${ctx.quantity} ${ctx.unit}), apurado conforme memória de cálculo e pesquisa de preços do ${etpRef}.`,
    budgetAdequacy: `Despesa compatível com o Plano de Contratações Anual (${ctx.expectedPeriodStartIso.slice(0, 4)})${ctx.objectiveCodeAndDescription ? `, vinculada ao Objetivo PPA ${ctx.objectiveCodeAndDescription}` : ""} e às dotações orçamentárias consignadas na solicitação de origem.`,
    contractorAndAdministrationObligations: `A Contratada obriga-se a cumprir fielmente os prazos, especificações, garantias e encargos trabalhistas/fiscais; a Administração obriga-se a proporcionar as condições de recebimento, fiscalizar a execução e efetuar o pagamento no prazo pactuado.`,
  };
}

export function verifyInternalPhaseCoherence(params: {
  ctx: PlanningUpstreamContext;
  documentType: InternalPhaseDocumentType;
  payload: PcaDocumentPayload | EtpDocumentPayload | TrDocumentPayload;
  sourceDfdVersionId?: string | null;
  sourceEtpVersionId?: string | null;
  now?: Date;
}): CoherenceReport {
  const warnings: string[] = [];
  const { ctx, documentType, payload } = params;

  if (!ctx.originRequest) {
    warnings.push("Planejamento sem solicitação de compra de origem vinculada; recomenda-se vincular a solicitação para rastreabilidade completa desde a demanda inicial.");
  } else if (!ctx.latestDfdVersion) {
    warnings.push(`A solicitação de origem nº ${ctx.originRequest.number} ainda não possui versão formalizada de DFD.`);
  } else if (params.sourceDfdVersionId && params.sourceDfdVersionId !== ctx.latestDfdVersion.id) {
    warnings.push(`O documento referencia uma versão anterior do DFD; a versão atual do DFD é a v${ctx.latestDfdVersion.version}.`);
  }

  if (!ctx.objectiveCodeAndDescription) {
    warnings.push("Planejamento sem Objetivo Institucional do PPA vinculado.");
  }

  if (documentType === "ETP") {
    const etp = payload as EtpDocumentPayload;
    const planningVal = new Decimal(ctx.estimatedValueDecimal).toDecimalPlaces(2);
    const etpVal = new Decimal(etp.estimatedTotalValueBrl).toDecimalPlaces(2);
    if (!planningVal.eq(etpVal)) {
      warnings.push(`Divergência de valor estimado: o Planejamento prevê R$ ${planningVal.toFixed(2)}, enquanto o ETP estima R$ ${etpVal.toFixed(2)}.`);
    }
    if (etp.viabilityConclusion === "INVIAVEL") {
      warnings.push("O ETP concluiu pela INVIABILIDADE da contratação; a fase interna não deve prosseguir para aprovação de TR sem revisão.");
    }
  }

  if (documentType === "TR") {
    const tr = payload as TrDocumentPayload;
    if (!ctx.latestEtpVersion) {
      warnings.push("Termo de Referência elaborado sem Estudo Técnico Preliminar (ETP) registrado para este planejamento.");
    } else {
      if (params.sourceEtpVersionId && params.sourceEtpVersionId !== ctx.latestEtpVersion.id) {
        warnings.push(`O TR referencia uma versão desatualizada do ETP; a versão mais recente do ETP é a v${ctx.latestEtpVersion.version}.`);
      }
      if (ctx.latestEtpVersion.payload.viabilityConclusion === "INVIAVEL") {
        warnings.push("Inconsistência impeditiva: o ETP vinculado concluiu pela inviabilidade da contratação.");
      }
      if (ctx.latestEtpVersion.status !== "APROVADO") {
        warnings.push(`O ETP v${ctx.latestEtpVersion.version} ainda está com status "${ctx.latestEtpVersion.status}" (recomenda-se aprovar o ETP antes da aprovação final do TR).`);
      }
    }
    if (!tr.objectDefinition.toLowerCase().includes(ctx.itemName.toLowerCase().slice(0, 12))) {
      warnings.push(`A definição do objeto no TR pode divergir do item planejado ("${ctx.itemName}"). Verifique a consistência textual.`);
    }
  }

  return {
    coherent: warnings.length === 0,
    warnings,
    checkedAt: (params.now ?? new Date()).toISOString(),
  };
}

export type AssistiveSuggestionItem = {
  fieldKey: string;
  fieldLabel: string;
  documentType: InternalPhaseDocumentType;
  suggestionType: AiSuggestionType;
  suggestedText: string;
  rationale: string;
};

export function generateAssistiveSuggestions(
  ctx: PlanningUpstreamContext,
  documentType: InternalPhaseDocumentType,
): AssistiveSuggestionItem[] {
  if (documentType === "PCA") {
    const inherited = buildInheritedPcaPayload(ctx);
    return [
      {
        fieldKey: "consolidatedJustification",
        fieldLabel: "Justificativa consolidada no PCA",
        documentType: "PCA",
        suggestionType: "REAPROVEITAMENTO_DADOS",
        suggestedText: inherited.consolidatedJustification,
        rationale: "Reaproveita automaticamente o objeto, período e justificativa da Solicitação/DFD de origem.",
      },
      {
        fieldKey: "collectivePurchaseAnalysis",
        fieldLabel: "Análise de compras coletivas",
        documentType: "PCA",
        suggestionType: "REDACAO_PARAMETRIZADA",
        suggestedText: inherited.collectivePurchaseAnalysis,
        rationale: "Aplica regra parametrizada do art. 12, VII, e art. 40 da Lei nº 14.133/2021 para padronização e ganho de escala.",
      },
      {
        fieldKey: "governanceConclusion",
        fieldLabel: "Conclusão de governança do PCA",
        documentType: "PCA",
        suggestionType: "CONSISTENCIA_NORMATIVA",
        suggestedText: inherited.governanceConclusion,
        rationale: "Verifica aderência normativa ao calendário anual do PCA e vinculação ao planejamento institucional.",
      },
    ];
  }

  if (documentType === "ETP") {
    const inherited = buildInheritedEtpPayload(ctx);
    return [
      {
        fieldKey: "problemDescription",
        fieldLabel: "Descrição da necessidade (art. 18, § 1º, I)",
        documentType: "ETP",
        suggestionType: "REAPROVEITAMENTO_DADOS",
        suggestedText: inherited.problemDescription,
        rationale: "Herda a necessidade consolidada no DFD sem exigir redigitação manual.",
      },
      {
        fieldKey: "quantityEstimateAndMemory",
        fieldLabel: "Estimativa das quantidades e memória de cálculo (art. 18, § 1º, IV)",
        documentType: "ETP",
        suggestionType: "REAPROVEITAMENTO_DADOS",
        suggestedText: inherited.quantityEstimateAndMemory,
        rationale: "Reaproveita quantitativo, unidade de medida e período esperado do Planejamento e da Solicitação.",
      },
      {
        fieldKey: "parcelingJustification",
        fieldLabel: "Justificativa de parcelamento (art. 18, § 1º, VIII)",
        documentType: "ETP",
        suggestionType: "REDACAO_PARAMETRIZADA",
        suggestedText: inherited.parcelingJustification,
        rationale: "Sugestão assistiva fundamentada no art. 40, §§ 2º e 3º, da Lei nº 14.133/2021.",
      },
      {
        fieldKey: "viabilityJustification",
        fieldLabel: "Posicionamento conclusivo de viabilidade (art. 18, § 1º, XIII)",
        documentType: "ETP",
        suggestionType: "CONSISTENCIA_NORMATIVA",
        suggestedText: inherited.viabilityJustification,
        rationale: "Consolida os requisitos técnicos, orçamentários e de risco exigidos pela Lei nº 14.133/2021.",
      },
    ];
  }

  const inherited = buildInheritedTrPayload(ctx);
  return [
    {
      fieldKey: "objectDefinition",
      fieldLabel: "Definição do objeto (art. 6º, XXIII, 'a')",
      documentType: "TR",
      suggestionType: "REAPROVEITAMENTO_DADOS",
      suggestedText: inherited.objectDefinition,
      rationale: "Reaproveita especificação, quantitativo, unidade e vigência diretamente do DFD e do ETP.",
    },
    {
      fieldKey: "legalAndTechnicalFoundation",
      fieldLabel: "Fundamentação da contratação (art. 6º, XXIII, 'b')",
      documentType: "TR",
      suggestionType: "REAPROVEITAMENTO_DADOS",
      suggestedText: inherited.legalAndTechnicalFoundation,
      rationale: "Mantém encadeamento lógico expresso com o ETP e o DFD aprovados na fase interna.",
    },
    {
      fieldKey: "managementAndSupervisionModel",
      fieldLabel: "Modelo de gestão e fiscalização (art. 6º, XXIII, 'f')",
      documentType: "TR",
      suggestionType: "REDACAO_PARAMETRIZADA",
      suggestedText: inherited.managementAndSupervisionModel,
      rationale: "Cláusula parametrizada conforme art. 117 da Lei nº 14.133/2021.",
    },
    {
      fieldKey: "budgetAdequacy",
      fieldLabel: "Adequação orçamentária (art. 6º, XXIII, 'j')",
      documentType: "TR",
      suggestionType: "CONSISTENCIA_NORMATIVA",
      suggestedText: inherited.budgetAdequacy,
      rationale: "Valida consistência entre valor estimado no TR, previsão no PCA e objetivo do PPA.",
    },
  ];
}

export function getCf30GovernanceAndWarrantyDescriptor() {
  return {
    moduleCode: "CF30",
    moduleTitle: "Solução Tecnológica para Planejamento, Governança e Elaboração dos Documentos das Contratações",
    legalFramework: {
      primaryLaw: "Lei Federal nº 14.133, de 1º de abril de 2021 (Nova Lei de Licitações e Contratos Administrativos)",
      articlesCovered: [
        "Art. 12, VII — Plano de Contratações Anual (PCA), consolidação de demandas e racionalização via compras coletivas",
        "Art. 18, caput e incisos I a XI — Instrução da fase preparatória (interna) do processo licitatório",
        "Art. 18, § 1º, I a XIII — Estudo Técnico Preliminar (ETP), análise de viabilidade, riscos e alternativas",
        "Art. 6º, XXIII, 'a' a 'j', e Art. 40, § 1º — Termo de Referência (TR), modelo de execução, gestão e adequação orçamentária",
        "Art. 117 — Governança, rastreabilidade, segregação de funções e fiscalização",
      ],
    },
    securityAndAudit: {
      accessControl: "RBAC por módulo (COMPRAS: read/create/update) e verificação de unidade/secretaria de origem (assertPurchaseRequestOrigin)",
      segregationOfDuties: "Proibição de autoaprovação na mesma etapa de revisão (autor da submissão não pode aprovar/devolver a própria versão)",
      auditTrail: "Registro transacional em AuditEvent, PurchaseDemandVersion, PurchaseDemandEvent, PurchasePlanningDocumentVersion e PurchasePlanningAiSuggestionLog",
      humanInTheLoop: "Toda sugestão assistiva de IA exige decisão humana explícita (ACEITA, EDITADA ou RECUSADA) com registro do usuário e carimbo de tempo",
    },
    performanceAndAvailability: {
      concurrencyControl: "Isolamento transacional com bloqueio pessimista (SELECT ... FOR UPDATE) e validação otimista de versão/etapa",
      availabilityTarget: "99,5% de disponibilidade operacional em arquitetura web responsiva multiusuário",
      responseTimeSla: "Consultas, consolidações do PCA e validações de coerência processadas em memória/SQL indexado (< 500ms em carga nominal)",
    },
    warrantyAndSupport: {
      warrantyMonths: 12,
      coverageStartCondition: "A partir do aceite definitivo da solução tecnológica pela Administração",
      includedServices: [
        "Manutenção corretiva ininterrupta para correção de falhas, defeitos ou não conformidades sem ônus adicional",
        "Manutenção evolutiva e adaptativa para adequação a atualizações normativas da Lei nº 14.133/2021 e regulamentos do TCE/PNCP",
        "Suporte técnico especializado durante todo o período de garantia mínima de 12 (doze) meses",
        "Preservação integral de versões históricas, logs de auditoria e documentos vinculados ao GED",
      ],
    },
  };
}

