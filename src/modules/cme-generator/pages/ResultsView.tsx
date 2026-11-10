// src/modules/cmeGenerator/pages/ResultsView.tsx
import { activeItems, labelOf } from '../lib/hierarchy';
import { allGroupKeys, buildLedgerRows } from '../lib/ledger';
import { eur, fmt } from '../lib/format';
import { useState, useMemo } from 'react';
import { Download, Search, ChevronDown, FileSpreadsheet, FileCode2, Layers, Pencil } from 'lucide-react';
import { useCme } from '../context/CmeContext';
import { useApp } from '../context/AppContext';
import { exportExcel } from '../services/excelExporter';
import { buildXpwe } from '../services/xpweExport';
import { describeNvpIssues, nvpIssues } from '../services/nvpGroups';
import { AddModelDialog } from '../components/AddModelDialog';
import { fillTemplateAndExport } from '../services/excelFiller';
import { hasTemplate } from '../services/templateService';
import { DashboardRiepilogo } from '../components/DashboardRiepilogo';
import { NvpBuilderModal } from '../components/NvpBuilderModal';
import { buildNvpResult } from '../services/claudeService';
import type { StatusItem } from '../types';

const STATUS_CHIP: Record<StatusItem, { label: string; className: string }> = {
  OK:             { label: 'OK',          className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  ALERT:          { label: 'Alert',       className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  NAO_ENCONTRADO: { label: 'Non trovata', className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  NVP:            { label: 'NVP',         className: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300' },
};

interface ResultsViewProps { onSelectElement: (id: string) => void }

export function ResultsView({ onSelectElement }: ResultsViewProps) {
  const { state, dispatch, getAllEffectiveResults, hierarchy } = useCme();
  const results = getAllEffectiveResults();

  const [tab, setTab] = useState<'computo' | 'categoria' | 'livello' | 'edificio' | 'dashboard'>('computo');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusItem | 'ALL'>('ALL');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const { setHierarchyOpen } = useApp();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingNvpId, setEditingNvpId] = useState<string | null>(null);

  const editingNvpItem = editingNvpId ? state.resultados.get(editingNvpId) || (results.find(x => x.idElemento === editingNvpId)) : null;

  // Una tariffa NVP deve essere univoca (un solo codice e una sola descrizione): prima dell'esportazione si
  // segnalano i conflitti e si chiede se continuare comunque
  const confirmNvpOk = (): boolean => {
    const issues = nvpIssues(results);
    if (issues.totale === 0) return true;
    return window.confirm(
      `Ci sono ${issues.totale} conflitt${issues.totale === 1 ? 'o' : 'i'} nelle NVP:\n\n- ${describeNvpIssues(issues).join('\n- ')}\n\n` +
      'Due NVP non possono avere lo stesso codice o la stessa descrizione. Risolvili da Analisi Prezzi.\n\nEsportare comunque?',
    );
  };

  const handleExportXpwe = () => {
    setExportMenu(false);
    if (!confirmNvpOk()) return;
    try {
      const name = state.projectName || 'Computo Metrico';
      const out = buildXpwe(results, { projectName: name, fileName: `${name}.xpwe`, hierarchy });
      const url = URL.createObjectURL(new Blob([out.xml], { type: 'application/xml;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[\\/:*?"<>|]+/g, '_')}.xpwe`;
      a.click();
      URL.revokeObjectURL(url);
      const w = out.warnings.length ? '\n\nAvvisi:\n- ' + out.warnings.join('\n- ') : '';
      alert(`XPWE esportato: ${out.stats.prezzi} voci di elenco prezzi (${out.stats.np} NP), ${out.stats.voci} voci di computo, ${out.stats.righe} righe di misura.${w}`);
    } catch (err: any) {
      alert(err.message || "Errore durante l'esportazione XPWE.");
    }
  };

  const handleExport = async () => {
    setExportMenu(false);
    if (!confirmNvpOk()) return;
    setIsExporting(true);
    try {
      const useTemplate = await hasTemplate();
      if (useTemplate) {
        await fillTemplateAndExport(results, 'Computo_Metrico_Generato.xlsx', state.rawBimOffData, hierarchy);
      } else {
        await exportExcel(results, 'Computo_Metrico.xlsx', hierarchy);
      }
    } catch (err: any) {
      alert(err.message || "Errore durante l'esportazione.");
    } finally {
      setIsExporting(false);
    }
  };

  const filtered = useMemo(() => {
    return results.filter(r => {
      const matchSearch = !search || [r.descrizioneElemento, r.edificio, r.livello, r.zona, r.categoria]
        .some(f => f.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = filterStatus === 'ALL' || r.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [results, search, filterStatus]);

  const cols = useMemo(() => activeItems(hierarchy), [hierarchy]);
  const grandTotal = filtered.reduce((s, r) => s + r.total, 0);

  // Aggregations
  const byCategoria = useMemo(() => {
    const map = new Map<string, number>();
    results.forEach(r => map.set(r.categoria, (map.get(r.categoria) ?? 0) + r.total));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [results]);

  const byEdificio = useMemo(() => {
    const map = new Map<string, number>();
    results.forEach(r => map.set(r.edificio, (map.get(r.edificio) ?? 0) + r.total));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [results]);

  const kpi = useMemo(() => ({
    total: results.reduce((s, r) => s + r.total, 0),
    ok:    results.filter(r => r.status === 'OK').length,
    alert: results.filter(r => r.status === 'ALERT').length,
    nf:    results.filter(r => r.status === 'NAO_ENCONTRADO').length,
    nvp:   results.filter(r => r.status === 'NVP').length,
  }), [results]);

  const TABS = [
    { id: 'computo', label: 'Computo' },
    { id: 'categoria', label: labelOf(hierarchy, 'cat') },
    { id: 'livello', label: labelOf(hierarchy, 'wbs2') },
    { id: 'edificio', label: labelOf(hierarchy, 'wbs1') },
    { id: 'dashboard', label: 'Dashboard' },
  ] as const;

  const maxTotal = useMemo(() => Math.max(1, ...filtered.map(r => r.total)), [filtered]);
  const rows = useMemo(() => buildLedgerRows(filtered, cols, collapsed), [filtered, cols, collapsed]);
  const toggleGroup = (key: string) => setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const nStatus = (s: StatusItem) => results.filter(r => r.status === s).length;

  const FILTERS: { id: StatusItem | 'ALL'; label: string; n?: number }[] = [
    { id: 'ALL', label: 'Tutte', n: results.length },
    { id: 'OK', label: 'OK', n: nStatus('OK') },
    { id: 'NVP', label: 'NVP', n: nStatus('NVP') },
    { id: 'ALERT', label: 'Alert', n: nStatus('ALERT') },
    { id: 'NAO_ENCONTRADO', label: 'Non trovate', n: nStatus('NAO_ENCONTRADO') },
  ];

  const toolBtn = 'flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#0B1018] text-slate-900 dark:text-slate-100">
      {/* Sezioni del riepilogo e azioni */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 border-b border-slate-200 dark:border-white/10">
        <div className="flex gap-0.5">
          {TABS.map(t => (
            <button
              key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1 rounded text-[12px] font-semibold transition-colors ${tab === t.id ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'}`}
            >{t.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAddModelOpen(true)} className={toolBtn} title="Unisci un altro modello Revit (es. FM, LUCE) a questo computo">
            <Layers size={13} /> Aggiungi modello
          </button>
          <div className="relative">
            <button
              onClick={() => setExportMenu(o => !o)}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#0F3460' }}
            >
              <Download size={13} />
              {isExporting ? 'Esportazione…' : 'Esporta'}
              <ChevronDown size={13} />
            </button>
            {exportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportMenu(false)} />
                <div className="absolute right-0 mt-1 w-56 z-50 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141C2B] shadow-xl overflow-hidden text-slate-900 dark:text-white">
                  <button onClick={handleExport} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10">
                    <FileSpreadsheet size={16} className="text-emerald-600" />
                    <span><span className="block text-xs font-semibold">Excel</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">Modello Rilo (.xlsx)</span></span>
                  </button>
                  <button onClick={handleExportXpwe} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10 border-t border-slate-200 dark:border-white/10">
                    <FileCode2 size={16} className="text-orange-500" />
                    <span><span className="block text-xs font-semibold">XPWE</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">Interscambio PriMus (.xpwe)</span></span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Computo tab */}
      {tab === 'computo' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 border-b border-slate-200 dark:border-white/10 text-[12px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span>Livelli:</span>
              {cols.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">›</span>}
                  <span className="px-2 py-0.5 rounded border border-slate-300 dark:border-white/15 text-slate-800 dark:text-slate-100">{i + 1} {c.label}</span>
                </span>
              ))}
              <button onClick={() => setHierarchyOpen(true)} className="ml-1 underline underline-offset-2 hover:text-slate-800 dark:hover:text-white">modifica</button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCollapsed(new Set(allGroupKeys(filtered, cols)))} className="px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/10">Comprimi</button>
              <button onClick={() => setCollapsed(new Set())} className="px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/10">Espandi</button>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5">
                {FILTERS.map(f => (
                  <button
                    key={f.id} onClick={() => setFilterStatus(f.id)}
                    className={`px-2 py-0.5 rounded text-[12px] ${filterStatus === f.id ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white font-semibold' : 'hover:bg-slate-100 dark:hover:bg-white/10'} ${f.id === 'NAO_ENCONTRADO' && (f.n ?? 0) > 0 ? 'text-red-700 dark:text-red-400' : ''}`}
                  >{f.label}{f.id !== 'ALL' ? ` ${f.n}` : ''}</button>
                ))}
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca…"
                  className="w-48 bg-white dark:bg-white/5 border border-slate-300 dark:border-white/15 rounded pl-7 pr-2 py-1 text-[12px] text-slate-900 dark:text-white outline-none focus:border-[#0F3460]"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px] border-collapse table-fixed min-w-[900px]">
              <colgroup>
                <col style={{ width: 130 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 54 }} />
                <col style={{ width: 96 }} /><col style={{ width: 190 }} /><col style={{ width: 110 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#0E1522]">
                <tr className="text-left text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-1.5 font-semibold border-b border-slate-200 dark:border-white/10">Tariffa</th>
                  <th className="py-1.5 font-semibold border-b border-slate-200 dark:border-white/10">Descrizione</th>
                  <th className="py-1.5 font-semibold text-right border-b border-slate-200 dark:border-white/10">Q.tà</th>
                  <th className="py-1.5 pl-3 font-semibold border-b border-slate-200 dark:border-white/10">UM</th>
                  <th className="py-1.5 font-semibold text-right border-b border-slate-200 dark:border-white/10">Prezzo</th>
                  <th className="py-1.5 pl-5 font-semibold border-b border-slate-200 dark:border-white/10">Importo</th>
                  <th className="py-1.5 pl-3 font-semibold border-b border-slate-200 dark:border-white/10">Stato</th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap(row => {
                  if (row.kind === 'group') {
                    const tone = row.depth === 0 ? 'bg-slate-100 dark:bg-[#141D2E]' : row.depth === 1 ? 'bg-slate-50 dark:bg-[#101827]' : 'bg-slate-50/60 dark:bg-[#0E1522]';
                    return [(
                      <tr key={`g-${row.key}`} onClick={() => toggleGroup(row.key)} className={`cursor-pointer border-t border-slate-200 dark:border-white/10 ${tone} hover:bg-slate-200/60 dark:hover:bg-white/5`}>
                        <td colSpan={5} className="py-1.5 font-semibold" style={{ paddingLeft: 16 + row.depth * 18 }}>
                          <span className="inline-block w-4 text-slate-400">{row.open ? '▾' : '▸'}</span>
                          {row.label}
                          <span className="ml-2 font-normal text-[11px] text-slate-500 dark:text-slate-400">{row.level} · {row.count}</span>
                        </td>
                        <td className="py-1.5 pl-5 font-mono tabular-nums font-semibold">{eur(row.total)}</td>
                        <td />
                      </tr>
                    )];
                  }
                  const r = row.result;
                  const chip = STATUS_CHIP[r.status];
                  const subs = r.subItems ?? [];
                  const single = subs.length === 1 ? subs[0] : null;
                  const rowTone = r.status === 'NAO_ENCONTRADO' ? 'bg-red-50 dark:bg-red-500/10' : r.status === 'ALERT' ? 'bg-amber-50 dark:bg-amber-500/10' : '';
                  const pad = 16 + row.depth * 18;
                  const out = [(
                    <tr key={`i-${r.idElemento}`} onClick={() => onSelectElement(r.idElemento)} className={`cursor-pointer border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 ${rowTone}`}>
                      <td className="py-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate" style={{ paddingLeft: pad }} title={single?.descrizionePrezzarioTarget}>
                        {single ? (single.codicePrezzarioTarget || 'NVP') : r.status === 'NVP' ? (r.tariffaOriginal || 'NVP') : subs.length > 1 ? `${subs.length} voci` : (r.tariffaOriginal || '—')}
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="truncate font-medium" title={r.descrizioneElemento}>{r.descrizioneElemento}</div>
                        {r.status === 'NAO_ENCONTRADO' && r.notes && <div className="truncate text-[11px] text-red-700 dark:text-red-300" title={r.notes}>{r.notes}</div>}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{r.quantitaElemento.toLocaleString('it-IT', { maximumFractionDigits: 2 })}</td>
                      <td className="py-1.5 pl-3 text-slate-500 dark:text-slate-400">{r.unidade}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">{r.status === 'NAO_ENCONTRADO' ? '—' : fmt(r.valoreUnitario)}</td>
                      <td className="py-1.5 pl-5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 shrink-0 rounded bg-slate-200 dark:bg-white/10">
                            <div className="h-1.5 rounded bg-[#0F3460] dark:bg-sky-400" style={{ width: `${Math.max(2, (r.total / maxTotal) * 100)}%` }} />
                          </div>
                          <span className="font-mono tabular-nums">{r.status === 'NAO_ENCONTRADO' ? '—' : fmt(r.total)}</span>
                        </div>
                      </td>
                      <td className="py-1.5 pl-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${chip.className}`}>{chip.label}</span>
                          {r.status === 'NVP' && (
                            <button
                              onClick={e => { e.stopPropagation(); setEditingNvpId(r.idElemento); }}
                              className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10" title="Modifica NVP" aria-label="Modifica NVP"
                            ><Pencil size={12} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )];
                  if (subs.length > 1) {
                    subs.forEach((sub, i) => {
                      const q = r.quantitaElemento * (sub.quantitaComposizione || 1);
                      out.push(
                        <tr key={`s-${r.idElemento}-${i}`} onClick={() => onSelectElement(r.idElemento)} className="cursor-pointer text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="py-1 font-mono text-[11px] truncate" style={{ paddingLeft: pad + 14 }}>{sub.codicePrezzarioTarget || 'NVP'}</td>
                          <td className="py-1 pr-3 truncate" title={sub.descrizionePrezzarioTarget}>↳ {sub.descrizionePrezzarioTarget}</td>
                          <td className="py-1 text-right font-mono tabular-nums">{q.toLocaleString('it-IT', { maximumFractionDigits: 2 })}</td>
                          <td className="py-1 pl-3">{sub.unidade || (sub as any).um || ''}</td>
                          <td className="py-1 text-right font-mono tabular-nums">{fmt(sub.valoreUnitario)}</td>
                          <td className="py-1 pl-5 font-mono tabular-nums">{fmt(q * (sub.valoreUnitario || 0))}</td>
                          <td />
                        </tr>,
                      );
                    });
                  }
                  return out;
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Nessun elemento corrisponde ai filtri.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E1522] text-[12px] text-slate-500 dark:text-slate-400">
            <span>{filtered.length.toLocaleString('it-IT')} elementi{filtered.length !== results.length ? ` su ${results.length.toLocaleString('it-IT')}` : ''}</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">Totale {eur(grandTotal)}</span>
          </div>
        </div>
      )}

      {/* Categoria tab */}
      {tab === 'categoria' && (
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest border-b border-gray-300 dark:border-white/10">
              <th className="text-left py-3 px-4">{labelOf(hierarchy, 'cat')}</th>
              <th className="text-right py-3 px-4">Voci</th>
              <th className="text-right py-3 px-4">Totale (€)</th>
              <th className="text-right py-3 px-4">%</th>
            </tr></thead>
            <tbody>
              {byCategoria.map(([cat, total]) => (
                <tr key={cat} className="border-b border-gray-200 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5">
                  <td className="py-3 px-4 text-gray-900 dark:text-white">{cat}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-white/60 text-right">{results.filter(r => r.categoria === cat).length}</td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-bold text-right">€{total.toFixed(2)}</td>
                  <td className="py-3 px-4 text-gray-500 dark:text-white/40 text-right">{kpi.total > 0 ? ((total/kpi.total)*100).toFixed(1) : 0}%</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 dark:border-white/20">
                <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">TOTALE</td>
                <td className="py-3 px-4 font-bold text-gray-900 dark:text-white text-right">{results.length}</td>
                <td className="py-3 px-4 font-bold text-[#E94560] text-right">€{kpi.total.toFixed(2)}</td>
                <td className="py-3 px-4 text-gray-500 dark:text-white/40 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Edificio tab */}
      {tab === 'edificio' && (
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest border-b border-gray-300 dark:border-white/10">
              <th className="text-left py-3 px-4">{labelOf(hierarchy, 'wbs1')}</th>
              <th className="text-right py-3 px-4">Voci</th>
              <th className="text-right py-3 px-4">Totale (€)</th>
              <th className="text-right py-3 px-4">%</th>
            </tr></thead>
            <tbody>
              {byEdificio.map(([ed, total]) => (
                <tr key={ed} className="border-b border-gray-200 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5">
                  <td className="py-3 px-4 text-gray-900 dark:text-white">{ed}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-white/60 text-right">{results.filter(r => r.edificio === ed).length}</td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-bold text-right">€{total.toFixed(2)}</td>
                  <td className="py-3 px-4 text-gray-500 dark:text-white/40 text-right">{kpi.total > 0 ? ((total/kpi.total)*100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Livello tab */}
      {tab === 'livello' && (
        <div className="flex-1 overflow-auto p-6">
          {(() => {
            const livelli = [...new Set(results.map(r => r.livello))].sort();
            const edificios = [...new Set(results.map(r => r.edificio))].sort();
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 dark:border-white/10">
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-white/40 text-xs uppercase">{labelOf(hierarchy, 'wbs2')}</th>
                    {edificios.map(ed => <th key={ed} className="text-right py-3 px-4 text-gray-500 dark:text-white/40 text-xs uppercase">{ed}</th>)}
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-white/40 text-xs uppercase">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {livelli.map(lv => {
                    const lvTotal = results.filter(r => r.livello === lv).reduce((s, r) => s + r.total, 0);
                    return (
                      <tr key={lv} className="border-b border-gray-200 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5">
                        <td className="py-3 px-4 text-gray-900 dark:text-white font-bold">{lv}</td>
                        {edificios.map(ed => {
                          const t = results.filter(r => r.livello === lv && r.edificio === ed).reduce((s, r) => s + r.total, 0);
                          return <td key={ed} className="py-3 px-4 text-gray-700 dark:text-white/70 text-right">{t > 0 ? `€${t.toFixed(2)}` : '—'}</td>;
                        })}
                        <td className="py-3 px-4 text-gray-900 dark:text-white font-bold text-right">€{lvTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

      {/* Dashboard tab */}
      {tab === 'dashboard' && (
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            {[
              { label: 'Totale Generale', value: `€${kpi.total.toFixed(2)}`, color: '#E94560' },
              { label: 'Voci OK', value: kpi.ok, color: '#27ae60' },
              { label: 'Avvisi', value: kpi.alert, color: '#f39c12' },
              { label: 'Non Trovato', value: kpi.nf, color: '#e74c3c' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white dark:bg-[#101827] border border-slate-200 dark:border-white/10 rounded-lg p-3">
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                <p className="text-xl font-bold font-mono tabular-nums" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
          <DashboardRiepilogo results={results} hierarchy={hierarchy} />
        </div>
      )}

      {addModelOpen && <AddModelDialog onClose={() => setAddModelOpen(false)} />}

      {/* Edit NVP Modal */}
      {editingNvpItem && (
        <NvpBuilderModal
          elemento={{ 
            idUnico: editingNvpItem.idElemento, 
            edificio: editingNvpItem.edificio, 
            livello: editingNvpItem.livello, 
            zona: editingNvpItem.zona, 
            descricao: editingNvpItem.descrizioneElemento, 
            tariffa: editingNvpItem.tariffaOriginal || '', 
            quantita: editingNvpItem.quantitaElemento, 
            fatorWBS: 1, 
            countRevit: editingNvpItem.quantitaElemento 
          }}
          initialNvpDetails={editingNvpItem.nvpDetails || {
            materiali: [{ 
              id: '1', 
              descrizione: editingNvpItem.descrizioneElemento, 
              um: editingNvpItem.unidade || 'cad', 
              quantita: 1, 
              prezzoUnitario: editingNvpItem.valoreUnitario 
            }],
            scontoPercentuale: 0,
            manoDOpera: [],
            noleggi: [],
            trasportiPercentuale: 0,
            speseGeneraliPercentuale: 0,
            utiliPercentuale: 0,
            fonte: editingNvpItem.originePrezzo
          }}
          onConfirm={(valoreUnitario, originePrezzo, nvpDetails) => {
            const updated = buildNvpResult(
              {
                idUnico: editingNvpItem.idElemento,
                edificio: editingNvpItem.edificio,
                livello: editingNvpItem.livello,
                zona: editingNvpItem.zona,
                descricao: editingNvpItem.descrizioneElemento,
                tariffa: editingNvpItem.tariffaOriginal || '',
                quantita: editingNvpItem.quantitaElemento,
                fatorWBS: 1,
                countRevit: editingNvpItem.quantitaElemento
              }, 
              valoreUnitario, 
              originePrezzo
            );
            updated.nvpDetails = nvpDetails;
            dispatch({ type: 'ADD_RESULTADO', payload: updated });
            setEditingNvpId(null);
          }}
          onSkip={() => setEditingNvpId(null)}
        />
      )}
    </div>
  );
}
