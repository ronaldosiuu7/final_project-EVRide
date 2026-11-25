import React from 'react';

const PALETTES = [
  { body: '#0d9488', bodyDark: '#0f766e', accent: '#10b981', glow: '#ccfbf1' },
  { body: '#059669', bodyDark: '#047857', accent: '#14b8a6', glow: '#d1fae5' },
  { body: '#0f766e', bodyDark: '#115e59', accent: '#34d399', glow: '#ccfbf1' },
];

function pickPalette(seedText = '') {
  const str = String(seedText || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return PALETTES[hash % PALETTES.length];
}

/**
 * Hình minh họa xe máy điện thuần vector (2 bánh, sàn để chân, ghi đông, đèn pha, yên xe),
 * không dùng ảnh ô tô và không phụ thuộc nguồn ảnh ngoài dễ hỏng.
 */
export default function ElectricScooterIllustration({
  model = '',
  compact = false,
  className = '',
}) {
  const palette = pickPalette(model);

  return (
    <div
      className={`scooter-media ${compact ? 'scooter-media-compact' : 'scooter-media-hero'} ${className}`.trim()}
      role="img"
      aria-label={model ? `Hình minh họa xe máy điện ${model}` : 'Hình minh họa xe máy điện EVRide'}
    >
      <svg
        viewBox="0 0 320 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="scooter-svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`bg-${palette.body.slice(1)}`} x1="0" y1="0" x2="320" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.glow} stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Nền bo nhẹ */}
        <rect x="0" y="0" width="320" height="180" rx="14" fill={`url(#bg-${palette.body.slice(1)})`} />
        <ellipse cx="160" cy="148" rx="108" ry="10" fill="#0f766e" fillOpacity="0.12" />

        {/* Bánh sau */}
        <circle cx="94" cy="132" r="26" fill="#1e293b" />
        <circle cx="94" cy="132" r="15" fill="#e2e8f0" />
        <circle cx="94" cy="132" r="6" fill={palette.bodyDark} />

        {/* Bánh trước */}
        <circle cx="228" cy="132" r="26" fill="#1e293b" />
        <circle cx="228" cy="132" r="15" fill="#e2e8f0" />
        <circle cx="228" cy="132" r="6" fill={palette.bodyDark} />

        {/* Phuộc trước */}
        <path d="M210 64 L228 132" stroke="#334155" strokeWidth="7" strokeLinecap="round" />
        <path d="M204 108 Q226 98 248 112" stroke={palette.bodyDark} strokeWidth="6" strokeLinecap="round" fill="none" />

        {/* Sàn để chân và thân xe máy điện */}
        <path
          d="M72 114 C72 92, 92 80, 128 82 L152 116 L196 116 L208 68 C218 68, 224 76, 222 92 L206 126 C202 132, 196 134, 188 134 L132 134 C122 134, 118 124, 108 116 Z"
          fill={palette.body}
        />
        <path
          d="M136 120 L194 120"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Ốp hông nhấn xanh lá & tia điện */}
        <path
          d="M84 96 C98 88, 124 88, 140 104 L124 112 C108 106, 92 106, 84 96 Z"
          fill={palette.accent}
        />
        <path
          d="M114 91 L107 100 L113 100 L109 108 L119 98 L113 98 Z"
          fill="#ffffff"
        />

        {/* Yên xe máy điện */}
        <path
          d="M80 82 C92 72, 134 72, 152 84 C154 86, 152 90, 146 90 L86 90 C80 90, 78 86, 80 82 Z"
          fill="#0f172a"
        />
        {/* Tay dắt sau */}
        <path d="M68 86 L84 86" stroke="#475569" strokeWidth="5" strokeLinecap="round" />

        {/* Cổ lái, ghi đông & gương chiếu hậu */}
        <path d="M206 68 L198 46 L184 44" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="196" y1="45" x2="188" y2="33" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="184" cy="31" rx="8" ry="4" fill="#334155" />

        {/* Đầu đèn LED phía trước */}
        <path d="M206 52 L222 55 C227 56, 229 61, 226 65 L212 68 Z" fill={palette.bodyDark} />
        <ellipse cx="225" cy="60" rx="4" ry="6" fill="#fef08a" />
        <path d="M232 54 L264 46 L264 74 L232 66 Z" fill="#fef08a" fillOpacity="0.32" />
      </svg>
    </div>
  );
}
