import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  return {
    user,
    profile,
  };
}

export async function requireUser() {
  const result = await getCurrentUser();

  if (!result) {
    throw new Error("Unauthorized");
  }

  return result;
}

export async function requireFinanceAdmin() {
  const result = await requireUser();

  if (result.profile?.role !== "finance_admin") {
    throw new Error("Forbidden");
  }

  return result;
}
