import React from 'react';
import { FolderKanban, UploadCloud } from 'lucide-react';
import { useApp } from '../context/AppContext';

// Mostrata nelle sezioni che lavorano sul progetto in corso quando non ce n'è nessuno.
export const EmptyProjectNotice: React.FC<{ title: string }> = ({ title }) => {
  const { moduleTheme, setActiveTab, setComputoView } = useApp();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-5">
        <h2 className="text-lg font-black uppercase tracking-tight dark:text-white">{title}</h2>
        <p className="text-[12px] opacity-50 dark:text-white">
          Questa sezione lavora sul progetto in corso, ma non c'è ancora nessun computo aperto.
          Apri un progetto salvato oppure importa un nuovo computo da Revit.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setActiveTab('banco-progetti')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 dark:text-white"
          >
            <FolderKanban size={14} /> Banco di Progetti
          </button>
          <button
            onClick={() => { setComputoView('setup'); setActiveTab('computo'); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white"
            style={{ backgroundColor: moduleTheme.accent }}
          >
            <UploadCloud size={14} /> Nuovo computo
          </button>
        </div>
      </div>
    </div>
  );
};
