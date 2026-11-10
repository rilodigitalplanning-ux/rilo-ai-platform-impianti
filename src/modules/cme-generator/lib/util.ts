/** Copia profonda di dati JSON (le analisi NVP si copiano su ogni elemento) */
export const deepClone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));
