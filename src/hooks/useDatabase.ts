import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Cable, StandardStructure } from '../types';
import { useAuth } from '../context/AuthContext';

export const useDatabase = () => {
  const { user } = useAuth();
  
  const [customCables, setCustomCables] = useState<Cable[]>([]);
  const [customStructures, setCustomStructures] = useState<StandardStructure[]>([]);
  const [selectedStandardId, setSelectedStandardId] = useState<string>('');
  const [selectedCableId, setSelectedCableId] = useState('');

  const fetchDatabase = async () => {
    if (!user) return;
    
    // Clear local state before fetching
    setCustomCables([]);
    setCustomStructures([]);
    
    try {
      // Fetch Cables
      let { data: cablesData, error: cablesError } = await supabase
        .from('Cable')
        .select('id, indice, name, type, diameter, size, weight, userId');
        
      if (cablesError) {
        console.error('Error fetching Cable:', JSON.stringify(cablesError, null, 2));
      }
      
      if (cablesData) {
        let favCables: string[] = [];
        try {
          favCables = JSON.parse(localStorage.getItem('favoriteCables') || '[]');
        } catch (e) {
          console.error('Error parsing favoriteCables', e);
        }
        const mappedCables = cablesData.map((c) => ({
          id: c.id,
          name: c.name || 'Unknown Cable',
          size: c.size || '',
          diameter: Number(c.diameter || 0),
          weight: Number(c.weight || 0),
          type: c.type as 'power' | 'data' | 'evac' | 'irai',
          indice: c.indice,
          INDICE: c.indice,
          isFavorite: favCables.includes(c.id)
        }));
        
        const sortedCables = [...mappedCables].sort((a, b) => (a.indice || 0) - (b.indice || 0));
        setCustomCables(sortedCables);
        if (sortedCables.length > 0) {
          setSelectedCableId(prev => sortedCables.some(c => c.id === prev) ? prev : sortedCables[0].id);
        }
      }

      // Fetch Structures
      let { data: structuresData, error: structuresError } = await supabase
        .from('Structure')
        .select('id, name, type, width, height, fillLimit, userId')
        .order('type', { ascending: true })
        .order('width', { ascending: true });
        
      if (structuresError) {
        console.error('Error fetching Structure:', JSON.stringify(structuresError, null, 2));
      }
        
      if (structuresData) {
        let favStructures: string[] = [];
        try {
          favStructures = JSON.parse(localStorage.getItem('favoriteStructures') || '[]');
        } catch (e) {
          console.error('Error parsing favoriteStructures', e);
        }
        const mappedStructures = structuresData.map((s) => ({
          id: s.id,
          name: s.name || 'Unknown Structure',
          type: s.type as 'tray' | 'conduit',
          width: Number(s.width || 0),
          height: Number(s.height || 0),
          fillLimit: Number(s.fillLimit || 40),
          isFavorite: favStructures.includes(s.id)
        })) as StandardStructure[];
        setCustomStructures(mappedStructures);
        if (mappedStructures.length > 0) {
          setSelectedStandardId(prev => mappedStructures.some(s => s.id === prev) ? prev : mappedStructures[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching database:', err);
    }
  };

  useEffect(() => {
    fetchDatabase();
  }, [user?.id]);

  const toggleFavoriteCable = (id: string) => {
    setCustomCables(prev => {
      const next = prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c);
      localStorage.setItem('favoriteCables', JSON.stringify(next.filter(c => c.isFavorite).map(c => c.id)));
      return next;
    });
  };

  const toggleFavoriteStructure = (id: string) => {
    setCustomStructures(prev => {
      const next = prev.map(s => s.id === id ? { ...s, isFavorite: !s.isFavorite } : s);
      localStorage.setItem('favoriteStructures', JSON.stringify(next.filter(s => s.isFavorite).map(s => s.id)));
      return next;
    });
  };

  return {
    customCables, setCustomCables,
    customStructures, setCustomStructures,
    selectedStandardId, setSelectedStandardId,
    selectedCableId, setSelectedCableId,
    toggleFavoriteCable, toggleFavoriteStructure,
    refreshDatabase: fetchDatabase
  };
};
