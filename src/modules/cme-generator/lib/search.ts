// Ricerca testuale condivisa: ogni parola digitata deve comparire in almeno uno dei campi
// (tariffa/codice, descrizione, prezzario…), senza distinguere maiuscole e minuscole.
const searchWords = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

export function matchesQuery(fields: (string | undefined | null)[], q: string): boolean {
  const words = searchWords(q);
  if (words.length === 0) return true;
  const hay = fields.map(f => (f ?? '').toLowerCase());
  return words.every(w => hay.some(f => f.includes(w)));
}

// Filtri PostgREST per la ricerca nel prezzario: una clausola or(codice, descrizione) per parola.
// Il valore va tra virgolette per proteggere virgole e parentesi; * e % digitati dall'utente vengono tolti.
export function textOrFilters(q: string): string[] {
  return searchWords(q)
    .slice(0, 6)
    .map(w => w.replace(/[*%]/g, ''))
    .filter(Boolean)
    .map(w => {
      const v = w.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `codice.ilike."*${v}*",descrizione.ilike."*${v}*"`;
    });
}
