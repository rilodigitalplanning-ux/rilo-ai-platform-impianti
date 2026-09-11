import React from 'react';
import { AppProvider } from './context/AppContext';
import { ProjectProvider } from './context/ProjectContext';
import { MainLayout } from './components/layout/MainLayout';
import { StringConfigView } from './components/views/StringConfigView';

function ImpiantoFvInner() {
  return (
    <MainLayout>
      <StringConfigView />
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
