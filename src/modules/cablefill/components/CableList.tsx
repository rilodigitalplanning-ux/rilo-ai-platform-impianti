import React, { useState, useCallback, useRef } from 'react';
import { Trash2, GripVertical, Copy, Cable, CheckSquare, Square, Palette, Tag } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ProjectCable } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface SortableItemProps {
  pc: ProjectCable;
  index: number;
  selected: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  updateCableTag: (index: number, tag: string) => void;
  updateCableColor: (index: number, color: string) => void;
  removeCable: (index: number) => void;
  replaceCable: (index: number, cableId: string) => void;
  duplicateCable: (index: number) => void;
  customCables: any[];
  t: any;
}

function SortableCableItem({
  pc, index, selected, onToggleSelect,
  updateCableTag, updateCableColor, removeCable, replaceCable, duplicateCable,
  customCables, t,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pc?.id || 'unknown' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const cable = pc?.cable;
  if (!cable) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 text-[10px] border group transition-colors ${
        selected
          ? 'bg-[#81292C]/10 border-[#81292C]/40 dark:bg-[#81292C]/20 dark:border-[#81292C]/50'
          : 'bg-[#efefef] dark:bg-white/5 border-black/5 dark:border-white/5'
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => onToggleSelect(pc.id, e.shiftKey)}
        className="shrink-0 text-black/30 dark:text-white/30 hover:text-[#81292C] dark:hover:text-[#81292C] transition-colors"
      >
        {selected
          ? <CheckSquare size={14} className="text-[#81292C]" />
          : <Square size={14} />}
      </button>

      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab shrink-0">
        <GripVertical size={14} className="text-black/20 dark:text-white/20" />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="shrink-0 w-4 h-4 bg-[#401318] dark:bg-white dark:text-black text-white flex items-center justify-center rounded-[2px] text-[8px] font-bold">
            {index + 1}
          </span>
          <select
            value={cable.id}
            onChange={(e) => replaceCable(index, e.target.value)}
            className="font-bold bg-transparent border-none outline-none cursor-pointer truncate w-full max-w-[140px] dark:text-white"
          >
            {customCables.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span className={`shrink-0 px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase tracking-wider ${
            cable.type === 'power'  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            cable.type === 'data'   ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
            cable.type === 'evac'   ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
            'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
          }`}>
            {t.cableTypes[cable.type as keyof typeof t.cableTypes] || cable.type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-4 h-4 rounded-full overflow-hidden border border-black/10 dark:border-white/20 shrink-0 shadow-sm">
            <input
              type="color"
              value={pc.color || (cable.type === 'power' ? '#81292C' : '#00B4D8')}
              onChange={(e) => updateCableColor(index, e.target.value)}
              className="absolute -inset-1 w-[200%] h-[200%] cursor-pointer border-none p-0 bg-transparent"
            />
          </div>
          <input
            type="text"
            value={pc.tag || ''}
            onChange={(e) => updateCableTag(index, e.target.value)}
            placeholder={t.input.editTag}
            className="bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/5 px-1.5 py-0.5 text-[8px] font-bold uppercase outline-none focus:bg-white dark:focus:bg-black/40 focus:border-black/20 dark:focus:border-white/20 transition-all flex-1 min-w-0 dark:text-white"
          />
        </div>
      </div>
      <div className="flex items-center shrink-0">
        <button onClick={() => duplicateCable(index)} className="p-1 text-black/20 hover:text-blue-600 transition-colors">
          <Copy size={12} />
        </button>
        <button onClick={() => removeCable(index)} className="p-1 text-black/20 hover:text-[#81292C] transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Batch action bar ──────────────────────────────────────────────────────────

interface BatchBarProps {
  count: number;
  selectedIds: string[];
  onColorBatch: (ids: string[], color: string) => void;
  onTagBatch: (ids: string[], tag: string) => void;
  onDeleteBatch: (ids: string[]) => void;
  onClearSelection: () => void;
}

function BatchBar({ count, selectedIds, onColorBatch, onTagBatch, onDeleteBatch, onClearSelection }: BatchBarProps) {
  const [batchTag, setBatchTag] = useState('');
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  const confirmColor = () => {
    if (pendingColor) {
      onColorBatch(selectedIds, pendingColor);
      setPendingColor(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl bg-[#81292C] text-white text-[10px] font-bold shadow-lg"
    >
      {/* Count badge */}
      <span className="bg-white/20 rounded-full px-2 py-0.5 shrink-0">{count} selezionati</span>

      <div className="flex-1" />

      {/* Batch color — scegli, poi conferma (nulla viene applicato finché non si conferma) */}
      {!pendingColor ? (
        <div
          className="relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer transition-colors"
          title="Scegli colore"
          onClick={() => colorRef.current?.click()}
        >
          <Palette size={12} />
          <span>Colore</span>
          <input
            ref={colorRef}
            type="color"
            value="#81292c"
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            onChange={(e) => setPendingColor(e.target.value)}
          />
        </div>
      ) : (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg bg-white text-[#81292C] shadow-md ring-2 ring-white/60"
        >
          <span
            className="w-4 h-4 rounded-full border border-black/10 shrink-0 cursor-pointer"
            style={{ backgroundColor: pendingColor }}
            title="Cambia di nuovo il colore scelto"
            onClick={() => colorRef.current?.click()}
          />
          <input
            ref={colorRef}
            type="color"
            value={pendingColor}
            className="absolute left-0 top-0 opacity-0 w-4 h-4 cursor-pointer"
            onChange={(e) => setPendingColor(e.target.value)}
          />
          <span className="text-[9px] font-black uppercase tracking-wider">Colore scelto</span>
          <button
            onClick={confirmColor}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider transition-colors animate-pulse"
            title="Applica questo colore a tutti i selezionati"
          >
            ✓ Applica
          </button>
          <button
            onClick={() => setPendingColor(null)}
            className="p-1 rounded-md text-black/30 hover:text-black/60 hover:bg-black/5 transition-colors"
            title="Annulla, non cambiare colore"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Batch tag */}
      <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2 py-1">
        <Tag size={12} />
        <input
          type="text"
          value={batchTag}
          onChange={(e) => setBatchTag(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && batchTag.trim()) {
              onTagBatch(selectedIds, batchTag.trim());
              setBatchTag('');
            }
          }}
          placeholder="TAG → INVIO"
          className="bg-transparent outline-none placeholder-white/40 uppercase w-24 text-[10px] font-bold"
        />
      </div>

      {/* Delete batch */}
      <button
        onClick={() => onDeleteBatch(selectedIds)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/30 transition-colors"
        title="Elimina selezionati"
      >
        <Trash2 size={12} />
        <span>Elimina</span>
      </button>

      {/* Clear selection */}
      <button
        onClick={onClearSelection}
        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        title="Deseleziona tutto"
      >
        ✕
      </button>
    </motion.div>
  );
}

// ── Main CableList ────────────────────────────────────────────────────────────

export function CableList({
  projectCables, updateCableTag, updateCableColor, removeCable, replaceCable, duplicateCable,
  updateCablesColorBatch, updateCablesTagBatch, removeCablesBatch,
  customCables, t, sensors, handleDragEnd,
}: any) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const lastSelectedRef = useRef<string | null>(null);

  const validCables: ProjectCable[] = projectCables.filter((pc: ProjectCable) => pc && pc.id);

  const handleToggleSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedIds(prev => {
      if (shiftKey && lastSelectedRef.current) {
        const ids = validCables.map((pc: ProjectCable) => pc.id);
        const a = ids.indexOf(lastSelectedRef.current);
        const b = ids.indexOf(id);
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
        const merged = Array.from(new Set([...prev, ...range]));
        return merged;
      }
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      lastSelectedRef.current = id;
      return next;
    });
    if (!shiftKey) lastSelectedRef.current = id;
  }, [validCables]);

  const handleSelectAll = () => {
    if (selectedIds.length === validCables.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(validCables.map((pc: ProjectCable) => pc.id));
    }
  };

  const handleDeleteBatch = (ids: string[]) => {
    removeCablesBatch(ids);
    setSelectedIds([]);
  };

  const handleColorBatch = (ids: string[], color: string) => {
    updateCablesColorBatch(ids, color);
  };

  const handleTagBatch = (ids: string[], tag: string) => {
    updateCablesTagBatch(ids, tag);
    setSelectedIds([]);
  };

  if (validCables.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex flex-col items-center justify-center p-8 text-black/40 dark:text-white/40 border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl"
      >
        <Cable size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-bold uppercase tracking-widest text-center">{t.preview.noCables}</p>
        <p className="text-[10px] mt-2 opacity-60 text-center">{t.misc.addCablesPrompt}</p>
      </motion.div>
    );
  }

  const allSelected = selectedIds.length === validCables.length && validCables.length > 0;
  const someSelected = selectedIds.length > 0;

  return (
    <div>
      {/* Select-all header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <button
          onClick={handleSelectAll}
          className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40 hover:text-[#81292C] dark:hover:text-[#81292C] transition-colors"
        >
          {allSelected
            ? <CheckSquare size={12} className="text-[#81292C]" />
            : <Square size={12} />}
          {allSelected ? 'Deseleziona tutto' : 'Seleziona tutto'}
        </button>
        {someSelected && (
          <span className="text-[9px] text-[#81292C] font-bold ml-auto">
            {selectedIds.length}/{validCables.length}
          </span>
        )}
      </div>

      {/* Batch action bar */}
      <AnimatePresence>
        {selectedIds.length > 1 && (
          <BatchBar
            count={selectedIds.length}
            selectedIds={selectedIds}
            onColorBatch={handleColorBatch}
            onTagBatch={handleTagBatch}
            onDeleteBatch={handleDeleteBatch}
            onClearSelection={() => setSelectedIds([])}
          />
        )}
      </AnimatePresence>

      {/* Cable list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={validCables.map((pc: ProjectCable) => pc.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence mode="popLayout">
            {validCables.map((pc: ProjectCable, index: number) => (
              <motion.div
                key={pc.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <SortableCableItem
                  pc={pc}
                  index={index}
                  selected={selectedIds.includes(pc.id)}
                  onToggleSelect={handleToggleSelect}
                  updateCableTag={updateCableTag}
                  updateCableColor={updateCableColor}
                  removeCable={removeCable}
                  replaceCable={replaceCable}
                  duplicateCable={duplicateCable}
                  customCables={customCables}
                  t={t}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>
    </div>
  );
}
