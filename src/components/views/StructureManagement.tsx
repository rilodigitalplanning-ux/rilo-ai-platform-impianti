import React, { useState } from 'react';
import { Search, Star } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useDatabase } from '../../hooks/useDatabase';
import { TRANSLATIONS } from '../../constants';
import { motion } from 'motion/react';

export const StructureManagement = ({ type }: { type: 'tray' | 'conduit' }) => {
  const t = TRANSLATIONS;
  const { customStructures, toggleFavoriteStructure } = useDatabase();
  
  const [search, setSearch] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  const filtered = [...customStructures]
    .filter(Boolean)
    .filter(s => s?.type === type)
    .filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchesFavorite = showOnlyFavorites ? s.isFavorite : true;
      return matchesSearch && matchesFavorite;
    });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black italic tracking-tighter uppercase dark:text-white">
                {type === 'tray' ? t.sidebar.cableTrays : t.sidebar.conduits}
              </h2>
              <p className="text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.management.existingModels}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/20" size={14} />
                <input 
                  type="text"
                  placeholder={t.input.searchCables}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[#81292C]/50 focus:ring-offset-2 dark:focus:ring-offset-[#141414] transition-all dark:text-white w-64"
                />
              </div>
              <button 
                onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${showOnlyFavorites ? 'bg-yellow-400/10 border-yellow-400 text-yellow-600' : 'bg-white dark:bg-[#141414] border-black/10 dark:border-white/10 text-black/40 dark:text-white/40'}`}
              >
                <Star size={14} fill={showOnlyFavorites ? 'currentColor' : 'none'} />
                {t.input.favorites}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-xl overflow-x-auto overflow-y-hidden shadow-sm custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-[#F5F5F5] dark:bg-white/5 border-b border-black/10 dark:border-white/10">
                  <th className="p-3 text-[10px] font-bold opacity-40 tracking-widest uppercase w-10"></th>
                  <th className="p-3 text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.management.name}</th>
                  <th className="p-3 text-[10px] font-bold opacity-40 tracking-widest uppercase">{type === 'conduit' ? t.management.diameter : t.management.width}</th>
                  {type === 'tray' && <th className="p-3 text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.management.height}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group cursor-pointer">
                    <td className="p-3">
                      <button 
                        onClick={() => toggleFavoriteStructure(s.id)}
                        className={`transition-colors ${s.isFavorite ? 'text-yellow-400' : 'text-black/10 dark:text-white/10 hover:text-yellow-400'}`}
                      >
                        <Star size={16} fill={s.isFavorite ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="p-3 text-[10px] font-bold dark:text-white">{s.name}</td>
                    <td className="p-3 text-xs font-mono dark:text-white">{s.width}mm</td>
                    {type === 'tray' && <td className="p-3 text-xs font-mono dark:text-white">{s.height}mm</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
