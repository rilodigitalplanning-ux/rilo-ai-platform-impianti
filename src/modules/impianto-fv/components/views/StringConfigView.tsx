import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Zap, PanelsTopLeft, Plus, Pencil, Trash2, CheckCircle2, XCircle, ListPlus, Tag,
  FolderInput, Save, FolderOpen,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProject } from '../../context/ProjectContext';
import type { InverterSpec, PanelSpec, StringConfig } from '../../context/ProjectContext';
import { checkAndSizeString } from '../../utils/pvStringCalc';
import { CABLE_TYPES, STANDARD_SECTIONS, ampacityForSection } from '../../utils/dcCableCalc';
import { parseLocaleFloat, parseLocaleInt, selectAllOnFocus } from '../../utils/numberInput';

// I campi numerici dei form restano stringhe finché l'utente digita (vedi nota
// più sotto su perché) — vengono convertiti in numeri solo al salvataggio.
// Vuoti di default: niente valori di esempio precompilati.
const blankInverterForm = { name: '', ratedPowerKw: '', mpptVoltageMinV: '', mpptVoltageMaxV: '', mpptMaxCurrentA: '' };
const blankPanelForm = { name: '', pMaxW: '', vmp: '', voc: '', impp: '', isc: '', tempCoeffVocPctPerC: '' };

export const StringConfigView: React.FC = () => {
  const { moduleTheme, showToast } = useApp();
  const {
    activeProject, addNewProject, renameProject,
    savedProjects, isLoadingSaved, refreshSavedProjects, loadProject, deleteSavedProject, saveProject,
    catalogInverters, catalogPanels,
    addInverter, updateInverter, removeInverter,
    addPanel, updatePanel, removePanel,
    addStringConfig, updateStringConfig, removeStringConfig,
  } = useProject();

  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [showInverterForm, setShowInverterForm] = useState(false);
  const [editingInverterId, setEditingInverterId] = useState<string | null>(null);
  const [inverterForm, setInverterForm] = useState(blankInverterForm);

  const [showPanelForm, setShowPanelForm] = useState(false);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [panelForm, setPanelForm] = useState(blankPanelForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [stringName, setStringName] = useState('');
  const [inverterId, setInverterId] = useState<string>('');
  const [panelId, setPanelId] = useState<string>('');
  // Campi numerici tenuti come stringa mentre si digita (vedi nota sopra su blankInverterForm).
  const [panelsInSeries, setPanelsInSeries] = useState('12');
  const [stringsInParallel, setStringsInParallel] = useState('1');
  const [tMinC, setTMinC] = useState('-10');
  const [tMaxC, setTMaxC] = useState('70');
  const [cableLengthM, setCableLengthM] = useState('50');
  const [deltaVPercent, setDeltaVPercent] = useState('1');
  const [cableTypeId, setCableTypeId] = useState(CABLE_TYPES[0].id);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);

  const cableType = CABLE_TYPES.find(c => c.id === cableTypeId) ?? CABLE_TYPES[0];
  const inverter = catalogInverters.find(i => i.id === inverterId) ?? null;
  const panel = catalogPanels.find(p => p.id === panelId) ?? null;

  const check = useMemo(() => {
    const panelsInSeriesN = parseLocaleInt(panelsInSeries, 0);
    const stringsInParallelN = parseLocaleInt(stringsInParallel, 0);
    const cableLengthMN = parseLocaleFloat(cableLengthM, 0);
    const deltaVPercentN = parseLocaleFloat(deltaVPercent, 0);
    const tMinCN = parseLocaleFloat(tMinC, 0);
    const tMaxCN = parseLocaleFloat(tMaxC, 0);
    if (!inverter || !panel || panelsInSeriesN <= 0 || stringsInParallelN <= 0 || cableLengthMN <= 0 || deltaVPercentN <= 0) return null;
    return checkAndSizeString(inverter, panel, {
      panelsInSeries: panelsInSeriesN, stringsInParallel: stringsInParallelN,
      tMinC: tMinCN, tMaxC: tMaxCN, cableLengthM: cableLengthMN, deltaVPercent: deltaVPercentN,
    }, cableType);
  }, [inverter, panel, panelsInSeries, stringsInParallel, tMinC, tMaxC, cableLengthM, deltaVPercent, cableType]);

  const recommendedSection = check?.cable.sCommercialMm2 ?? null;
  const chosenSection = selectedSection ?? recommendedSection;
  const chosenIz = chosenSection ? ampacityForSection(cableType, chosenSection) : null;

  const startEditInverter = (inv: InverterSpec) => {
    setEditingInverterId(inv.id);
    setInverterForm({
      name: inv.name,
      ratedPowerKw: String(inv.ratedPowerKw),
      mpptVoltageMinV: String(inv.mpptVoltageMinV),
      mpptVoltageMaxV: String(inv.mpptVoltageMaxV),
      mpptMaxCurrentA: String(inv.mpptMaxCurrentA),
    });
    setShowInverterForm(true);
  };

  const handleSaveInverter = () => {
    if (!inverterForm.name.trim()) return;
    const payload = {
      name: inverterForm.name,
      ratedPowerKw: parseLocaleFloat(inverterForm.ratedPowerKw, 0),
      mpptVoltageMinV: parseLocaleFloat(inverterForm.mpptVoltageMinV, 0),
      mpptVoltageMaxV: parseLocaleFloat(inverterForm.mpptVoltageMaxV, 0),
      mpptMaxCurrentA: parseLocaleFloat(inverterForm.mpptMaxCurrentA, 0),
    };
    if (editingInverterId) {
      updateInverter(editingInverterId, payload);
      showToast('Inverter aggiornato.', 'success');
    } else {
      const inv = addInverter(payload);
      setInverterId(inv.id);
    }
    setInverterForm(blankInverterForm);
    setEditingInverterId(null);
    setShowInverterForm(false);
  };

  const startEditPanel = (p: PanelSpec) => {
    setEditingPanelId(p.id);
    setPanelForm({
      name: p.name,
      pMaxW: String(p.pMaxW),
      vmp: String(p.vmp),
      voc: String(p.voc),
      impp: String(p.impp),
      isc: String(p.isc),
      tempCoeffVocPctPerC: String(p.tempCoeffVocPctPerC),
    });
    setShowPanelForm(true);
  };

  const handleSavePanel = () => {
    if (!panelForm.name.trim()) return;
    const payload = {
      name: panelForm.name,
      pMaxW: parseLocaleFloat(panelForm.pMaxW, 0),
      vmp: parseLocaleFloat(panelForm.vmp, 0),
      voc: parseLocaleFloat(panelForm.voc, 0),
      impp: parseLocaleFloat(panelForm.impp, 0),
      isc: parseLocaleFloat(panelForm.isc, 0),
      tempCoeffVocPctPerC: parseLocaleFloat(panelForm.tempCoeffVocPctPerC, 0),
    };
    if (editingPanelId) {
      updatePanel(editingPanelId, payload);
      showToast('Pannello aggiornato.', 'success');
    } else {
      const p = addPanel(payload);
      setPanelId(p.id);
    }
    setPanelForm(blankPanelForm);
    setEditingPanelId(null);
    setShowPanelForm(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setStringName('');
    setPanelsInSeries('12');
    setStringsInParallel('1');
    setTMinC('-10');
    setTMaxC('70');
    setCableLengthM('50');
    setDeltaVPercent('1');
    setSelectedSection(null);
  };

  const loadConfigIntoForm = (cfg: StringConfig) => {
    setEditingId(cfg.id);
    setStringName(cfg.name);
    setInverterId(cfg.inverterId);
    setPanelId(cfg.panelId);
    setPanelsInSeries(String(cfg.panelsInSeries));
    setStringsInParallel(String(cfg.stringsInParallel));
    setTMinC(String(cfg.tMinC));
    setTMaxC(String(cfg.tMaxC));
    setCableLengthM(String(cfg.cableLengthM));
    setDeltaVPercent(String(cfg.deltaVPercent));
    setCableTypeId(cfg.cableTypeId);
    setSelectedSection(cfg.selectedSectionMm2);
  };

  const handleSaveConfig = () => {
    if (!inverter || !panel || !chosenSection) return;
    const payload = {
      name: stringName || `Stringa ${activeProject.stringConfigs.length + 1}`,
      inverterId: inverter.id, panelId: panel.id,
      panelsInSeries: parseLocaleInt(panelsInSeries, 1),
      stringsInParallel: parseLocaleInt(stringsInParallel, 1),
      tMinC: parseLocaleFloat(tMinC, 0),
      tMaxC: parseLocaleFloat(tMaxC, 0),
      cableLengthM: parseLocaleFloat(cableLengthM, 0),
      deltaVPercent: parseLocaleFloat(deltaVPercent, 1),
      cableTypeId,
      selectedSectionMm2: chosenSection,
    };
    if (editingId) {
      updateStringConfig(editingId, payload);
      showToast('Stringa aggiornata nel progetto.', 'success');
    } else {
      addStringConfig(payload);
      showToast('Stringa aggiunta al progetto.', 'success');
    }
    resetForm();
  };

  // Passando a un altro progetto, l'inverter/pannello selezionati (id validi
  // solo nel progetto precedente) e il form vanno azzerati.
  const resetSelections = () => {
    setInverterId('');
    setPanelId('');
    setShowInverterForm(false);
    setEditingInverterId(null);
    setShowPanelForm(false);
    setEditingPanelId(null);
    resetForm();
  };

  useEffect(() => {
    refreshSavedProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputCls = "w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-bold dark:text-white outline-none";
  const labelCls = "text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Project Hub */}
          <div className="flex items-center justify-between bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-2xl px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FolderInput size={16} style={{ color: moduleTheme.accent }} className="shrink-0" />
              <div className="min-w-0">
                <label className="block text-[8px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-0.5">
                  Nome progetto
                </label>
                <input
                  type="text"
                  value={activeProject.name}
                  onChange={e => renameProject(activeProject.id, e.target.value.toUpperCase())}
                  placeholder="NOME DEL PROGETTO"
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-[12px] font-black uppercase tracking-tight text-black dark:text-white outline-none focus:ring-2 transition-all min-w-0 w-64"
                  style={{ ['--tw-ring-color' as any]: moduleTheme.accent }}
                />
              </div>
              <span className="text-[9px] opacity-40 dark:text-white/40 shrink-0">
                {activeProject.stringConfigs.length} string{activeProject.stringConfigs.length === 1 ? 'a' : 'he'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { addNewProject(); resetSelections(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
              >
                <Plus size={12} /> Nuovo
              </button>
              <button
                onClick={() => { setIsBrowseOpen(o => !o); if (!isBrowseOpen) refreshSavedProjects(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
              >
                <FolderOpen size={12} /> Progetti salvati
              </button>
              <button
                onClick={() => saveProject(showToast)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white transition-all"
                style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
              >
                <Save size={12} /> Salva progetto
              </button>
            </div>
          </div>

          {isBrowseOpen && (
            <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-2">
                {isLoadingSaved ? 'Caricamento...' : `${savedProjects.length} progetto/i salvato/i`}
              </p>
              {savedProjects.length === 0 && !isLoadingSaved && (
                <p className="text-[10px] opacity-40 dark:text-white/40">Nessun progetto salvato ancora.</p>
              )}
              {savedProjects.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5">
                  <button
                    onClick={() => { loadProject(p); setIsBrowseOpen(false); resetSelections(); }}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-[11px] font-bold dark:text-white truncate">{p.name}</p>
                    <p className="text-[9px] opacity-40 dark:text-white/40">
                      {p.stringConfigs.length} stringhe · {p.lastSaved}
                    </p>
                  </button>
                  <button
                    onClick={() => deleteSavedProject(p.id, showToast)}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-6">

          {/* Inverter + Panel, affiancati */}
          <div className="grid grid-cols-2 gap-6">
              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-3xl premium-shadow space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={16} style={{ color: moduleTheme.accent }} />
                    <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Inverter</h3>
                  </div>
                  <button
                    onClick={() => {
                      if (showInverterForm) { setShowInverterForm(false); setEditingInverterId(null); setInverterForm(blankInverterForm); }
                      else setShowInverterForm(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Plus size={14} style={{ color: moduleTheme.accent }} />
                  </button>
                </div>

                {catalogInverters.length > 0 && (
                  <select value={inverterId} onChange={e => setInverterId(e.target.value)} className={inputCls}>
                    <option value="">Seleziona inverter...</option>
                    {catalogInverters.map(inv => (
                      <option key={inv.id} value={inv.id}>{inv.name} ({inv.ratedPowerKw} kW)</option>
                    ))}
                  </select>
                )}
                {inverter && (
                  <div className="flex items-center justify-between text-[9px] opacity-60 dark:text-white/60 px-1">
                    <span>MPPT {inverter.mpptVoltageMinV}–{inverter.mpptVoltageMaxV} V · {inverter.mpptMaxCurrentA} A max</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEditInverter(inverter)} className="opacity-70 hover:opacity-100"><Pencil size={12} /></button>
                      <button onClick={() => { removeInverter(inverter.id); setInverterId(''); }} className="text-red-500"><Trash2 size={12} /></button>
                    </div>
                  </div>
                )}

                {showInverterForm && (
                  <div className="space-y-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10">
                    <input placeholder="Nome inverter" value={inverterForm.name} onChange={e => setInverterForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Potenza (kW)</label>
                        <input type="text" inputMode="decimal" value={inverterForm.ratedPowerKw} onFocus={selectAllOnFocus}
                          onChange={e => setInverterForm(f => ({ ...f, ratedPowerKw: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>I max MPPT (A)</label>
                        <input type="text" inputMode="decimal" value={inverterForm.mpptMaxCurrentA} onFocus={selectAllOnFocus}
                          onChange={e => setInverterForm(f => ({ ...f, mpptMaxCurrentA: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>V min MPPT (V)</label>
                        <input type="text" inputMode="decimal" value={inverterForm.mpptVoltageMinV} onFocus={selectAllOnFocus}
                          onChange={e => setInverterForm(f => ({ ...f, mpptVoltageMinV: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>V max MPPT (V)</label>
                        <input type="text" inputMode="decimal" value={inverterForm.mpptVoltageMaxV} onFocus={selectAllOnFocus}
                          onChange={e => setInverterForm(f => ({ ...f, mpptVoltageMaxV: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    <button onClick={handleSaveInverter} className="w-full py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white" style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}>
                      {editingInverterId ? 'Aggiorna inverter' : 'Salva inverter'}
                    </button>
                  </div>
                )}
              </section>

              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-3xl premium-shadow space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PanelsTopLeft size={16} style={{ color: moduleTheme.accent }} />
                    <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Pannello</h3>
                  </div>
                  <button
                    onClick={() => {
                      if (showPanelForm) { setShowPanelForm(false); setEditingPanelId(null); setPanelForm(blankPanelForm); }
                      else setShowPanelForm(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Plus size={14} style={{ color: moduleTheme.accent }} />
                  </button>
                </div>

                {catalogPanels.length > 0 && (
                  <select value={panelId} onChange={e => setPanelId(e.target.value)} className={inputCls}>
                    <option value="">Seleziona pannello...</option>
                    {catalogPanels.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.pMaxW} Wp)</option>
                    ))}
                  </select>
                )}
                {panel && (
                  <div className="flex items-center justify-between text-[9px] opacity-60 dark:text-white/60 px-1">
                    <span>Vmp {panel.vmp}V · Voc {panel.voc}V · Isc {panel.isc}A · β {panel.tempCoeffVocPctPerC}%/°C</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEditPanel(panel)} className="opacity-70 hover:opacity-100"><Pencil size={12} /></button>
                      <button onClick={() => { removePanel(panel.id); setPanelId(''); }} className="text-red-500"><Trash2 size={12} /></button>
                    </div>
                  </div>
                )}

                {showPanelForm && (
                  <div className="space-y-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10">
                    <input placeholder="Nome pannello" value={panelForm.name} onChange={e => setPanelForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={labelCls}>Pmax (W)</label>
                        <input type="text" inputMode="decimal" value={panelForm.pMaxW} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, pMaxW: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Vmp (V)</label>
                        <input type="text" inputMode="decimal" value={panelForm.vmp} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, vmp: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Voc (V)</label>
                        <input type="text" inputMode="decimal" value={panelForm.voc} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, voc: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Impp (A)</label>
                        <input type="text" inputMode="decimal" value={panelForm.impp} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, impp: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Isc (A)</label>
                        <input type="text" inputMode="decimal" value={panelForm.isc} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, isc: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>β Voc (%/°C)</label>
                        <input type="text" inputMode="decimal" value={panelForm.tempCoeffVocPctPerC} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, tempCoeffVocPctPerC: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    <button onClick={handleSavePanel} className="w-full py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white" style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}>
                      {editingPanelId ? 'Aggiorna pannello' : 'Salva pannello'}
                    </button>
                  </div>
                )}
              </section>
          </div>

          {/* Configurazione stringa + Verifica, affiancati e simmetrici come Inverter/Pannello */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-3xl premium-shadow space-y-4">
                <label className={`flex items-center gap-1.5 ${labelCls}`}><Tag size={11} /> Nome stringa</label>
                <input value={stringName} onChange={e => setStringName(e.target.value)} placeholder="ES: STRINGA 01" className={`${inputCls} uppercase placeholder:normal-case placeholder:font-normal`} />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Pannelli in serie</label>
                    <input type="text" inputMode="numeric" min={1} value={panelsInSeries} onFocus={selectAllOnFocus}
                      onChange={e => setPanelsInSeries(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Stringhe in parallelo</label>
                    <input type="text" inputMode="numeric" min={1} value={stringsInParallel} onFocus={selectAllOnFocus}
                      onChange={e => setStringsInParallel(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>T min progetto (°C)</label>
                    <input type="text" inputMode="decimal" value={tMinC} onFocus={selectAllOnFocus}
                      onChange={e => setTMinC(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>T max cella (°C)</label>
                    <input type="text" inputMode="decimal" value={tMaxC} onFocus={selectAllOnFocus}
                      onChange={e => setTMaxC(e.target.value)} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Tipo di cavo</label>
                  <select value={cableTypeId} onChange={e => setCableTypeId(e.target.value)} className={`${inputCls} uppercase`}>
                    {CABLE_TYPES.map(ct => <option key={ct.id} value={ct.id} className="normal-case">{ct.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Lunghezza cavo (m)</label>
                    <input type="text" inputMode="decimal" min={0} value={cableLengthM} onFocus={selectAllOnFocus}
                      onChange={e => setCableLengthM(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>ΔV ammessa (%)</label>
                    <input type="text" inputMode="decimal" min={0} value={deltaVPercent} onFocus={selectAllOnFocus}
                      onChange={e => setDeltaVPercent(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <p className="text-[9px] opacity-40 dark:text-white/40">Default 1% — modificabile. Riferita alla Vmpp nominale di stringa a 25°C.</p>
              </section>
            </div>

            {/* Result */}
            <div>
              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-3xl premium-shadow">
                <div className="flex items-center justify-between mb-6 gap-3">
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Verifica compatibilità e cavo</h3>
                  {check && chosenSection && (
                    <button onClick={handleSaveConfig} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white shrink-0" style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}>
                      <ListPlus size={12} /> {editingId ? 'Aggiorna stringa' : 'Aggiungi al progetto'}
                    </button>
                  )}
                </div>

                {!inverter || !panel ? (
                  <div className="h-48 flex items-center justify-center border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl">
                    <p className="text-[10px] font-bold opacity-20 dark:text-white uppercase tracking-widest text-center px-8">
                      Seleziona (o crea) un inverter e un pannello per verificare la stringa
                    </p>
                  </div>
                ) : check ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`rounded-xl p-3 border ${check.vocOk ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                        <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">Voc a freddo ({tMinC}°C)</p>
                        <p className="text-sm font-black dark:text-white">{check.vocColdV.toFixed(1)} V</p>
                        <p className="text-[8px] opacity-50">limite {inverter.mpptVoltageMaxV} V</p>
                      </div>
                      <div className={`rounded-xl p-3 border ${check.vmpOk ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                        <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">Vmp a caldo ({tMaxC}°C)</p>
                        <p className="text-sm font-black dark:text-white">{check.vmpHotV.toFixed(1)} V</p>
                        <p className="text-[8px] opacity-50">range {inverter.mpptVoltageMinV}–{inverter.mpptVoltageMaxV} V</p>
                      </div>
                      <div className={`rounded-xl p-3 border ${check.currentOk ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                        <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">Corrente in ingresso (Isc stringa)</p>
                        <p className="text-sm font-black dark:text-white">{check.iscStringA.toFixed(1)} A</p>
                        <p className="text-[8px] opacity-50">limite {inverter.mpptMaxCurrentA} A</p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${check.allOk ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                      {check.allOk ? <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" /> : <XCircle size={14} className="text-red-600 dark:text-red-400 shrink-0" />}
                      <p className={`text-[10px] font-bold ${check.allOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                        {check.allOk
                          ? `La stringa funziona con questo inverter. Potenza totale ${(check.totalPowerW / 1000).toFixed(2)} kW.`
                          : 'La stringa NON è compatibile con questo inverter — vedi i valori fuori range sopra.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4">
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Isc / Impp stringa</p>
                        <p className="text-lg font-black" style={{ color: moduleTheme.accent }}>{check.iscStringA.toFixed(2)} A <span className="text-[10px] opacity-40 font-bold">/ {check.imppStringA.toFixed(2)} A</span></p>
                      </div>
                      <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4">
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Sezione cavo consigliata</p>
                        <p className="text-lg font-black" style={{ color: moduleTheme.accent }}>
                          {check.cable.sCommercialMm2 ?? '—'}{check.cable.sCommercialMm2 !== null && <span className="text-[10px] opacity-40 font-bold"> mm²</span>}
                        </p>
                      </div>
                    </div>

                    {check.cable.sCommercialMm2 !== null && (
                      <div>
                        <p className={`${labelCls} mb-2`}>Scegli sezione — solo verso l'alto rispetto al minimo ({check.cable.sCommercialMm2} mm²)</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {STANDARD_SECTIONS.map(s => {
                            const disabled = s < (check.cable.sCommercialMm2 as number);
                            const active = s === chosenSection;
                            return (
                              <button key={s} type="button" disabled={disabled} onClick={() => setSelectedSection(s)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${disabled ? 'opacity-25 cursor-not-allowed line-through' : 'cursor-pointer hover:scale-105'}`}
                                style={active && !disabled ? { backgroundColor: moduleTheme.accent, color: '#1a1400' } : { backgroundColor: 'rgba(0,0,0,0.05)' }}
                              >{s}</button>
                            );
                          })}
                        </div>
                        <p className="text-[9px] opacity-50 dark:text-white/50">
                          Con {chosenSection} mm²: ΔV cavo ≈ {check.deltaVoltsV.toFixed(2)} V ammessi · Iz cavo {chosenIz ?? '—'} A
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          </div>

          {/* Stringhe salvate nel progetto */}
          <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-3xl premium-shadow overflow-hidden">
            <div className="p-6 border-b border-black/5 dark:border-white/5">
              <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Stringhe nel progetto "{activeProject.name}"</h3>
            </div>
            {activeProject.stringConfigs.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[10px] font-bold opacity-30 dark:text-white uppercase tracking-widest">Nessuna stringa ancora aggiunta.</p>
              </div>
            ) : (
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {activeProject.stringConfigs.map(cfg => {
                  const inv = catalogInverters.find(i => i.id === cfg.inverterId);
                  const pnl = catalogPanels.find(p => p.id === cfg.panelId);
                  const ct = CABLE_TYPES.find(c => c.id === cfg.cableTypeId);
                  const cfgCheck = (inv && pnl && ct) ? checkAndSizeString(inv, pnl, cfg, ct) : null;
                  return (
                    <div key={cfg.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <button onClick={() => loadConfigIntoForm(cfg)} className="flex-1 text-left min-w-0 flex items-center gap-2">
                        {cfgCheck && (cfgCheck.allOk ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> : <XCircle size={14} className="text-red-500 shrink-0" />)}
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold dark:text-white truncate">{cfg.name}</p>
                          <p className="text-[9px] opacity-40 dark:text-white/40 truncate">
                            {pnl?.name || '?'} × {cfg.panelsInSeries} serie, {cfg.stringsInParallel} parallelo · {inv?.name || '?'}
                          </p>
                        </div>
                      </button>
                      <p className="text-sm font-black shrink-0" style={{ color: moduleTheme.accent }}>
                        {cfg.selectedSectionMm2 ?? '—'}<span className="text-[10px] font-bold opacity-40 ml-0.5">mm²</span>
                      </p>
                      <button onClick={() => removeStringConfig(cfg.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </motion.div>
  );
};
