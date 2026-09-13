import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Zap, PanelsTopLeft, Plus, Pencil, Trash2, CheckCircle2, XCircle, ListPlus, Tag,
  FileDown, Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProject } from '../../context/ProjectContext';
import type { InverterSpec, PanelSpec, StringConfig } from '../../context/ProjectContext';
import { checkAndSizeString, calculateFdi } from '../../utils/pvStringCalc';
import { CABLE_TYPES, STANDARD_SECTIONS, ampacityForSection } from '../../utils/dcCableCalc';
import { parseLocaleFloat, parseLocaleInt, selectAllOnFocus } from '../../utils/numberInput';
import { exportStringReportPdf } from '../../utils/pdfExport';
import { PvArrayDiagram } from '../PvArrayDiagram';
import { SystemPreviewModal } from '../SystemPreviewModal';

// I campi numerici dei form restano stringhe finché l'utente digita (vedi nota
// più sotto su perché) — vengono convertiti in numeri solo al salvataggio.
// Vuoti di default: niente valori di esempio precompilati.
const blankInverterForm = { name: '', ratedPowerKw: '', mpptVoltageMinV: '', mpptVoltageMaxV: '', mpptMaxCurrentA: '', numMppt: '1' };
const blankPanelForm = { name: '', pMaxW: '', vmp: '', voc: '', impp: '', isc: '', tempCoeffVocPctPerC: '', tempCoeffPmaxPctPerC: '', maxReverseCurrentA: '' };

export const StringConfigView: React.FC = () => {
  const { moduleTheme, showToast } = useApp();
  const {
    activeProject,
    catalogInverters, catalogPanels,
    addInverter, updateInverter, removeInverter,
    addPanel, updatePanel, removePanel,
    addStringConfig, updateStringConfig, removeStringConfig,
  } = useProject();

  const [isSystemPreviewOpen, setIsSystemPreviewOpen] = useState(false);
  const [showInverterForm, setShowInverterForm] = useState(false);
  const [editingInverterId, setEditingInverterId] = useState<string | null>(null);
  const [inverterForm, setInverterForm] = useState(blankInverterForm);

  const [showPanelForm, setShowPanelForm] = useState(false);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [panelForm, setPanelForm] = useState(blankPanelForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [stringName, setStringName] = useState('');
  const [inverterId, setInverterId] = useState<string>('');
  const [mpptIndex, setMpptIndex] = useState('1');
  const [panelId, setPanelId] = useState<string>('');
  // Campi numerici tenuti come stringa mentre si digita (vedi nota sopra su blankInverterForm).
  const [panelsInSeries, setPanelsInSeries] = useState('12');
  const [stringsInParallel, setStringsInParallel] = useState('1');
  const [tMinC, setTMinC] = useState('-10');
  const [tMaxC, setTMaxC] = useState('70');
  const [cableLengthM, setCableLengthM] = useState('50');
  const [deltaVPercent, setDeltaVPercent] = useState('3');
  const [cableTypeId, setCableTypeId] = useState(CABLE_TYPES[0].id);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const stringFormRef = useRef<HTMLDivElement>(null);

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

  const fdi = useMemo(() => {
    if (!inverter) return null;
    const panelsById: Record<string, PanelSpec> = Object.fromEntries(catalogPanels.map(p => [p.id, p]));
    const stringsOnThisInverter = activeProject.stringConfigs.filter(s => s.inverterId === inverter.id);
    return calculateFdi(inverter, stringsOnThisInverter, panelsById);
  }, [inverter, catalogPanels, activeProject.stringConfigs]);

  const mpptIndexN = parseLocaleInt(mpptIndex, 1);
  const mpptConflict = useMemo(() => {
    if (!inverter) return null;
    return activeProject.stringConfigs.find(s =>
      s.inverterId === inverter.id &&
      (s.mpptIndex ?? 1) === mpptIndexN &&
      s.id !== editingId
    ) ?? null;
  }, [inverter, activeProject.stringConfigs, mpptIndexN, editingId]);

  // Nel dropdown si nascondono gli MPPT già occupati da un'altra stringa di
  // questo inverter — resta comunque selezionabile l'MPPT della stringa in
  // modifica (altrimenti sparirebbe dalle opzioni mentre la si modifica).
  const usedMpptIndexes = useMemo(() => {
    if (!inverter) return new Set<number>();
    return new Set(
      activeProject.stringConfigs
        .filter(s => s.inverterId === inverter.id && s.id !== editingId)
        .map(s => s.mpptIndex ?? 1)
    );
  }, [inverter, activeProject.stringConfigs, editingId]);

  // usedMpptIndexes esclude già la stringa in modifica (s.id !== editingId),
  // quindi il suo MPPT resta disponibile automaticamente — nessuna eccezione
  // aggiuntiva serve qui (altrimenti si rischia di riammettere un MPPT
  // davvero in conflitto solo perché coincide col valore corrente del form).
  const availableMpptOptions = useMemo(() => {
    if (!inverter) return [];
    return Array.from({ length: inverter.numMppt ?? 1 }, (_, i) => i + 1)
      .filter(n => !usedMpptIndexes.has(n));
  }, [inverter, usedMpptIndexes]);

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
      numMppt: String(inv.numMppt ?? 1),
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
      numMppt: Math.max(1, parseLocaleInt(inverterForm.numMppt, 1)),
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
      tempCoeffPmaxPctPerC: p.tempCoeffPmaxPctPerC != null ? String(p.tempCoeffPmaxPctPerC) : '',
      maxReverseCurrentA: p.maxReverseCurrentA != null ? String(p.maxReverseCurrentA) : '',
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
      tempCoeffPmaxPctPerC: panelForm.tempCoeffPmaxPctPerC.trim() === '' ? undefined : parseLocaleFloat(panelForm.tempCoeffPmaxPctPerC, 0),
      maxReverseCurrentA: panelForm.maxReverseCurrentA.trim() === '' ? undefined : parseLocaleFloat(panelForm.maxReverseCurrentA, 0),
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
    setMpptIndex('1');
    setPanelsInSeries('12');
    setStringsInParallel('1');
    setTMinC('-10');
    setTMaxC('70');
    setCableLengthM('50');
    setDeltaVPercent('3');
    setSelectedSection(null);
  };

  const loadConfigIntoForm = (cfg: StringConfig) => {
    setEditingId(cfg.id);
    setStringName(cfg.name);
    setInverterId(cfg.inverterId);
    setMpptIndex(String(cfg.mpptIndex ?? 1));
    setPanelId(cfg.panelId);
    setPanelsInSeries(String(cfg.panelsInSeries));
    setStringsInParallel(String(cfg.stringsInParallel));
    setTMinC(String(cfg.tMinC));
    setTMaxC(String(cfg.tMaxC));
    setCableLengthM(String(cfg.cableLengthM));
    setDeltaVPercent(String(cfg.deltaVPercent));
    setCableTypeId(cfg.cableTypeId);
    setSelectedSection(cfg.selectedSectionMm2);
    stringFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSaveConfig = () => {
    if (!inverter || !panel || !chosenSection) return;
    if (mpptConflict) {
      showToast(`MPPT ${mpptIndex} già usato dalla stringa "${mpptConflict.name}" su questo inverter.`, 'error');
      return;
    }
    const payload = {
      name: stringName || `Stringa ${activeProject.stringConfigs.length + 1}`,
      inverterId: inverter.id, mpptIndex: parseLocaleInt(mpptIndex, 1), panelId: panel.id,
      panelsInSeries: parseLocaleInt(panelsInSeries, 1),
      stringsInParallel: parseLocaleInt(stringsInParallel, 1),
      tMinC: parseLocaleFloat(tMinC, 0),
      tMaxC: parseLocaleFloat(tMaxC, 0),
      cableLengthM: parseLocaleFloat(cableLengthM, 0),
      deltaVPercent: parseLocaleFloat(deltaVPercent, 3),
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

  // Passando a un altro progetto (creato o caricato dalla sidebar), l'inverter/
  // pannello selezionati (id validi solo nel progetto precedente) e il form
  // vanno azzerati — la barra progetti ora vive nella sidebar (MainLayout),
  // quindi si intercetta il cambio osservando l'id del progetto attivo.
  useEffect(() => {
    setInverterId('');
    setPanelId('');
    setShowInverterForm(false);
    setEditingInverterId(null);
    setShowPanelForm(false);
    setEditingPanelId(null);
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject.id]);

  // Se l'MPPT selezionato non è (più) disponibile per questo inverter
  // (cambio inverter, o quello scelto è stato appena occupato), passa
  // automaticamente al primo MPPT libero.
  useEffect(() => {
    if (availableMpptOptions.length > 0 && !availableMpptOptions.includes(mpptIndexN)) {
      setMpptIndex(String(availableMpptOptions[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inverter?.id, availableMpptOptions.join(',')]);

  const handleExportPdf = async () => {
    if (activeProject.stringConfigs.length === 0) {
      showToast('Aggiungi almeno una stringa al progetto prima di esportare il report.', 'error');
      return;
    }
    try {
      await exportStringReportPdf(activeProject, catalogInverters, catalogPanels);
    } catch (e: any) {
      showToast(`Errore nell'esportazione del PDF: ${e?.message || e}`, 'error');
    }
  };

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
                    <span>MPPT {inverter.mpptVoltageMinV}–{inverter.mpptVoltageMaxV} V · {inverter.mpptMaxCurrentA} A max · {inverter.numMppt ?? 1} MPPT</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEditInverter(inverter)} className="opacity-70 hover:opacity-100"><Pencil size={12} /></button>
                      <button onClick={() => { removeInverter(inverter.id); setInverterId(''); }} className="text-red-500"><Trash2 size={12} /></button>
                    </div>
                  </div>
                )}
                {fdi && (
                  <div className={`flex items-center justify-between text-[9px] px-3 py-2 rounded-xl border ${fdi.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
                    <span className="font-bold uppercase tracking-widest opacity-60">FDI (P_AC / ΣP_DC su questo inverter)</span>
                    <span className={`font-black ${fdi.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {fdi.fdi.toFixed(2)} {!fdi.ok && '⚠'}
                    </span>
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
                      <div>
                        <label className={labelCls}>N. MPPT indipendenti</label>
                        <input type="text" inputMode="numeric" value={inverterForm.numMppt} onFocus={selectAllOnFocus}
                          onChange={e => setInverterForm(f => ({ ...f, numMppt: e.target.value }))} className={inputCls} />
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
                    <span>Vmp {panel.vmp}V · Voc {panel.voc}V · Isc {panel.isc}A · β {panel.tempCoeffVocPctPerC}%/°C · γ {panel.tempCoeffPmaxPctPerC ?? panel.tempCoeffVocPctPerC}%/°C</span>
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
                      <div>
                        <label className={labelCls}>γ Pmax (%/°C)</label>
                        <input type="text" inputMode="decimal" placeholder="= β se vuoto" value={panelForm.tempCoeffPmaxPctPerC} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, tempCoeffPmaxPctPerC: e.target.value }))} className={`${inputCls} placeholder:font-normal placeholder:normal-case`} />
                      </div>
                      <div>
                        <label className={labelCls}>I max inversa (A)</label>
                        <input type="text" inputMode="decimal" placeholder="= 2×Isc se vuoto" value={panelForm.maxReverseCurrentA} onFocus={selectAllOnFocus}
                          onChange={e => setPanelForm(f => ({ ...f, maxReverseCurrentA: e.target.value }))} className={`${inputCls} placeholder:font-normal placeholder:normal-case`} />
                      </div>
                    </div>
                    <button onClick={handleSavePanel} className="w-full py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white" style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}>
                      {editingPanelId ? 'Aggiorna pannello' : 'Salva pannello'}
                    </button>
                  </div>
                )}
              </section>
          </div>

          {/* Configurazione stringa: larghezza piena (Inverter+Pannello insieme), risultato sotto */}
          <div className="space-y-6">
            <div ref={stringFormRef}>
              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-3xl premium-shadow space-y-4">
                {editingId && (
                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-dashed" style={{ borderColor: moduleTheme.accent, backgroundColor: `${moduleTheme.accent}1a` }}>
                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: moduleTheme.accent }}>
                      <Pencil size={11} /> Modifica stringa in corso
                    </span>
                    <button onClick={resetForm} className="text-[9px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 dark:text-white">
                      Annulla
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className={`flex items-center gap-1.5 ${labelCls}`}><Tag size={11} /> Nome stringa</label>
                    <input value={stringName} onChange={e => setStringName(e.target.value)} placeholder="ES: STRINGA 01" className={`${inputCls} uppercase placeholder:normal-case placeholder:font-normal`} />
                  </div>
                  {inverter && (
                    <div>
                      <label className={labelCls}>MPPT collegato</label>
                      {availableMpptOptions.length > 0 ? (
                        <select value={mpptIndex} onChange={e => setMpptIndex(e.target.value)} className={inputCls}>
                          {availableMpptOptions.map(n => (
                            <option key={n} value={n}>MPPT {n}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 py-2">
                          ⚠ Tutti gli MPPT già assegnati.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {mpptConflict && (
                  <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 -mt-2">
                    ⚠ MPPT {mpptIndex} già usato dalla stringa "{mpptConflict.name}" — un MPPT accetta un solo gruppo di stringhe in parallelo.
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Tipo di cavo</label>
                    <select value={cableTypeId} onChange={e => setCableTypeId(e.target.value)} className={`${inputCls} uppercase`}>
                      {CABLE_TYPES.map(ct => <option key={ct.id} value={ct.id} className="normal-case">{ct.name}</option>)}
                    </select>
                  </div>
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
                <p className="text-[9px] opacity-40 dark:text-white/40">Default 3% — obbligo normativo (CEI 82-25 / Guida CEI 0-21), modificabile. Riferita alla Vmpp nominale di stringa a 25°C.</p>
              </section>
            </div>

            {/* Result, sotto, larghezza piena */}
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
                          Con {chosenSection} mm²: ΔV cavo ≈ {check.deltaVoltsV.toFixed(2)} V ammessi · Iz cavo {chosenIz ?? '—'} A · Ib progetto {check.stringBox.ibA.toFixed(1)} A
                        </p>
                      </div>
                    )}

                    <div>
                      <p className={`${labelCls} mb-2`}>Quadro di campo (String Box)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`rounded-xl p-3 border ${check.stringBox.fuse.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                          <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">Fusibile di stringa {!check.stringBox.fuse.required && '(non richiesto)'}</p>
                          <p className="text-sm font-black dark:text-white">{check.stringBox.fuse.ratingA ? `${check.stringBox.fuse.ratingA} A` : '—'}</p>
                          <p className="text-[8px] opacity-50">{check.stringBox.fuse.note}</p>
                        </div>
                        <div className={`rounded-xl p-3 border ${check.stringBox.breaker.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                          <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">Interruttore CC</p>
                          <p className="text-sm font-black dark:text-white">{check.stringBox.breaker.ratingA ? `${check.stringBox.breaker.ratingA} A` : '—'}</p>
                          <p className="text-[8px] opacity-50">{check.stringBox.breaker.note}</p>
                        </div>
                        <div className={`rounded-xl p-3 border ${check.stringBox.switchDisconnector.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                          <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">Sezionatore CC ({check.stringBox.switchDisconnector.category})</p>
                          <p className="text-sm font-black dark:text-white">{check.stringBox.switchDisconnector.ratedCurrentA ? `${check.stringBox.switchDisconnector.ratedCurrentA} A` : '—'}</p>
                          <p className="text-[8px] opacity-50">{check.stringBox.switchDisconnector.note}</p>
                        </div>
                        <div className={`rounded-xl p-3 border ${check.stringBox.spd.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                          <p className="text-[8px] font-bold uppercase tracking-widest opacity-50">SPD Classe {check.stringBox.spd.spdClass}</p>
                          <p className="text-[8px] opacity-50">{check.stringBox.spd.note}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className={`${labelCls} mb-2`}>Preview schema a blocchi</p>
                      <PvArrayDiagram
                        inverterName={`${inverter.name} — MPPT ${mpptIndexN}`}
                        accentColor={moduleTheme.accent}
                        branches={[{
                          label: stringName || 'Stringa',
                          panelCount: parseLocaleInt(stringsInParallel, 1),
                          ok: check.allOk,
                          subLabel: `${(check.totalPowerW / 1000).toFixed(2)} kW · ${chosenSection ?? '—'} mm²`,
                          protections: {
                            fuseRequired: check.stringBox.fuse.required,
                            fuseOk: check.stringBox.fuse.ok,
                            fuseRatingA: check.stringBox.fuse.ratingA,
                            breakerOk: check.stringBox.breaker.ok,
                            breakerRatingA: check.stringBox.breaker.ratingA,
                            switchOk: check.stringBox.switchDisconnector.ok,
                            switchRatingA: check.stringBox.switchDisconnector.ratedCurrentA,
                            spdOk: check.stringBox.spd.ok,
                            spdInKA: check.stringBox.spd.inKA,
                          },
                        }]}
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          </div>

          {/* Stringhe salvate nel progetto */}
          <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-3xl premium-shadow overflow-hidden">
            <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Stringhe nel progetto "{activeProject.name}"</h3>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsSystemPreviewOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                >
                  <Layers size={12} /> Preview impianto
                </button>
                <button
                  onClick={handleExportPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white"
                  style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
                >
                  <FileDown size={12} /> Esporta report PDF
                </button>
              </div>
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
                            {pnl?.name || '?'} × {cfg.panelsInSeries} serie, {cfg.stringsInParallel} parallelo · {inv?.name || '?'} · MPPT {cfg.mpptIndex ?? 1}
                          </p>
                        </div>
                      </button>
                      <p className="text-sm font-black shrink-0" style={{ color: moduleTheme.accent }}>
                        {cfg.selectedSectionMm2 ?? '—'}<span className="text-[10px] font-bold opacity-40 ml-0.5">mm²</span>
                      </p>
                      <button onClick={() => loadConfigIntoForm(cfg)} className="p-2 opacity-60 hover:opacity-100 rounded-lg transition-colors shrink-0 dark:text-white">
                        <Pencil size={14} />
                      </button>
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

      <SystemPreviewModal
        isOpen={isSystemPreviewOpen}
        onClose={() => setIsSystemPreviewOpen(false)}
        project={activeProject}
        catalogInverters={catalogInverters}
        catalogPanels={catalogPanels}
        accentColor={moduleTheme.accent}
      />
    </motion.div>
  );
};
