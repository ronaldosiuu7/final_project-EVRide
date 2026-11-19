import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRole } from './integrations/authBridge';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './features/admin/AdminDashboard';
import RevenueReportPage from './features/analytics/RevenueReportPage';
import OperationalAnalyticsPage from './features/analytics/OperationalAnalyticsPage';
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
import AdminTicketList from './features/tickets/AdminTicketList';
import TicketDetailPage from './features/tickets/TicketDetailPage';
import AdminMaintenanceList from './features/maintenance/AdminMaintenanceList';
import AdminIncidentList from './features/incidents/AdminIncidentList';
import IncidentDetailPage from './features/incidents/IncidentDetailPage';

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
        <Route path="reports" element={<RevenueReportPage />} />
        <Route path="reports/operations" element={<OperationalAnalyticsPage />} />
        <Route path="vehicles" element={<AdminVehicleList />} />
        <Route path="vehicles/:vehicleId" element={<VehicleDetailPage />} />
        <Route path="stations" element={<AdminStationList />} />
        <Route path="prices" element={<AdminPriceList />} />
        <Route path="rentals" element={<AdminRentalList />} />
        <Route path="rentals/:rentalId" element={<RentalDetailPage />} />
        <Route path="check-ins" element={<AdminCheckInList />} />
        <Route path="tickets" element={<AdminTicketList />} />
        <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        <Route path="maintenance" element={<AdminMaintenanceList />} />
        <Route path="incidents" element={<AdminIncidentList />} />
        <Route path="incidents/:incidentId" element={<IncidentDetailPage />} />
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
