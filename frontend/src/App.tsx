import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Toaster } from '@/components/ui/toaster'
import LoginPage from '@/pages/auth/LoginPage'
import SetupPage from '@/pages/auth/SetupPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ResetPage from '@/pages/auth/ResetPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import AmmoPage from '@/pages/ammo/AmmoPage'
import ThresholdSettingsPage from '@/pages/settings/ThresholdSettingsPage'
import ProfilePage from '@/pages/settings/ProfilePage'
import UserManagementPage from '@/pages/admin/UserManagementPage'
import BackupPage from '@/pages/admin/BackupPage'
import DatasetsPage from '@/pages/admin/LookupsPage'
import TasksPage from '@/pages/admin/TasksPage'
import ImportPage from '@/pages/ImportPage'
import ProductsPage from '@/pages/ProductsPage'
import FirearmsListPage from '@/pages/firearms/FirearmsListPage'
import FirearmDetailPage from '@/pages/firearms/FirearmDetailPage'
import AtRangePage from '@/pages/AtRangePage'
import AboutPage from '@/pages/AboutPage'
import HelpPage from '@/pages/HelpPage'
import WhatsNewModal from '@/components/WhatsNewModal'

const queryClient = new QueryClient()

function RootRedirect() {
  const { user, isFirstRun, loading } = useAuth()
  if (loading) return null
  if (isFirstRun) return <Navigate to="/setup" replace />
  if (user) return <Navigate to="/dashboard" replace />
  return <Navigate to="/login" replace />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (mustChangePassword && location.pathname !== '/settings/profile') {
    return <Navigate to="/settings/profile" replace />
  }
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function SetupRoute() {
  const { user, isFirstRun, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  if (!isFirstRun) return <Navigate to="/login" replace />
  return <SetupPage />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupRoute />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ammo"
        element={
          <ProtectedRoute>
            <AmmoPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute>
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/firearms"
        element={
          <ProtectedRoute>
            <FirearmsListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/firearms/:id"
        element={
          <ProtectedRoute>
            <FirearmDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/import"
        element={
          <ProtectedRoute>
            <ImportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/at-range"
        element={
          <ProtectedRoute>
            <AtRangePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/thresholds"
        element={
          <ProtectedRoute>
            <ThresholdSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <UserManagementPage />
          </AdminRoute>
        }
      />
      <Route path="/admin/invites" element={<Navigate to="/admin/users" replace />} />
      <Route
        path="/admin/backup"
        element={
          <AdminRoute>
            <BackupPage />
          </AdminRoute>
        }
      />
      <Route path="/admin/lookups" element={<Navigate to="/admin/datasets" replace />} />
      <Route
        path="/admin/datasets"
        element={
          <AdminRoute>
            <DatasetsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/tasks"
        element={
          <AdminRoute>
            <TasksPage />
          </AdminRoute>
        }
      />
      <Route
        path="/about"
        element={
          <ProtectedRoute>
            <AboutPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <HelpPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <WhatsNewModal />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
