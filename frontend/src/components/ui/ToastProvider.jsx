import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone, message, title = '') => {
      idCounter.current += 1;
      const id = idCounter.current;
      setToasts((prev) => [...prev, { id, tone, title, message }]);
      setTimeout(() => {
        dismiss(id);
      }, 4500);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (msg, title) => push('success', msg, title),
      error: (msg, title) => push('danger', msg, title),
      warning: (msg, title) => push('warning', msg, title),
      info: (msg, title) => push('info', msg, title),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            <div className="toast-content">
              {t.title && <strong>{t.title}</strong>}
              <span>{t.message}</span>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Đóng thông báo"
              onClick={() => dismiss(t.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast phải được gọi bên trong ToastProvider.');
  }
  return ctx;
}
