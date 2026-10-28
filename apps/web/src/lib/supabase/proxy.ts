import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "@/lib/env";
import { demoHostRedirect, mainSiteUrlOf } from "@/lib/site/demo-host";
import { isPublicPath } from "@/lib/site/public-paths";

// Refreshes the auth session on every request and sends signed-out users to
// the login page, except on the public site (isPublicPath). Section-level authorization happens in the section layouts.
// On a demo host (ORCHADOS_MAIN_SITE_URL, docs/demo-turu.md §11.1) pages
// other than /demo and /portal go to the main site, and signed-out visitors
// to /demo instead of the login page.
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const mainSiteUrl = mainSiteUrlOf(process.env.ORCHADOS_MAIN_SITE_URL);
  const host = demoHostRedirect(path, mainSiteUrl, request.nextUrl.search);
  if (host.kind === "main") return NextResponse.redirect(host.location, 307);
  if (host.kind === "local") {
    const url = request.nextUrl.clone();
    url.pathname = host.location;
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() validates the JWT; do not run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublicPath(path)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.search = "";
    if (mainSiteUrl) {
      loginUrl.pathname = "/demo";
    } else {
      loginUrl.pathname = "/giris";
      loginUrl.searchParams.set("next", path);
    }
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
