import { NextResponse, type NextRequest } from "next/server";
import { creaClientServer } from "@/lib/supabase/server";

// Chiude la sessione. Solo POST: un link non deve poter far uscire l'utente.
export async function POST(request: NextRequest) {
  const supabase = await creaClientServer();
  // "local": esce solo da questo dispositivo. Senza, l'uscita chiuderebbe anche telefono e altri browser.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
