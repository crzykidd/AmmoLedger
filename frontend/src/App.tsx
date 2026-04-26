import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Toaster } from '@/components/ui/toaster'
import LoginPage from '@/pages/auth/LoginPage'
import SetupPage from '@/pages/auth/SetupPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import InventoryPage from '@/pages/inventory/InventoryPage'

const queryClient = new QueryClient()

function RootRedirect() {
  const { user, isFirstRun, loading } = useAuth()
  if (loading) return null
  if (isFirstRun) return <Navigate to="/setup" replace />
  if (user) return <Navigate to="/dashboard" replace />
  return <Navigate to="/login" replace />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
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
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <InventoryPage />
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
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
