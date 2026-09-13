import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layers } from 'lucide-react';
import type { FvProject, InverterSpec, PanelSpec } from '../context/ProjectContext';
import { checkAndSizeString, calculateFdi } from '../utils/pvStringCalc';
import { CABLE_TYPES } from '../utils/dcCableCalc';
import { PvArrayDiagram, type PvDiagramBranch } from './PvArrayDiagram';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: FvProject;
  catalogInverters: InverterSpec[];
  catalogPanels: PanelSpec[];
  accentColor: string;
}

/**
 * Preview a blocchi dell'intero impianto: un blocco per inverter, con lo
 * stato di ciascuno dei suoi MPPT (stringa collegata + esito, o "libero") —
 * la visione d'insieme di come il sistema è configurato, complementare al
 * dettaglio per singola stringa mostrato nella card "Verifica".
 */
export const SystemPreviewModal: React.FC<Props> = ({ isOpen, onClose, project, catalogInverters, catalogPanels, accentColor }) => {
  if (!isOpen) return null;

  const panelsById: Record<string, PanelSpec> = Object.fromEntries(catalogPanels.map(p => [p.id, p]));
  const inverterIdsInUse = Array.from(new Set(project.stringConfigs.map(s => s.inverterId)));
  const invertersToShow = catalogInverters.filter(inv => inverterIdsInUse.includes(inv.id));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto custom-scrollbar bg-white dark:bg-[#141414] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-5 bg-white dark:bg-[#141414] border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-3">
              <Layers size={18} style={{ color: accentColor }} />
              <h2 className="text-sm font-black dark:text-white uppercase tracking-tight">Preview impianto — "{project.name}"</h2>
            </div>
            <button onClick={onClose} className="p-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5">
              <X size={18} />
            </button>
          </div>

          <div className="p-8 space-y-8">
            {invertersToShow.length === 0 ? (
              <p className="text-[11px] font-bold opacity-40 uppercase tracking-widest text-center py-8 dark:text-white">
                Nessuna stringa configurata in questo progetto.
              </p>
            ) : (
              invertersToShow.map(inv => {
                const stringsOnThisInverter = project.stringConfigs.filter(s => s.inverterId === inv.id);
                const fdi = calculateFdi(inv, stringsOnThisInverter, panelsById);
                const numMppt = inv.numMppt ?? 1;

                return (
                  <div key={inv.id} className="rounded-2xl border-2 p-5 space-y-4" style={{ borderColor: accentColor }}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 dark:text-white/50">Inverter</p>
                        <p className="text-sm font-black dark:text-white">{inv.name} ({inv.ratedPowerKw} kW · {numMppt} MPPT)</p>
                      </div>
                      {fdi && (
                        <div className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${fdi.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>
                          FDI {fdi.fdi.toFixed(2)} {!fdi.ok && '⚠'}
                        </div>
                      )}
                    </div>

                    <PvArrayDiagram
                      inverterName={inv.name}
                      accentColor={accentColor}
                      branches={Array.from({ length: numMppt }, (_, i) => i + 1).map((mpptN): PvDiagramBranch => {
                        const cfg = stringsOnThisInverter.find(s => (s.mpptIndex ?? 1) === mpptN);
                        if (!cfg) {
                          return { label: `MPPT ${mpptN}`, panelCount: 0, disabled: true, ok: null };
                        }
                        const pnl = panelsById[cfg.panelId];
                        const ct = CABLE_TYPES.find(c => c.id === cfg.cableTypeId) ?? CABLE_TYPES[0];
                        const check = pnl ? checkAndSizeString(inv, pnl, cfg, ct) : null;
                        return {
                          label: `MPPT ${mpptN} — ${cfg.name}`,
                          panelCount: cfg.stringsInParallel,
                          ok: check?.allOk ?? null,
                          subLabel: check ? `${(check.totalPowerW / 1000).toFixed(2)} kW · ${cfg.selectedSectionMm2 ?? '—'} mm²` : undefined,
                          protections: check ? {
                            fuseRequired: check.stringBox.fuse.required,
                            fuseOk: check.stringBox.fuse.ok,
                            fuseRatingA: check.stringBox.fuse.ratingA,
                            breakerOk: check.stringBox.breaker.ok,
                            breakerRatingA: check.stringBox.breaker.ratingA,
                            switchOk: check.stringBox.switchDisconnector.ok,
                            switchRatingA: check.stringBox.switchDisconnector.ratedCurrentA,
                            spdOk: check.stringBox.spd.ok,
                            spdInKA: check.stringBox.spd.inKA,
                          } : undefined,
                        };
                      })}
                    />
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
