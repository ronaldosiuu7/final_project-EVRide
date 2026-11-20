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
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        onCloseRef.current?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    cardRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
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
