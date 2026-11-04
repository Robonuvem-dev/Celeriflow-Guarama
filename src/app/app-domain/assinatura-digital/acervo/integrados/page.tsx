import { redirect } from "next/navigation";

// Integrated records enter through their source authorization; the historical
// unscoped Document listing must not bypass documentary ACLs or source scopes.
export default function IntegratedGedPage() { redirect("/assinatura-digital/origens"); }
