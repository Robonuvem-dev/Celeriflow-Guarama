import { PGlite } from '@electric-sql/pglite';
import { sql as statement } from 'drizzle-orm';
import { withDatabaseTransaction } from '../src/db/transaction.ts';
import { identifier, insertToolRows, queryRows } from './lib/cross-domain-database.ts';
import { openLocalToolDatabase } from './lib/cross-domain-local-database.ts';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// No dotenv or URL input: this command can only create/open its own local P0 database.
const parent = resolve(process.env.LOCALAPPDATA ?? '.', 'Temp', 'opencode', 'ibema-poc-p0');
mkdirSync(parent, { recursive:true });
const marker = join(parent,'isolation.json');
const dataDir = join(parent,'postgres-data');
if (existsSync(dataDir) && !existsSync(marker)) throw new Error('Diretório existente sem identificação P0.');
const identity = existsSync(marker) ? JSON.parse(readFileSync(marker,'utf8')) : {id:randomUUID(),phase:'P0',engine:'PGlite',createdAt:new Date().toISOString()};
if (identity.phase !== 'P0' || identity.engine !== 'PGlite') throw new Error('Identidade do banco inválida.');
writeFileSync(marker,JSON.stringify(identity,null,2)+'\n');
const baseline = JSON.parse(readFileSync('docs/poc-p0/BASELINE.json','utf8'));
const pg = new PGlite(dataDir);
let local;
const report = {generatedAt:new Date().toISOString(),commit:baseline.commit,database:{...identity,dataDir,network:'loopback only',operationalDatabaseTouched:false},migrations:[],dataset:null,blockers:[],status:'EM_PREPARAÇÃO'};
try {
  await pg.waitReady;
  report.database.version = (await pg.query('SELECT version() AS version')).rows[0].version;
  // Local receipts are independent of the preserved historical migration ledger.
  await pg.exec('CREATE TABLE IF NOT EXISTS "P0MigrationReceipt" (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const migration of baseline.migrations) {
    const sql = readFileSync(`prisma/migrations-ibema/${migration.name}/migration.sql`,'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (checksum !== migration.hash) throw new Error(`Migration mudou desde baseline: ${migration.name}`);
    const old = (await pg.query('SELECT checksum FROM "P0MigrationReceipt" WHERE name=$1',[migration.name])).rows[0];
    if (old && old.checksum !== checksum) throw new Error(`Conflito de checksum: ${migration.name}`);
    if (!old) {
      await pg.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query('INSERT INTO "P0MigrationReceipt"(name,checksum) VALUES ($1,$2)',[migration.name,checksum]);
      });
    }
    report.migrations.push({...migration,status:old ? 'SQL_JÁ_APLICADO_CHECKSUM_CONFERIDO' : 'SQL_APLICADO_EM_TRANSAÇÃO',method:'SQL direto PGlite + P0MigrationReceipt'});
  }
  local = await openLocalToolDatabase(pg);
  const { db } = local.connection;
  await withDatabaseTransaction(local.connection, async (tx) => {
    for (const [suffix,type,jurisdiction] of [['exe','PREFEITURA','EXECUTIVE'],['leg','CAMARA','LEGISLATIVE']]) {
      const governmentEntityId = `p0-${suffix}`;
      const secretariatId = `p0-secretariat-${suffix}`;
      await insertToolRows(tx,'GovernmentEntity',{id:governmentEntityId,code:`P0-${suffix.toUpperCase()}`,name:`POC P0 — ${type} (sintético)`,type},['id']);
      await insertToolRows(tx,'PlanningEntityScope',{governmentEntityId,jurisdiction},['governmentEntityId']);
      await insertToolRows(tx,'Secretariat',{id:secretariatId,name:`POC P0 — Administração ${suffix}`},['id']);
      for (let i=1;i<=21;i++) {
        const id = `p0-${suffix}-ug-${i}`;
        await insertToolRows(tx,'BudgetUnit',{id,code:`P0.${suffix}.${String(i).padStart(3,'0')}`,name:`POC Unidade ${i} — ${suffix}`,secretariatId},['id']);
        await insertToolRows(tx,'PlanningEntityUnit',{budgetUnitId:id,governmentEntityId},['budgetUnitId']);
        await insertToolRows(tx,'CostCenter',{id:`p0-${suffix}-cc-${i}`,code:`P0.${suffix}.CC.${i}`,name:`POC Centro ${i} — ${suffix}`,governmentEntityId,secretariatId},['id']);
      }
      const roles = {
        proponente:{create:true,update:true},
        aprovador:{legalApproval:true,update:true},
        sancionador:{legalApproval:true,update:true},
        consulta:{create:false,update:false,issueReports:true},
        financeiro:{create:true,update:true,issueReports:true},
        controlador:{create:true,update:true,issueReports:true},
        notificado:{create:false,update:false},
      };
      for (const [role,permissions] of Object.entries(roles)) {
        const id = `p0-${suffix}-${role}`;
        const modules = Object.fromEntries(['PLANEJAMENTO','FINANCEIRO','TRIBUTACAO','AUDITORIA','CAMARA','DOCUMENTOS','TRANSPARENCIA'].map((code) => [code,{blocked:false,...permissions}]));
        await insertToolRows(tx,'ConfiguracaoPerfil',{id,codigo:`P0_${suffix}_${role}`.toUpperCase(),nome:`POC ${role} ${suffix}`,permissoes:JSON.stringify({modules})},['id']);
        await insertToolRows(tx,'Usuario',{id,nome:`POC ${role} ${suffix}`,email:`${id}@example.test`,perfilId:id},['id']);
        await insertToolRows(tx,'UsuarioUnidadeGestora',{usuarioId:id,budgetUnitId:`p0-${suffix}-ug-1`},['usuarioId','budgetUnitId']);
      }
    }
    for (const suffix of ['exe','leg']) for (const year of [2024,2025,2026,2027]) await insertToolRows(tx,'FinancialYear',{id:`p0-${suffix}-year-${year}`,governmentEntityId:`p0-${suffix}`,year,status:'Aberto',startDate:new Date(`${year}-01-01T00:00:00Z`),endDate:new Date(`${year}-12-31T23:59:59Z`)},['governmentEntityId','year']);
    for (let i=1;i<=21;i++) {
      await insertToolRows(tx,'ResourceSource',{id:`p0-source-${i}`,code:`P0.SOURCE.${i}`,name:`POC Fonte ${i} — não oficial`,referenceYear:2026},['id']);
      await insertToolRows(tx,'RevenueNature',{id:`p0-revenue-${i}`,code:`P0.REVENUE.${i}`,name:`POC Receita ${i} — não oficial`},['id']);
      await insertToolRows(tx,'ExpenseNature',{id:`p0-expense-${i}`,code:`P0.EXPENSE.${i}`,name:`POC Despesa ${i} — não oficial`},['id']);
      await insertToolRows(tx,'AccountingPlan',{id:`p0-account-${i}`,code:`P0.ACCOUNT.${i}`,name:`POC Conta ${i} — não PCASP homologado`,type:i%2 ? 'Ativo' : 'Passivo'},['id']);
    }
  }, {timeoutMs:120000,lockTimeoutMs:120000});
  const tables = {governmentEntity:'GovernmentEntity',planningEntityScope:'PlanningEntityScope',planningEntityUnit:'PlanningEntityUnit',budgetUnit:'BudgetUnit',costCenter:'CostCenter',financialYear:'FinancialYear',resourceSource:'ResourceSource',revenueNature:'RevenueNature',expenseNature:'ExpenseNature',accountingPlan:'AccountingPlan',usuario:'Usuario',configuracaoPerfil:'ConfiguracaoPerfil'};
  const counts = {};
  for (const [name,table] of Object.entries(tables)) counts[name] = Number((await queryRows(db,statement`SELECT count(*) AS count FROM ${identifier(table)}`))[0].count);
  report.dataset = {id:'P0-SINTETICO-v1',type:'SINTÉTICO; NÃO DADO MUNICIPAL; NÃO CLASSIFICAÇÃO OFICIAL',counts,years:[2024,2025,2026,2027],minimumPerCatalog:21,authentication:'Usuários locais sem Firebase UID/sessão: não login autenticado',scenarios:'Cadastro/escopo/volume prontos; movimentos financeiros e parâmetros legais dependem de P1–P7'};
  report.blockers = [
    'Firebase: vincular contas de ensaio/autenticação normal; não há Firebase UID ou sessão criada.',
    'Banco preparado com Drizzle/Neon via WebSocket loopback. O transporte fecha ao terminar o comando; ensaio de UI requer servidor local persistente ou instância Neon isolada.',
    'PGlite possui um backend serializado: concorrência entre sessões deve usar PostgreSQL com conexões reais na fase de ensaio.',
    'Catálogos P0 são sintéticos para volume; homologar classificações, matriz contábil e parâmetros municipais em P1.',
  ];
  report.status = 'BANCO_E_DATASET_PREPARADOS; INSTÂNCIA_AUTENTICADA_PENDENTE';
  if (report.migrations.length !== baseline.migrations.length || report.dataset.counts.budgetUnit !== 42) throw new Error('Inventário incompleto.');
} catch (error) {
  report.status = 'BLOQUEADO';
  report.blockers.push(String(error.message));
  process.exitCode=1;
} finally {
  await local?.close();
  await pg.close();
  mkdirSync('docs/poc-p0',{recursive:true});
  writeFileSync('docs/poc-p0/AMBIENTE_ISOLADO.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,migrations:report.migrations.length,dataset:report.dataset,blockers:report.blockers},null,2));
}
