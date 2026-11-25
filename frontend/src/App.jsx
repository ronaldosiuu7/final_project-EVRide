import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireRole } from './integrations/authBridge';
import { LoadingState } from './components/ui';
import AdminLayout from './layouts/AdminLayout';

// Tách bundle theo từng màn hình (route-level code splitting) để giảm kích thước tải ban đầu.
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));
const RevenueReportPage = lazy(() => import('./features/analytics/RevenueReportPage'));
const OperationalAnalyticsPage = lazy(() => import('./features/analytics/OperationalAnalyticsPage'));
const AdminVehicleList = lazy(() => import('./features/vehicles/AdminVehicleList'));
const VehicleDetailPage = lazy(() => import('./features/vehicles/VehicleDetailPage'));
const AdminStationList = lazy(() => import('./features/stations/AdminStationList'));
const AdminPriceList = lazy(() => import('./features/prices/AdminPriceList'));
const AdminUserList = lazy(() => import('./features/users/AdminUserList'));
const UserDetailPage = lazy(() => import('./features/users/UserDetailPage'));
const AdminDocumentVerifyPage = lazy(() => import('./features/documents/AdminDocumentVerifyPage'));
const AdminPromotionList = lazy(() => import('./features/promotions/AdminPromotionList'));
const AdminRentalList = lazy(() => import('./features/rentals/AdminRentalList'));
const RentalDetailPage = lazy(() => import('./features/rentals/RentalDetailPage'));
const AdminCheckInList = lazy(() => import('./features/checkins/AdminCheckInList'));
const AdminTicketList = lazy(() => import('./features/tickets/AdminTicketList'));
const TicketDetailPage = lazy(() => import('./features/tickets/TicketDetailPage'));
const AdminMaintenanceList = lazy(() => import('./features/maintenance/AdminMaintenanceList'));
const AdminIncidentList = lazy(() => import('./features/incidents/AdminIncidentList'));
const IncidentDetailPage = lazy(() => import('./features/incidents/IncidentDetailPage'));

function LazyRoute({ children }) {
  return <Suspense fallback={<LoadingState message="Đang tải màn hình..." />}>{children}</Suspense>;
}

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
        <Route index element={<LazyRoute><AdminDashboard /></LazyRoute>} />
        <Route path="reports" element={<LazyRoute><RevenueReportPage /></LazyRoute>} />
        <Route path="reports/operations" element={<LazyRoute><OperationalAnalyticsPage /></LazyRoute>} />
        <Route path="vehicles" element={<LazyRoute><AdminVehicleList /></LazyRoute>} />
        <Route path="vehicles/:vehicleId" element={<LazyRoute><VehicleDetailPage /></LazyRoute>} />
        <Route path="stations" element={<LazyRoute><AdminStationList /></LazyRoute>} />
        <Route path="prices" element={<LazyRoute><AdminPriceList /></LazyRoute>} />
        <Route path="rentals" element={<LazyRoute><AdminRentalList /></LazyRoute>} />
        <Route path="rentals/:rentalId" element={<LazyRoute><RentalDetailPage /></LazyRoute>} />
        <Route path="check-ins" element={<LazyRoute><AdminCheckInList /></LazyRoute>} />
        <Route path="tickets" element={<LazyRoute><AdminTicketList /></LazyRoute>} />
        <Route path="tickets/:ticketId" element={<LazyRoute><TicketDetailPage /></LazyRoute>} />
        <Route path="maintenance" element={<LazyRoute><AdminMaintenanceList /></LazyRoute>} />
        <Route path="incidents" element={<LazyRoute><AdminIncidentList /></LazyRoute>} />
        <Route path="incidents/:incidentId" element={<LazyRoute><IncidentDetailPage /></LazyRoute>} />
        <Route path="users" element={<LazyRoute><AdminUserList /></LazyRoute>} />
        <Route path="users/:userId" element={<LazyRoute><UserDetailPage /></LazyRoute>} />
        <Route path="documents" element={<LazyRoute><AdminDocumentVerifyPage /></LazyRoute>} />
        <Route
          path="promotions"
          element={
            <RequireRole allowedRoles={['MANAGER']}>
              <LazyRoute>
                <AdminPromotionList />
              </LazyRoute>
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
