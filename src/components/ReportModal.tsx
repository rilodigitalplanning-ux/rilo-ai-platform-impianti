import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Printer, ShieldCheck, FileText, Hash, PenTool } from 'lucide-react';
import { ProjectCable, Structure, Cable, Translation } from '../types';
import { StructurePreview } from './StructurePreview';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  structure: Structure;
  cables: ProjectCable[];
  allCables: Cable[];
  packedStructures: any[];
  results: {
    totalArea: number;
    usedArea: number;
    utilization: number;
    isPass: boolean;
  };
  t: Translation;
  darkMode: boolean;
  reportId: string;
  today: string;
  engineerName?: string;
}

export function ReportModal({
  isOpen,
  onClose,
  onConfirm,
  structure,
  cables,
  allCables,
  packedStructures,
  results,
  t,
  darkMode,
  reportId,
  today,
  engineerName = 'R. SILVA'
}: ReportModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className={`relative w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col ${darkMode ? 'bg-[#0A0A0A] text-white' : 'bg-white text-black'}`}
          style={{ maxHeight: '90vh' }}
        >
          {/* Header Actions */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20 no-export">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#81292C]" />
              <span className="text-sm font-bold tracking-widest uppercase">{t.misc.reportPreview}</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={onConfirm}
                className="flex items-center gap-2 px-4 py-2 bg-[#81292C] hover:bg-[#6A2023] text-white font-bold rounded-lg transition-colors text-xs uppercase tracking-wider"
              >
                <Printer className="w-4 h-4" />
                {t.report.printPDF}
              </button>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Report Content Scroll Wrapper */}
          <div className="flex-1 overflow-y-auto bg-white">
            <div id="report-content" className="p-12 space-y-10 font-sans text-black min-h-full">
              {/* Main Header */}
              <div className="flex justify-center items-center border-b-2 border-[#81292C] pb-6">
                <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[#81292C]">{t.report.title}</h1>
              </div>

            {/* Cross Section Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-[#81292C] rounded-sm flex items-center justify-center">
                    <div className="w-2 h-2 border border-white"></div>
                  </div>
                  <h3 className="text-xs font-bold tracking-widest uppercase text-black">{t.report.crossSection}</h3>
                </div>
                <span className="text-[10px] bg-black/5 px-2 py-1 rounded font-mono opacity-50 uppercase text-black">{t.report.scale}</span>
              </div>
              
              <div className="flex flex-wrap gap-8 items-center justify-center p-8 border border-black/10 rounded-xl bg-white min-h-[300px]">
                {packedStructures.map((packedStructure, idx) => (
                  <StructurePreview 
                    key={idx}
                    structure={structure}
                    cables={cables}
                    allCables={allCables}
                    packedCables={packedStructure.cables}
                    fillPercentage={packedStructure.fillPercentage}
                    limit={packedStructure.limit}
                    index={idx}
                    allowedArea={results.totalArea}
                    darkMode={false}
                    zoom={1}
                    t={t}
                    showLimitLine={false}
                  />
                ))}
              </div>
            </div>

            {/* Cable Manifesto */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-black/10 pb-2">
                <h3 className="text-xs font-bold tracking-widest uppercase text-black">{t.report.cableManifest}</h3>
                <span className="text-[9px] font-bold opacity-40 uppercase text-black">{t.report.total}: {cables.reduce((acc, c) => acc + c.quantity, 0)} {t.report.units}</span>
              </div>
              
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[9px] font-bold opacity-40 uppercase tracking-widest border-b border-black/10">
                    <th className="py-3 px-4 text-black">{t.report.specification}</th>
                    <th className="py-3 px-4 text-black">{t.report.dimension}</th>
                    <th className="py-3 px-4 text-black">{t.report.tag}</th>
                    <th className="py-3 px-4 text-right text-black">{t.report.qty}</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {cables.map((pc, i) => {
                    const cable = pc.cable;
                    if (!cable) return null;
                    return (
                      <tr key={i} className="border-b border-black/5 hover:bg-black/5 transition-colors">
                        <td className="py-3 px-4 font-bold text-[#81292C] uppercase">{cable.name}</td>
                        <td className="py-3 px-4 text-black">{cable.size || `${cable.diameter}mm`}</td>
                        <td className="py-3 px-4 text-black italic opacity-60">{pc.tag || '-'}</td>
                        <td className="py-3 px-4 text-right font-black text-[#81292C]">{pc.quantity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
