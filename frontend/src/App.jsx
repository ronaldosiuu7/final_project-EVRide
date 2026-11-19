import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRole } from './integrations/authBridge';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminVehicleList from './features/vehicles/AdminVehicleList';
import AdminStationList from './features/stations/AdminStationList';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route
        path="/admin"
        element={
          <RequireRole allowedRoles={['STAFF', 'MANAGER']}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="vehicles" element={<AdminVehicleList />} />
        <Route path="stations" element={<AdminStationList />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
