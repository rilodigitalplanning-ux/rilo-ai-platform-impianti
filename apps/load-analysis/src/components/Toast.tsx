import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle, XCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
}

export const Toast: React.FC<ToastProps> = ({ message, type }) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 20, scale: 0.9 }}
    className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-[11px] font-bold ${
      type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
    }`}
  >
    {type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
    {message}
  </motion.div>
);
