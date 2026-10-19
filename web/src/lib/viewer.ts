import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { decodeClaims, homeForRole, type AppRole } from "@/lib/claims";

export type Viewer = {
  userId: string;
  email: string | null;
  phone: string | null;
  role: AppRole;
  manufacturerId: string | null;
  fullName: string | null;
  approvalLimitPaise: number | null;
  /** Delegated lead permissions (owners implicitly have all of them). */
  permissions: string[];
  manufacturer: { id: string; name: string; city: string | null; state: string; whatsapp_display_number: string | null } | null;
};

// Reads the session once per request (React cache) and loads the profile
// under RLS. Role and tenant come from the JWT the access token hook wrote.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await getSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const claims = decodeClaims(sessionData.session?.access_token);
  if (!claims?.app_role) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, approval_limit_paise, manufacturer_id, permissions")
    .eq("user_id", user.id)
    .maybeSingle();

  let manufacturer: Viewer["manufacturer"] = null;
  if (claims.manufacturer_id) {
    const { data } = await supabase
      .from("manufacturers")
      .select("id, name, city, state, whatsapp_display_number")
      .eq("id", claims.manufacturer_id)
      .maybeSingle();
    manufacturer = data;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    role: claims.app_role,
    manufacturerId: claims.manufacturer_id ?? null,
    fullName: profile?.full_name ?? null,
    approvalLimitPaise: profile?.approval_limit_paise ?? null,
    permissions: profile?.permissions ?? [],
    manufacturer,
  };
});

export async function requireViewer(roles?: AppRole[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (roles && !roles.includes(viewer.role)) redirect(homeForRole(viewer.role));
  return viewer;
}
