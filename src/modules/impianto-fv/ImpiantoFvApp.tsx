import React from 'react';
import { AppProvider } from './context/AppContext';
import { ProjectProvider } from './context/ProjectContext';
import { MainLayout } from './components/layout/MainLayout';
import { DcCableView } from './components/views/DcCableView';

function ImpiantoFvInner() {
  return (
    <MainLayout>
      <DcCableView />
    </MainLayout>
  );
}

export function ImpiantoFvApp() {
  return (
    <AppProvider>
      <ProjectProvider>
        <ImpiantoFvInner />
      </ProjectProvider>
    </AppProvider>
  );
}
