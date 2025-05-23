
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AppProvider } from "./contexts/AppContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

// Pages
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminResellers from "./pages/admin/AdminResellers";
import AdminResellerDetail from "./pages/admin/AdminResellerDetail";
import AdminCredits from "./pages/admin/AdminCredits";
import AdminLogs from "./pages/admin/AdminLogs";
import AdminSettings from "./pages/admin/AdminSettings";
import ResellerDashboard from "./pages/reseller/ResellerDashboard";
import ResellerCustomers from "./pages/reseller/ResellerCustomers";
import ResellerCredits from "./pages/reseller/ResellerCredits";
import ResellerCreditPurchase from "./pages/reseller/ResellerCreditPurchase";
import ResellerSettings from "./pages/reseller/ResellerSettings";
import Webhook from "./pages/Webhook";
import AdminSetup from "./pages/AdminSetup";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AppProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Redirect root to login */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/admin-setup" element={<AdminSetup />} />
              <Route path="/api/webhook" element={<Webhook />} />
              
              {/* Protected admin routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/resellers"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminResellers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/resellers/:id"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminResellerDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/credits"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminCredits />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/logs"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminSettings />
                  </ProtectedRoute>
                }
              />
              
              {/* Protected reseller routes */}
              <Route
                path="/reseller"
                element={
                  <ProtectedRoute allowedRoles={["reseller"]}>
                    <ResellerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reseller/customers"
                element={
                  <ProtectedRoute allowedRoles={["reseller"]}>
                    <ResellerCustomers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reseller/credits"
                element={
                  <ProtectedRoute allowedRoles={["reseller"]}>
                    <ResellerCredits />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reseller/credits/purchase"
                element={
                  <ProtectedRoute allowedRoles={["reseller"]}>
                    <ResellerCreditPurchase />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reseller/settings"
                element={
                  <ProtectedRoute allowedRoles={["reseller"]}>
                    <ResellerSettings />
                  </ProtectedRoute>
                }
              />
              
              {/* Catch-all for 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AppProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
