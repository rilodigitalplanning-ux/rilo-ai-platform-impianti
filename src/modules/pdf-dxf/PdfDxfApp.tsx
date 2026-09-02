import React from 'react';
import { AppProvider } from './context/AppContext';
import { MainLayout } from './components/layout/MainLayout';
import { PdfDxfView } from './components/views/PdfDxfView';

function PdfDxfInner() {
  return (
    <MainLayout>
      <PdfDxfView />
    </MainLayout>
  );
}

export function PdfDxfApp() {
  return (
    <AppProvider>
      <PdfDxfInner />
    </AppProvider>
  );
}
