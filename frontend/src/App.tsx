import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Context
import { AuthProvider } from './context/AuthContext';

// Layouts
import { MarketingLayout } from './components/layout/MarketingLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

// Pages
import { LandingPage } from './features/landing/LandingPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { VaultPage } from './features/vault/VaultPage';
import { ContactsPage } from './features/contacts/ContactsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ActivityPage } from './features/activity/ActivityPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Toast Notification Container with light theme styling */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            className:
              '!bg-white !text-navy !border !border-border !rounded-full !shadow-md !text-xs !font-medium !py-2 !px-4',
            success: {
              iconTheme: {
                primary: '#2F7D5B',
                secondary: '#FFFFFF',
              },
            },
            error: {
              iconTheme: {
                primary: '#B4423A',
                secondary: '#FFFFFF',
              },
            },
          }}
        />

        <Routes>
          {/* Marketing site with floating nav & signature footer */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<LandingPage />} />
          </Route>

          {/* Authentication split layout */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected App Console */}
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="vault" element={<VaultPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="activity" element={<ActivityPage />} />
            </Route>
          </Route>

          {/* 404 Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
