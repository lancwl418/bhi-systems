import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { createServerSupabase, createServiceSupabase } from "@/lib/supabase/server";

async function getUserRole(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = await createServiceSupabase();
  const { data: profile } = await service
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.role ?? null;
}

export default async function ERPLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getUserRole();

  return (
    <div className="flex h-full">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header role={role} />
        <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
