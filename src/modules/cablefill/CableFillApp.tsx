import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ProjectProvider } from './context/ProjectContext';
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

// Auth bypass: inject a default user so no login screen is shown.
// Will be replaced with real auth in a future phase.
const BYPASS_USER = {
  id: 'bypass',
  email: 'rafael.azevedo.93@live.com',
  name: 'Rafael Azevedo',
  role: 'admin',
  accessible_modules: ['cablefill'],
};

function ensureBypassUser() {
  if (!localStorage.getItem('cablefill_user')) {
    localStorage.setItem('cablefill_user', JSON.stringify(BYPASS_USER));
  }
}

function CableFillInner() {
  const { user, setUser, isSessionVerified } = useAuth();
  const { darkMode, activeTab, showToast } = useApp();
  const { customCables, customStructures } = useDatabase();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Auth bypass: auto-login if no user
  useEffect(() => {
    if (isSessionVerified && !user) {
      setUser(BYPASS_USER);
      localStorage.setItem('cablefill_user', JSON.stringify(BYPASS_USER));
    }
  }, [isSessionVerified, user, setUser]);

  if (!isSessionVerified || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a]">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#81292C', borderTopColor: 'transparent' }} />
      </div>
    );
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
      {activeTab === 'dashboard'  && <DashboardView key="dashboard" />}
      {activeTab === 'trays'      && <StructureManagement key="trays" type="tray" />}
      {activeTab === 'conduits'   && <StructureManagement key="conduits" type="conduit" />}
      {activeTab === 'cables'     && <CableManagement key="cables" />}
      {activeTab === 'database'   && <DatabaseView key="database" />}
      {activeTab === 'users' && user.role === 'admin' && <UserManagement key="users" t={TRANSLATIONS} showToast={showToast} />}
    </MainLayout>
  );
}

export function CableFillApp() {
  ensureBypassUser();
  return (
    <AuthProvider>
      <AppProvider>
        <ProjectProvider>
          <CableFillInner />
        </ProjectProvider>
      </AppProvider>
    </AuthProvider>
  );
}
