import React from 'react';
import { motion } from 'motion/react';
import { Hammer } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ComingSoonView: React.FC<{ title: string; description?: string }> = ({ title, description }) => {
  const { moduleTheme } = useApp();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex items-center justify-center p-8"
    >
      <div className="max-w-md text-center space-y-4">
        <div
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
          style={{ backgroundColor: `${moduleTheme.accent}1a`, color: moduleTheme.accent }}
        >
          <Hammer size={26} />
        </div>
        <h2 className="text-lg font-black uppercase tracking-tight dark:text-white">{title}</h2>
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40">
          {description ?? 'Sezione in costruzione'}
        </p>
      </div>
    </motion.div>
  );
};
