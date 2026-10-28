import assert from "node:assert/strict";
import test from "node:test";
import { and, desc, eq, sql } from "drizzle-orm";
import { economicRegistrations, taxes } from "../src/db/schema/taxation-core";
import { taxpayers } from "../src/db/schema/registry";
import { healthCbos } from "../src/db/schema/master-data";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { countTaxRows, createTaxChainDatabase, firstTaxRow, taxChainObject } from "./helpers/tax-chain-database";
import { financeDatabaseError } from "./helpers/finance-database-error";
import { configureTaxFinancialMapping,configureTaxServiceActivity } from "../src/lib/tributacao";
import { publishEconomicActivity } from "../src/lib/tributacao/economic-activity-registry";
import { unifyEconomicActivities } from "../src/lib/tributacao/economic-activity-operations";
import { createEconomicRegistrationWithProfile,saveEconomicProfile } from "../src/lib/tributacao/economic-profile";
import { updateEconomicRegistrationWithHistory } from "../src/lib/tributacao/economic-history";
import { publishFiscalCatalog } from "../src/lib/tributacao/configurable-cadastres";

test("ISS: atividade relaciona CNAE/serviços/CBO e unificação preserva versões, origem e rollback",async()=>{
  const f=await createTaxChainDatabase();
  f.connection.pool.options.max = 1;
  try{
    await f.db.insert(taxes).values({id:"ISS",name:"ISS",taxType:"Imposto"});
    await configureTaxFinancialMapping(f.connection,f.actor,{taxId:"ISS",revenueNatureId:"receita",resourceSourceId:"livre",defaultBankAccountId:"banco"});
    const service=await configureTaxServiceActivity(f.connection,f.actor,{taxId:"ISS",code:"1.01",name:"Serviço municipal",issRate:"2"});
    await f.db.insert(healthCbos).values({code:"123456",description:"Ocupação cadastrada",isActive:true});
    const activityInput={expectedVersion:0,governmentEntityId:"ente",budgetUnitId:"ug",cnae:"1234567",name:"Atividade de origem",risk:"BAIXO",active:true,serviceActivityIds:[service.id],cboCodes:["123456"],legalBasis:"Enquadramento municipal"} satisfies Parameters<typeof publishEconomicActivity>[2];
    await assert.rejects(publishEconomicActivity(f.connection,{...f.actor,allowedBudgetUnitIds:[]},activityInput),/autorizado/);
    await assert.rejects(publishEconomicActivity(f.connection,f.actor,{...activityInput,cboCodes:["999999"]}),/CBO ativas/);
    const source=await publishEconomicActivity(f.connection,f.actor,activityInput);
    await assert.rejects(publishEconomicActivity(f.connection,f.actor,activityInput),/já cadastrado/);
    const revised=await publishEconomicActivity(f.connection,f.actor,{...activityInput,activityId:source.entityId,expectedVersion:1,risk:"ALTO",name:"Atividade revisada"});
    assert.equal(taxChainObject(source.data).risk,"BAIXO");assert.equal(taxChainObject(revised.data).risk,"ALTO");
    await assert.rejects(f.db.update(taxRegistryEntries).set({data:{}}).where(eq(taxRegistryEntries.id,source.id)),financeDatabaseError(/imutável/));
    const target=await publishEconomicActivity(f.connection,f.actor,{...activityInput,cnae:"7654321",name:"Atividade de destino"});
    await f.db.insert(taxpayers).values({id:"payer",taxpayerType:"PF",status:"Ativo"});
    const address={street:"Rua",number:"1",complement:"",neighborhood:"Centro",city:"Município",state:"PR",zipCode:""};
    const profile={registrationId:"NEW",expectedVersion:0,governmentEntityId:"ente",budgetUnitId:"ug",accountantTaxpayerId:null,accountantCrc:"",companyType:"Autônomo",realEstateIds:[],primaryCnae:"1234567",secondaryCnaes:["7654321"],partners:[],contractNumber:"",contractDate:null,companyAddress:address,correspondenceAddress:address,latitude:null,longitude:null,provisionalUntil:null,validateCompanyDebt:false,validatePartnerDebts:false,documentIds:[],processId:null,reason:"Inclusão com atividades"};
    const registration=await createEconomicRegistrationWithProfile(f.connection,f.actor,{municipalInsc:"ACTIVITY-1",taxpayerId:"payer",taxRegime:"Normal",profile});
    const second=await createEconomicRegistrationWithProfile(f.connection,f.actor,{municipalInsc:"ACTIVITY-2",taxpayerId:"payer",taxRegime:"Normal",profile:{...profile,primaryCnae:"7654321",secondaryCnaes:["1234567"]}});
    await f.db.insert(economicRegistrations).values({id:"legacy",municipalInsc:"ACTIVITY-LEGACY",taxpayerId:"payer",primaryCnae:"1234567"});
    const unify={governmentEntityId:"ente",budgetUnitId:"ug",sourceId:source.entityId,sourceVersion:2,targetId:target.entityId,targetVersion:1,processId:null,reason:"Unificação dos códigos municipais"};
    const zoneInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, kind: "ZONEAMENTO", code: "Z1", name: "Zona municipal", active: true, fields: [], neighborhoodId: null, streetId: null, landUnitValue: null, legalBasis: "Plano diretor municipal", zoningActivities: [{ cnae: "1234567", treatment: "PERMITIDA", condition: "" }, { cnae: "7654321", treatment: "PROIBIDA", condition: "" }] } satisfies Parameters<typeof publishFiscalCatalog>[2];
    const zone = await publishFiscalCatalog(f.connection, f.actor, zoneInput);
    await assert.rejects(unifyEconomicActivities(f.connection, f.actor, unify), /Concilie a regra urbanística/);
    assert.equal(firstTaxRow(await f.db.select().from(economicRegistrations).where(eq(economicRegistrations.id,registration.id))).primaryCnae, "1234567");
    await publishFiscalCatalog(f.connection, f.actor, { ...zoneInput, catalogId: zone.entityId, expectedVersion: 1, zoningActivities: [zoneInput.zoningActivities[0]] });
    await assert.rejects(unifyEconomicActivities(f.connection,f.actor,{...unify,sourceVersion:1}),/alterada/);
    await f.database.exec(`CREATE FUNCTION reject_activity_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='ECONOMIC_PROFILE' AND NEW.version=2 THEN RAISE EXCEPTION 'activity rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_activity_profile BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION reject_activity_profile();`);
    try {
      await assert.rejects(unifyEconomicActivities(f.connection,f.actor,unify),financeDatabaseError(/activity rollback/));
      assert.equal(firstTaxRow(await f.db.select().from(economicRegistrations).where(eq(economicRegistrations.id,registration.id))).primaryCnae,"1234567");
      assert.equal(await countTaxRows(f.db,"TaxRegistryEntry",sql`category='ECONOMIC_ACTIVITY_UNIFICATION'`),0);
      assert.equal(firstTaxRow(await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId,zone.entityId),eq(taxRegistryEntries.category,"TYPED_FISCAL_CATALOG"))).orderBy(desc(taxRegistryEntries.version)).limit(1)).version, 2);
    } finally { await f.database.exec('DROP TRIGGER reject_activity_profile ON "TaxRegistryEntry"; DROP FUNCTION reject_activity_profile();'); }
    const result=await unifyEconomicActivities(f.connection,f.actor,unify);
    assert.equal(result.count,2);assert.equal(result.unscopedRegistrationsNotAttributed,1);
    const currentZone = firstTaxRow(await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId,zone.entityId),eq(taxRegistryEntries.category,"TYPED_FISCAL_CATALOG"))).orderBy(desc(taxRegistryEntries.version)).limit(1));
    assert.equal(currentZone.version, 3); assert.deepEqual(taxChainObject(currentZone.data).zoningActivities, [{ cnae: "7654321", treatment: "PERMITIDA", condition: "" }]);
    assert.deepEqual(taxChainObject(zone.data).zoningActivities, zoneInput.zoningActivities);
    assert.equal(firstTaxRow(await f.db.select().from(economicRegistrations).where(eq(economicRegistrations.id,registration.id))).primaryCnae,"7654321");
    assert.equal(firstTaxRow(await f.db.select().from(economicRegistrations).where(eq(economicRegistrations.id,"legacy"))).primaryCnae,"1234567");
    for(const id of [registration.id,second.id]) {const current=firstTaxRow(await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId,id),eq(taxRegistryEntries.category,"ECONOMIC_PROFILE"))).orderBy(desc(taxRegistryEntries.version)).limit(1));assert.deepEqual(taxChainObject(current.data).secondaryCnaes,[]);}
    await updateEconomicRegistrationWithHistory(f.connection,f.actor,registration.id,{primaryCnae:"1234567"});
    assert.equal(firstTaxRow(await f.db.select().from(economicRegistrations).where(eq(economicRegistrations.id,registration.id))).primaryCnae,"7654321");
    await saveEconomicProfile(f.connection,f.actor,{...profile,registrationId:registration.id,expectedVersion:2});
    assert.equal(firstTaxRow(await f.db.select().from(economicRegistrations).where(eq(economicRegistrations.id,registration.id))).primaryCnae,"7654321");
    await assert.rejects(unifyEconomicActivities(f.connection,f.actor,unify),/alterada/);
  }finally{await f.close();}
});
