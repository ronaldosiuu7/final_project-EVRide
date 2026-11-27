import React, { useRef } from 'react';

export default function Tabs({ tabs = [], items = [], activeKey, onChange, ariaLabel = 'Chuyển mục nội dung' }) {
  const tabList = Array.isArray(tabs) && tabs.length > 0 ? tabs : Array.isArray(items) ? items : [];
  const tabRefs = useRef([]);

  if (tabList.length === 0) return null;

  const handleKeyDown = (event, index) => {
    const count = tabList.length;
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % count;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + count) % count;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = count - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      const targetTab = tabList[nextIndex];
      if (targetTab) {
        onChange?.(targetTab.key);
        tabRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <div className="tabs-bar" role="tablist" aria-label={ariaLabel}>
      {tabList.map((tab, idx) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={isActive ? 'tab-item active' : 'tab-item'}
            onClick={() => onChange?.(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span className="tab-badge">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
