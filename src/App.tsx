
import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { AppProvider } from "./contexts/AppContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { CreditPurchaseRoute } from "./components/auth/CreditPurchaseRoute";

// Pages
import Login from "./pages/Login";
import TokenAuth from "./pages/TokenAuth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PublicSportsUpdate from "./pages/PublicSportsUpdate";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminResellers from "./pages/admin/AdminResellers";
import AdminResellerDetail from "./pages/admin/AdminResellerDetail";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminFinance from "./pages/admin/AdminFinance";
import AdminCredits from "./pages/admin/AdminCredits";
import AdminLogs from "./pages/admin/AdminLogs";
import AdminSports from "./pages/admin/AdminSports";
import AdminSettings from "./pages/admin/AdminSettings";
import ResellerDashboard from "./pages/reseller/ResellerDashboard";
import ResellerCustomers from "./pages/reseller/ResellerCustomers";
import ResellerSportsUpdates from "./pages/reseller/ResellerSportsUpdates";
import ResellerCredits from "./pages/reseller/ResellerCredits";
import ResellerSubResellers from "./pages/reseller/ResellerSubResellers";
import ResellerCreditManagement from "./pages/reseller/ResellerCreditManagement";
import ResellerSettings from "./pages/reseller/ResellerSettings";
import ResellerFunnels from "./pages/reseller/ResellerFunnels";
import Webhook from "./pages/Webhook";

import SupportReseller from './pages/SupportReseller';
import { SupportBoundary } from './components/support/SupportBoundary';

const ResellerSales = lazy(() => import('./pages/reseller/ResellerSales'));
const AdminSalesProgram = lazy(() => import('./pages/admin/AdminSalesProgram'));
const PublicSalesInquiry = lazy(() => import('./pages/PublicSalesInquiry'));
const salesLoading = <p className="p-6" role="status">Loading sales tools…</p>;
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Router>
              <div className="min-h-screen bg-gray-50">
                <SupportBoundary>
                <Routes>
                  <Route path="/support/reseller" element={<SupportReseller />} />
                  {/* Redirect root to login */}
                  <Route path="/" element={<Navigate to="/login" replace />} />
                  
                  <Route path="/reseller/sales" element={<ProtectedRoute allowedRoles={["reseller"]}><Suspense fallback={salesLoading}><ResellerSales /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/sales" element={<ProtectedRoute allowedRoles={["admin"]}><Suspense fallback={salesLoading}><AdminSalesProgram /></Suspense></ProtectedRoute>} />
                  <Route path="/r/:slug" element={<Suspense fallback={salesLoading}><PublicSalesInquiry /></Suspense>} />
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/auth/token" element={<TokenAuth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/api/webhook" element={<Webhook />} />
                  <Route path="/sports-update/:updateId" element={<PublicSportsUpdate />} />
                  
                  {/* Protected admin routes */}
                  <Route path="/admin/finance" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFinance /></ProtectedRoute>} />
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
                    path="/admin/customers"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <AdminCustomers />
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
                  
                  <Route path="/admin/sports" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSports /></ProtectedRoute>} />
                  {/* Reseller Routes */}
                  <Route path="/reseller" element={
                    <ProtectedRoute allowedRoles={['reseller']}>
                      <ResellerDashboard />
                    </ProtectedRoute>
                  } />
                  
                  <Route path="/reseller/customers" element={
                    <ProtectedRoute allowedRoles={['reseller']}>
                      <ResellerCustomers />
                    </ProtectedRoute>
                  } />
                  
                  <Route path="/reseller/sports-updates" element={
                    <ProtectedRoute allowedRoles={['reseller']}>
                      <ResellerSportsUpdates />
                    </ProtectedRoute>
                  } />
                  
                  <Route path="/reseller/credits" element={
                    <ProtectedRoute allowedRoles={['reseller']}>
                      <ResellerCredits />
                    </ProtectedRoute>
                  } />
                  
                  {/* Sub-Resellers Route */}
                  <Route path="/reseller/sub-resellers" element={
                    <ProtectedRoute allowedRoles={['reseller']}>
                      <ResellerSubResellers />
                    </ProtectedRoute>
                  } />
                  
                  {/* Credit Management Route */}
                  <Route path="/reseller/credit-management" element={
                    <ProtectedRoute allowedRoles={['reseller']}>
                      <ResellerCreditManagement />
                    </ProtectedRoute>
                  } />
                  
                  <Route path="/reseller/settings" element={
                    <ProtectedRoute allowedRoles={['reseller']}>
                      <ResellerSettings />
                    </ProtectedRoute>
                  } />
                  
                   {/* Funnel feature hidden from resellers */}
                  
                  {/* Catch-all for 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </SupportBoundary>
              </div>
            </Router>
          </TooltipProvider>
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
