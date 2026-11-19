import React, { useState } from 'react';
import { formatVnd } from '../../utils/format';

// Bảng màu cố định và đủ độ tương phản cho từng mẫu xe (không hard-code 3 loại).
const PALETTE = [
  '#059669',
  '#2563eb',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#4f46e5',
  '#65a30d',
];

function colorForModel(modelKey, allModels) {
  if (modelKey === 'Thiếu snapshot') return '#6b7280';
  const index = allModels.indexOf(modelKey);
  if (index >= 0) return PALETTE[index % PALETTE.length];
  let hash = 0;
  for (let i = 0; i < modelKey.length; i += 1) {
    hash = (hash * 31 + modelKey.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export default function RevenueStackedChart({ items = [] }) {
  const [hovered, setHovered] = useState(null);

  if (!items || items.length === 0) return null;

  const modelSet = new Set();
  const byMonth = new Map();

  for (const row of items) {
    const modelLabel = row.vehicle_model || 'Thiếu snapshot';
    modelSet.add(modelLabel);
    if (!byMonth.has(row.month)) {
      byMonth.set(row.month, { month: row.month, total: 0, segments: [] });
    }
    const bucket = byMonth.get(row.month);
    const revNum = Number(row.revenue || 0);
    bucket.total += Number.isNaN(revNum) ? 0 : revNum;
    bucket.segments.push({ ...row, modelLabel, revNum: Number.isNaN(revNum) ? 0 : revNum });
  }

  const allModels = Array.from(modelSet).sort();
  const months = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  const maxMonthTotal = Math.max(0, ...months.map((m) => m.total));

  return (
    <div className="chart-card">
      <div className="card-header">
        <h3>Biểu đồ cột chồng doanh thu theo tháng &amp; mẫu xe (Snapshot)</h3>
        <span className="muted">Di chuột hoặc focus vào từng đoạn cột để xem chi tiết</span>
      </div>

      <div className="chart-legend" aria-label="Chú giải mẫu xe">
        {allModels.map((model) => (
          <span key={model} className="legend-item">
            <span
              className="legend-swatch"
              style={{ backgroundColor: colorForModel(model, allModels) }}
            />
            <span>{model}</span>
          </span>
        ))}
      </div>

      <div className="stacked-chart-scroll">
        <div className="stacked-bars-row">
          {months.map((m) => {
            const barHeightPct = maxMonthTotal > 0 ? Math.max(2, (m.total / maxMonthTotal) * 100) : 0;
            return (
              <div key={m.month} className="stacked-bar-col">
                <div className="stacked-bar-total">{formatVnd(m.total.toFixed(2))}</div>
                <div className="stacked-bar-stack" aria-label={`Tháng ${m.month}`}>
                  {m.segments.map((seg) => {
                    const segShareOfMax =
                      maxMonthTotal > 0 ? (seg.revNum / maxMonthTotal) * 100 : 0;
                    const heightPct = m.total > 0 ? Math.max(2, segShareOfMax) : 0;
                    const color = colorForModel(seg.modelLabel, allModels);
                    return (
                      <div
                        key={`${m.month}-${seg.modelLabel}`}
                        tabIndex={0}
                        role="button"
                        aria-label={`Tháng ${m.month}, mẫu xe ${seg.modelLabel}, doanh thu ${formatVnd(seg.revenue)}, ${seg.rental_count} chuyến, tỷ trọng ${seg.share_percent}%`}
                        className="stacked-segment"
                        style={{
                          height: `${Math.min(100, heightPct || barHeightPct * 0)}%`,
                          backgroundColor: color,
                        }}
                        onMouseEnter={() => setHovered(seg)}
                        onFocus={() => setHovered(seg)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    );
                  })}
                </div>
                <div className="stacked-bar-label">{m.month}</div>
              </div>
            );
          })}
        </div>
      </div>

      {hovered && (
        <div className="chart-tooltip" role="status">
          <strong>{hovered.month}</strong> · Mẫu xe: <strong>{hovered.modelLabel}</strong> · Doanh thu:{' '}
          <strong>{formatVnd(hovered.revenue)}</strong> (Thường: {formatVnd(hovered.normal_revenue)}, Sự cố:{' '}
          {formatVnd(hovered.incident_revenue)}) · Số chuyến: <strong>{hovered.rental_count}</strong> · Tỷ trọng:{' '}
          <strong>{hovered.share_percent}%</strong>
        </div>
      )}
    </div>
  );
}
