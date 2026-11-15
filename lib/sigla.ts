// La sigla in apice accanto al nome dell'app (come un ™), da NEXT_PUBLIC_SIGLA: massimo 3 lettere.
// Vuota (predefinito) = nessuna sigla. Vale per il logo e per le icone dell'app.
export const SIGLA = (process.env.NEXT_PUBLIC_SIGLA ?? "").trim().slice(0, 3).toUpperCase();
