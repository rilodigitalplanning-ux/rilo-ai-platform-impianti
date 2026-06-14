import { Cable } from '../types';

export const sortCables = (cables: Cable[]) => {
  return [...cables].filter(Boolean).sort((a, b) => {
    if (!a || !b) return 0;
    // First priority: indice column if it exists and is not 0
    const aIndice = (a as any).indice !== undefined ? (a as any).indice : (a as any).INDICE;
    const bIndice = (b as any).indice !== undefined ? (b as any).indice : (b as any).INDICE;
    
    if (aIndice !== undefined && bIndice !== undefined) {
      if (aIndice !== bIndice) {
        return aIndice - bIndice;
      }
    }

    // Extract numbers for natural sorting (e.g., "16mm" vs "110mm")
    const numA = parseInt((a.name || '').replace(/\D/g, ''), 10);
    const numB = parseInt((b.name || '').replace(/\D/g, ''), 10);
    
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }

    // Fallback to existing sorting logic
    if (a.type === 'power' && b.type !== 'power') return -1;
    if (a.type !== 'power' && b.type === 'power') return 1;
    
    if (a.type === 'power' && b.type === 'power') {
      const getCoresAndSection = (name: string) => {
        let cores = 99;
        let section = 999;
        
        const match = name?.match(/(\d+)[xXgG](\d+(\.\d+)?)/);
        if (match) {
          cores = parseInt(match[1]);
          section = parseFloat(match[2]);
        }
        
        const extraMatch = name?.match(/\+(\d+)[xXgG]/);
        if (extraMatch) {
          cores += parseInt(extraMatch[1]);
        }
        
        return { cores, section };
      };
      const aData = getCoresAndSection(a.name);
      const bData = getCoresAndSection(b.name);
      
      if (aData.cores !== bData.cores) {
        return aData.cores - bData.cores;
      }
      if (aData.section !== bData.section) {
        return aData.section - bData.section;
      }
    }
    return (a.name || '').localeCompare(b.name || '');
  });
};

export const hasMixedSystems = (projectCables: any[], newCable?: Cable) => {
  const hasPower = projectCables.some(pc => pc.cable?.type === 'power') || (newCable?.type === 'power');
  const hasSpecial = projectCables.some(pc => pc.cable?.type !== 'power' && pc.cable !== undefined) || (newCable && newCable.type !== 'power');
  return hasPower && hasSpecial;
};
