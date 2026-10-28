"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Bell, LogOut, Menu, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { APP_VERSION } from "@/lib/version";
import styles from "./operational.module.css";

type DevicePolicy = "phone" | "tablet" | "desktop" | "unclassified";
const WorkspaceContext = createContext<{ userId: string; device: DevicePolicy; actionsHost: HTMLDivElement | null } | null>(null);

function getDevicePolicy(): DevicePolicy {
  if (typeof navigator === "undefined") return "unclassified";
  const agent = navigator.userAgent;
  const knownTablet = /iPad|Tablet|SM-T\w+|Nexus (?:7|9|10)/i.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  if (knownTablet || (/Android/i.test(agent) && !/Mobile/i.test(agent))) return "tablet";
  if (/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(agent)) return "phone";
  if (/Windows NT|Macintosh|X11|CrOS/.test(agent)) return "desktop";
  return "unclassified";
}

function subscribeDevice(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

export function useOperationalWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("A listagem operacional precisa do seu workspace.");
  return workspace;
}

export function OperationalHeaderActions({ children }: { children: ReactNode }) {
  const { actionsHost } = useOperationalWorkspace();
  return actionsHost ? createPortal(children, actionsHost) : null;
}

export function OperationalWorkspace({ title, moduleTitle, institutionName, userId, userName, userRole, navigation, onLogout, children }: {
  title: string;
  moduleTitle: string;
  institutionName: string;
  userId: string;
  userName: string;
  userRole: string;
  navigation: ModuleNavGroup[];
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const device = useSyncExternalStore(subscribeDevice, getDevicePolicy, () => "unclassified" as const);

  return <WorkspaceContext.Provider value={{ userId, device, actionsHost }}>
    <div className={styles.workspace} data-operational-workspace data-device={device}>
      <header className={styles.header} data-operational-header>
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <button type="button" className={styles.iconButton} onClick={() => setMenuOpen(true)} aria-label={`Abrir menu de ${moduleTitle}`} aria-expanded={menuOpen}><Menu /></button>
          <DialogContent className={styles.dialog} data-device={device}>
            <DialogHeader><DialogTitle>{moduleTitle}</DialogTitle><DialogDescription>{institutionName}</DialogDescription></DialogHeader>
            <nav aria-label={`Navegação de ${moduleTitle}`} className={styles.menuList}>
              {navigation.map((group) => <div key={group.title}>
                <p className={styles.menuGroup}>{group.title}</p>
                {group.items.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setMenuOpen(false)}><ArrowRight aria-hidden="true" />{item.title}</Link>)}
              </div>)}
              <Link href="/dashboard" onClick={() => setMenuOpen(false)}><ArrowLeft aria-hidden="true" />Voltar ao painel geral</Link>
            </nav>
            <button type="button" className={styles.dialogButton} onClick={() => setMenuOpen(false)}>Fechar menu</button>
          </DialogContent>
        </Dialog>
        <Link href="/dashboard" className={styles.brand} aria-label="CeleriFlow — painel geral" title={institutionName}><Image src="/favicon.png" alt="CeleriFlow" width={84} height={28} priority /></Link>
        <h1 className={styles.heading} title={`${title} — ${institutionName}`}>{title}</h1>
        <div ref={setActionsHost} className={styles.headerActions} data-operational-header-actions />
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={styles.iconButton} aria-label="Menu do usuário" />}><UserRound /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 overflow-y-hidden">
            <DropdownMenuLabel>{userName}</DropdownMenuLabel>
            <DropdownMenuLabel>{userRole} · CeleriFlow {APP_VERSION}</DropdownMenuLabel>
            <DropdownMenuItem render={<Link href="/notificacoes" />}><Bell />Notificações internas</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onLogout()}><LogOut />Sair</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <main className={styles.main} data-operational-main>{children}</main>
    </div>
  </WorkspaceContext.Provider>;
}
