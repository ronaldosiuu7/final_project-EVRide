import React from 'react';

export default function Tabs({ tabs = [], activeKey, onChange }) {
  return (
    <div className="tabs-bar" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? 'tab-item active' : 'tab-item'}
            onClick={() => onChange(tab.key)}
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
