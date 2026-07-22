import React from 'react';
import { AppProvider } from './context/AppContext';
import { MainLayout } from './components/layout/MainLayout';
import { CMEEditorView } from './components/views/CMEEditorView';

function CMEEditorInner() {
  return (
    <MainLayout>
      <CMEEditorView />
    </MainLayout>
  );
}

export function CMEEditorApp() {
  return (
    <AppProvider>
      <CMEEditorInner />
    </AppProvider>
  );
}
