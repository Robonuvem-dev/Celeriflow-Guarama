import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import GEDClient from "@/app/app-domain/documentos/ged/GEDClient";
import { db } from "@/db/client";
import { listGedDocuments, listGedFolders, listGedSelectors, readGedFolder } from "@/db/repositories/documents/queries";

export const dynamic = "force-dynamic";

export default async function GEDPage({ searchParams }: { searchParams: Promise<{ folderId?: string; view?: string }> }) {
  await getTenantContextForModule("DOCUMENTOS");
  const resolved = await searchParams;
  const currentFolderId = resolved?.folderId || null;
  const view = resolved?.view || null;
  const { documentClasses, signers } = await listGedSelectors(db);
  const currentFolder = currentFolderId ? await readGedFolder(db, currentFolderId) : null;
  const rootFolders = await listGedFolders(db, null);
  const displayFolders = currentFolderId ? await listGedFolders(db, currentFolderId) : rootFolders;
  const documents = await listGedDocuments(db, currentFolderId, view === "recentes");

  return <GEDClient key={`${currentFolderId ?? "root"}:${view ?? "all"}`} folders={displayFolders} documents={documents} currentFolderId={currentFolderId} documentClasses={documentClasses} signers={signers}
    navigation={<nav aria-label="Navegação do GED" className="grid gap-2">
      <p>GED{currentFolder?.parent ? ` / ${currentFolder.parent.name}` : ""}{currentFolder ? ` / ${currentFolder.name}` : ""}{view === "recentes" ? " / Recentes" : ""}</p>
      <Link href="/documentos/ged">Raiz</Link>
      <Link href="/documentos/ged?view=recentes">Recentes</Link>
      {currentFolderId && <Link href={currentFolder?.parentId ? `/documentos/ged?folderId=${currentFolder.parentId}` : "/documentos/ged"}>Voltar para {currentFolder?.parent?.name || "Raiz"}</Link>}
      <form action="/documentos/ged" method="get" className="grid gap-2"><label>Pastas da raiz<select name="folderId" defaultValue={currentFolderId ?? ""} className="block h-8 w-full rounded border"><option value="">Raiz</option>{rootFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="h-7 rounded border px-2">Abrir pasta</button></form>
    </nav>} />;
}
