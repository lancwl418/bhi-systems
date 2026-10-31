import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPathAllowed, homePath } from "@/lib/access";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  // Paths with their own auth (or none) — skip session and role checks
  const selfAuthed =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/orders/import") ||
    // External support API authenticates with its own bearer token in-route
    pathname.startsWith("/api/v1/");

  // Redirect unauthenticated users to login
  if (!user && !selfAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Role-based section access: restricted roles (e.g. cs → Support only) are
  // bounced to their home section when visiting anything else.
  if (user && !selfAuthed) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = profile?.role;
    if (role && !isPathAllowed(role, pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = homePath(role);
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
