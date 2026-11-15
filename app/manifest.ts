import type { MetadataRoute } from "next";
import { traduzione } from "@/lib/i18n/server";

// Rende l'app installabile sul telefono ("Aggiungi a schermata Home").
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t, lingua } = await traduzione();
  return {
    name: "MyWineApp",
    short_name: "MyWineApp",
    description: t("La mia cantina e le mie degustazioni"),
    lang: lingua,
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#8e3b46",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
