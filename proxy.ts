import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigurato } from "@/lib/supabase/config";

// Eseguito prima di ogni pagina: rinnova la sessione Supabase e manda al login chi non è entrato.
export async function proxy(request: NextRequest) {
  if (!supabaseConfigurato()) return NextResponse.next({ request });

  let risposta = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(daImpostare) {
        for (const { name, value } of daImpostare) request.cookies.set(name, value);
        risposta = NextResponse.next({ request });
        for (const { name, value, options } of daImpostare) {
          risposta.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const percorso = request.nextUrl.pathname;

  // Il link dell'email può riportare alla pagina iniziale con "?code=..." (succede quando
  // l'indirizzo di ritorno non è tra quelli ammessi in Supabase): lo giriamo alla route che apre la sessione.
  if (request.nextUrl.searchParams.has("code") && !percorso.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }
  // Il lavoro notturno non ha un utente: si protegge da solo con CRON_SECRET.
  const pubblico = percorso.startsWith("/login") || percorso.startsWith("/auth") || percorso.startsWith("/api/cron");

  if (!user && !pubblico) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (user && percorso.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return risposta;
}

export const config = {
  // Tutto tranne file statici, immagini, icone e manifest.
  matcher: ["/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
