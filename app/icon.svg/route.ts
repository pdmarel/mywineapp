import { SIGLA } from "@/lib/sigla";

// Icona dell'app (SVG). È una route e non un file fisso perché la sigla in apice dipende dalla configurazione
// (NEXT_PUBLIC_SIGLA): senza sigla resta solo il calice.
export const dynamic = "force-static";

export function GET() {
  const sigla = SIGLA
    ? `\n  <text x="418" y="138" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="72" letter-spacing="2" fill="#faf7f2">${SIGLA.replace(/[<>&"']/g, "")}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#8e3b46"/>
  <!-- calice -->
  <path d="M150 112h180c0 0 14 150-90 176c-104-26-90-176-90-176z" fill="#faf7f2"/>
  <path d="M159 190h162c-6 44-27 84-81 98c-54-14-75-54-81-98z" fill="#c8892b"/>
  <rect x="230" y="284" width="20" height="104" fill="#faf7f2"/>
  <rect x="172" y="384" width="136" height="20" rx="10" fill="#faf7f2"/>${sigla}
</svg>
`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
