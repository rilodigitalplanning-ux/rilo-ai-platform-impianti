import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div 
        className="bg-white dark:bg-[#141414] w-full max-w-md rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in duration-200"
      >
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 text-[#81292C]">
              <div className="p-2 bg-[#81292C]/10 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-xl font-bold tracking-tight">{title}</h3>
            </div>
            <button 
              onClick={onCancel}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          <p className="text-sm opacity-80 leading-relaxed">
            {message}
          </p>

          <div className="flex items-center justify-end gap-3 mt-4">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 text-sm font-bold rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className="px-5 py-2.5 text-sm font-bold rounded-xl bg-[#81292C] text-white hover:bg-[#81292C]/90 transition-colors shadow-lg shadow-[#81292C]/20"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
