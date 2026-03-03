import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const addToast = useCallback(
    (message, type = 'info', duration = 3500) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      timers.current[id] = setTimeout(() => removeToast(id), duration);
      return id;
    },
    [removeToast]
  );

  const toast = useCallback(
    (msg, dur) => addToast(msg, 'info', dur),
    [addToast]
  );
  toast.success = useCallback(
    (msg, dur) => addToast(msg, 'success', dur),
    [addToast]
  );
  toast.error = useCallback(
    (msg, dur) => addToast(msg, 'error', dur),
    [addToast]
  );
  toast.info = useCallback(
    (msg, dur) => addToast(msg, 'info', dur),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx.toast;
}

export function useToastState() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastState must be inside ToastProvider');
  return { toasts: ctx.toasts, removeToast: ctx.removeToast };
}
