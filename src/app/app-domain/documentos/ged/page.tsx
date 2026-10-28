import { Folder as FolderIcon, Clock, ArrowLeft, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import GEDClient from "./GEDClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listGedDocuments, listGedFolders, listGedSelectors, readGedFolder } from "@/db/repositories/documents/queries";

export const dynamic = "force-dynamic";

export default async function GEDPage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string; view?: string }>;
}) {
  await getTenantContextForModule("DOCUMENTOS");
  const resolved = await searchParams;
  const currentFolderId = resolved?.folderId || null;
  const view = resolved?.view || null;
  const { documentClasses, signers } = await listGedSelectors(db);

  // Current folder metadata
  let currentFolder = null;
  if (currentFolderId) {
    currentFolder = await readGedFolder(db, currentFolderId);
  }

  // All root folders for sidebar
  const rootFolders = await listGedFolders(db, null);

  // Folders to show in main grid
  const displayFolders = currentFolderId
    ? await listGedFolders(db, currentFolderId)
    : rootFolders;

  // Documents query based on view/folder
  const documents = await listGedDocuments(db, currentFolderId, view === "recentes");

  return (
    <PageFrame className="h-full space-y-2 overflow-y-auto">
      <PageHeader title="Gerenciamento Eletrônico de Documentos" icon={<FolderIcon className="size-4 shrink-0 text-indigo-600" />} />
      <div>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 mt-1 text-sm text-slate-400 flex-wrap">
          <Link href="/documentos/ged" className="hover:text-indigo-600 transition-colors">GED</Link>
          {currentFolder?.parent && (
            <>
              <span>/</span>
              <Link href={`/documentos/ged?folderId=${currentFolder.parentId}`} className="hover:text-indigo-600 transition-colors">
                {currentFolder.parent.name}
              </Link>
            </>
          )}
          {currentFolder && (
            <>
              <span>/</span>
              <span className="text-slate-700 font-semibold">{currentFolder.name}</span>
            </>
          )}
          {view === "recentes" && (
            <>
              <span>/</span>
              <span className="text-slate-700 font-semibold">Recentes</span>
            </>
          )}
        </nav>
      </div>

      {/* Layout: sidebar + main */}
      <div className="flex gap-3">
        {/* Sidebar - only on large screens */}
        <aside className="w-52 shrink-0 hidden lg:flex flex-col gap-1">
          <div className="sticky top-4 rounded-md border border-slate-200 bg-white p-2.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-2">Acesso Rápido</p>
            <Link
              href="/documentos/ged"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                !currentFolderId && !view ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" /> Raiz
            </Link>
            <Link
              href="/documentos/ged?view=recentes"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                view === "recentes" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" /> Recentes
            </Link>

            {rootFolders.length > 0 && (
              <>
                <div className="border-t border-slate-100 my-2" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">Pastas</p>
                {rootFolders.map((f) => (
                  <Link
                    key={f.id}
                    href={`/documentos/ged?folderId=${f.id}`}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentFolderId === f.id
                        ? "bg-amber-50 text-amber-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <FolderIcon className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span className="truncate">{f.name}</span>
                  </Link>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {currentFolderId && (
            <div className="mb-4">
              <Link
                href={
                  currentFolder?.parentId
                    ? `/documentos/ged?folderId=${currentFolder.parentId}`
                    : "/documentos/ged"
                }
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para {currentFolder?.parent?.name || "Raiz"}
              </Link>
            </div>
          )}

          {/* GEDClient renders: action buttons, folder grid, file table, and modals */}
          <GEDClient
            folders={displayFolders}
            documents={documents}
            currentFolderId={currentFolderId}
            documentClasses={documentClasses}
            signers={signers}
          />
        </div>
      </div>
    </PageFrame>
  );
}
