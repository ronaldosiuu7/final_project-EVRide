import React from 'react';

const LoadingState = ({ message = 'Đang tải dữ liệu...' }) => (
  <div className="state-box state-loading" role="status" aria-live="polite">
    <span className="spinner" aria-hidden="true" />
    <p>{message}</p>
  </div>
);

export default LoadingState;

