"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { creaTraduttore, inItaliano, localeDi, type Dizionario, type Lingua, type Traduttore } from "./lingue";

// La lingua lato browser. Il layout passa la lingua e il solo dizionario di quella lingua;
// i componenti la usano con:  const t = useT();   oppure   const { t, lingua, locale } = useLingua();

type Contesto = { t: Traduttore; lingua: Lingua; locale: string };

const ContestoLingua = createContext<Contesto>({ t: inItaliano, lingua: "it", locale: "it-IT" });

export function ProviderLingua({ lingua, dizionario, children }: { lingua: Lingua; dizionario: Dizionario; children: ReactNode }) {
  const valore = useMemo(() => ({ t: creaTraduttore(lingua, dizionario), lingua, locale: localeDi(lingua) }), [lingua, dizionario]);
  return <ContestoLingua.Provider value={valore}>{children}</ContestoLingua.Provider>;
}

export function useLingua(): Contesto {
  return useContext(ContestoLingua);
}

export function useT(): Traduttore {
  return useContext(ContestoLingua).t;
}
