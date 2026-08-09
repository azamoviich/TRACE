import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toasts: ToastMessage[];
  removeToast: (id: number) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; removeToast: (id: number) => void }> = ({ toast, removeToast }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  const icons = {
    success: <CheckCircle className="text-success" size={20} />,
    error: <AlertCircle className="text-danger" size={20} />,
    info: <Info className="text-primary" size={20} />
  };

  const bgColors = {
    success: 'bg-[#1a1a1a] border-success/30',
    error: 'bg-[#1a1a1a] border-danger/30',
    info: 'bg-[#1a1a1a] border-primary/30'
  };

  return (
    <div className={`pointer-events-auto flex items-center gap-3 min-w-[300px] p-4 rounded-lg border shadow-xl animate-slide-in-right backdrop-blur-md ${bgColors[toast.type]}`}>
      {icons[toast.type]}
      <p className="text-sm font-medium text-white flex-1">{toast.message}</p>
      <button onClick={() => removeToast(toast.id)} className="text-muted hover:text-white transition-colors">
        <X size={16} />
      </button>
    </div>
  );
};