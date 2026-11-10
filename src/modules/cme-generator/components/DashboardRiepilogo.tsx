import React, { useMemo, useState } from 'react';
import { BarChart3, PieChart, X } from 'lucide-react';
import type { ResultadoItem } from '../types';
import { eur } from '../lib/format';
import { activeItems, labelOf, type HierarchyItem } from '../lib/hierarchy';
import { filterResults, groupTotals, sumTotal, type DashDim, type Selection } from '../lib/dashboard';

const PALETTE = ['#E94560', '#0F9ED5', '#27AE60', '#F39C12', '#8E44AD', '#16A085', '#D35400', '#2C3E50', '#C0392B', '#7F8C8D'];
const pct = (v: number, t: number) => (t > 0 ? `${((v / t) * 100).toFixed(1).replace('.', ',')}%` : '0%');

// Riepilogo flessibile: si spuntano livelli WBS e categorie e il grafico si aggiorna sulla selezione.
export const DashboardRiepilogo: React.FC<{ results: ResultadoItem[]; hierarchy: HierarchyItem[] }> = ({ results, hierarchy }) => {
  const dims = useMemo<DashDim[]>(() => activeItems(hierarchy).map(i => i.id), [hierarchy]);
  const dimLabel = (id: DashDim) => labelOf(hierarchy, id);

  const [sel, setSel] = useState<Selection>({});
  const [groupByRaw, setGroupBy] = useState<DashDim>('cat');
  const groupBy = dims.includes(groupByRaw) ? groupByRaw : dims[dims.length - 1];
  const [chart, setChart] = useState<'barre' | 'torta'>('barre');

  const filtered = useMemo(() => filterResults(results, sel), [results, sel]);
  const projectTotal = useMemo(() => sumTotal(results), [results]);
  const selTotal = sumTotal(filtered);
  const nActive = Object.values(sel).reduce((n, v) => n + v.length, 0);
  const groups = useMemo(() => groupTotals(filtered, groupBy), [filtered, groupBy]);
  const groupSum = groups.reduce((s, g) => s + g.total, 0);

  const toggle = (dim: DashDim, value: string) =>
    setSel(prev => {
      const cur = prev[dim] ?? [];
      return { ...prev, [dim]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] };
    });
  const clearDim = (dim: DashDim) => setSel(prev => ({ ...prev, [dim]: [] }));

  const chip = 'text-left px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors';
  const chipOff = 'border-gray-300 dark:border-white/10 text-gray-700 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/10';
  const chipOn = 'border-transparent bg-[#E94560] text-white';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-3">
      {/* Filtri: una sezione per livello WBS e per categoria */}
      <div className="bg-white dark:bg-[#101827] border border-slate-200 dark:border-white/10 rounded-lg p-3 space-y-4 max-h-[640px] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-widest text-gray-500 dark:text-white/40 uppercase">Selezione</h3>
          {nActive > 0 && (
            <button onClick={() => setSel({})} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#E94560] hover:opacity-80">
              <X size={12} /> Azzera ({nActive})
            </button>
          )}
        </div>
        {dims.map(dim => {
          // conteggi "a faccette": i valori di ogni dimensione riflettono le altre spunte
          const values = groupTotals(filterResults(results, sel, dim), dim);
          const picked = sel[dim] ?? [];
          // valori spuntati ma ora esclusi dalle altre spunte restano visibili per poterli togliere
          const extra = picked.filter(p => !values.some(v => v.key === p)).map(p => ({ key: p, total: 0, n: 0 }));
          return (
            <div key={dim}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/50">{dimLabel(dim)} <span className="opacity-50">({values.length})</span></p>
                {picked.length > 0 && (
                  <button onClick={() => clearDim(dim)} className="text-[10px] text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white">tutti</button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {[...values, ...extra].map(v => {
                  const on = picked.includes(v.key);
                  return (
                    <button key={v.key} onClick={() => toggle(dim, v.key)} className={`${chip} ${on ? chipOn : chipOff} flex items-center justify-between gap-2`}>
                      <span className="truncate">{v.key}</span>
                      <span className={`shrink-0 text-[10px] ${on ? 'text-white/80' : 'opacity-50'}`}>{eur(v.total)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Totale della selezione e grafico */}
      <div className="space-y-3 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-[#101827] border border-slate-200 dark:border-white/10 rounded-lg p-3">
            <p className="text-gray-500 dark:text-white/40 text-xs uppercase tracking-widest mb-2">Totale selezione</p>
            <p className="text-xl font-bold font-mono tabular-nums text-[#E94560]">{eur(selTotal)}</p>
          </div>
          <div className="bg-white dark:bg-[#101827] border border-slate-200 dark:border-white/10 rounded-lg p-3">
            <p className="text-gray-500 dark:text-white/40 text-xs uppercase tracking-widest mb-2">Elementi</p>
            <p className="text-xl font-bold font-mono tabular-nums text-gray-900 dark:text-white">{filtered.length} <span className="text-sm font-medium opacity-40">/ {results.length}</span></p>
          </div>
          <div className="bg-white dark:bg-[#101827] border border-slate-200 dark:border-white/10 rounded-lg p-3">
            <p className="text-gray-500 dark:text-white/40 text-xs uppercase tracking-widest mb-2">% del computo</p>
            <p className="text-xl font-bold font-mono tabular-nums text-gray-900 dark:text-white">{pct(selTotal, projectTotal)}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#101827] border border-slate-200 dark:border-white/10 rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <h3 className="text-xs font-bold tracking-widest text-gray-500 dark:text-white/40 uppercase">Raggruppa per</h3>
            <div className="flex flex-wrap gap-1">
              {dims.map(d => (
                <button
                  key={d} onClick={() => setGroupBy(d)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${groupBy === d ? 'bg-[#E94560] text-white' : 'text-gray-600 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                >{dimLabel(d)}</button>
              ))}
            </div>
            <div className="ml-auto flex gap-1">
              {([['barre', BarChart3], ['torta', PieChart]] as const).map(([id, Icon]) => (
                <button
                  key={id} onClick={() => setChart(id)} title={id === 'barre' ? 'Barre' : 'Torta'}
                  className={`p-2 rounded-lg transition-colors ${chart === id ? 'bg-[#E94560] text-white' : 'text-gray-600 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                ><Icon size={15} /></button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="text-center text-sm text-gray-500 dark:text-white/40 py-10">Nessun elemento nella selezione.</p>
          ) : chart === 'barre' ? (
            <div className="space-y-3">
              {groups.map((g, i) => (
                <button key={g.key} onClick={() => toggle(groupBy, g.key)} className="block w-full text-left group" title="Clicca per aggiungere/togliere dalla selezione">
                  <div className="flex justify-between text-xs mb-1 gap-3">
                    <span className="text-gray-800 dark:text-white/80 truncate">{g.key} <span className="opacity-40">· {g.n}</span></span>
                    <span className="text-gray-600 dark:text-white/60 shrink-0">{eur(g.total)} <span className="opacity-50">({pct(g.total, groupSum)})</span></span>
                  </div>
                  <div className="h-2.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all group-hover:opacity-80" style={{ width: `${groupSum > 0 ? (g.total / groupSum) * 100 : 0}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Donut groups={groups} total={groupSum} onPick={k => toggle(groupBy, k)} />
          )}
        </div>
      </div>
    </div>
  );
};

const Donut: React.FC<{ groups: { key: string; total: number; n: number }[]; total: number; onPick: (k: string) => void }> = ({ groups, total, onPick }) => {
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-8">
      <svg viewBox="0 0 200 200" className="w-52 h-52 -rotate-90 shrink-0">
        {groups.map((g, i) => {
          const len = total > 0 ? (g.total / total) * C : 0;
          const el = (
            <circle
              key={g.key} cx="100" cy="100" r={R} fill="none" strokeWidth="34" stroke={PALETTE[i % PALETTE.length]}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} className="cursor-pointer hover:opacity-80" onClick={() => onPick(g.key)}
            ><title>{`${g.key}: ${eur(g.total)}`}</title></circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="flex-1 min-w-[220px] space-y-2">
        {groups.map((g, i) => (
          <li key={g.key}>
            <button onClick={() => onPick(g.key)} className="flex items-center gap-2 w-full text-left text-xs hover:opacity-80">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
              <span className="truncate flex-1 text-gray-800 dark:text-white/80">{g.key}</span>
              <span className="shrink-0 text-gray-600 dark:text-white/60">{eur(g.total)} <span className="opacity-50">({pct(g.total, total)})</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
