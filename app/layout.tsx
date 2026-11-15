import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { RegistraSW } from "@/components/RegistraSW";
import { ProviderLingua } from "@/lib/i18n/client";
import { dizionarioDi, traduzione } from "@/lib/i18n/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await traduzione();
  return {
    title: "MyWineApp",
    description: t("La mia cantina e le mie degustazioni"),
    icons: { icon: "/icon.svg" },
    appleWebApp: { capable: true, title: "MyWineApp", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#8e3b46",
  width: "device-width",
  initialScale: 1,
};

// La lingua si legge qui una volta (cookie "lingua", o la lingua del browser la prima volta) e arriva
// ai componenti del browser insieme al solo dizionario che serve.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { lingua } = await traduzione();
  return (
    <html lang={lingua} className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ProviderLingua lingua={lingua} dizionario={dizionarioDi(lingua)}>
          {children}
        </ProviderLingua>
        <RegistraSW />
      </body>
    </html>
  );
}
