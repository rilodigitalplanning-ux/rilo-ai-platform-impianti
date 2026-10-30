import React, { useMemo, useState } from 'react';
import { Search, Pencil, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCme } from '../../context/CmeContext';
import { EmptyProjectNotice } from '../EmptyProjectNotice';
import { NvpBuilderModal } from '../NvpBuilderModal';
import { updateNvpElement, updateNvpSub, type NvpDetails } from '../../services/pricing';
import type { ResultadoItem } from '../../types';

interface NvpEntry {
  key: string;
  result: ResultadoItem;
  subIndex: number | null; // null = NVP dell'intero elemento
  descrizione: string;
  valoreUnitario: number;
  importo: number;
  fonte: string;
  nvpDetails?: NvpDetails;
}

const fmt = (v: number) => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const AnalisiPrezziView: React.FC = () => {
  const { moduleTheme, showToast } = useApp();
  const { getAllEffectiveResults, dispatch, state, totalAmount } = useCme();
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<NvpEntry | null>(null);

  const entries = useMemo<NvpEntry[]>(() => {
    const out: NvpEntry[] = [];
    for (const r of getAllEffectiveResults()) {
      if (r.subItems.length === 0 && r.status === 'NVP') {
        out.push({
          key: r.idElemento, result: r, subIndex: null, descrizione: r.descrizioneElemento,
          valoreUnitario: r.valoreUnitario, importo: r.total, fonte: r.originePrezzo, nvpDetails: r.nvpDetails,
        });
      }
      r.subItems.forEach((s, i) => {
        if (!s.nvpDetails) return;
        out.push({
          key: `${r.idElemento}#${i}`, result: r, subIndex: i, descrizione: `${r.descrizioneElemento} — ${s.descrizionePrezzarioTarget || s.descrizioneDei}`,
          valoreUnitario: s.valoreUnitario, importo: r.quantitaElemento * s.quantitaComposizione * s.valoreUnitario,
          fonte: s.prezzarioNome || '', nvpDetails: s.nvpDetails,
        });
      });
    }
    return out;
  }, [getAllEffectiveResults]);

  const missing = (e: NvpEntry) => !e.nvpDetails || e.valoreUnitario === 0;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e =>
      (!onlyMissing || missing(e)) &&
      (!q || [e.descrizione, e.result.edificio, e.result.livello, e.result.zona, e.fonte].some(f => (f || '').toLowerCase().includes(q))),
    );
  }, [entries, search, onlyMissing]);

  if (state.resultados.size === 0) return <EmptyProjectNotice title="Analisi Prezzi" />;

  const nMissing = entries.filter(missing).length;
  const nvpTotal = entries.reduce((s, e) => s + e.importo, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#060A12] text-gray-900 dark:text-white">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14] shrink-0">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca NVP, ubicazione o fonte…"
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-[12px] outline-none"
          />
        </div>
        <button
          onClick={() => setOnlyMissing(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${onlyMissing ? 'text-white' : 'opacity-60 hover:opacity-100 border border-black/10 dark:border-white/10'}`}
          style={onlyMissing ? { backgroundColor: moduleTheme.accent } : undefined}
        >
          <AlertTriangle size={12} /> Senza analisi ({nMissing})
        </button>
        <span className="text-[10px] opacity-40">{visible.length} di {entries.length} NVP</span>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        {entries.length === 0 ? (
          <div className="py-24 text-center opacity-50">
            <p className="text-sm font-bold">Nessuna NVP nel progetto</p>
            <p className="text-[11px] mt-1">Le NVP compaiono qui quando un elemento non ha una voce di prezzario o quando sostituisci una voce con una NVP dall'Elenco Prezzi.</p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-gray-50 dark:bg-[#060A12] z-10">
              <tr className="text-left text-[9px] font-bold uppercase tracking-widest opacity-50">
                <th className="px-6 py-3">Descrizione</th>
                <th className="px-3 py-3">Ubicazione</th>
                <th className="px-3 py-3 text-right">Quantità</th>
                <th className="px-3 py-3">UM</th>
                <th className="px-3 py-3 text-right">Prezzo un.</th>
                <th className="px-3 py-3 text-right">Importo</th>
                <th className="px-3 py-3">Fonte</th>
                <th className="px-6 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {visible.map(e => (
                <tr key={e.key} onClick={() => setEditing(e)} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                  <td className="px-6 py-2.5 max-w-[380px]">
                    <span className="line-clamp-2">{e.descrizione}</span>
                    {missing(e) && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-500">SENZA ANALISI</span>}
                  </td>
                  <td className="px-3 py-2.5 opacity-70 whitespace-nowrap">{e.result.edificio} / {e.result.livello}</td>
                  <td className="px-3 py-2.5 text-right">{e.result.quantitaElemento.toLocaleString('it-IT', { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2.5">{e.result.unidade}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">€ {fmt(e.valoreUnitario)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap font-bold">€ {fmt(e.importo)}</td>
                  <td className="px-3 py-2.5 opacity-70 max-w-[200px] truncate">{e.fonte}</td>
                  <td className="px-6 py-2.5 text-right"><Pencil size={13} className="inline opacity-50" /></td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center opacity-40">Nessuna NVP corrisponde ai filtri.</td></tr>
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
            descricao: editing.descrizione, descrizioneElemento: editing.descrizione,
            edificio: editing.result.edificio, edifcio: '', livello: editing.result.livello,
          } as any}
          initialNvpDetails={editing.nvpDetails}
          onConfirm={(_valore, fonte, details) => {
            const next = editing.subIndex === null
              ? updateNvpElement(editing.result, details, fonte)
              : updateNvpSub(editing.result, editing.subIndex, details, fonte);
            dispatch({ type: 'APPLY_CHANGES', payload: { upsert: [next], remove: [] } });
            showToast('Analisi NVP aggiornata.', 'success');
            setEditing(null);
          }}
          onSkip={() => setEditing(null)}
        />
      )}
    </div>
  );
};
