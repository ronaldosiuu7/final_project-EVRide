import React, { useEffect, useId, useRef } from 'react';
import Button from './Button';

/**
 * Hộp thoại modal dùng chung: hỗ trợ phím Escape, aria-modal, và kích thước sm/md/lg.
 */
export default function Modal({
  open = true,
  title,
  onClose,
  size = 'md',
  closeDisabled = false,
  children,
  footer,
}) {
  const titleId = useId();
  const cardRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === 'Tab') {
        const focusable = [...(cardRef.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter((el) => el.getClientRects().length);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) { event.preventDefault(); cardRef.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === cardRef.current)) { event.preventDefault(); first.focus(); }
      }
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        onCloseRef.current?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    cardRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) {
          onClose?.();
        }
      }}
    >
      <div ref={cardRef} tabIndex={-1} className={`modal-card modal-${size}`}>
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Đóng hộp thoại"
            disabled={closeDisabled}
            onClick={onClose}
          >
            ✕
          </Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
