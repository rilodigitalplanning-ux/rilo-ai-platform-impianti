import React from 'react';
import { AnimatePresence } from 'motion/react';
import { AppProvider } from './context/AppContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoadAnalysisView } from './components/views/LoadAnalysisView';

function LoadAnalysisInner() {
  return (
    <MainLayout>
      <AnimatePresence mode="wait">
        <LoadAnalysisView key="load-analysis" />
      </AnimatePresence>
    </MainLayout>
  );
}

export function LoadAnalysisApp() {
  return (
    <AppProvider>
      <LoadAnalysisInner />
    </AppProvider>
  );
}
