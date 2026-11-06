"use client";

import { useState, useTransition } from "react";
import { saveDocumentMessageAction, deleteDocumentMessageAction } from "./actions";
import { TaxOperationalTable } from "../../TaxOperationalTable";
import { Printer, Plus, Trash2, Pencil, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type DocumentMessage = {
  id: string;
  title: string;
  documentType: string;
  targetScope: string;
  competenceYear: number | null;
  validFrom: string | null;
  validUntil: string | null;
  placement: string;
  messageContent: string;
  legalReference: string | null;
  active: boolean;
  version: number;
  createdAt: string;
};

const docTypes = [
  { value: "CARNE", label: "Carnê (IPTU/ISS/Taxas)" },
  { value: "GUIA", label: "Guia / DAM de Arrecadação" },
  { value: "ALVARA", label: "Alvará de Licença / Funcionamento" },
  { value: "CERTIDAO", label: "Certidão Negativa / Regularidade Fiscal" },
  { value: "NOTIFICACAO", label: "Notificação Fiscal de Lançamento" },
  { value: "AVISO", label: "Aviso de Cobrança / Débito" },
  { value: "ORDEM_FISCALIZACAO", label: "Ordem de Fiscalização (OSF)" },
  { value: "TERMO_ACAO_FISCAL", label: "Termo de Ação Fiscal (TIAF)" }
];

export default function MensagensDocumentosClient(props: { messages: DocumentMessage[] }) {
  const [messages, setMessages] = useState<DocumentMessage[]>(props.messages);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editingMessage, setEditingMessage] = useState<DocumentMessage | null>(null);
  const [viewingMessage, setViewingMessage] = useState<DocumentMessage | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const field = "mt-1 w-full rounded border p-1.5 text-xs";

  const filtered = messages.filter(m => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.messageContent.toLowerCase().includes(search.toLowerCase()) ||
      (m.legalReference ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesType = !typeFilter || m.documentType === typeFilter;
    return matchesSearch && matchesType;
  });

  async function handleDelete(id: string) {
    if (!confirm("Deseja realmente inativar/excluir esta mensagem de documento?")) return;
    startTransition(async () => {
      const res = await deleteDocumentMessageAction(id);
      if (res.error) {
        setNotice(res.error);
      } else {
        setMessages(prev => prev.filter(m => m.id !== id));
        setNotice("Mensagem excluída com sucesso.");
      }
    });
  }

  return (
    <div className="h-full space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Central de Mensagens para Documentos Fiscais</h1>
          <p className="text-xs text-slate-500">
            Parametrização de mensagens e notas legais para emissão de carnês, guias, alvarás, certidões, notificações, avisos, ordens de fiscalização e termos fiscais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/tributacao/configuracoes-cadastrais/mensagens-documentos/relatorio${typeFilter ? `?type=${typeFilter}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="size-3.5" />
            Imprimir Relatório
          </a>
          <button
            onClick={() => {
              setEditingMessage(null);
              setIsCreating(true);
            }}
            className="inline-flex h-8 items-center gap-1 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="size-3.5" />
            Nova Mensagem
          </button>
        </div>
      </div>

      {notice && <p role="status" className="rounded border bg-amber-50 p-2 text-sm">{notice}</p>}

      <TaxOperationalTable
        id="tabela-mensagens-documentos"
        resetKey={`${search}:${typeFilter}`}
        emptyMessage="Nenhuma mensagem parametrizada encontrada."
        toolbar={
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              aria-label="Buscar mensagens"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, conteúdo ou embasamento legal"
              className="h-8 min-w-0 flex-1 rounded border px-2 text-[13px]"
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="h-8 rounded border px-2 text-xs"
            >
              <option value="">Todos os tipos de documentos</option>
              {docTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        }
        columns={[
          ["title", "Título da Mensagem", 150, 200, "identifier"],
          ["type", "Tipo de Documento", 130, 160],
          ["placement", "Posição", 90, 110],
          ["year", "Exercício", 70, 80],
          ["content", "Conteúdo da Mensagem", 200, 350],
          ["status", "Status", 75, 85, "status"],
          ["actions", "Ações", 90, 110, "actions"]
        ]}
        rows={filtered.map(m => ({
          id: m.id,
          label: m.title,
          values: {
            title: m.title,
            type: docTypes.find(d => d.value === m.documentType)?.label.split(" (")[0] ?? m.documentType,
            placement: m.placement,
            year: m.competenceYear ? String(m.competenceYear) : "Todos",
            content: m.messageContent.length > 80 ? `${m.messageContent.slice(0, 80)}...` : m.messageContent,
            status: m.active ? "Ativo" : "Inativo"
          },
          actions: (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewingMessage(m)}
                title="Visualizar Detalhes"
                className="text-slate-600 hover:text-slate-900"
              >
                <Eye className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditingMessage(m);
                  setIsCreating(false);
                }}
                title="Editar"
                className="text-emerald-700 hover:text-emerald-900"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => handleDelete(m.id)}
                title="Excluir"
                className="text-rose-600 hover:text-rose-800"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        }))}
      />

      {/* Modal de Criação / Edição */}
      <Dialog
        open={isCreating || editingMessage !== null}
        onOpenChange={open => {
          if (!open) {
            setIsCreating(false);
            setEditingMessage(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingMessage ? `Editar Mensagem: ${editingMessage.title}` : "Nova Mensagem para Documentos Fiscais"}
            </DialogTitle>
          </DialogHeader>

          <form
            action={form => startTransition(async () => {
              const res = await saveDocumentMessageAction({
                id: editingMessage?.id,
                title: String(form.get("title")),
                documentType: String(form.get("documentType")) as any,
                targetScope: String(form.get("targetScope")) as any,
                competenceYear: form.get("competenceYear") ? Number(form.get("competenceYear")) : null,
                validFrom: String(form.get("validFrom") || "") || null,
                validUntil: String(form.get("validUntil") || "") || null,
                placement: String(form.get("placement")) as any,
                messageContent: String(form.get("messageContent")),
                legalReference: String(form.get("legalReference") || "").trim() || null,
                active: form.get("active") === "on",
                reason: String(form.get("reason"))
              });

              if (res.error) {
                setNotice(res.error);
              } else {
                setNotice("Mensagem salva e parametrizada com sucesso.");
                setIsCreating(false);
                setEditingMessage(null);
                window.location.reload();
              }
            })}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="text-xs font-medium sm:col-span-2">Título Identificador
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={editingMessage?.title}
                placeholder="Ex: Instrução de Pagamento com Desconto em Cota Única"
                className={field}
              />
            </label>

            <label className="text-xs font-medium">Documento de Destino
              <select
                name="documentType"
                required
                defaultValue={editingMessage?.documentType ?? "GUIA"}
                className={field}
              >
                {docTypes.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium">Posicionamento no Documento
              <select
                name="placement"
                defaultValue={editingMessage?.placement ?? "INSTRUCOES"}
                className={field}
              >
                <option value="INSTRUCOES">Instruções ao Contribuinte</option>
                <option value="CABECALHO">Cabeçalho</option>
                <option value="CORPO">Corpo do Documento</option>
                <option value="RODAPE">Rodapé</option>
                <option value="VERSO">Verso do Carnê / Notificação</option>
              </select>
            </label>

            <label className="text-xs font-medium">Pasta / Módulo de Aplicação
              <select
                name="targetScope"
                defaultValue={editingMessage?.targetScope ?? "GERAL"}
                className={field}
              >
                <option value="GERAL">Geral (Todos os Módulos)</option>
                <option value="IMOBILIARIO">Cadastro Imobiliário (IPTU/Taxas)</option>
                <option value="ECONOMICO">Cadastro Econômico (ISS/Alvarás)</option>
                <option value="DIVIDA_ATIVA">Dívida Ativa e Cobrança</option>
              </select>
            </label>

            <label className="text-xs font-medium">Exercício (Opcional)
              <input
                name="competenceYear"
                type="number"
                min={2000}
                max={2100}
                defaultValue={editingMessage?.competenceYear ?? ""}
                placeholder="Ex: 2026 (vazio = todos)"
                className={field}
              />
            </label>

            <label className="text-xs font-medium">Data Início Vigência
              <input
                name="validFrom"
                type="date"
                defaultValue={editingMessage?.validFrom ?? ""}
                className={field}
              />
            </label>

            <label className="text-xs font-medium">Data Fim Vigência
              <input
                name="validUntil"
                type="date"
                defaultValue={editingMessage?.validUntil ?? ""}
                className={field}
              />
            </label>

            <label className="text-xs font-medium sm:col-span-2">Texto da Mensagem a Imprimir
              <textarea
                name="messageContent"
                required
                rows={4}
                defaultValue={editingMessage?.messageContent}
                placeholder="Digite o texto que será impresso no documento..."
                className={field}
              />
            </label>

            <label className="text-xs font-medium sm:col-span-2">Fundamento Legal / Decreto
              <input
                name="legalReference"
                defaultValue={editingMessage?.legalReference ?? ""}
                placeholder="Ex: Conforme Art. 120 da Lei Municipal 1.450/2025"
                className={field}
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium sm:col-span-2">
              <input
                name="active"
                type="checkbox"
                defaultChecked={editingMessage?.active ?? true}
              />
              Mensagem Ativa para Impressão
            </label>

            <label className="text-xs font-medium sm:col-span-2">Motivo / Justificativa da Alteração
              <textarea
                name="reason"
                required
                defaultValue="Parametrização operacional de mensagens de documentos fiscais"
                className={field}
              />
            </label>

            <div className="flex justify-end gap-2 sm:col-span-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setEditingMessage(null);
                }}
                className="h-8 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                disabled={pending}
                className="h-8 rounded bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {editingMessage ? "Atualizar Mensagem" : "Cadastrar Mensagem"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Visualização */}
      <Dialog
        open={viewingMessage !== null}
        onOpenChange={open => {
          if (!open) setViewingMessage(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Mensagem</DialogTitle>
          </DialogHeader>

          {viewingMessage && (
            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-500">Título:</span>
                <p className="text-sm font-bold text-slate-800">{viewingMessage.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded">
                <div>
                  <span className="font-semibold text-slate-500">Documento:</span>
                  <p>{docTypes.find(d => d.value === viewingMessage.documentType)?.label}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Posição:</span>
                  <p>{viewingMessage.placement}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Exercício:</span>
                  <p>{viewingMessage.competenceYear ?? "Todos"}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Status:</span>
                  <p>{viewingMessage.active ? "Ativo" : "Inativo"}</p>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-500">Conteúdo a Imprimir:</span>
                <div className="mt-1 rounded border bg-slate-50 p-3 text-slate-700 font-mono text-[11px] whitespace-pre-wrap">
                  {viewingMessage.messageContent}
                </div>
              </div>

              {viewingMessage.legalReference && (
                <div>
                  <span className="font-semibold text-slate-500">Embasamento Legal:</span>
                  <p>{viewingMessage.legalReference}</p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setViewingMessage(null)}
                  className="h-8 rounded border px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
