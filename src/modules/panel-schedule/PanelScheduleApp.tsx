import React from 'react';
import { AnimatePresence } from 'motion/react';
import { AppProvider } from './context/AppContext';
import { MainLayout } from './components/layout/MainLayout';
import { PanelScheduleView } from './components/views/PanelScheduleView';
import { AIEditChat } from './components/AIEditChat';

function PanelScheduleInner() {
  return (
    <MainLayout>
      <AnimatePresence mode="wait">
        <PanelScheduleView key="panel-schedule" />
      </AnimatePresence>
      <AIEditChat />
    </MainLayout>
  );
}

export function PanelScheduleApp() {
  return (
    <AppProvider>
      <PanelScheduleInner />
    </AppProvider>
  );
}
