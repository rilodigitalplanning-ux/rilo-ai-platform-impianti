import React from 'react';
import { AnimatePresence } from 'motion/react';
import { AppProvider } from './context/AppContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoadAnalysisView } from './components/views/LoadAnalysisView';

const AppInner: React.FC = () => {
  return (
    <MainLayout>
      <AnimatePresence mode="wait">
        <LoadAnalysisView key="load-analysis" />
      </AnimatePresence>
    </MainLayout>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <AppInner />
  </AppProvider>
);

export default App;
