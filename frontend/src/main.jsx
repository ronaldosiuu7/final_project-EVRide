import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './integrations/authBridge.jsx';
import { ToastProvider } from './components/ui/index.js';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';
import './styles/admin.css';
import './styles/customer.css';
import './styles/maps.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
