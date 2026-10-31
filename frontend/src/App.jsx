import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './features/admin/AdminDashboard';
import AdminVehicleList from './features/vehicles/AdminVehicleList';
import AdminStationList from './features/stations/AdminStationList';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="vehicles" element={<AdminVehicleList />} />
          <Route path="stations" element={<AdminStationList />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;