import { getTaxPasswordSetting } from "./actions";
import { PasswordSetting } from "./PasswordSetting";
export const dynamic="force-dynamic";
export default async function TaxPasswordSettingsPage(){const setting=await getTaxPasswordSetting();return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Confirmação de senha na Tributação</h1><PasswordSetting initialRequired={setting.required}/></div>;}
