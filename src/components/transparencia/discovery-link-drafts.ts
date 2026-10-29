import type { DiscoverySettings } from "@/lib/transparencia/discovery-settings";

const fields = ["title", "sectionId", "description", "href", "responsible", "reviewedAt", "order", "enabled"] as const;

/** Serializa o rascunho completo, independente da página/montagem do painel. */
export function writeDiscoveryLinkDrafts(form: FormData, links: DiscoverySettings["links"]) {
  for (const id of form.getAll("linkIds")) for (const field of fields) form.delete(`${id}.${field}`);
  form.delete("linkIds");
  for (const link of links) {
    form.append("linkIds", link.id);
    for (const field of fields) {
      if (field === "enabled") {
        if (link.enabled) form.set(`${link.id}.enabled`, "on");
        else form.delete(`${link.id}.enabled`);
      } else form.set(`${link.id}.${field}`, String(link[field]));
    }
  }
}
