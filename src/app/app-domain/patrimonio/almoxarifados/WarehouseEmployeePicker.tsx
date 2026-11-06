"use client";

import { useEffect, useState, useTransition } from "react";
import { UserPlus, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createEmployeeQuickAction } from "./actions";

type Option = { id: string; label: string };

export function WarehouseEmployeePicker({
  value,
  selectedLabel,
  onChange,
}: {
  value: string;
  selectedLabel: string;
  onChange: (id: string, label: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openModal, setOpenModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newCpf, setNewCpf] = useState("");
  const [newRegistration, setNewRegistration] = useState("");
  const [newRole, setNewRole] = useState("");
  const [modalError, setModalError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/patrimonio/referencias?${new URLSearchParams({ kind: "employees", q: search })}`,
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível buscar os servidores.");
        setOptions(result.options);
      } catch (error) {
        if (!controller.signal.aborted) {
          setOptions([]);
          setError(error instanceof Error ? error.message : "Falha na busca.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    startTransition(async () => {
      const res = await createEmployeeQuickAction({
        fullName: newFullName,
        cpf: newCpf,
        registration: newRegistration,
        role: newRole,
      });
      if (res.error) {
        setModalError(res.error);
      } else if (res.employee) {
        onChange(res.employee.id, res.employee.label);
        setOptions((prev) => [res.employee!, ...prev]);
        setOpenModal(false);
        setNewFullName("");
        setNewCpf("");
        setNewRegistration("");
        setNewRole("");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor="warehouse-manager-search" className="text-sm font-medium">
          Responsável *
        </label>
        <button
          type="button"
          onClick={() => {
            setModalError("");
            setOpenModal(true);
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
        >
          <UserPlus className="size-3.5" />
          + Novo Servidor
        </button>
      </div>
      <input
        id="warehouse-manager-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Pesquisar servidor por nome ou matrícula"
        className="h-9 w-full rounded-md border px-3 text-sm"
      />
      <select
        aria-label="Selecionar servidor responsável"
        name="managerId"
        required
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
            options.find((option) => option.id === event.target.value)?.label || "",
          )
        }
        className="h-9 w-full rounded-md border bg-white px-3 text-sm"
        aria-busy={loading}
      >
        <option value="" disabled>
          Selecione um servidor cadastrado
        </option>
        {value && !options.some((option) => option.id === value) && (
          <option value={value}>{selectedLabel}</option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p
        role={error ? "alert" : "status"}
        className={`text-xs ${error ? "text-red-700" : "text-slate-500"}`}
      >
        {error ||
          (loading
            ? "Buscando servidores..."
            : options.length
              ? "Até 20 resultados. Refine pelo nome ou matrícula."
              : "Nenhum servidor ativo encontrado para esta pesquisa.")}
      </p>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Servidor Responsável</DialogTitle>
            <DialogDescription>
              Cria o registro do servidor para vínculo imediato ao almoxarifado.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
            {modalError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-red-700">
                {modalError}
              </p>
            )}
            <div>
              <label className="mb-1 block font-semibold text-slate-700">Nome Completo *</label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Ex: Carlos da Silva"
                className="h-8 w-full rounded border px-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">CPF *</label>
                <input
                  type="text"
                  required
                  value={newCpf}
                  onChange={(e) => setNewCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="h-8 w-full rounded border px-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Matrícula</label>
                <input
                  type="text"
                  value={newRegistration}
                  onChange={(e) => setNewRegistration(e.target.value)}
                  placeholder="Ex: 12345"
                  className="h-8 w-full rounded border px-2 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-700">Cargo / Função</label>
              <input
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder="Ex: Encarregado de Almoxarifado"
                className="h-8 w-full rounded border px-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {pending ? "Cadastrando..." : "Cadastrar e Selecionar"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
