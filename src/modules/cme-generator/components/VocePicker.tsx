import React, { useEffect, useState } from 'react';
import { Search, Loader2, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { listPrezzarios } from '../services/prezzarioService';
import { searchVoci, type VoceHit } from '../services/consultaService';
import type { PrezzarioRecord } from '../types';
import type { VoceChoice } from '../services/pricing';

interface Props {
  selected: VoceChoice | null;
  initialQuery?: string;
  onSelect: (v: VoceChoice) => void;
}

const CODE_LIKE = /^[A-Za-z0-9]+([.\-/][A-Za-z0-9]+)+$/;
const fmt = (v: number) => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Selettore di una voce di prezzario: scelta del prezzario + ricerca per testo o codice.
export const VocePicker: React.FC<Props> = ({ selected, onSelect, initialQuery = '' }) => {
  const { moduleTheme, prezzariVersion } = useApp();
  const [prezzari, setPrezzari] = useState<PrezzarioRecord[]>([]);
  const [prezzarioId, setPrezzarioId] = useState<string>('');
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<VoceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listPrezzarios().then(setPrezzari).catch(() => {}); }, [prezzariVersion]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); setError(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const nome = prezzari.find(p => String(p.id) === prezzarioId)?.nome;
      const args = CODE_LIKE.test(q)
        ? { codice: q, prezzario: nome, limit: 30 }
        : { terms: q.split(/\s+/).filter(Boolean), prezzario: nome, limit: 30 };
      const res = await searchVoci(args, prezzari);
      setLoading(false);
      if (res.error) { setError(res.error); setHits([]); } else setHits(res.results ?? []);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, prezzarioId, prezzari]);

  const inputCls = 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-[12px] outline-none dark:text-white';

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={prezzarioId} onChange={e => setPrezzarioId(e.target.value)} className={`${inputCls} w-52 shrink-0`}>
          <option value="">Tutti i prezzari</option>
          {prezzari.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per descrizione (es. cavo FG16 4x6) o per codice…"
            className={`${inputCls} w-full pl-9`}
          />
        </div>
      </div>

      <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-64 overflow-y-auto custom-scrollbar">
        {loading && <div className="p-4 flex justify-center opacity-50"><Loader2 size={16} className="animate-spin" /></div>}
        {!loading && error && <p className="p-3 text-[11px] text-red-500">{error}</p>}
        {!loading && !error && query.trim() && hits.length === 0 && (
          <p className="p-4 text-[11px] opacity-50 text-center">Nessuna voce trovata.</p>
        )}
        {!loading && !query.trim() && (
          <p className="p-4 text-[11px] opacity-40 text-center">Scrivi per cercare una voce nei prezzari.</p>
        )}
        {hits.map(h => {
          const isSel = !!selected && selected.codice === h.codice && selected.prezzarioNome === h.prezzario;
          return (
            <button
              key={`${h.prezzarioId}|${h.codice}`}
              onClick={() => onSelect({
                codice: h.codice, descrizione: h.descrizione, um: h.um, valore: h.valore,
                categoria: h.categoria, prezzarioId: h.prezzarioId, prezzarioNome: h.prezzario,
              })}
              className={`w-full text-left px-3 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0 flex items-start gap-3 transition-colors ${
                isSel ? '' : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              style={isSel ? { backgroundColor: `${moduleTheme.accent}1a` } : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold font-mono">{h.codice} <span className="font-sans font-normal opacity-40">· {h.prezzario}</span></p>
                <p className="text-[11px] opacity-70 line-clamp-2">{h.descrizione}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12px] font-black">€ {fmt(h.valore)}</p>
                <p className="text-[10px] opacity-40">{h.um}</p>
              </div>
              {isSel && <Check size={14} className="mt-1 shrink-0" style={{ color: moduleTheme.accent }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
