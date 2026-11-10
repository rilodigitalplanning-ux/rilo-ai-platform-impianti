// src/modules/cmeGenerator/pages/ResultsView.tsx
import { activeItems, dimensionValue, labelOf } from '../lib/hierarchy';
import { useState, useMemo } from 'react';
import { Download, Search, ChevronDown, FileSpreadsheet, FileCode2, Layers } from 'lucide-react';
import { useCme } from '../context/CmeContext';
import { exportExcel } from '../services/excelExporter';
import { buildXpwe } from '../services/xpweExport';
import { describeNvpIssues, nvpIssues } from '../services/nvpGroups';
import { AddModelDialog } from '../components/AddModelDialog';
import { fillTemplateAndExport } from '../services/excelFiller';
import { hasTemplate } from '../services/templateService';
import { useSaveProject } from '../hooks/useSaveProject';
import { DashboardRiepilogo } from '../components/DashboardRiepilogo';
import { NvpBuilderModal } from '../components/NvpBuilderModal';
import { buildNvpResult } from '../services/claudeService';
import type { StatusItem } from '../types';

const STATUS_BADGE: Record<StatusItem, { label: string; className: string }> = {
  OK:            { label: 'OK',          className: 'bg-green-900/40 text-green-400 border-green-700/40' },
  ALERT:         { label: 'ALERT',       className: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40' },
  NAO_ENCONTRADO:{ label: 'NON TROVATO', className: 'bg-red-900/40 text-red-400 border-red-700/40' },
  NVP:           { label: 'NVP',         className: 'bg-cyan-900/40 text-cyan-400 border-cyan-700/40' },
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
  const { save, isSaving } = useSaveProject();
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

  const handleSaveProject = () => { save(); };

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 dark:border-white/5">
        <div className="flex gap-1 flex-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all
                ${tab === t.id ? 'bg-[#E94560]/20 text-[#E94560] border border-[#E94560]/30' : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAddModelOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-900/30 border border-violet-700/40 rounded-xl text-violet-400 text-xs font-bold tracking-widest uppercase hover:bg-violet-900/50 transition-colors"
          title="Unisci un altro modello Revit (es. FM, LUCE) a questo computo"
        >
          <Layers size={14} /> AGGIUNGI MODELLO
        </button>
        <button
          onClick={handleSaveProject}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900/30 border border-blue-700/40 rounded-xl text-blue-400 text-xs font-bold tracking-widest uppercase hover:bg-blue-900/50 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'SALVATAGGIO...' : 'SALVA PROGETTO'}
        </button>
        <div className="relative">
          <button
            onClick={() => setExportMenu(o => !o)}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-green-900/30 border border-green-700/40 rounded-xl text-green-400 text-xs font-bold tracking-widest uppercase hover:bg-green-900/50 transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            {isExporting ? 'ESPORTAZIONE IN CORSO...' : 'ESPORTA'}
            <ChevronDown size={14} />
          </button>
          {exportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportMenu(false)} />
              <div className="absolute right-0 mt-2 w-60 z-50 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#141414] shadow-2xl overflow-hidden text-gray-900 dark:text-white">
                <button onClick={handleExport} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/10">
                  <FileSpreadsheet size={16} className="text-green-500" />
                  <span><span className="block text-xs font-bold">Excel</span><span className="block text-[10px] opacity-50">Modello Rilo (.xlsx)</span></span>
                </button>
                <button onClick={handleExportXpwe} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/10 border-t border-black/5 dark:border-white/5">
                  <FileCode2 size={16} className="text-orange-500" />
                  <span><span className="block text-xs font-bold">XPWE</span><span className="block text-[10px] opacity-50">Interscambio PriMus (.xpwe)</span></span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Computo tab */}
      {tab === 'computo' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filters */}
          <div className="flex gap-3 px-6 py-3 border-b border-gray-200 dark:border-white/5">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca..."
                className="w-full bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 dark:text-white" />
            </div>
            <div className="flex gap-1">
              {(['ALL', 'OK', 'ALERT', 'NAO_ENCONTRADO', 'NVP'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${filterStatus === s ? 'bg-gray-300 dark:bg-white/20 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60'}`}>
                  {s === 'ALL' ? 'TUTTO' : STATUS_BADGE[s].label}
                </button>
              ))}
            </div>
            <span className="text-gray-400 dark:text-white/30 text-xs ml-auto self-center">{filtered.length} voci · €{grandTotal.toFixed(2)}</span>
          </div>
          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-[#080C14]">
                <tr className="text-xs text-gray-500 dark:text-white/40 font-bold tracking-widest uppercase">
                  {[...cols.map(c => c.label),'Codice','Descrizione','Q.tà','UM','Valore Unit.','Totale','Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap border-b border-gray-200 dark:border-white/5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.flatMap((r, i) => {
                  const badge = STATUS_BADGE[r.status];
                  const parentBg = i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-white/[0.01]';
                  const childBg = i % 2 === 0 ? '' : 'bg-gray-50/30 dark:bg-white/[0.005]';

                  const subItemsList = r.subItems && r.subItems.length > 0 ? r.subItems : [{
                    codicePrezzarioTarget: r.tariffaOriginal || r.idElemento,
                    descrizionePrezzarioTarget: r.descrizioneElemento,
                    unidade: r.unidade || '',
                    quantitaComposizione: 1,
                    valoreUnitario: r.valoreUnitario,
                    status: r.status
                  }];

                  return [
                    // 1. Parent Row (Bold, WBS/Codice empty, Revit details)
                    <tr key={`parent-${r.idElemento}`}
                      onClick={() => onSelectElement(r.idElemento)}
                      className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-colors border-b border-gray-200 dark:border-white/5 ${parentBg} font-bold`}>
                      {cols.map(c => <td key={c.id} className="px-4 py-2.5"></td>)}
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white max-w-xs truncate">{r.descrizioneElemento}</td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white text-right">{r.quantitaElemento}</td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white text-xs">{r.unidade}</td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-white/70 text-right">€{r.valoreUnitario.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white font-bold text-right">€{r.total.toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${badge.className}`}>{badge.label}</span>
                          {r.status === 'NVP' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingNvpId(r.idElemento);
                              }}
                              className="p-1 rounded-md bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 transition-colors"
                              title="Modifica NVP"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>,
                    // 2. Child Rows (WBS coordinates, prezzario code, prezzario description, composition factors)
                    ...subItemsList.map((sub, subIdx) => {
                      const childQty = r.quantitaElemento * (sub.quantitaComposizione || 1);
                      const childTot = childQty * (sub.valoreUnitario || 0);
                      return (
                        <tr key={`child-${r.idElemento}-${subIdx}`}
                          onClick={() => onSelectElement(r.idElemento)}
                          className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5 transition-colors border-b border-gray-200/50 dark:border-white/[0.02] text-xs text-gray-500 dark:text-white/50 ${childBg}`}>
                          {cols.map(c => <td key={c.id} className="px-4 py-2 text-gray-600 dark:text-white/60 font-semibold">{dimensionValue(r, c.id)}</td>)}
                          <td className="px-4 py-2 font-mono text-[10px] text-gray-400 dark:text-white/30">{sub.codicePrezzarioTarget || 'NVP'}</td>
                          <td className="px-4 py-2 text-gray-700 dark:text-white/70 max-w-xs truncate pl-6">↳ {sub.descrizionePrezzarioTarget}</td>
                          <td className="px-4 py-2 text-gray-600 dark:text-white/60 text-right">{childQty}</td>
                          <td className="px-4 py-2 text-gray-400 dark:text-white/30">{sub.unidade || (sub as any).um || ''}</td>
                          <td className="px-4 py-2 text-gray-600 dark:text-white/60 text-right">€{sub.valoreUnitario.toFixed(2)}</td>
                          <td className="px-4 py-2 text-gray-700 dark:text-white/70 font-semibold text-right">€{childTot.toFixed(2)}</td>
                          <td className="px-4 py-2"></td>
                        </tr>
                      );
                    })
                  ];
                })}
              </tbody>
            </table>
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
        <div className="flex-1 overflow-auto p-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Totale Generale', value: `€${kpi.total.toFixed(2)}`, color: '#E94560' },
              { label: 'Voci OK', value: kpi.ok, color: '#27ae60' },
              { label: 'Avvisi', value: kpi.alert, color: '#f39c12' },
              { label: 'Non Trovato', value: kpi.nf, color: '#e74c3c' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl p-5">
                <p className="text-gray-500 dark:text-white/40 text-xs uppercase tracking-widest mb-2">{label}</p>
                <p className="text-2xl font-black" style={{ color }}>{value}</p>
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
