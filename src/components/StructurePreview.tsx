import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Structure, ProjectCable, Cable, Translation } from '../types';

export function CableCircle({ c, scale, onCableClick }: { c: any, scale: number, onCableClick?: (index: number) => void, key?: React.Key }) {
  return (
    <div 
      className="absolute rounded-full border border-black/20 dark:border-white/20 shadow-sm flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-black/50 dark:hover:ring-white/50 transition-all"
      style={{ 
        width: c.diameter * scale, 
        height: c.diameter * scale,
        backgroundColor: c.color || (c.type === 'power' ? '#81292C' : '#00B4D8'),
        transform: 'translate(-50%, -50%)',
        zIndex: 10
      }}
      title={`${c.name} (Ø${c.diameter}mm)`}
      onClick={(e) => {
        e.stopPropagation();
        if (onCableClick && c.originalIndex !== undefined) {
          onCableClick(c.originalIndex);
        }
      }}
    >
      <span 
        className="text-white font-bold drop-shadow-md"
        style={{ fontSize: `${Math.max(6, (c.diameter * scale) * 0.4)}px` }}
      >
        {c.originalIndex !== undefined ? c.originalIndex + 1 : ''}
      </span>
    </div>
  );
}

export interface StructurePreviewProps {
  structure: Structure;
  cables: ProjectCable[];
  allCables: Cable[];
  packedCables: any[];
  fillPercentage: number;
  limit: number;
  index: number;
  allowedArea: number;
  onCableClick?: (index: number) => void;
  onNameChange?: (name: string) => void;
  t: Translation;
  darkMode: boolean;
  zoom?: number;
  showLimitLine?: boolean;
  key?: React.Key;
}

export function StructurePreview({ structure, cables, allCables, packedCables, fillPercentage, limit, index, allowedArea, onCableClick, onNameChange, t, darkMode, zoom = 1, showLimitLine = true }: StructurePreviewProps) {
  if (!structure) return null;
  const baseScale = Math.min(400 / (structure.width || 1), 300 / (structure.height || 1));
  const scale = baseScale * zoom;
  const w = (structure.width || 0) * scale;
  const h = (structure.height || 0) * scale;

  const cablesInThisStructure = useMemo(() => {
    if (!structure) return [];
    const isSingle = packedCables.length === 1;
    return packedCables.map(c => ({
      ...c,
      x: isSingle && structure?.type === 'conduit'
        ? (structure.width || 0) / 2 * scale
        : structure?.type === 'conduit'
          ? (c.px + (structure?.width || 0)/2) * scale
          : (c.px + c.diameter/2) * scale,
      y: isSingle && structure?.type === 'conduit'
        ? (structure.height || 0) / 2 * scale
        : structure?.type === 'conduit'
          ? (c.py + (structure?.height || 0)/2) * scale
          : ((structure?.height || 0) - c.py - c.diameter/2) * scale
    }));
  }, [packedCables, scale, structure?.type, structure?.width, structure?.height]);

  const isOverLimit = fillPercentage > limit;

  const renderHeader = () => (
    <div className="absolute -top-8 text-[10px] font-bold opacity-40 uppercase tracking-widest dark:text-white/40 flex items-center justify-center w-full gap-1">
      {onNameChange ? (
        <input 
          type="text" 
          value={structure.name || ''} 
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t.preview.structure}
          className="bg-transparent border-b border-transparent hover:border-black/20 dark:hover:border-white/20 focus:border-black/50 dark:focus:border-white/50 outline-none text-center w-full max-w-[150px] transition-colors"
        />
      ) : (
        <span className="text-center">{structure.name || t.preview.structure}</span>
      )}
      <span>{index + 1}</span>
    </div>
  );

  const renderUtilizationInfo = () => (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="flex gap-4 text-sm font-black opacity-80 dark:text-white/80 tracking-widest uppercase">
        <span>{t.misc.widthShort}: {structure.width}mm</span>
        {structure.type !== 'conduit' && <span>{t.misc.heightShort}: {structure.height}mm</span>}
      </div>
      
      {/* Visual Gauge */}
      <div className="w-32 h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (fillPercentage / limit) * 100)}%` }}
          className={`h-full rounded-full ${fillPercentage > limit ? 'bg-[#E63946]' : fillPercentage > limit * 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
        />
      </div>

      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
        fillPercentage > limit 
          ? 'bg-[#E63946]/10 text-[#E63946]' 
          : fillPercentage > limit * 0.8 
            ? 'bg-amber-500/10 text-amber-500' 
            : 'bg-emerald-500/10 text-emerald-500'
      }`}>
        <div className={`w-1.5 h-1.5 rounded-full ${
          fillPercentage > limit 
            ? 'bg-[#E63946] animate-pulse' 
            : fillPercentage > limit * 0.8 
              ? 'bg-amber-500' 
              : 'bg-emerald-500'
        }`} />
        {fillPercentage.toFixed(1)}% {t.preview.utilization}
        <span className="opacity-40 font-bold ml-1">/ {limit}%</span>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative flex flex-col items-center shrink-0"
      style={{ perspective: '1000px' }}
    >
      {renderHeader()}
      
      {/* The Tray/Conduit Outline */}
      <div className="relative">
        <div 
          className={`relative border-2 bg-white dark:bg-[#1A1A1A] shadow-md transition-all ${structure.type === 'conduit' ? 'overflow-hidden' : ''} ${isOverLimit ? 'border-[#E63946] shadow-[0_0_20px_rgba(230,57,70,0.3)]' : 'border-black/20 dark:border-white/20'}`}
          style={{ 
            width: w, 
            height: h, 
            borderRadius: structure.type === 'conduit' ? '50%' : '2px'
          }}
        >
          {/* Fill Limit Line (for trays) */}
          {structure.type === 'tray' && (
            <>
              {showLimitLine && (
                <div 
                  className="absolute left-0 w-full border-t border-dashed border-[#E63946] z-20 pointer-events-none"
                  style={{ bottom: `${limit}%` }}
                >
                  <span className="absolute -top-4 right-0 text-[8px] font-black text-[#E63946] opacity-60 uppercase tracking-tighter">
                    {limit}% {t.results.utilization}
                  </span>
                </div>
              )}
              {structure.hasSeparator && (
                <div className="absolute top-0 left-1/2 w-0.5 h-full bg-black/20 dark:bg-white/20 border-l border-dashed border-black/40 dark:border-white/40 z-20"></div>
              )}
            </>
          )}

          {/* Cables */}
          <div className="absolute inset-0">
            {cablesInThisStructure.map((c, i) => (
              <div key={i} className="absolute" style={{ left: c.x, top: c.y }}>
                <CableCircle c={c} scale={scale} onCableClick={onCableClick} />
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Utilization Info & Dimensions */}
      {renderUtilizationInfo()}
    </motion.div>
  );
}
