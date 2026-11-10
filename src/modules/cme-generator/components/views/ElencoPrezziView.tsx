import React, { useMemo, useState } from 'react';
import { Search, Plus, Replace, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCme } from '../../context/CmeContext';
import { fmt, fmtQty } from '../../lib/format';
import { EmptyProjectNotice } from '../EmptyProjectNotice';
import { ReplaceVoceDialog } from '../ReplaceVoceDialog';
import { AddItemDialog } from '../AddItemDialog';
import { matchesQuery } from '../../lib/search';
import { groupVoci, deleteVoce, type VoceRow, type Changes } from '../../services/pricing';

type Filter = 'tutte' | 'voce' | 'nvp' | 'risorsa' | 'nf';


export const ElencoPrezziView: React.FC = () => {
  const { moduleTheme, showToast } = useApp();
  const { getAllEffectiveResults, dispatch, state, totalAmount } = useCme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('tutte');
  const [replacing, setReplacing] = useState<VoceRow | null>(null);
  const [adding, setAdding] = useState(false);

  const results = useMemo(() => getAllEffectiveResults(), [getAllEffectiveResults]);
  const rows = useMemo(() => groupVoci(results).sort((a, b) => b.importo - a.importo), [results]);

  const visible = useMemo(() => {
    return rows.filter(r =>
      (filter === 'tutte' || r.kind === filter) &&
      matchesQuery([r.codice, r.descrizione, r.prezzario], search),
    );
  }, [rows, search, filter]);

  if (state.resultados.size === 0) return <EmptyProjectNotice title="Elenco Prezzi" />;

  function apply(changes: Changes, message: string) {
    dispatch({ type: 'APPLY_CHANGES', payload: changes });
    showToast(message, 'success');
  }

  function handleDelete(row: VoceRow) {
    if (!window.confirm(`Eliminare la voce "${row.descrizione}" da ${row.nElementi} element${row.nElementi === 1 ? 'o' : 'i'}?\nGli elementi che restano senza voci vengono rimossi dal computo.`)) return;
    const changes = deleteVoce(results, row.key);
    apply(changes, `Voce eliminata (${changes.upsert.length + changes.remove.length} elementi modificati).`);
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'tutte', label: 'Tutte' },
    { id: 'voce', label: 'Prezzario' },
    { id: 'nvp', label: 'NVP' },
    { id: 'risorsa', label: 'Manodopera/Noleggi' },
    { id: 'nf', label: 'Non trovate' },
  ];
  const kindBadge = (r: VoceRow) =>
    r.kind === 'nvp'
      ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-500">NVP</span>
      : r.kind === 'risorsa'
        ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/15 text-violet-500 uppercase" title="Compresa nel prezzo di una NVP: non si somma al totale">{r.tipoRisorsa} in NVP</span>
        : r.kind === 'nf'
        ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-500">NON TROVATO</span>
        : null;
  const conflictBadge = (r: VoceRow) => r.conflitto
    ? <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-500 uppercase" title={'La tariffa deve essere univoca. Testi diversi:\n' + r.descrizioni.join('\n')}>tariffa con testi diversi</span>
    : null;

  const nRisorse = rows.filter(r => r.kind === 'risorsa').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1018] shrink-0">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca tariffa, descrizione o prezzario…"
            className="w-full bg-white dark:bg-white/5 border border-slate-300 dark:border-white/15 rounded pl-9 pr-3 py-1 text-[12px] outline-none focus:border-[#0F3460]"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded text-[12px] font-semibold transition-colors ${filter === f.id ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'}`}
              
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-slate-500 dark:text-slate-400 ml-2">{visible.length} voci</span>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: moduleTheme.primary }}
        >
          <Plus size={13} /> Aggiungi
        </button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-slate-50 dark:bg-[#0E1522] z-10">
            <tr className="text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <th className="px-4 py-1.5">Codice</th>
              <th className="px-3 py-1.5">Descrizione</th>
              <th className="px-3 py-1.5">UM</th>
              <th className="px-3 py-1.5">Prezzario</th>
              <th className="px-3 py-1.5 text-right">El.</th>
              <th className="px-3 py-1.5 text-right">Quantità</th>
              <th className="px-3 py-1.5 text-right">Prezzo un.</th>
              <th className="px-3 py-1.5 text-right">Importo</th>
              <th className="px-4 py-1.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.key} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                <td className="px-4 py-1.5 font-mono font-bold whitespace-nowrap">{r.codice || '—'}</td>
                <td className="px-3 py-1.5 max-w-[420px]">
                  <span className="line-clamp-2">{r.descrizione}</span> {kindBadge(r)}{conflictBadge(r)}
                </td>
                <td className="px-3 py-1.5">{r.um}</td>
                <td className="px-3 py-1.5 opacity-70 whitespace-nowrap">{r.prezzario}</td>
                <td className="px-3 py-1.5 text-right">{r.nElementi}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">{fmtQty(r.quantita)}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">€ {fmt(r.valoreUnitario)}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap font-bold">€ {fmt(r.importo)}</td>
                <td className="px-4 py-1.5">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setReplacing(r)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10" title="Sostituisci voce">
                      <Replace size={14} />
                    </button>
                    <button onClick={() => handleDelete(r)} className="p-1 rounded text-red-500 hover:bg-red-500/10" title="Elimina voce">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center opacity-40">Nessuna voce corrisponde alla ricerca.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E1522] shrink-0">
        <span className="text-[10px] opacity-40 uppercase tracking-widest">Totale computo{nRisorse > 0 ? ' · le righe Manodopera/Noleggi sono comprese nelle NVP' : ''}</span>
        <span className="text-sm font-black" style={{ color: moduleTheme.accent }}>€ {fmt(totalAmount)}</span>
      </div>

      {replacing && (
        <ReplaceVoceDialog
          row={replacing}
          results={results}
          onClose={() => setReplacing(null)}
          onApply={changes => {
            apply(changes, `Voce sostituita in ${changes.upsert.length} element${changes.upsert.length === 1 ? 'o' : 'i'}.`);
            setReplacing(null);
          }}
        />
      )}
      {adding && (
        <AddItemDialog
          onClose={() => setAdding(false)}
          onApply={changes => { apply(changes, 'Elemento aggiunto al computo.'); setAdding(false); }}
        />
      )}
    </div>
  );
};
