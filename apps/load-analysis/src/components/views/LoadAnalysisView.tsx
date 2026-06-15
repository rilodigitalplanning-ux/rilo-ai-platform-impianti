import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3, Plus, Trash2, FileText, Building2, Zap,
  Thermometer, Plug, Download, ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type {
  LoadProject, Zone, ZoneUsage, BuildingType, QualityLevel, ClimateZone, SpecialLoad,
} from '../../types';
import {
  USAGE_LABELS, BUILDING_TYPE_LABELS, CLIMATE_ZONE_LABELS,
} from '../../constants/coefficients';
import { calculateProject } from '../../utils/calculator';

const EMPTY_PROJECT = (): LoadProject => ({
  id: crypto.randomUUID(),
  name: '',
  client: '',
  buildingType: 'uffici',
  qualityLevel: 'standard',
  climateZone: 'E',
  zones: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const EMPTY_ZONE = (): Zone => ({
  id: crypto.randomUUID(),
  name: '',
  usage: 'ufficio_open_space',
  area: 0,
  height: 3.0,
  floor: 0,
  specialLoads: [],
});

type Section = 'overview' | 'zones' | 'results';

export const LoadAnalysisView: React.FC = () => {
  const { moduleTheme, showToast, savedProjects, setSavedProjects, setCurrentProject, currentProject, activeTab, setActiveTab } = useApp();
  const activeSection = activeTab as Section;
  const setActiveSection = setActiveTab as (s: Section) => void;
  const [editingProject, setEditingProject] = useState<LoadProject>(() => currentProject ?? EMPTY_PROJECT());

  // Sync editingProject when AI modifies currentProject externally
  useEffect(() => {
    if (currentProject && currentProject.id !== editingProject.id) {
      setEditingProject(currentProject);
    } else if (currentProject && currentProject.updatedAt !== editingProject.updatedAt) {
      setEditingProject(currentProject);
    }
  }, [currentProject]);

  const sections: Section[] = ['overview', 'zones', 'results'];

  const handleCalculate = () => {
    if (!editingProject.name) { showToast('Inserisci il nome del progetto', 'error'); return; }
    if (editingProject.zones.length === 0) { showToast('Aggiungi almeno una zona', 'error'); return; }
    const result = calculateProject(editingProject);
    const updated: LoadProject = { ...editingProject, result, updatedAt: new Date().toISOString() };
    setEditingProject(updated);
    setCurrentProject(updated);
    setSavedProjects(prev => {
      const idx = prev.findIndex(p => p.id === updated.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [...prev, updated];
    });
    showToast('Calcolo completato!');
    setActiveSection('results');
  };

  const addZone = () => {
    setEditingProject(p => ({ ...p, zones: [...p.zones, EMPTY_ZONE()] }));
  };

  const updateZone = (id: string, patch: Partial<Zone>) => {
    setEditingProject(p => ({
      ...p,
      zones: p.zones.map(z => z.id === id ? { ...z, ...patch } : z),
    }));
  };

  const removeZone = (id: string) => {
    setEditingProject(p => ({ ...p, zones: p.zones.filter(z => z.id !== id) }));
  };

  const addSpecialLoad = (zoneId: string) => {
    const sl: SpecialLoad = { id: crypto.randomUUID(), description: '', power: 0, quantity: 1 };
    const zone = editingProject.zones.find(z => z.id === zoneId);
    if (!zone) return;
    updateZone(zoneId, { specialLoads: [...zone.specialLoads, sl] });
  };

  const updateSpecialLoad = (zoneId: string, slId: string, patch: Partial<SpecialLoad>) => {
    const zone = editingProject.zones.find(z => z.id === zoneId);
    if (!zone) return;
    updateZone(zoneId, {
      specialLoads: zone.specialLoads.map(s => s.id === slId ? { ...s, ...patch } : s),
    });
  };

  const removeSpecialLoad = (zoneId: string, slId: string) => {
    const zone = editingProject.zones.find(z => z.id === zoneId);
    if (!zone) return;
    updateZone(zoneId, { specialLoads: zone.specialLoads.filter(s => s.id !== slId) });
  };

  const inputCls = `w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2 text-[11px] font-bold dark:text-white focus:outline-none focus:ring-2 transition-all`;
  const selectCls = `w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest dark:text-white focus:outline-none focus:ring-2 transition-all`;

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

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black italic tracking-tighter uppercase dark:text-white">
                ANALISI CARICHI PRELIMINARE
              </h2>
              <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest dark:text-white/40">
                Stima parametrica della potenza elettrica necessaria
              </p>
            </div>
            <button
              onClick={handleCalculate}
              className="px-6 py-2.5 rounded-xl text-[10px] font-bold text-white flex items-center gap-2 active:scale-95 transition-all overflow-hidden group relative"
              style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
            >
              <BarChart3 size={14} className="relative z-10" />
              <span className="relative z-10">CALCOLA</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>
          </div>

          {/* Sub-nav */}
          <div className="flex gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl w-fit">
            {sections.map(s => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeSection === s
                    ? 'bg-white dark:bg-[#141414] shadow-sm dark:text-white'
                    : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'
                }`}
              >
                {s === 'overview' ? 'Progetto' : s === 'zones' ? 'Zone' : 'Risultati'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* TAB: PROGETTO */}
            {activeSection === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="grid grid-cols-12 gap-8">

                <div className="col-span-7 bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${moduleTheme.accent}20` }}>
                      <Building2 size={20} style={{ color: moduleTheme.accent }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">DATI PROGETTO</h3>
                      <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest dark:text-white/40">Informazioni generali</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">NOME PROGETTO</label>
                      <input
                        type="text"
                        value={editingProject.name}
                        onChange={e => setEditingProject(p => ({ ...p, name: e.target.value }))}
                        placeholder="Es. Edificio Uffici — Via Roma 10"
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">COMMITTENTE</label>
                      <input
                        type="text"
                        value={editingProject.client}
                        onChange={e => setEditingProject(p => ({ ...p, client: e.target.value }))}
                        placeholder="Nome committente / azienda"
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">TIPOLOGIA EDIFICIO</label>
                      <select
                        value={editingProject.buildingType}
                        onChange={e => setEditingProject(p => ({ ...p, buildingType: e.target.value as BuildingType }))}
                        className={selectCls}
                      >
                        {Object.entries(BUILDING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">ZONA CLIMATICA</label>
                      <select
                        value={editingProject.climateZone}
                        onChange={e => setEditingProject(p => ({ ...p, climateZone: e.target.value as ClimateZone }))}
                        className={selectCls}
                      >
                        {Object.entries(CLIMATE_ZONE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">LIVELLO QUALITATIVO</label>
                      <div className="flex gap-2">
                        {(['base', 'standard', 'premium'] as QualityLevel[]).map(q => (
                          <button
                            key={q}
                            onClick={() => setEditingProject(p => ({ ...p, qualityLevel: q }))}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
                              editingProject.qualityLevel === q
                                ? 'text-white border-transparent'
                                : 'border-black/10 dark:border-white/10 dark:text-white hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                            style={editingProject.qualityLevel === q
                              ? { background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }
                              : {}}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right sidebar */}
                <div className="col-span-5 space-y-4">
                  <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-3xl premium-shadow space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">COME FUNZIONA</h3>
                    {[
                      { icon: Building2, title: 'Dati Progetto', desc: "Inserisci tipologia edificio, zona climatica e livello qualitativo. Questi parametri influenzano i coefficienti di calcolo." },
                      { icon: Plus, title: 'Definisci le Zone', desc: "Aggiungi ogni ambiente con la sua area e destinazione d'uso. La stima si basa su coefficienti W/m² per categoria." },
                      { icon: BarChart3, title: 'Calcola', desc: "Il motore parametrico applica i coefficienti CEI 64-8 / EN 12464-1 e restituisce potenza installata e di domanda." },
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: `${moduleTheme.accent}20` }}>
                          <Icon size={14} style={{ color: moduleTheme.accent }} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black dark:text-white uppercase tracking-tight">{title}</p>
                          <p className="text-[10px] opacity-50 dark:text-white/50 leading-relaxed mt-0.5">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {savedProjects.length > 0 && (
                    <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-3xl premium-shadow space-y-3">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">PROGETTI SALVATI</h3>
                      {savedProjects.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setEditingProject(p); setActiveSection('zones'); }}
                          className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all group"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${moduleTheme.accent}20` }}>
                            <FileText size={14} style={{ color: moduleTheme.accent }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black dark:text-white uppercase truncate">{p.name}</p>
                            <p className="text-[9px] opacity-40 dark:text-white/40">
                              {p.result ? `${p.result.totalDemandKw.toFixed(1)} kW domanda` : 'Non calcolato'}
                            </p>
                          </div>
                          <ChevronRight size={12} className="opacity-30 group-hover:opacity-60 transition-all" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB: ZONE */}
            {activeSection === 'zones' && (
              <motion.div key="zones" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-4">

                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest dark:text-white/40">
                    {editingProject.zones.length} zona{editingProject.zones.length !== 1 ? 'e' : ''} definita{editingProject.zones.length !== 1 ? 'e' : ''}
                  </p>
                  <button
                    onClick={addZone}
                    className="px-4 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2 transition-all border border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 dark:text-white"
                  >
                    <Plus size={12} /> AGGIUNGI ZONA
                  </button>
                </div>

                {editingProject.zones.length === 0 && (
                  <div className="text-center py-20 space-y-3 border-2 border-dashed border-black/10 dark:border-white/10 rounded-3xl">
                    <Building2 size={32} className="mx-auto opacity-20 dark:text-white" />
                    <p className="text-[11px] font-bold opacity-30 dark:text-white uppercase tracking-widest">Nessuna zona definita</p>
                    <button onClick={addZone} className="text-[10px] font-bold transition-all" style={{ color: moduleTheme.accent }}>
                      + Aggiungi la prima zona
                    </button>
                  </div>
                )}

                {editingProject.zones.map((zone, idx) => (
                  <div key={zone.id} className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden">
                    <div className="p-4 flex items-center gap-3 border-b border-black/5 dark:border-white/5">
                      <span
                        className="w-6 h-6 rounded-lg text-[9px] font-black text-white flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: moduleTheme.accent }}
                      >
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={zone.name}
                        onChange={e => updateZone(zone.id, { name: e.target.value })}
                        placeholder="Nome zona (es. Open Space Piano 1)"
                        className="flex-1 bg-transparent text-[11px] font-bold dark:text-white focus:outline-none placeholder:opacity-30"
                      />
                      <button onClick={() => removeZone(zone.id)} className="text-red-500 hover:text-red-600 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="p-4 grid grid-cols-4 gap-4">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">DESTINAZIONE D'USO</label>
                        <select
                          value={zone.usage}
                          onChange={e => updateZone(zone.id, { usage: e.target.value as ZoneUsage })}
                          className={selectCls}
                        >
                          {Object.entries(USAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">AREA (m²)</label>
                        <input
                          type="number"
                          min="0"
                          value={zone.area || ''}
                          onChange={e => updateZone(zone.id, { area: parseFloat(e.target.value) || 0 })}
                          className={inputCls}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">ALTEZZA (m)</label>
                        <input
                          type="number"
                          min="2"
                          step="0.1"
                          value={zone.height || ''}
                          onChange={e => updateZone(zone.id, { height: parseFloat(e.target.value) || 3 })}
                          className={inputCls}
                          placeholder="3.0"
                        />
                      </div>

                      {/* Carichi speciali */}
                      <div className="col-span-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">CARICHI SPECIALI</label>
                          <button
                            onClick={() => addSpecialLoad(zone.id)}
                            className="text-[9px] font-bold transition-all flex items-center gap-1"
                            style={{ color: moduleTheme.accent }}
                          >
                            <Plus size={10} /> Aggiungi
                          </button>
                        </div>
                        {zone.specialLoads.map(sl => (
                          <div key={sl.id} className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={sl.description}
                              onChange={e => updateSpecialLoad(zone.id, sl.id, { description: e.target.value })}
                              placeholder="Descrizione (es. UPS 10kW)"
                              className={`${inputCls} flex-1`}
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={sl.power || ''}
                              onChange={e => updateSpecialLoad(zone.id, sl.id, { power: parseFloat(e.target.value) || 0 })}
                              placeholder="kW"
                              className={`${inputCls} w-20`}
                            />
                            <input
                              type="number"
                              min="1"
                              value={sl.quantity}
                              onChange={e => updateSpecialLoad(zone.id, sl.id, { quantity: parseInt(e.target.value) || 1 })}
                              placeholder="n°"
                              className={`${inputCls} w-16`}
                            />
                            <button onClick={() => removeSpecialLoad(zone.id, sl.id)} className="text-red-500 hover:text-red-600 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {editingProject.zones.length > 0 && (
                  <button
                    onClick={handleCalculate}
                    className="w-full py-3 rounded-xl text-[10px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
                    style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
                  >
                    <BarChart3 size={14} /> CALCOLA POTENZA TOTALE
                  </button>
                )}
              </motion.div>
            )}

            {/* TAB: RISULTATI */}
            {activeSection === 'results' && (
              <motion.div key="results" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="space-y-6">

                {!editingProject.result ? (
                  <div className="text-center py-20 space-y-3 border-2 border-dashed border-black/10 dark:border-white/10 rounded-3xl">
                    <BarChart3 size={32} className="mx-auto opacity-20 dark:text-white" />
                    <p className="text-[11px] font-bold opacity-30 dark:text-white uppercase tracking-widest">Nessun calcolo effettuato</p>
                    <button onClick={() => setActiveSection('zones')} className="text-[10px] font-bold" style={{ color: moduleTheme.accent }}>
                      Vai alla definizione zone →
                    </button>
                  </div>
                ) : (
                  <>
                    {/* KPI cards */}
                    <div className="grid grid-cols-4 gap-4">
                      {[
                        { label: 'Potenza Installata', value: editingProject.result.totalInstalledKw.toFixed(1), unit: 'kW', icon: Zap },
                        { label: 'Potenza di Domanda', value: editingProject.result.totalDemandKw.toFixed(1), unit: 'kW', icon: BarChart3 },
                        { label: 'Domanda (kVA)', value: editingProject.result.totalDemandKva.toFixed(1), unit: 'kVA', icon: Plug },
                        { label: 'cosφ adottato', value: editingProject.result.powerFactor.toFixed(2), unit: '—', icon: Thermometer },
                      ].map(({ label, value, unit, icon: Icon }) => (
                        <div key={label} className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-2xl p-5 premium-shadow">
                          <div className="flex items-center gap-2 mb-3">
                            <Icon size={14} style={{ color: moduleTheme.accent }} />
                            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">{label}</p>
                          </div>
                          <p className="text-2xl font-black dark:text-white" style={{ color: moduleTheme.accent }}>
                            {value}<span className="text-sm font-bold opacity-40 ml-1">{unit}</span>
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Table */}
                    <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-2xl overflow-x-auto shadow-sm custom-scrollbar">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="bg-[#F5F5F5] dark:bg-white/5 border-b border-black/10 dark:border-white/10">
                            {['Zona', 'Area (m²)', 'Illumin. (kW)', 'Prese (kW)', 'HVAC (kW)', 'Speciali (kW)', 'Installata (kW)', 'Domanda (kW)', 'f.cont.'].map(h => (
                              <th key={h} className="p-3 text-[10px] font-bold opacity-40 tracking-widest uppercase">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {editingProject.result.zones.map(z => (
                            <tr key={z.zoneId} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                              <td className="p-3 text-[10px] font-bold dark:text-white">{z.zoneName || USAGE_LABELS[z.usage]}</td>
                              <td className="p-3 text-[10px] font-bold dark:text-white">{z.area}</td>
                              <td className="p-3 text-[10px] font-bold dark:text-white">{z.lightingInstalled.toFixed(2)}</td>
                              <td className="p-3 text-[10px] font-bold dark:text-white">{z.powerOutletsInstalled.toFixed(2)}</td>
                              <td className="p-3 text-[10px] font-bold dark:text-white">{z.hvacInstalled.toFixed(2)}</td>
                              <td className="p-3 text-[10px] font-bold dark:text-white">{z.specialInstalled.toFixed(2)}</td>
                              <td className="p-3 text-[11px] font-black" style={{ color: moduleTheme.accent }}>{z.totalInstalled.toFixed(2)}</td>
                              <td className="p-3 text-[11px] font-black dark:text-white">{z.totalDemand.toFixed(2)}</td>
                              <td className="p-3 text-[10px] font-bold opacity-50 dark:text-white/50">{(z.simultaneityFactor * 100).toFixed(0)}%</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5">
                            <td className="p-3 text-[10px] font-black dark:text-white uppercase tracking-widest" colSpan={6}>TOTALE</td>
                            <td className="p-3 text-[11px] font-black" style={{ color: moduleTheme.accent }}>{editingProject.result.totalInstalledKw.toFixed(2)}</td>
                            <td className="p-3 text-[11px] font-black dark:text-white">{editingProject.result.totalDemandKw.toFixed(2)}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Methodology */}
                    <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 rounded-3xl premium-shadow space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">NOTA METODOLOGICA</h3>
                        <button className="px-4 py-2 rounded-xl text-[10px] font-bold border border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white flex items-center gap-2">
                          <Download size={12} /> ESPORTA PDF
                        </button>
                      </div>
                      <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap opacity-70 dark:text-white/70">
                        {editingProject.result.methodology}
                      </pre>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
