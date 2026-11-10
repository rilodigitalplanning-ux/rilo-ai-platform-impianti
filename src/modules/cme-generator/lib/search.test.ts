import { describe, it, expect } from 'vitest';
import { matchesQuery, textOrFilters } from './search';

describe('ricerca per tariffa e descrizione', () => {
  const fields = ['015003r', 'Impianto elettrico per punto presa di corrente', 'DEI ELETTRICI 2025'];
  it('trova per tariffa (anche parziale) e per descrizione', () => {
    expect(matchesQuery(fields, '015003')).toBe(true);
    expect(matchesQuery(fields, '015003R')).toBe(true);
    expect(matchesQuery(fields, 'presa')).toBe(true);
    expect(matchesQuery(fields, 'cavo')).toBe(false);
  });
  it('più parole: tutte devono comparire, in campi qualsiasi', () => {
    expect(matchesQuery(fields, '015003 presa')).toBe(true);
    expect(matchesQuery(fields, 'presa 2025')).toBe(true);
    expect(matchesQuery(fields, '015003 cavo')).toBe(false);
  });
  it('query vuota = tutto', () => expect(matchesQuery(fields, '  ')).toBe(true));
  it('filtri PostgREST: una clausola or per parola, valori protetti', () => {
    const f = textOrFilters('015003 pre,sa');
    expect(f).toHaveLength(2);
    expect(f[0]).toBe('codice.ilike."*015003*",descrizione.ilike."*015003*"');
    expect(f[1]).toContain('"*pre,sa*"');
    expect(textOrFilters('% *')).toEqual([]);
  });
});
