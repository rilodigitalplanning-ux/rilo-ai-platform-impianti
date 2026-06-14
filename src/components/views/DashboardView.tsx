import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useProject } from '../../context/ProjectContext';
import { useDatabase } from '../../hooks/useDatabase';
import { hasMixedSystems } from '../../utils/cableUtils';
import { Cable, Structure, StandardStructure } from '../../types';
import { TRANSLATIONS } from '../../constants';
// Icons
import { 
  Folder, Plus, Zap, AlertCircle, Layers, CheckCircle2, Copy, Eye, Minus, Trash2, Search, X, Download, FileText, Globe, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CableList } from '../CableList';
import { OccupancyChart } from '../OccupancyChart';
import { StructurePreview } from '../StructurePreview';
import { exportToPDF } from '../../utils/exportUtils';
import { ReportModal } from '../ReportModal';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export const DashboardView = () => {
  const { showToast, darkMode } = useApp();
  const { user } = useAuth();
  const t = TRANSLATIONS;
  const { 
    customCables, customStructures, selectedStandardId, setSelectedStandardId, 
    selectedCableId, setSelectedCableId 
  } = useDatabase();
  
  const { 
    projects, activeProject, activeProjectId, setActiveProjectId,
    addNewProject, deleteProject, duplicateProject, renameProject, setStructure, setProjectCables
  } = useProject();

  const [cableQty, setCableQty] = useState(1);
  const [cableTag, setCableTag] = useState('');
  const [cableSearch, setCableSearch] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);

  const [isExporting, setIsExporting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportMetadata, setReportMetadata] = useState({ id: '', date: '' });

  const structure = activeProject?.structure;
  const projectCables = activeProject?.projectCables || [];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      setProjectCables((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const hasMixedSystemsInProject = useMemo(() => {
    const hasPower = projectCables.some(pc => pc.cable?.type === 'power');
    const hasSpecial = projectCables.some(pc => pc.cable?.type !== 'power' && pc.cable !== undefined);
    return hasPower && hasSpecial;
  }, [projectCables]);

  useEffect(() => {
    if (warning === t.input.separatorRequiredWarning && !hasMixedSystemsInProject) {
      setWarning(null);
    }
  }, [hasMixedSystemsInProject, warning, t.input.separatorRequiredWarning]);

  const addCable = () => {
    if (cableQty <= 0) return;
    if (!structure) return;
    setWarning(null);

    const newCable = customCables.find(c => c.id === selectedCableId);
    if (!newCable) return;

    // Check for mixed systems
    const hasPower = projectCables.some(pc => pc.cable?.type === 'power') || newCable.type === 'power';
    const hasSpecial = projectCables.some(pc => pc.cable?.type !== 'power' && pc.cable !== undefined) || newCable.type !== 'power';

    if (hasPower && hasSpecial) {
      if (structure.type === 'tray' && !structure.hasSeparator) {
        setWarning(t.input.mixedSystemsWarning);
        return;
      }
    }

    setProjectCables(prev => {
      const newCables = [
        ...prev, 
        { 
          id: Math.random().toString(36).substr(2, 9),
          cable: newCable, 
          quantity: cableQty, 
          tag: cableTag.trim() || undefined,
          color: newCable.type === 'power' ? '#E63946' : '#00B4D8'
        }
      ];
      // Sort: Power first, others last
      return newCables.sort((a, b) => {
        const typeA = a.cable?.type === 'power' ? 0 : 1;
        const typeB = b.cable?.type === 'power' ? 0 : 1;
        return typeA - typeB;
      });
    });
    setCableTag('');
    showToast(t.input.cableAdded, 'success');
  };

  const removeCable = (index: number) => {
    setProjectCables(prev => prev.filter((_, i) => i !== index));
    showToast(t.input.cableRemoved, 'success');
  };

  const replaceCable = (index: number, newCableId: string) => {
    const newCable = customCables.find(c => c.id === newCableId);
    if (!newCable) return;
    setProjectCables(prev => {
      const next = [...prev];
      next[index] = { ...next[index], cable: newCable };
      return next;
    });
  };

  const duplicateCable = (index: number) => {
    setProjectCables(prev => {
      const cableToDuplicate = prev[index];
      if (!cableToDuplicate) return prev;
      
      const newCable = {
        ...cableToDuplicate,
        id: Math.random().toString(36).substr(2, 9),
        tag: cableToDuplicate.tag ? `${cableToDuplicate.tag}-copy` : undefined
      };
      
      const next = [...prev];
      next.splice(index + 1, 0, newCable);
      return next;
    });
  };

  const clearAllCables = () => {
    setProjectCables([]);
    showToast(t.input.allCablesRemoved, 'success');
  };

  const updateCableTag = (index: number, newTag: string) => {
    setProjectCables(prev => prev.map((pc, i) => i === index ? { ...pc, tag: newTag } : pc));
  };

  const updateCableColor = (index: number, color: string) => {
    setProjectCables(prev => prev.map((pc, i) => i === index ? { ...pc, color } : pc));
  };

  const handleExportPDF = () => {
    const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const reportId = `EP-${new Date().getFullYear()}-X${Math.floor(Math.random() * 999)}`;
    setReportMetadata({ id: reportId, date: today });
    setIsReportModalOpen(true);
  };

  const confirmExportPDF = async () => {
    setIsExporting(true);
    setTimeout(async () => {
      try {
        await exportToPDF({
          reportId: reportMetadata.id,
          today: reportMetadata.date,
          structure,
          cables: projectCables,
          allCables: customCables,
          packedStructures,
          results: {
            totalArea: calculationResults.totalStructureArea,
            usedArea: calculationResults.totalCableArea,
            utilization: calculationResults.utilization,
            isPass: calculationResults.isPass
          },
          t: t,
          lang: 'it',
          engineerName: user?.name || user?.email || 'R. SILVA'
        }, `Relatorio_Conformidade_${new Date().getTime()}`);
        setIsReportModalOpen(false);
      } catch (error: any) {
        showToast(error.message || t.preview.pdfExportError, 'error');
      } finally {
        setIsExporting(false);
      }
    }, 100);
  };

  const resetZoom = () => {
    const num = packedStructures.length;
    let targetZoom = 1;
    if (num === 2) targetZoom = 0.8;
    if (num === 3) targetZoom = 0.6;
    if (num === 4) targetZoom = 0.5;
    if (num > 4 && num <= 6) targetZoom = 0.4;
    if (num > 6 && num <= 9) targetZoom = 0.35;
    if (num > 9) targetZoom = 0.3;
    setPreviewZoom(targetZoom);
  };

  const packedStructures = useMemo(() => {
    if (!structure) return [];
    const allUnits: { diameter: number, color: string, name: string, type: string, originalIndex: number }[] = [];
    projectCables.forEach((pc, idx) => {
      if (!pc) return;
      const cable = pc.cable;
      if (cable) {
        for (let i = 0; i < pc.quantity; i++) {
          allUnits.push({
            diameter: cable.diameter,
            color: pc.color || (cable.type === 'power' ? '#E63946' : '#00B4D8'),
            name: cable.name,
            type: cable.type,
            originalIndex: idx
          });
        }
      }
    });

    const structures: { cables: any[], currentArea: number }[] = [{ cables: [], currentArea: 0 }];
    const totalStructureArea = structure.type === 'conduit' 
      ? Math.PI * Math.pow(structure.width / 2, 2)
      : structure.width * structure.height;
    
    const allowedAreaPerStructure = totalStructureArea * (structure.fillLimit / 100);
    
    if (structure.type === 'conduit') {
      const R = structure.width / 2;
      
      allUnits.forEach(unit => {
        const r = unit.diameter / 2;
        const unitArea = Math.PI * Math.pow(r, 2);
        let placed = false;
        
        for (let sIdx = 0; sIdx < structures.length; sIdx++) {
          const currentStructure = structures[sIdx];
          
          if (currentStructure.currentArea + unitArea > allowedAreaPerStructure + 0.01) {
            continue;
          }

          const placedInThis = currentStructure.cables;
          
          if (structure.type === 'conduit' && placedInThis.length > 0) {
            const hasPower = placedInThis.some(c => c.type === 'power');
            const isUnitPower = unit.type === 'power';
            if (hasPower !== isUnitPower) {
              continue;
            }
          }

          let bestX = 0;
          let bestY = 0;
          let found = false;
          
          if (placedInThis.length === 0) {
            if (r <= R - 0.1) {
              bestX = 0;
              // When cable is large relative to conduit, placing at exact center
              // prevents a second cable from fitting. Offset to allow packing.
              if (3 * r > R - 0.5) {
                bestY = Math.max(0, Math.min(r, R - r - 0.5));
              } else {
                bestY = 0;
              }
              found = true;
            }
          } else {
            const margin = 0.5; 
            const maxDist = R - r - margin;
            const distStep = 0.2; 
            
            for (let dist = 0; dist <= maxDist && !found; dist += distStep) {
              const numAngles = Math.max(16, Math.floor(dist * 6)); 
              const currentAngleStep = (Math.PI * 2) / numAngles;
              
              for (let angle = 0; angle < Math.PI * 2; angle += currentAngleStep) {
                const tx = dist * Math.cos(angle);
                const ty = dist * Math.sin(angle);
                
                if (Math.sqrt(tx*tx + ty*ty) + r <= R - margin + 0.1) {
                  let collision = false;
                  for (const p of placedInThis) {
                    const d = Math.sqrt(Math.pow(tx - p.px, 2) + Math.pow(ty - p.py, 2));
                    if (d < (r + p.diameter/2)) { 
                      collision = true;
                      break;
                    }
                  }
                  
                  if (!collision) {
                    bestX = tx;
                    bestY = ty;
                    found = true;
                    break;
                  }
                }
              }
            }
          }
          
          if (found) {
            placedInThis.push({ ...unit, px: bestX, py: bestY });
            currentStructure.currentArea += unitArea;
            placed = true;
            break;
          }
        }
        
        if (!placed) {
          // Use same offset logic for new structures
          const offset = (3 * r > R - 0.5) ? Math.max(0, Math.min(r, R - r - 0.5)) : 0;
          structures.push({ cables: [{ ...unit, px: 0, py: offset }], currentArea: unitArea });
        }
      });
    } else {
      const maxH = structure.height;
      const W = structure.width;
      
      allUnits.forEach(unit => {
        const unitArea = Math.PI * Math.pow(unit.diameter / 2, 2);
        let placed = false;
        
        for (let sIdx = 0; sIdx < structures.length; sIdx++) {
          const currentStructure = structures[sIdx];
          
          if (currentStructure.currentArea + unitArea > allowedAreaPerStructure + 0.01) {
            continue;
          }

          const placedInThis = currentStructure.cables;
          
          if (structure.hasSeparator) {
            const margin = 1.5;
            const midX = W / 2;
            const isPower = unit.type === 'power';
            const startX = isPower ? margin : midX + margin;
            const endX = isPower ? midX - margin : W - margin;
            
            const sideCables = placedInThis.filter(c => (isPower ? c.px < midX : c.px >= midX));
            
            let tempX = startX;
            let tempY = margin;
            let tempRowH = 0;
            
            sideCables.forEach(c => {
              if (tempX + c.diameter > endX + 0.01) {
                tempX = startX;
                tempY += tempRowH;
                tempRowH = 0;
              }
              tempX += c.diameter;
              tempRowH = Math.max(tempRowH, c.diameter);
            });
            
            if (tempX + unit.diameter <= endX + 0.01 && tempY + unit.diameter <= maxH - margin + 0.01) {
              placedInThis.push({ ...unit, px: tempX, py: tempY });
              currentStructure.currentArea += unitArea;
              placed = true;
              break;
            } else if (tempY + tempRowH + unit.diameter <= maxH - margin + 0.01) {
              placedInThis.push({ ...unit, px: startX, py: tempY + tempRowH });
              currentStructure.currentArea += unitArea;
              placed = true;
              break;
            }
          } else {
            const margin = 1.5;
            let tempX = margin;
            let tempY = margin;
            let tempRowH = 0;
            
            placedInThis.forEach(c => {
              if (tempX + c.diameter > W - margin + 0.01) {
                tempX = margin;
                tempY += tempRowH;
                tempRowH = 0;
              }
              tempX += c.diameter;
              tempRowH = Math.max(tempRowH, c.diameter);
            });
            
            if (tempX + unit.diameter <= W - margin + 0.01 && tempY + unit.diameter <= maxH - margin + 0.01) {
              placedInThis.push({ ...unit, px: tempX, py: tempY });
              currentStructure.currentArea += unitArea;
              placed = true;
              break;
            } else if (tempY + tempRowH + unit.diameter <= maxH - margin + 0.01) {
              placedInThis.push({ ...unit, px: margin, py: tempY + tempRowH });
              currentStructure.currentArea += unitArea;
              placed = true;
              break;
            }
          }
        }
        
        if (!placed) {
          const margin = 1.5;
          const startX = structure.hasSeparator && unit.type !== 'power' ? structure.width/2 + margin : margin;
          structures.push({ cables: [{ ...unit, px: startX, py: margin }], currentArea: unitArea });
        }
      });
    }

    if (structure.type === 'conduit' && structure.spareTubes && structure.spareTubes > 0) {
      for (let i = 0; i < structure.spareTubes; i++) {
        structures.push({ cables: [], currentArea: 0, isSpare: true });
      }
    }
    
    return structures.map(s => {
      return {
        ...s,
        fillPercentage: (s.currentArea / totalStructureArea) * 100,
        limit: structure.fillLimit
      };
    });
  }, [structure, projectCables, customCables]);

  const calculationResults = useMemo(() => {
    if (!structure) return {
      totalStructureArea: 0,
      allowedArea: 0,
      totalCableArea: 0,
      fillPercentage: 0,
      isOverfilled: false
    };
    const totalStructureArea = structure.type === 'conduit' 
      ? Math.PI * Math.pow(structure.width / 2, 2)
      : structure.width * structure.height;
    
    const allowedArea = totalStructureArea * (structure.fillLimit / 100);
    
    let totalCableArea = 0;
    projectCables.forEach(pc => {
      if (!pc) return;
      const cable = pc.cable;
      if (cable) {
        const radius = cable.diameter / 2;
        const area = Math.PI * Math.pow(radius, 2);
        totalCableArea += area * pc.quantity;
      }
    });

    const numStructures = packedStructures.length;
    const utilization = (totalCableArea / (totalStructureArea * Math.max(1, numStructures))) * 100;
    const isPass = utilization <= structure.fillLimit;

    return {
      totalStructureArea,
      allowedArea,
      totalCableArea,
      utilization,
      numStructures,
      isPass
    };
  }, [structure, projectCables, customCables, packedStructures]);

  useEffect(() => {
    resetZoom();
  }, [packedStructures.length]);

  if (!structure) return null;

  return (
    <motion.div 
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 p-8 overflow-y-auto flex flex-col gap-8 custom-scrollbar relative"
    >
      {/* Export Buttons Portaled to Header */}
      {document.getElementById('export-portal') && createPortal(
        <div className="flex items-center gap-2 group relative z-50">
          <button className="bg-[#81292C] shadow-lg shadow-[#81292C]/20 text-white text-[10px] font-bold px-6 py-2 rounded flex items-center gap-2 hover:bg-[#401318] active:scale-95 transition-all">
            <Download size={14} />
            {t.header.export}
          </button>
          
          <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#1A1A1A] border border-black/10 dark:border-white/10 shadow-xl rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all overflow-hidden">
            <button 
              onClick={handleExportPDF}
              disabled={isExporting}
              className={`w-full text-left px-4 py-3 text-[10px] font-bold hover:bg-black/5 dark:hover:bg-white/5 border-b border-black/5 dark:border-white/5 flex items-center gap-3 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <FileText size={14} className="text-red-500" />
              {isExporting ? t.header.generatingPdf : t.header.exportPdf}
            </button>
          </div>
        </div>,
        document.getElementById('export-portal')!
      )}

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Inputs */}
        <div className="col-span-4 space-y-8">
          <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 premium-shadow transition-all rounded-2xl">
            <div className="flex items-center gap-2 mb-6 border-b border-black/5 dark:border-white/5 pb-4">
              <div className="flex gap-0.5">
                <div className="w-1 h-4 bg-[#81292C] rounded-full"></div>
                <div className="w-1 h-3 bg-[#81292C] rounded-full"></div>
                <div className="w-1 h-5 bg-[#81292C] rounded-full"></div>
              </div>
              <h3 className="text-xs font-bold tracking-widest dark:text-white uppercase flex-1">{t.input.parameters}</h3>
              <button 
                onClick={() => duplicateProject(activeProjectId)}
                title={t.preview.duplicateProject}
                className="text-[#5a5a5a] hover:text-[#81292C] dark:text-white/50 dark:hover:text-white transition-colors p-1"
              >
                <Copy size={16} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">{t.input.structureName}</label>
                <input 
                  type="text"
                  value={structure.name || ''}
                  onChange={(e) => setStructure(s => ({ ...s, name: e.target.value.toUpperCase() }))}
                  placeholder="EX: ESTRUTURA 01"
                  className="w-full bg-[#efefef] dark:bg-white/5 border-none rounded text-[10px] font-bold py-3 px-4 outline-none focus:outline-none focus:ring-2 focus:ring-[#81292C]/50 focus:ring-offset-2 dark:focus:ring-offset-[#141414] dark:text-white uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">{t.input.structureType}</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const type = 'tray';
                      setStructure(s => ({ ...s, type }));
                      const firstOfType = customStructures.find(s => s?.type === type);
                      if (firstOfType) {
                        setStructure(prev => ({ ...prev, width: firstOfType.width, height: firstOfType.height, type }));
                        setSelectedStandardId(firstOfType.id);
                      }
                    }}
                    className={`flex-1 py-2 text-[10px] font-bold border transition-all ${structure?.type === 'tray' ? 'bg-[#401318] dark:bg-white dark:text-black text-white border-[#401318]' : 'bg-white dark:bg-transparent text-[#5a5a5a] dark:text-white border-black/10 dark:border-white/10 hover:bg-black/5'} ${warning === t.input.mixedSystemsWarning ? 'border-[#81292C]' : ''}`}
                  >
                    {t.sidebar.cableTrays}
                    {warning === t.input.mixedSystemsWarning && <AlertCircle size={10} className="inline ml-1" />}
                  </button>
                  <button 
                    onClick={() => {
                      const type = 'conduit';
                      setStructure(s => ({ ...s, type }));
                      const firstOfType = customStructures.find(s => s?.type === type);
                      if (firstOfType) {
                        setStructure(prev => ({ ...prev, width: firstOfType.width, height: firstOfType.height, type }));
                        setSelectedStandardId(firstOfType.id);
                      }
                    }}
                    className={`flex-1 py-2 text-[10px] font-bold border transition-all ${structure?.type === 'conduit' ? 'bg-[#401318] dark:bg-white dark:text-black text-white border-[#401318]' : 'bg-white dark:bg-transparent text-[#5a5a5a] dark:text-white border-black/10 dark:border-white/10 hover:bg-black/5'} ${warning === t.input.conduitMixedWarning ? 'border-[#81292C]' : ''}`}
                  >
                    {t.sidebar.conduits}
                    {warning === t.input.conduitMixedWarning && <AlertCircle size={10} className="inline ml-1" />}
                  </button>
                </div>
              </div>

              <div>
                  <select 
                    value={selectedStandardId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedStandardId(id);
                      const std = customStructures.find(s => s.id === id);
                      if (std) {
                        setStructure(prev => ({ ...prev, width: std.width, height: std.height, type: std.type }));
                      }
                    }}
                    className="w-full bg-[#efefef] dark:bg-white/5 border-none rounded text-[10px] font-bold py-3 px-4 outline-none focus:outline-none focus:ring-2 focus:ring-[#81292C]/50 focus:ring-offset-2 dark:focus:ring-offset-[#141414] dark:text-white uppercase"
                  >
                  {customStructures
                    .filter(Boolean)
                    .filter(s => s?.type === structure?.type)
                    .sort((a, b) => {
                      if (a.isFavorite && !b.isFavorite) return -1;
                      if (!a.isFavorite && b.isFavorite) return 1;
                      
                      const numA = parseInt((a?.name || '').replace(/\D/g, ''), 10);
                      const numB = parseInt((b?.name || '').replace(/\D/g, ''), 10);
                      
                      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
                        return numA - numB;
                      }
                      
                      return (a?.name || '').localeCompare(b?.name || '');
                    })
                    .map(s => (
                    <option key={s?.id} value={s?.id} className="dark:bg-[#141414]">{s.isFavorite ? 'â˜… ' : ''}{s?.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">
                    {structure?.type === 'conduit' ? `${t.input.diameter} (mm)` : `${t.input.width} (mm)`}
                  </label>
                  <input 
                    type="number" 
                    value={structure.width}
                    readOnly
                    className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 p-2 text-xs font-mono outline-none opacity-60 cursor-not-allowed dark:text-white"
                  />
                </div>
                {structure?.type === 'tray' && (
                  <div>
                    <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">{t.input.height} (mm)</label>
                    <input 
                      type="number" 
                      value={structure.height}
                      readOnly
                      className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 p-2 text-xs font-mono outline-none opacity-60 cursor-not-allowed dark:text-white"
                    />
                  </div>
                )}
                {structure?.type === 'conduit' && (
                  <div>
                    <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">{t.input.spareTubes}</label>
                    <input 
                      type="number" 
                      min="0"
                      value={structure.spareTubes || 0}
                      onChange={(e) => setStructure(s => ({ ...s, spareTubes: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 p-2 text-xs font-mono outline-none dark:text-white focus:ring-2 focus:ring-[#81292C]/50"
                    />
                  </div>
                )}
              </div>

              {structure?.type === 'tray' && (
                <div className="flex items-center gap-3 pt-2">
                  <button 
                    onClick={() => {
                      if (structure.hasSeparator && hasMixedSystemsInProject) {
                        setWarning(t.input.separatorRequiredWarning);
                        return;
                      }
                      setStructure(s => ({ ...s, hasSeparator: !s.hasSeparator }));
                    }}
                    className={`w-10 h-5 rounded-full relative transition-colors ${structure.hasSeparator ? 'bg-[#81292C]' : 'bg-black/10 dark:bg-white/10'} ${structure.hasSeparator && hasMixedSystemsInProject ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${structure.hasSeparator ? 'left-6' : 'left-1'}`}></div>
                  </button>
                  <span className="text-[10px] font-bold opacity-60 dark:text-white/60 uppercase tracking-widest">{t.input.hasSeparator}</span>
                </div>
              )}

            <div>
              <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">{t.input.fillLimit}</label>
              <input 
                type="range" 
                min="10" 
                max="100" 
                step="5"
                value={structure.fillLimit}
                onChange={(e) => setStructure(s => ({ ...s, fillLimit: Number(e.target.value) }))}
                className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#81292C]"
              />
              <div className="flex justify-between mt-2 text-[10px] font-mono opacity-60 dark:text-white/60">
                <span>10%</span>
                <span className="font-bold text-[#81292C]">{structure.fillLimit}%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="pt-4 border-t border-black/5 dark:border-white/5">
              <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase">{t.input.addCable}</label>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select 
                    value={selectedCableId}
                    onChange={(e) => setSelectedCableId(e.target.value)}
                    className="flex-1 bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 p-2 text-[10px] font-bold outline-none dark:text-white"
                  >
                    {[...customCables]
                      .filter(Boolean)
                      .sort((a, b) => {
                        if (a.isFavorite && !b.isFavorite) return -1;
                        if (!a.isFavorite && b.isFavorite) return 1;
                        return 0; // Maintain original order (indice)
                      })
                      .map(c => (
                      <option 
                        key={c.id} 
                        value={c.id} 
                        className={`dark:bg-[#141414] ${c?.type === 'power' ? 'text-[#E63946]' : 'text-[#00B4D8]'}`}
                      >
                        {c.isFavorite ? 'â˜… ' : ''}{c?.name} (Ã˜{c?.diameter}mm)
                      </option>
                    ))}
                  </select>
                  <input 
                    type="number" 
                    value={cableQty}
                    onChange={(e) => setCableQty(Math.max(1, Number(e.target.value)))}
                    className="w-16 bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 p-2 text-xs font-mono outline-none dark:text-white"
                    min="1"
                    aria-label={t.input.quantity}
                  />
                </div>
                <input 
                  type="text"
                  placeholder={t.input.tagPlaceholder}
                  value={cableTag}
                  onChange={(e) => setCableTag(e.target.value)}
                  className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 p-2 text-[10px] font-bold outline-none uppercase dark:text-white"
                />
                <button 
                  onClick={addCable}
                  aria-label={t.input.addCable}
                  className="w-full bg-[#401318] dark:bg-white dark:text-black text-white py-3 text-[10px] font-bold tracking-widest uppercase hover:bg-[#81292C] dark:hover:bg-white/90 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={14} />
                  {t.input.addCable}
                </button>
                <AnimatePresence>
                  {warning && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-[#81292C]/10 border border-[#81292C]/20 p-3 flex items-start gap-2"
                    >
                      <AlertCircle size={14} className="text-[#81292C] shrink-0 mt-0.5" />
                      <p className="text-[9px] font-bold text-[#81292C] leading-tight">{warning}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {projectCables.length > 0 && (
                  <button 
                    onClick={clearAllCables}
                    aria-label={t.input.clearAll}
                    className="w-full bg-transparent border border-[#81292C] text-[#81292C] dark:border-white/20 dark:text-white/50 py-2 text-[10px] font-bold tracking-widest uppercase hover:bg-[#81292C] hover:text-white dark:hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    <Trash2 size={14} />
                    {t.input.clearAll}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4 mt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/20" size={14} />
                <input 
                  type="text"
                  placeholder={t.input.searchCables}
                  value={cableSearch}
                  onChange={(e) => setCableSearch(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[#81292C]/50 focus:ring-offset-2 dark:focus:ring-offset-[#141414] transition-all dark:text-white"
                />
                {cableSearch && (
                  <button 
                    onClick={() => setCableSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/20 hover:text-black dark:hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                <CableList 
                  projectCables={projectCables.filter(pc => 
                    !cableSearch || 
                    pc.cable.name.toLowerCase().includes(cableSearch.toLowerCase()) || 
                    pc.tag?.toLowerCase().includes(cableSearch.toLowerCase())
                  )}
                  updateCableTag={updateCableTag}
                  updateCableColor={updateCableColor}
                  removeCable={removeCable}
                  replaceCable={replaceCable}
                  duplicateCable={duplicateCable}
                  customCables={customCables}
                  t={t}
                  sensors={sensors}
                  handleDragEnd={handleDragEnd}
                />
              </div>
          </div>
        </section>

      </div>

      {/* Right Column: Preview & Stats */}
      <div className="col-span-8 space-y-8">
        {/* Visual Preview */}
        <div className="space-y-8">
          <section id="preview-capture-area" className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 premium-shadow flex flex-col h-[600px] transition-all rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#81292C] animate-pulse"></div>
                <h3 className="text-xs font-bold tracking-widest uppercase">{t.preview.structuralPreview}</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-[#efefef] dark:bg-white/5 rounded p-1">
                  <button 
                    onClick={() => setPreviewZoom(prev => Math.max(0.2, prev - 0.1))}
                    className="w-6 h-6 flex items-center justify-center hover:bg-white dark:hover:bg-white/10 rounded transition-all"
                    title={t.preview.zoomOut}
                  >
                    <Minus size={12} />
                  </button>
                  <button 
                    onClick={resetZoom}
                    className="w-6 h-6 flex items-center justify-center hover:bg-white dark:hover:bg-white/10 rounded transition-all"
                    title={t.preview.fitToScreen}
                  >
                    <Zap size={12} className="text-[#81292C]" />
                  </button>
                  <span className="text-[9px] font-mono w-10 text-center">{Math.round(previewZoom * 100)}%</span>
                  <button 
                    onClick={() => setPreviewZoom(prev => Math.min(3, prev + 0.1))}
                    className="w-6 h-6 flex items-center justify-center hover:bg-white dark:hover:bg-white/10 rounded transition-all"
                    title={t.preview.zoomIn}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div className="flex bg-[#efefef] dark:bg-white/5 rounded p-1">
                  <button
                    className="px-4 py-1 text-[10px] font-bold rounded transition-all bg-white dark:bg-white dark:text-black shadow-sm"
                  >
                    {t.preview.crossSection}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 bg-[#efefef] dark:bg-[#0F0F0F] overflow-auto custom-scrollbar transition-colors flex flex-col">
              <div className="flex flex-wrap gap-x-12 gap-y-16 p-8 items-end justify-center w-full mx-auto min-h-full">
                {packedStructures.map((packedStructure, idx) => (
                  <StructurePreview 
                    key={idx}
                    structure={structure}
                    cables={projectCables}
                    allCables={customCables}
                    packedCables={packedStructure.cables}
                    fillPercentage={packedStructure.fillPercentage}
                    limit={packedStructure.limit}
                    index={idx}
                    allowedArea={calculationResults.allowedArea}
                    darkMode={darkMode}
                    zoom={previewZoom}
                    onNameChange={(name) => setStructure(s => ({ ...s, name }))}
                    onCableClick={(idx) => {
                      if (!projectCables[idx]) return;
                      const colors = ['#81292C', '#00B4D8', '#FFBE0B', '#8338EC', '#00C49A', '#401318'];
                      const currentColor = projectCables[idx].color || '#81292C';
                      const nextIndex = (colors.indexOf(currentColor) + 1) % colors.length;
                      updateCableColor(idx, colors[nextIndex]);
                    }}
                    t={t as any}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Cable Correspondence Table */}
          <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 shadow-sm transition-colors mb-8">
            <div className="grid grid-cols-1 gap-1">
              <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-4">{t.preview.cableSchedule}</p>
              <div className="space-y-6">
                {['power', 'data', 'evac', 'irai'].map(type => {
                  const cablesOfType = projectCables.filter(pc => pc.cable?.type === type);
                  if (cablesOfType.length === 0) return null;
                  
                  return (
                    <div key={type}>
                      <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest mb-2 border-b border-black/5 dark:border-white/5 pb-1">{type}</p>
                      <div className="space-y-1">
                        {cablesOfType.map((pc, idx) => {
                          const cable = pc.cable;
                          if (!cable) return null;
                          return (
                            <div key={pc.id} className="flex items-center gap-4 text-[10px] py-2 border-b border-black/5 dark:border-white/5 last:border-none">
                              <span className="w-6 h-6 bg-[#401318] dark:bg-white dark:text-black text-white flex items-center justify-center rounded font-bold shrink-0">
                                {projectCables.indexOf(pc) + 1}
                              </span>
                              <div className="flex-1 grid grid-cols-3 gap-4">
                                <span className="font-bold uppercase dark:text-white">{cable?.name}</span>
                                <span className="opacity-50 dark:text-white/50">Ã˜{cable?.diameter}mm Ã— {pc.quantity}</span>
                                <span className="font-bold text-[#81292C] uppercase">{pc.tag || t.preview.noTag}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {projectCables.length === 0 && (
                  <p className="text-[10px] opacity-30 italic dark:text-white/30">{t.preview.noCables}</p>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 shadow-sm transition-colors mb-8">
            <h3 className="text-xs font-bold tracking-widest uppercase mb-4 dark:text-white">{t.misc.occupancyDist}</h3>
            <OccupancyChart projectCables={projectCables} t={t} />
          </section>
        </div>
      </div>
      </div>

      <ReportModal 
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onConfirm={confirmExportPDF}
        structure={structure}
        cables={projectCables}
        allCables={customCables}
        packedStructures={packedStructures}
        results={{
          totalArea: calculationResults.totalStructureArea,
          usedArea: calculationResults.totalCableArea,
          utilization: calculationResults.utilization,
          isPass: calculationResults.isPass
        }}
        t={t as any}
        darkMode={darkMode}
        reportId={reportMetadata.id}
        today={reportMetadata.date}
        engineerName={user?.name || user?.email || 'R. SILVA'}
      />
    </motion.div>
  );
};
