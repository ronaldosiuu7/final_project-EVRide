import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRole } from './integrations/authBridge';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminVehicleList from './features/vehicles/AdminVehicleList';
import VehicleDetailPage from './features/vehicles/VehicleDetailPage';
import AdminStationList from './features/stations/AdminStationList';
import AdminPriceList from './features/prices/AdminPriceList';

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
        <Route path="vehicles/:vehicleId" element={<VehicleDetailPage />} />
        <Route path="stations" element={<AdminStationList />} />
        <Route path="prices" element={<AdminPriceList />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
