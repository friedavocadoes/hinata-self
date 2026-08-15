import { requireUser } from "@/lib/auth/permissions";

export default async function DashboardPage() {
  const { profile } = await requireUser();

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Dashboard</h1>

      <p className="mt-2 text-muted-foreground">
        Welcome, {profile?.full_name}
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        Role: {profile?.role}
      </p>
    </main>
  );
}
