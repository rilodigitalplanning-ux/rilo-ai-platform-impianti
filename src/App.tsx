import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useApp } from './context/AppContext';
import { useProject } from './context/ProjectContext';
import { useDatabase } from './hooks/useDatabase';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardView } from './components/views/DashboardView';
import { StructureManagement } from './components/views/StructureManagement';
import { CableManagement } from './components/views/CableManagement';
import { DatabaseView } from './components/views/DatabaseView';
import { UserManagement } from './components/UserManagement';
import { TRANSLATIONS } from './constants';

import { supabase } from './lib/supabase';
import { Toast } from './components/Toast';
import { Login } from './components/Login';
import { ShortcutsModal } from './components/ShortcutsModal';

export default function App() {
  const { user, setUser, isSessionVerified } = useAuth();
  const { darkMode, activeTab, toastData, showToast } = useApp();
  const { customCables, customStructures } = useDatabase();
  
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  if (!isSessionVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render Login UI if missing user
  if (!user) {
    return <Login t={TRANSLATIONS} onLogin={(u) => {
      setUser(u);
      localStorage.setItem('cablepro_user', JSON.stringify(u));
    }} />;
  }

  return (
    <MainLayout
      isShortcutsModalOpen={isShortcutsModalOpen}
      setIsShortcutsModalOpen={setIsShortcutsModalOpen}
      isReportModalOpen={isReportModalOpen}
      setIsReportModalOpen={setIsReportModalOpen}
      customCables={customCables}
      customStructures={customStructures}
    >
      {activeTab === 'dashboard' && <DashboardView key="dashboard" />}
      {activeTab === 'trays' && <StructureManagement key="trays" type="tray" />}
      {activeTab === 'conduits' && <StructureManagement key="conduits" type="conduit" />}
      {activeTab === 'cables' && <CableManagement key="cables" />}
      {activeTab === 'database' && <DatabaseView key="database" />}
      {activeTab === 'users' && user.role === 'admin' && <UserManagement key="users" t={TRANSLATIONS} showToast={showToast} />}
    </MainLayout>
  );
}
