import React from 'react';
import { AnimatePresence } from 'motion/react';
import { Zap, Sun, Moon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Toast } from '../Toast';
import { AIChat } from '../AIChat';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { darkMode, setDarkMode, moduleTheme, toastData } = useApp();

  return (
    <div className="h-screen flex overflow-hidden bg-[#F8F8F8] dark:bg-[#1a1a1a]">
      {/* Sidebar */}
      <aside
        className="w-[64px] flex-shrink-0 flex flex-col items-center py-6 gap-4"
        style={{ backgroundColor: darkMode ? moduleTheme.dark : moduleTheme.primary }}
      >
        {/* Logo */}
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4">
          <Zap size={20} className="text-white" />
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all text-white mt-auto"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>

      {/* Toast */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {toastData && <Toast key="toast" message={toastData.message} type={toastData.type} />}
        </AnimatePresence>
      </div>

      {/* AI Chat panel */}
      <AIChat />
    </div>
  );
};
