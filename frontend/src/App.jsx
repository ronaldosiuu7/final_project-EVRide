import React, { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { GuestOnlyRoute, RequireRole } from './integrations/authBridge.jsx';
import { LoadingState } from './components/ui/index.js';
import AdminLayout from './layouts/AdminLayout.jsx';
import CustomerLayout from './layouts/CustomerLayout.jsx';
import ForbiddenPage from './features/auth/ForbiddenPage.jsx';
import NotFoundPage from './features/auth/NotFoundPage.jsx';

const LoginPage = lazy(() => import('./features/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./features/auth/RegisterPage.jsx'));

// Khu vực khách hàng (#15 — tách bundle theo từng màn hình).
const CustomerHomePage = lazy(() => import('./features/customer/CustomerHomePage.jsx'));
const CustomerStationListPage = lazy(() => import('./features/stations/CustomerStationListPage.jsx'));
const CustomerStationDetailPage = lazy(() => import('./features/stations/CustomerStationDetailPage.jsx'));
const CustomerVehicleListPage = lazy(() => import('./features/vehicles/CustomerVehicleListPage.jsx'));
const CustomerVehicleDetailPage = lazy(() => import('./features/vehicles/CustomerVehicleDetailPage.jsx'));
const CustomerProfilePage = lazy(() => import('./features/profile/CustomerProfilePage.jsx'));
const CustomerRentalListPage = lazy(() => import('./features/rentals/CustomerRentalListPage.jsx'));
const CustomerRentalDetailPage = lazy(() => import('./features/rentals/CustomerRentalDetailPage.jsx'));
const CustomerWalletPage = lazy(() => import('./features/wallet/CustomerWalletPage.jsx'));
const CustomerPromotionsPage = lazy(() => import('./features/promotions/CustomerPromotionsPage.jsx'));
const CustomerTicketListPage = lazy(() => import('./features/tickets/CustomerTicketListPage.jsx'));
const CustomerTicketDetailPage = lazy(() => import('./features/tickets/CustomerTicketDetailPage.jsx'));
const CustomerFaqPage = lazy(() => import('./features/faq/CustomerFaqPage.jsx'));

// Tách bundle theo từng màn hình khu vực vận hành (#16 — giữ nguyên toàn bộ route).
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
      {/* Trang xác thực công khai */}
      <Route
        path="/login"
        element={
          <GuestOnlyRoute>
            <LazyRoute>
              <LoginPage />
            </LazyRoute>
          </GuestOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnlyRoute>
            <LazyRoute>
              <RegisterPage />
            </LazyRoute>
          </GuestOnlyRoute>
        }
      />

      {/* Trang thông báo quyền truy cập & đường dẫn */}
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />

      {/* Khu vực khách hàng (#15) */}
      <Route path="/" element={<CustomerLayout />}>
        <Route index element={<LazyRoute><CustomerHomePage /></LazyRoute>} />
        <Route path="stations" element={<LazyRoute><CustomerStationListPage /></LazyRoute>} />
        <Route path="stations/:stationId" element={<LazyRoute><CustomerStationDetailPage /></LazyRoute>} />
        <Route path="vehicles" element={<LazyRoute><CustomerVehicleListPage /></LazyRoute>} />
        <Route path="vehicles/:vehicleId" element={<LazyRoute><CustomerVehicleDetailPage /></LazyRoute>} />
        <Route
          path="rentals"
          element={
            <RequireRole allowedRoles={['CUSTOMER']}>
              <LazyRoute>
                <CustomerRentalListPage />
              </LazyRoute>
            </RequireRole>
          }
        />
        <Route
          path="rentals/:rentalId"
          element={
            <RequireRole allowedRoles={['CUSTOMER']}>
              <LazyRoute>
                <CustomerRentalDetailPage />
              </LazyRoute>
            </RequireRole>
          }
        />
        <Route
          path="wallet"
          element={
            <RequireRole allowedRoles={['CUSTOMER']}>
              <LazyRoute>
                <CustomerWalletPage />
              </LazyRoute>
            </RequireRole>
          }
        />
        <Route
          path="promotions"
          element={
            <RequireRole allowedRoles={['CUSTOMER']}>
              <LazyRoute>
                <CustomerPromotionsPage />
              </LazyRoute>
            </RequireRole>
          }
        />
        <Route
          path="support"
          element={
            <RequireRole allowedRoles={['CUSTOMER']}>
              <LazyRoute>
                <CustomerTicketListPage />
              </LazyRoute>
            </RequireRole>
          }
        />
        <Route
          path="support/tickets/:ticketId"
          element={
            <RequireRole allowedRoles={['CUSTOMER']}>
              <LazyRoute>
                <CustomerTicketDetailPage />
              </LazyRoute>
            </RequireRole>
          }
        />
        <Route path="faq" element={<LazyRoute><CustomerFaqPage /></LazyRoute>} />
        <Route
          path="profile"
          element={
            <RequireRole allowedRoles={['CUSTOMER', 'STAFF', 'MANAGER']}>
              <LazyRoute>
                <CustomerProfilePage />
              </LazyRoute>
            </RequireRole>
          }
        />
      </Route>

      {/* Khu vực vận hành STAFF/MANAGER (#16 — giữ nguyên toàn bộ cấu trúc định tuyến) */}
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
