import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Cable, CheckCircle2, XCircle, Tag, Zap, Save, FolderOpen, Plus, Trash2, ListPlus, FolderInput } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProject, type SavedCalculation } from '../../context/ProjectContext';
import {
  calculateDcCableSection,
  actualDeltaVoltsForSection,
  ampacityForSection,
  STANDARD_SECTIONS,
  COPPER_RESISTIVITY_HOT,
  CABLE_TYPES,
  AMPACITY_SAFETY_FACTOR,
} from '../../utils/dcCableCalc';

export const DcCableView: React.FC = () => {
  const { moduleTheme, showToast } = useApp();
  const {
    activeProject, addNewProject, renameProject,
    savedProjects, isLoadingSaved, refreshSavedProjects, loadProject, deleteSavedProject,
    addCalculation, updateCalculation, removeCalculation, saveProject,
  } = useProject();

  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [editingCalcId, setEditingCalcId] = useState<string | null>(null);

  const [stringName, setStringName] = useState<string>('');
  const [lengthM, setLengthM] = useState<number>(50);
  const [currentA, setCurrentA] = useState<number>(10);
  const [deltaVoltsV, setDeltaVoltsV] = useState<number>(6);
  const [cableTypeId, setCableTypeId] = useState<string>(CABLE_TYPES[0].id);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);

  const cableType = CABLE_TYPES.find(c => c.id === cableTypeId) ?? CABLE_TYPES[0];

  const result = useMemo(() => {
    if (lengthM > 0 && currentA > 0 && deltaVoltsV > 0) {
      return calculateDcCableSection({ lengthM, currentA, deltaVoltsV, cableType });
    }
    return null;
  }, [lengthM, currentA, deltaVoltsV, cableType]);

  // Ogni volta che cambia la sezione minima consigliata (nuovo calcolo o nuovo
  // tipo di cavo), riparti da quella come selezione di default — non mantenere
  // selezionata una sezione che potrebbe ora non soddisfare più i criteri.
  useEffect(() => {
    setSelectedSection(result?.sCommercialMm2 ?? null);
  }, [result?.sCommercialMm2]);

  const chosenSection = selectedSection ?? result?.sCommercialMm2 ?? null;
  const chosenActualDeltaV = (result && chosenSection)
    ? actualDeltaVoltsForSection(lengthM, currentA, chosenSection)
    : null;
  const chosenIz = chosenSection ? ampacityForSection(cableType, chosenSection) : null;
  const chosenIzOk = result && chosenIz !== null ? chosenIz >= result.requiredIzA : null;

  const loadCalcIntoForm = (calc: SavedCalculation) => {
    setEditingCalcId(calc.id);
    setStringName(calc.stringName);
    setLengthM(calc.lengthM);
    setCurrentA(calc.currentA);
    setDeltaVoltsV(calc.deltaVoltsV);
    setCableTypeId(calc.cableTypeId);
    setSelectedSection(calc.selectedSectionMm2);
  };

  const resetForm = () => {
    setEditingCalcId(null);
    setStringName('');
    setLengthM(50);
    setCurrentA(10);
    setDeltaVoltsV(6);
    setCableTypeId(CABLE_TYPES[0].id);
    setSelectedSection(null);
  };

  const handleSaveCalc = () => {
    if (!chosenSection) return;
    const payload = {
      stringName: stringName || `Stringa ${activeProject.calculations.length + 1}`,
      lengthM, currentA, deltaVoltsV, cableTypeId,
      selectedSectionMm2: chosenSection,
    };
    if (editingCalcId) {
      updateCalculation(editingCalcId, payload);
      showToast('Calcolo aggiornato nel progetto.', 'success');
    } else {
      addCalculation(payload);
      showToast('Calcolo aggiunto al progetto.', 'success');
    }
    resetForm();
  };

  useEffect(() => {
    refreshSavedProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <input
                type="text"
                value={activeProject.name}
                onChange={e => renameProject(activeProject.id, e.target.value.toUpperCase())}
                className="bg-transparent text-[12px] font-black uppercase tracking-tight dark:text-white outline-none border-b border-transparent hover:border-black/20 dark:hover:border-white/20 focus:border-black/50 dark:focus:border-white/50 transition-colors min-w-0 w-64"
              />
              <span className="text-[9px] opacity-40 dark:text-white/40 shrink-0">
                {activeProject.calculations.length} calcol{activeProject.calculations.length === 1 ? 'o' : 'i'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { addNewProject(); resetForm(); }}
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
                    onClick={() => { loadProject(p); setIsBrowseOpen(false); resetForm(); }}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-[11px] font-bold dark:text-white truncate">{p.name}</p>
                    <p className="text-[9px] opacity-40 dark:text-white/40">{p.calculations.length} calcoli · {p.lastSaved}</p>
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

          <div className="grid grid-cols-12 gap-8">
            {/* Input */}
            <div className="col-span-5 space-y-6">
              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${moduleTheme.accent}20` }}>
                    <Cable size={20} style={{ color: moduleTheme.accent }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Dati del circuito DC</h3>
                    <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">Cavo di stringa fotovoltaico</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 flex items-center gap-1.5">
                    <Tag size={11} /> Nome stringa (descrizione)
                  </label>
                  <input
                    type="text"
                    value={stringName}
                    onChange={e => setStringName(e.target.value)}
                    placeholder="ES: STRINGA 01 — FALDA SUD"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2.5 text-[12px] font-bold dark:text-white outline-none uppercase placeholder:normal-case placeholder:font-normal placeholder:opacity-40"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
                    Tipo di cavo (portata)
                  </label>
                  <select
                    value={cableTypeId}
                    onChange={e => setCableTypeId(e.target.value)}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2.5 text-[11px] font-bold dark:text-white outline-none uppercase"
                  >
                    {CABLE_TYPES.map(ct => (
                      <option key={ct.id} value={ct.id} className="dark:bg-[#141414] normal-case">{ct.name}</option>
                    ))}
                  </select>
                  <p className="text-[9px] opacity-40 dark:text-white/40 normal-case">{cableType.source}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
                    Lunghezza cavo — tratta singola (m)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={lengthM}
                    onChange={e => setLengthM(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2.5 text-[12px] font-bold dark:text-white outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-[#141414] transition-all"
                    style={{ ['--tw-ring-color' as any]: moduleTheme.accent }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
                    Corrente di circuito — Isc di stringa (A)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={currentA}
                    onChange={e => setCurrentA(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2.5 text-[12px] font-bold dark:text-white outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-[#141414] transition-all"
                  />
                  <p className="text-[9px] opacity-40 dark:text-white/40 normal-case">
                    Usata sia nella formula della caduta di tensione, sia per la portata richiesta (Iz ≥ {AMPACITY_SAFETY_FACTOR} × Isc).
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
                    Caduta di tensione ammessa (V)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={deltaVoltsV}
                    onChange={e => setDeltaVoltsV(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2.5 text-[12px] font-bold dark:text-white outline-none"
                  />
                  <p className="text-[9px] opacity-40 dark:text-white/40">
                    Se hai la ΔV in %, convertila prima in volt: ΔV(V) = ΔV% × Vmpp stringa / 100.
                  </p>
                </div>
              </section>

              <section className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Formule applicate</p>
                <p className="text-[11px] font-mono dark:text-white/70">S = (2 × L × I × ρ) / ΔV</p>
                <p className="text-[9px] opacity-40 dark:text-white/40">ρ = {COPPER_RESISTIVITY_HOT} Ω·mm²/m (rame a temperatura di esercizio del cavo solare, 70-90°C)</p>
                <p className="text-[11px] font-mono dark:text-white/70 pt-1">Iz ≥ {AMPACITY_SAFETY_FACTOR} × Isc</p>
              </section>
            </div>

            {/* Output */}
            <div className="col-span-7 space-y-8">
              <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow">
                <div className="flex items-center justify-between mb-6 gap-3">
                  <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Risultato del dimensionamento</h3>
                  <div className="flex items-center gap-2">
                    {stringName && (
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ backgroundColor: `${moduleTheme.accent}20`, color: moduleTheme.accent }}>
                        {stringName}
                      </span>
                    )}
                    {result?.sCommercialMm2 !== null && result?.sCommercialMm2 !== undefined && (
                      <button
                        onClick={handleSaveCalc}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white shrink-0"
                        style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
                      >
                        <ListPlus size={12} /> {editingCalcId ? 'Aggiorna calcolo' : 'Aggiungi al progetto'}
                      </button>
                    )}
                    {editingCalcId && (
                      <button
                        onClick={resetForm}
                        className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 dark:text-white"
                      >
                        Annulla
                      </button>
                    )}
                  </div>
                </div>

                {result ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Min. caduta di tensione</p>
                        <p className="text-xl font-black" style={{ color: moduleTheme.accent }}>
                          {result.sMinVoltageDropMm2.toFixed(2)}<span className="text-sm font-bold opacity-40 ml-1">mm²</span>
                        </p>
                      </div>
                      <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Min. per portata (Iz)</p>
                        <p className="text-xl font-black" style={{ color: moduleTheme.accent }}>
                          {result.sMinAmpacityMm2 !== null ? result.sMinAmpacityMm2 : '—'}
                          {result.sMinAmpacityMm2 !== null && <span className="text-sm font-bold opacity-40 ml-1">mm²</span>}
                        </p>
                      </div>
                      <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">Sezione consigliata</p>
                        <p className="text-xl font-black" style={{ color: moduleTheme.accent }}>
                          {result.sCommercialMm2 !== null ? result.sCommercialMm2 : '—'}
                          {result.sCommercialMm2 !== null && <span className="text-sm font-bold opacity-40 ml-1">mm²</span>}
                        </p>
                      </div>
                    </div>

                    {result.sCommercialMm2 === null ? (
                      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <XCircle size={14} className="mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
                        <p className="text-[10px] font-bold text-red-700 dark:text-red-400">
                          Nessuna sezione commerciale disponibile in tabella per "{cableType.name}" ha portata sufficiente
                          (serve Iz ≥ {result.requiredIzA.toFixed(1)} A). Aumenta la corrente ammessa scegliendo un tipo di cavo con portata maggiore,
                          oppure suddividi la stringa su più circuiti in parallelo.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
                          <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            Vincolo: {result.bindingCriterion === 'ampacity' ? 'portata (Iz)' : 'caduta di tensione'} — sezione minima da installare {result.sCommercialMm2} mm².
                          </p>
                        </div>

                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5">
                          <Zap size={14} className="shrink-0" style={{ color: moduleTheme.accent }} />
                          <p className="text-[10px] font-bold dark:text-white/70">
                            Con {chosenSection} mm²: ΔV reale {chosenActualDeltaV?.toFixed(2)} V ({(((chosenActualDeltaV ?? 0) / deltaVoltsV) * 100).toFixed(0)}% della ΔV ammessa) ·
                            Iz cavo {chosenIz ?? '—'} A {chosenIzOk === false && <span className="text-red-500 font-black"> — INSUFFICIENTE</span>}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-2">
                            Scegli la sezione da installare — puoi solo aumentare rispetto al minimo richiesto ({result.sCommercialMm2} mm², vincolato anche dalla portata del cavo)
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {STANDARD_SECTIONS.map(s => {
                              const disabled = result.sCommercialMm2 === null || s < result.sCommercialMm2;
                              const active = s === chosenSection;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => setSelectedSection(s)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${disabled ? 'opacity-25 cursor-not-allowed line-through' : 'cursor-pointer hover:scale-105'}`}
                                  style={
                                    active && !disabled
                                      ? { backgroundColor: moduleTheme.accent, color: '#1a1400' }
                                      : { backgroundColor: 'rgba(0,0,0,0.05)' }
                                  }
                                >
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl">
                    <p className="text-[10px] font-bold opacity-20 dark:text-white uppercase tracking-widest">
                      Inserisci lunghezza, corrente e ΔV per calcolare la sezione
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Calcoli salvati nel progetto */}
          <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-3xl premium-shadow overflow-hidden">
            <div className="p-6 border-b border-black/5 dark:border-white/5">
              <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">Calcoli nel progetto "{activeProject.name}"</h3>
            </div>
            {activeProject.calculations.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[10px] font-bold opacity-30 dark:text-white uppercase tracking-widest">
                  Nessun calcolo ancora aggiunto — usa "Aggiungi al progetto" qui sopra.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {activeProject.calculations.map(calc => {
                  const ct = CABLE_TYPES.find(c => c.id === calc.cableTypeId);
                  const iz = calc.selectedSectionMm2 && ct ? ampacityForSection(ct, calc.selectedSectionMm2) : null;
                  return (
                    <div key={calc.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <button onClick={() => loadCalcIntoForm(calc)} className="flex-1 text-left min-w-0">
                        <p className="text-[11px] font-bold dark:text-white truncate">{calc.stringName}</p>
                        <p className="text-[9px] opacity-40 dark:text-white/40">
                          L={calc.lengthM}m · I={calc.currentA}A · ΔV={calc.deltaVoltsV}V · {ct?.name || calc.cableTypeId}
                        </p>
                      </button>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black" style={{ color: moduleTheme.accent }}>
                          {calc.selectedSectionMm2 ?? '—'}<span className="text-[10px] font-bold opacity-40 ml-0.5">mm²</span>
                        </p>
                        {iz !== null && <p className="text-[8px] opacity-40 dark:text-white/40">Iz {iz} A</p>}
                      </div>
                      <button
                        onClick={() => removeCalculation(calc.id)}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                      >
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
