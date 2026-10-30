import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ModuleSelector } from './launcher/ModuleSelector';
import { CableFillApp } from './modules/cablefill/CableFillApp';
import { LoadAnalysisApp } from './modules/load-analysis/LoadAnalysisApp';
import { PanelScheduleApp } from './modules/panel-schedule/PanelScheduleApp';
import { CMEEditorApp } from './modules/cme-editor/CMEEditorApp';
import { PdfDxfApp } from './modules/pdf-dxf/PdfDxfApp';
import { ImpiantoFvApp } from './modules/impianto-fv/ImpiantoFvApp';
import { CmeGeneratorApp } from './modules/cme-generator/CmeGeneratorApp';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModuleSelector />} />
        <Route path="/cablefill/*" element={<CableFillApp />} />
        <Route path="/load-analysis/*" element={<LoadAnalysisApp />} />
        <Route path="/panel-schedule/*" element={<PanelScheduleApp />} />
        <Route path="/cme-editor/*" element={<CMEEditorApp />} />
        <Route path="/pdf-dxf/*" element={<PdfDxfApp />} />
        <Route path="/impianto-fv/*" element={<ImpiantoFvApp />} />
        <Route path="/cme-generator/*" element={<CmeGeneratorApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
