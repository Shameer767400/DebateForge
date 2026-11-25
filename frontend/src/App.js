import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import PageLoader from './components/PageLoader';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/ToastContainer';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailOTPPage = lazy(() => import('./pages/VerifyEmailOTPPage'));
const LobbyPage = lazy(() => import('./pages/LobbyPage'));
const DebateRoomPage = lazy(() => import('./pages/DebateRoomPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const DebateHistoryPage = lazy(() => import('./pages/DebateHistoryPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const GDTopicsPage = lazy(() => import('./pages/GDTopicsPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminOverviewPage = lazy(() => import('./pages/AdminOverviewPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminDebatesPage = lazy(() => import('./pages/AdminDebatesPage'));
const AdminTopicsPage = lazy(() => import('./pages/AdminTopicsPage'));
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage'));
const AdminSecurityPage = lazy(() => import('./pages/AdminSecurityPage'));
const AdminSystemPage = lazy(() => import('./pages/AdminSystemPage'));
import AdminRoute from './components/AdminRoute';
import BottomNav from './components/BottomNav';
import { Analytics } from '@vercel/analytics/react';


function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <ToastContainer />
            <BottomNav />
            <Analytics />
            <PageLoader>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                  <Route path="/verify-email-otp" element={<VerifyEmailOTPPage />} />
                  <Route
                    path="/lobby"
                    element={
                      <ProtectedRoute>
                        <LobbyPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/join/:roomCode"
                    element={
                      <ProtectedRoute>
                        <LobbyPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/debate/:id"
                    element={
                      <ProtectedRoute>
                        <DebateRoomPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/leaderboard"
                    element={
                      <ProtectedRoute>
                        <LeaderboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <ProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/history"
                    element={
                      <ProtectedRoute>
                        <DebateHistoryPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="/feedback" element={<FeedbackPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/gd-topics" element={<GDTopicsPage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms" element={<TermsOfServicePage />} />
                  {/* Admin Dashboard */}
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminLayout />
                      </AdminRoute>
                    }
                  >
                    <Route index element={<Navigate to="/admin/overview" replace />} />
                    <Route path="overview" element={<AdminOverviewPage />} />
                    <Route path="users" element={<AdminUsersPage />} />
                    <Route path="debates" element={<AdminDebatesPage />} />
                    <Route path="topics" element={<AdminTopicsPage />} />
                    <Route path="feedback" element={<AdminFeedbackPage />} />
                    <Route path="security" element={<AdminSecurityPage />} />
                    <Route path="system" element={<AdminSystemPage />} />
                  </Route>

                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </PageLoader>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
