import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { CmeProvider } from './context/CmeContext';
import { MainLayout } from './components/layout/MainLayout';
import { ComputoMetricoView } from './pages/CmeGeneratorModule';
import { ProjectsView } from './pages/ProjectsView';
import { ElencoPrezziView } from './components/views/ElencoPrezziView';
import { AnalisiPrezziView } from './components/views/AnalisiPrezziView';
import { PrezzariView } from './components/views/PrezzariView';
import { ConsultaBdView } from './components/views/ConsultaBdView';

function CmeGeneratorInner() {
  const { activeTab, setActiveTab, setComputoView } = useApp();

  return (
    <MainLayout>
      {/* Il computo in lavorazione resta montato (nascosto) cambiando sezione, così
          un'elaborazione in corso non viene interrotta. */}
      <div className={activeTab === 'computo' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
        <ComputoMetricoView />
      </div>

      <div className={activeTab === 'consulta-bd' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
        <ConsultaBdView />
      </div>
      {activeTab === 'analisi-prezzi' && <AnalisiPrezziView />}
      {activeTab === 'elenco-prezzi' && <ElencoPrezziView />}
      {activeTab === 'prezzari' && <PrezzariView />}
      {activeTab === 'banco-progetti' && (
        <div className="flex-1 flex flex-col overflow-auto bg-gray-50 dark:bg-[#060A12] text-gray-900 dark:text-white">
          <ProjectsView onNext={() => { setComputoView('setup'); setActiveTab('computo'); }} />
        </div>
      )}
    </MainLayout>
  );
}

export function CmeGeneratorApp() {
  return (
    <AppProvider>
      <CmeProvider>
        <CmeGeneratorInner />
      </CmeProvider>
    </AppProvider>
  );
}
