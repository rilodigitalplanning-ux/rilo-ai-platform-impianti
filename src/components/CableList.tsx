import React from 'react';
import { Trash2, GripVertical, Copy, Cable } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ProjectCable } from '../types';
import { motion, AnimatePresence } from 'motion/react';

function SortableCableItem({ pc, index, updateCableTag, updateCableColor, removeCable, replaceCable, duplicateCable, customCables, t }: { pc: ProjectCable, index: number, updateCableTag: any, updateCableColor: any, removeCable: any, replaceCable: any, duplicateCable: any, customCables: any, t: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pc?.id || 'unknown' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const cable = pc?.cable;
  if (!cable) return null;

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 bg-[#efefef] dark:bg-white/5 p-2 text-[10px] border border-black/5 dark:border-white/5 group transition-colors ${isDragging ? 'shadow-lg border-black/20 dark:border-white/20' : ''}`}>
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
            className="font-bold bg-transparent border-none outline-none cursor-pointer truncate w-full max-w-[140px]"
          >
            {customCables.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span className={`shrink-0 px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase tracking-wider ${
            cable.type === 'power' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            cable.type === 'data' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
            cable.type === 'evac' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
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
        <button 
          onClick={() => duplicateCable(index)}
          className="p-1 text-black/20 hover:text-blue-600 transition-colors"
        >
          <Copy size={12} />
        </button>
        <button 
          onClick={() => removeCable(index)}
          className="p-1 text-black/20 hover:text-[#81292C] transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export function CableList({ projectCables, updateCableTag, updateCableColor, removeCable, replaceCable, duplicateCable, customCables, t, sensors, handleDragEnd }: any) {
  const validCables = projectCables.filter((pc: ProjectCable) => pc && pc.id);
  
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

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={validCables.map((pc: ProjectCable) => pc.id)}
        strategy={verticalListSortingStrategy}
      >
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
  );
}
