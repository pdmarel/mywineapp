import { NextResponse, type NextRequest } from "next/server";
import { creaClientServer } from "@/lib/supabase/server";
import { emailAbilitata } from "@/lib/persone";

// Arrivo dal link nell'email: scambia il codice monouso con una sessione.
export async function GET(request: NextRequest) {
  const codice = request.nextUrl.searchParams.get("code");
  const login = (errore: string) => NextResponse.redirect(new URL(`/login?errore=${errore}`, request.url));

  if (!codice) return login("link");

  const supabase = await creaClientServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(codice);
  if (error || !data.user) {
    console.error("Apertura sessione dal link fallita:", error?.message);
    return login("link");
  }

  // Secondo controllo: anche con un link valido entra solo chi è nell'elenco.
  if (!data.user.email || !(await emailAbilitata(data.user.email))) {
    await supabase.auth.signOut({ scope: "local" });
    return login("non_abilitata");
  }

  return NextResponse.redirect(new URL("/", request.url));
}
