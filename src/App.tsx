import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ModuleSelector } from './launcher/ModuleSelector';
import { CableFillApp } from './modules/cablefill/CableFillApp';
import { LoadAnalysisApp } from './modules/load-analysis/LoadAnalysisApp';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModuleSelector />} />
        <Route path="/cablefill/*" element={<CableFillApp />} />
        <Route path="/load-analysis/*" element={<LoadAnalysisApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
