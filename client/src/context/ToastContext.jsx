import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  const toast = useCallback((msg) => {
    setMessage(msg);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`toast${visible ? ' on' : ''}`}>{message}</div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
