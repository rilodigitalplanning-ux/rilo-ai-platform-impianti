import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface ToastProps {
  data: { message: string, type: 'success' | 'error' } | null;
}

export const Toast: React.FC<ToastProps> = ({ data }) => {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className={`fixed bottom-4 right-4 p-4 rounded shadow-lg flex items-center gap-3 text-white text-xs font-bold z-50 ${data.type === 'success' ? 'bg-emerald-600' : 'bg-[#81292C]'}`}
        >
          {data.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {data.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
