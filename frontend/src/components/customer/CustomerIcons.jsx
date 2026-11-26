import React from 'react';

/**
 * Bộ biểu tượng SVG nét mảnh đồng nhất cho cổng Khách hàng.
 * Mặc định đặt aria-hidden="true" khi đi kèm nhãn văn bản hiển thị.
 */
function SvgBase({ size = 18, className = '', children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function BoltIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M13 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13 2Z" />
    </SvgBase>
  );
}

export function MapPinIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 1 1 13 0c0 5.2-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </SvgBase>
  );
}

export function ClockIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </SvgBase>
  );
}

export function SearchIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8" />
    </SvgBase>
  );
}

export function ScooterIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M9 17.5h5l2-7.5h-2.5" />
      <path d="M15.5 6.5h2.5l1.5 6" />
      <path d="M6.5 15c0-2.5 2-4 5-4h1.5" />
    </SvgBase>
  );
}

export function UserIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </SvgBase>
  );
}

export function KeyIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L19 4" />
      <path d="M16 7l3 3" />
    </SvgBase>
  );
}

export function LifebuoyIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </SvgBase>
  );
}

export function GridIcon(props) {
  return (
    <SvgBase {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </SvgBase>
  );
}

export function LogOutIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </SvgBase>
  );
}

export function ChevronDownIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M6 9l6 6 6-6" />
    </SvgBase>
  );
}

export function MenuIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </SvgBase>
  );
}

export function CloseIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </SvgBase>
  );
}

export function RefreshIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </SvgBase>
  );
}

export function ArrowRightIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </SvgBase>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </SvgBase>
  );
}

export function BatteryIcon(props) {
  return (
    <SvgBase {...props}>
      <rect x="2" y="7" width="17" height="10" rx="2" />
      <path d="M22 10v4" />
      <path d="M6 10v4M10 10v4" />
    </SvgBase>
  );
}

export function CompassIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="15.5 8.5 13.4 13.4 8.5 15.5 10.6 10.6 15.5 8.5" />
    </SvgBase>
  );
}

export function ShieldCheckIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z" />
      <path d="M9.5 12l1.8 1.8 3.6-3.8" />
    </SvgBase>
  );
}

export function InfoIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </SvgBase>
  );
}

export function CheckCircleIcon(props) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12.2l2 2 4-4.2" />
    </SvgBase>
  );
}

export function WalletIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2H16a3 3 0 0 0 0 6h4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M21 10h-5a2 2 0 0 0 0 4h5v-4Z" />
    </SvgBase>
  );
}

export function TagIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a1.1 1.1 0 0 1 0 1.6Z" />
      <circle cx="8" cy="8.5" r="1.2" />
    </SvgBase>
  );
}

export function ReceiptIcon(props) {
  return (
    <SvgBase {...props}>
      <path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3H5Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </SvgBase>
  );
}
