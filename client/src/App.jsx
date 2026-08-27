import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AuthPage from './pages/AuthPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SignalsPage from './pages/SignalsPage';
import DiscoveryPage from './pages/DiscoveryPage';
import WatchlistPage from './pages/WatchlistPage';
import PositionsPage from './pages/PositionsPage';
import AlertsPage from './pages/AlertsPage';
import ProfilePage from './pages/ProfilePage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/signals" element={<SignalsPage />} />
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/positions" element={<PositionsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/signals" replace />} />
    </Routes>
  );
}

export default App;
