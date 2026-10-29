"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OperationalSurface } from "./OperationalWorkspace";

/**
 * Painel contextual para OperationalListFrame, tabela e paginação.
 * Mantenha rascunhos e seleção não salva no estado do componente pai e passe
 * valores/controladores aos filhos: o conteúdo pode desmontar ao fechar.
 * DialogContent não expõe keepMounted (disponível apenas no Portal da Base UI).
 * OperationalSurface fornece o provider local, header de 36px e main restante.
 */
export function OperationalTablePanel({ title, triggerLabel, description, children }: {
  title: string;
  triggerLabel?: string;
  description?: string;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog>
      <DialogTrigger ref={triggerRef} render={<Button type="button" variant="outline" size="sm" />}>
        {triggerLabel ?? `Abrir ${title}`}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        finalFocus={triggerRef}
        className="flex! h-dvh! max-h-none! w-dvw! max-w-none! min-h-0 min-w-0 flex-col gap-0! overflow-hidden! rounded-none! p-0! sm:max-w-none!"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {description ?? `Tabela de ${title} em tela cheia.`}
        </DialogDescription>
        <OperationalSurface
          title={title}
          actions={
            <DialogClose render={<Button type="button" variant="outline" size="sm" />}>
              Fechar
            </DialogClose>
          }
        >
          {children}
        </OperationalSurface>
      </DialogContent>
    </Dialog>
  );
}
