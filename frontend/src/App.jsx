import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRole } from './integrations/authBridge';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminVehicleList from './features/vehicles/AdminVehicleList';
import VehicleDetailPage from './features/vehicles/VehicleDetailPage';
import AdminStationList from './features/stations/AdminStationList';
import AdminPriceList from './features/prices/AdminPriceList';
import AdminUserList from './features/users/AdminUserList';
import UserDetailPage from './features/users/UserDetailPage';
import AdminDocumentVerifyPage from './features/documents/AdminDocumentVerifyPage';
import AdminPromotionList from './features/promotions/AdminPromotionList';
import AdminRentalList from './features/rentals/AdminRentalList';
import RentalDetailPage from './features/rentals/RentalDetailPage';
import AdminCheckInList from './features/checkins/AdminCheckInList';

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
        <Route path="rentals" element={<AdminRentalList />} />
        <Route path="rentals/:rentalId" element={<RentalDetailPage />} />
        <Route path="check-ins" element={<AdminCheckInList />} />
        <Route path="users" element={<AdminUserList />} />
        <Route path="users/:userId" element={<UserDetailPage />} />
        <Route path="documents" element={<AdminDocumentVerifyPage />} />
        <Route
          path="promotions"
          element={
            <RequireRole allowedRoles={['MANAGER']}>
              <AdminPromotionList />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
