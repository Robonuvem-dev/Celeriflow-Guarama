"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetTrigger 
} from "@/components/ui/sheet";
import { createMeterReading } from "../actions";
import { ConsumerUnitPicker } from "./ConsumerUnitPicker";
import { CompetencePicker } from "./CompetencePicker";
import styles from "./sanitation.module.css";

export function NewReadingSheet() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      const result = await createMeterReading({
        unitId: formData.get("unitId") as string,
        competence: formData.get("competence") as string,
        previousValue: parseFloat(formData.get("previousValue") as string),
        currentValue: parseFloat(formData.get("currentValue") as string),
        readerName: formData.get("readerName") as string,
      });
      if (result.error) {
        alert(result.error);
        return;
      }
      setOpen(false);
    } catch {
      alert("Erro ao cadastrar leitura.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<button className="flex h-8 items-center gap-2 rounded-md bg-[#0284C7] px-3 text-sm font-medium text-white transition-colors hover:bg-[#0369A1]" />}>
        <FileText className="h-5 w-5" />
        Nova Leitura
      </SheetTrigger>
      <SheetContent side="right" className={styles.sheet}>
        <SheetHeader>
          <SheetTitle>Registrar Leitura</SheetTitle>
          <SheetDescription>
            Registre a medição mensal de consumo de água.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 pb-2">
          <ConsumerUnitPicker required activeOnly />
          <CompetencePicker />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Leitura Anterior</label>
              <input
                type="number"
                name="previousValue"
                step="0.01"
                min="0"
                required
                className="w-full p-2 border rounded-md"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Leitura Atual</label>
              <input
                type="number"
                name="currentValue"
                step="0.01"
                min="0"
                required
                className="w-full p-2 border rounded-md"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Leiturista (Nome)</label>
            <input
              name="readerName"
              required
              className="w-full p-2 border rounded-md"
              placeholder="João da Silva"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0284C7] rounded-md hover:bg-[#0369A1] disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Salvar Leitura"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
