import { redirect } from "next/navigation";

// L'inserimento di una bottiglia sta ora nella pagina «Inserimento rapido», che funziona anche senza rete.
// Questo indirizzo resta per i vecchi collegamenti e preferiti.
export default async function PaginaNuovaBottiglia({ params }: PageProps<"/cantine/[id]/nuova">) {
  const { id } = await params;
  redirect(`/inserimento?cantina=${encodeURIComponent(id)}`);
}
