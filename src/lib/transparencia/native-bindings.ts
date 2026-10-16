import "server-only";
import type { PrismaClient } from "@prisma/client";
import { nativeBindingSchema, type NativeSourceType } from "./native-binding-policy";

export async function nativeSourceOptions(db: PrismaClient, type: NativeSourceType, search = "") {
  const contains = { contains: search.slice(0, 150), mode: "insensitive" as const };
  if (type === "EMPLOYMENT_CONTRACT") return (await db.hrEmploymentContract.findMany({ where: search ? { OR: [{ registration: contains }, { employee: { name: contains } }] } : {}, select: { id: true, registration: true, employee: { select: { name: true } } }, take: 100, orderBy: { registration: "asc" } })).map(row => ({ id: row.id, label: `${row.registration} · ${row.employee.name}` }));
  if (type === "PAYROLL_STATEMENT") return (await db.hrPayrollStatement.findMany({ where: { revokedAt: null, releaseAt: { lte: new Date() }, run: { mode: "OFICIAL", scope: "PRODUCAO", status: "FECHADA" }, ...(search ? { contract: { employee: { name: contains } } } : {}) }, select: { id: true, contract: { select: { registration: true, employee: { select: { name: true } } } }, run: { select: { payroll: { select: { competence: true, type: true } } } } }, take: 100 })).map(row => ({ id: row.id, label: `${row.contract.registration} · ${row.contract.employee.name} · ${row.run.payroll.competence} · ${row.run.payroll.type}` }));
  if (type === "POSITION_PLAN") return (await db.hrPayrollRule.findMany({ where: { code: "QUADRO_CARGOS", isActive: true, ruleSet: { scope: "PRODUCAO", isDemo: false }, ...(search ? { name: contains } : {}) }, select: { id: true, name: true }, take: 100 })).map(row => ({ id: row.id, label: row.name }));
  if (type === "TRAVEL_REQUEST" || type === "ADVANCE_REQUEST") {
    const employees=await db.employee.findMany({where:search?{name:contains}:{},select:{id:true,name:true}});
    return (await db.hrPortalRequest.findMany({ where: { kind: type === "TRAVEL_REQUEST" ? "DIARIA" : "ADIANTAMENTO", status: "DEFERIDA", ...(search ? { employeeId: { in:employees.map(row=>row.id) } } : {}) }, select: { id: true, employeeId:true, decidedAt: true }, take: 100 })).map(row => ({ id: row.id, label: `${employees.find(employee=>employee.id===row.employeeId)?.name || "Beneficiário não identificado"} · ${row.decidedAt?.toISOString().slice(0, 10) || ""}` }));
  }
  if (type === "PURCHASE_RECEIPT") return (await db.purchaseReceipt.findMany({ where: { status: "APPROVED", ...(search ? { number: contains } : {}) }, select: { id: true, number: true }, take: 100, orderBy: { receivedAt: "desc" } })).map(row => ({ id: row.id, label: row.number }));
  if (type === "ASSET") return (await db.asset.findMany({ where: search ? { name: contains } : {}, select: { id: true, name: true, patrimonyNumber: true }, take: 100 })).map(row => ({ id: row.id, label: `${row.patrimonyNumber} · ${row.name}` }));
  if (type === "FLEET_UNIT") return (await db.fleetUnit.findMany({ where: search ? { name: contains } : {}, select: { id: true, name: true, code: true }, take: 100 })).map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }));
  if (type === "WAREHOUSE") return (await db.warehouse.findMany({ where: search ? { name: contains } : {}, select: { id: true, name: true }, take: 100 })).map(row => ({ id: row.id, label: row.name }));
  if (type === "WORK") return (await db.obrasObra.findMany({ where: search ? { nome: contains } : {}, select: { id: true, nome: true, numero: true }, take: 100 })).map(row => ({ id: row.id, label: `${row.numero} · ${row.nome}` }));
  if (type === "COVENANT") return (await db.covenant.findMany({ where: search ? { description: contains } : {}, select: { id: true, number: true, description: true }, take: 100 })).map(row => ({ id: row.id, label: `${row.number} · ${row.description}` }));
  if (type === "TAX_BENEFIT_RULE") return (await db.taxBenefitRule.findMany({ where: search ? { name: contains } : {}, select: { id: true, code: true, name: true }, take: 100 })).map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }));
  if (type === "TAX_BENEFIT_GRANT") return (await db.taxBenefitGrant.findMany({ where: { status: "CONCEDIDO" }, select: { id: true, grantedAt: true, rule: { select: { code: true, name: true } } }, take: 100 })).map(row => ({ id: row.id, label: `${row.rule.code} · ${row.rule.name} · ${row.grantedAt.toISOString().slice(0, 10)}` }));
  if(type==="HEALTH_REGULATION_SECTOR")return (await db.healthRegulationSector.findMany({where:search?{name:contains}:{},select:{id:true,name:true},take:100})).map(row=>({id:row.id,label:row.name}));
  if(type==="PRE_ENROLLMENT_PROCESS")return (await db.preEnrollmentProcess.findMany({where:search?{name:contains}:{},select:{id:true,name:true,year:true},take:100})).map(row=>({id:row.id,label:`${row.name} · ${row.year}`}));
  return (await db.officialDiary.findMany({ select: { id: true, editionNumber: true, publishDate: true }, take: 100, orderBy: { publishDate: "desc" } })).map(row => ({ id: row.id, label: `Edição ${row.editionNumber} · ${row.publishDate.toISOString().slice(0, 10)}` }));
}

export async function saveNativeBinding(db: PrismaClient, actorId: string, raw: unknown) {
  const input = nativeBindingSchema.parse(raw);
  await db.governmentEntity.findUniqueOrThrow({ where: { id: input.governmentEntityId } });
  // Validate existence through fixed model dispatch; browsers cannot provide a table/query.
  const exists = input.sourceType === "EMPLOYMENT_CONTRACT" ? await db.hrEmploymentContract.count({ where: { id: input.sourceId } })
    : input.sourceType === "PAYROLL_STATEMENT" ? await db.hrPayrollStatement.count({ where: { id: input.sourceId } })
    : input.sourceType === "POSITION_PLAN" ? await db.hrPayrollRule.count({ where: { id: input.sourceId, code: "QUADRO_CARGOS" } })
    : input.sourceType === "TRAVEL_REQUEST" || input.sourceType === "ADVANCE_REQUEST" ? await db.hrPortalRequest.count({ where: { id: input.sourceId, kind: input.sourceType === "TRAVEL_REQUEST" ? "DIARIA" : "ADIANTAMENTO" } })
    : input.sourceType === "PURCHASE_RECEIPT" ? await db.purchaseReceipt.count({ where: { id: input.sourceId } })
    : input.sourceType === "ASSET" ? await db.asset.count({ where: { id: input.sourceId } })
    : input.sourceType === "FLEET_UNIT" ? await db.fleetUnit.count({ where: { id: input.sourceId } })
    : input.sourceType === "WAREHOUSE" ? await db.warehouse.count({ where: { id: input.sourceId } })
    : input.sourceType === "WORK" ? await db.obrasObra.count({ where: { id: input.sourceId } })
    : input.sourceType === "COVENANT" ? await db.covenant.count({ where: { id: input.sourceId } })
    : input.sourceType === "TAX_BENEFIT_RULE" ? await db.taxBenefitRule.count({ where: { id: input.sourceId } })
    : input.sourceType === "TAX_BENEFIT_GRANT" ? await db.taxBenefitGrant.count({ where: { id: input.sourceId } })
    : input.sourceType==="HEALTH_REGULATION_SECTOR"?await db.healthRegulationSector.count({where:{id:input.sourceId}})
    : input.sourceType==="PRE_ENROLLMENT_PROCESS"?await db.preEnrollmentProcess.count({where:{id:input.sourceId}})
    : await db.officialDiary.count({ where: { id: input.sourceId } });
  if (!exists) throw new Error("Registro da fonte não encontrado.");
  if (input.enabled && input.collectionSlug === "renuncia" && await db.transparencyNativeBinding.count({ where: { governmentEntityId: input.governmentEntityId, collectionSlug: "renuncia", enabled: true, sourceType: input.sourceType === "TAX_BENEFIT_RULE" ? "TAX_BENEFIT_GRANT" : "TAX_BENEFIT_RULE" } })) throw new Error("Escolha publicação agregada por regra ou individual por concessão; não misture os dois grãos nos totais.");
  return db.$transaction(async tx => {
    const entry = await tx.transparencyNativeBinding.upsert({ where: { collectionSlug_sourceType_sourceId: { collectionSlug: input.collectionSlug, sourceType: input.sourceType, sourceId: input.sourceId } }, create: { ...input, createdById: actorId }, update: { ...input } });
    await tx.financialAuditLog.create({ data: { action: "CONFIGURE_NATIVE_TRANSPARENCY_BINDING", entityType: "TransparencyNativeBinding", entityId: entry.id, authorUsuarioId: actorId, payload: { sourceType: input.sourceType, sourceId: input.sourceId, governmentEntityId: input.governmentEntityId, enabled: input.enabled } } });
    return entry;
  });
}
