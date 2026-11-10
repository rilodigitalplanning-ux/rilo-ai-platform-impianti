import React, { useMemo, useState } from 'react';
import { Search, Pencil, AlertTriangle, ChevronRight, ChevronDown, Copy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCme } from '../../context/CmeContext';
import { EmptyProjectNotice } from '../EmptyProjectNotice';
import { NvpBuilderModal } from '../NvpBuilderModal';
import { applyNvpToGroup, groupNvp, type NvpGroup } from '../../services/nvpGroups';
import { matchesQuery } from '../../lib/search';
import type { NvpDetails } from '../../services/pricing';

const fmt = (v: number) => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (v: number) => v.toLocaleString('it-IT', { maximumFractionDigits: 2 });

// Analisi di partenza per la finestra di modifica: quella più diffusa tra gli elementi del gruppo
function referenceDetails(g: NvpGroup): NvpDetails | undefined {
  const counts = new Map<string, { n: number; d: NvpDetails }>();
  for (const e of g.entries) {
    if (!e.nvpDetails) continue;
    const k = JSON.stringify(e.nvpDetails, (key, v) => (key === 'id' ? undefined : v));
    const c = counts.get(k) ?? { n: 0, d: e.nvpDetails };
    c.n++; counts.set(k, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.d;
}

const Badge: React.FC<{ tone: 'amber' | 'red'; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span
    title={title}
    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${tone === 'red' ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'}`}
  >{children}</span>
);

export const AnalisiPrezziView: React.FC = () => {
  const { moduleTheme, showToast } = useApp();
  const { getAllEffectiveResults, dispatch, state, totalAmount } = useCme();
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<NvpGroup | null>(null);

  const groups = useMemo(() => groupNvp(getAllEffectiveResults()), [getAllEffectiveResults]);

  const visible = useMemo(() => groups.filter(g =>
    (!onlyMissing || g.senzaAnalisi > 0) &&
    (!onlyAlerts || g.conflitto || g.analisiDiverse) &&
    matchesQuery([g.codice, ...g.descrizioni], search),
  ), [groups, search, onlyMissing, onlyAlerts]);

  if (state.resultados.size === 0) return <EmptyProjectNotice title="Analisi Prezzi" />;

  const nMissing = groups.filter(g => g.senzaAnalisi > 0).length;
  const nConflitti = groups.filter(g => g.conflitto).length;
  const nAvvisi = groups.filter(g => g.conflitto || g.analisiDiverse).length;
  const nElementi = groups.reduce((s, g) => s + g.entries.length, 0);
  const nvpTotal = groups.reduce((s, g) => s + g.importo, 0);

  const toggle = (key: string) => setOpen(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  function startEdit(g: NvpGroup) { setEditing(g); }

  function confirmEdit(g: NvpGroup, details: NvpDetails, fonte: string) {
    if (g.analisiDiverse && !window.confirm(
      `Gli elementi di "${g.codice}" hanno analisi diverse tra loro.\nVerranno tutti sostituiti con questa analisi. Continuare?`,
    )) return;
    dispatch({ type: 'APPLY_AGENT_CHANGES', payload: { ...applyNvpToGroup(g, details, fonte), label: `Analisi NVP ${g.codice}` } });
    showToast(`Analisi di ${g.codice} aggiornata su ${g.entries.length} element${g.entries.length === 1 ? 'o' : 'i'}.`, 'success');
    setEditing(null);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#060A12] text-gray-900 dark:text-white">
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14] shrink-0">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca tariffa NVP o descrizione…"
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-[12px] outline-none"
          />
        </div>
        {([
          ['Senza analisi', nMissing, onlyMissing, setOnlyMissing],
          ['Con avvisi', nAvvisi, onlyAlerts, setOnlyAlerts],
        ] as const).map(([label, n, on, set]) => (
          <button
            key={label}
            onClick={() => set(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${on ? 'text-white' : 'opacity-60 hover:opacity-100 border border-black/10 dark:border-white/10'}`}
            style={on ? { backgroundColor: moduleTheme.accent } : undefined}
          >
            <AlertTriangle size={12} /> {label} ({n})
          </button>
        ))}
        <span className="text-[10px] opacity-40">{visible.length} di {groups.length} NVP · {nElementi} element{nElementi === 1 ? 'o' : 'i'}</span>
      </div>

      {nConflitti > 0 && (
        <div className="mx-6 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-600 dark:text-red-400 shrink-0">
          <p className="font-bold flex items-center gap-2"><AlertTriangle size={14} /> {nConflitti} tariff{nConflitti === 1 ? 'a' : 'e'} con testi descrittivi diversi</p>
          <p className="opacity-80 mt-1">La tariffa deve essere univoca: lo stesso codice identifica la stessa voce. Apri le righe segnalate per vedere gli elementi coinvolti e correggi il codice o la descrizione.</p>
        </div>
      )}

      <div className="flex-1 overflow-auto custom-scrollbar">
        {groups.length === 0 ? (
          <div className="py-24 text-center opacity-50">
            <p className="text-sm font-bold">Nessuna NVP nel progetto</p>
            <p className="text-[11px] mt-1">Le NVP compaiono qui quando un elemento ha una tariffa NVP o quando sostituisci una voce con una NVP dall'Elenco Prezzi.</p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-gray-50 dark:bg-[#060A12] z-10">
              <tr className="text-left text-[9px] font-bold uppercase tracking-widest opacity-50">
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3">Tariffa</th>
                <th className="px-3 py-3">Descrizione</th>
                <th className="px-3 py-3 text-right">El.</th>
                <th className="px-3 py-3 text-right">Quantità</th>
                <th className="px-3 py-3">UM</th>
                <th className="px-3 py-3 text-right">Prezzo un.</th>
                <th className="px-3 py-3 text-right">Importo</th>
                <th className="px-3 py-3">Fonte</th>
                <th className="px-6 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {visible.map(g => {
                const isOpen = open.has(g.key);
                return (
                  <React.Fragment key={g.key}>
                    <tr onClick={() => startEdit(g)} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                      <td className="px-3 py-2.5">
                        <button
                          onClick={e => { e.stopPropagation(); toggle(g.key); }}
                          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10" title="Mostra gli elementi"
                        >{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold whitespace-nowrap">{g.codice || '—'}</td>
                      <td className="px-3 py-2.5 max-w-[360px]">
                        <span className="line-clamp-2">{g.descrizioni[0]}</span>{' '}
                        <span className="inline-flex flex-wrap gap-1">
                          {g.conflitto && <Badge tone="red" title={g.descrizioni.join('\n')}>{g.descrizioni.length} testi diversi</Badge>}
                          {g.analisiDiverse && <Badge tone="amber" title="Gli elementi hanno analisi diverse">analisi diverse</Badge>}
                          {g.senzaAnalisi > 0 && <Badge tone="amber">senza analisi{g.senzaAnalisi < g.entries.length ? ` (${g.senzaAnalisi})` : ''}</Badge>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{g.entries.length}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtQty(g.qty)}</td>
                      <td className="px-3 py-2.5">{g.entries[0].result.unidade}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{g.prezzo === null ? <span className="opacity-50">vari</span> : `€ ${fmt(g.prezzo)}`}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap font-bold">€ {fmt(g.importo)}</td>
                      <td className="px-3 py-2.5 opacity-70 max-w-[180px] truncate">{g.entries[0].fonte}</td>
                      <td className="px-6 py-2.5 text-right"><Pencil size={13} className="inline opacity-50" /></td>
                    </tr>
                    {isOpen && g.entries.map(e => (
                      <tr key={e.id} className="bg-black/[0.03] dark:bg-white/[0.03] text-[10.5px]">
                        <td />
                        <td className="px-3 py-1.5 opacity-50 text-right"><Copy size={11} className="inline" /></td>
                        <td className="px-3 py-1.5 max-w-[360px]">
                          <span className="line-clamp-1">{e.descrizione}</span>
                          <span className="opacity-50">{e.wbs.join(' › ')}</span>
                        </td>
                        <td />
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{fmtQty(e.qty)}</td>
                        <td />
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">€ {fmt(e.valoreUnitario)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">€ {fmt(e.importo)}</td>
                        <td colSpan={2} />
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-12 text-center opacity-40">Nessuna NVP corrisponde ai filtri.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14] shrink-0">
        <span className="text-[10px] opacity-40 uppercase tracking-widest">
          Importo NVP: € {fmt(nvpTotal)} · {totalAmount > 0 ? Math.round((nvpTotal / totalAmount) * 100) : 0}% del computo
        </span>
        <span className="text-sm font-black" style={{ color: moduleTheme.accent }}>€ {fmt(totalAmount)}</span>
      </div>

      {editing && (
        <NvpBuilderModal
          elemento={{
            descricao: editing.descrizioni[0], descrizioneElemento: `${editing.codice} — ${editing.descrizioni[0]}`,
            edificio: `${editing.entries.length} element${editing.entries.length === 1 ? 'o' : 'i'}`, edifcio: '', livello: 'analisi condivisa',
          } as any}
          initialNvpDetails={referenceDetails(editing)}
          onConfirm={(_valore, fonte, details) => confirmEdit(editing, details, fonte)}
          onSkip={() => setEditing(null)}
        />
      )}
    </div>
  );
};
