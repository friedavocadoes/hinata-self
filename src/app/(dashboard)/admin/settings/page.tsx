import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSetting } from "./actions";

export default async function SettingsAdminPage() {
  const { profile } = await requireUser();
  if (profile?.role !== "finance_admin") throw new Error("Forbidden");
  const { data: settings, error } = await createAdminClient().from("global_settings").select("id, setting_key, setting_value, description, updated_at").order("setting_key");
  if (error) throw new Error(error.message);
  return <div className="p-8"><div className="mb-8"><h1 className="text-2xl font-semibold">System Settings</h1><p className="mt-1 text-sm text-zinc-500">Edit global costing constants. Changes are used by the next live costing calculation.</p></div><section className="overflow-hidden rounded-xl border bg-white shadow-sm"><table className="w-full text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-5 py-3 text-left">Setting</th><th className="px-5 py-3 text-left">Description</th><th className="px-5 py-3 text-right">Value</th><th className="px-5 py-3"/></tr></thead><tbody className="divide-y">{(settings ?? []).map((setting) => <tr key={setting.id}><td className="px-5 py-4 font-medium">{setting.setting_key}</td><td className="px-5 py-4 text-zinc-500">{setting.description ?? "—"}</td><td colSpan={2}><form action={updateSetting} className="flex items-center justify-end gap-2 px-5"><input type="hidden" name="id" value={setting.id}/><input name="description" type="hidden" value={setting.description ?? ""}/><input name="settingValue" type="number" step="0.00000001" defaultValue={Number(setting.setting_value)} className="w-44 rounded-lg border px-3 py-2 text-right"/><button className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white">Save</button></form></td></tr>)}</tbody></table></section></div>;
}
