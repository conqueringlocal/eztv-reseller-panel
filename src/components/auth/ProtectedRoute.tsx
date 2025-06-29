
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/contexts/auth/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  allowedRoles = []
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  
  console.log('🛡️ ProtectedRoute: Auth state -', {
    isAuthenticated,
    isLoading,
    userRole: user?.role,
    currentPath: location.pathname,
    allowedRoles
  });
  
  if (isLoading) {
    console.log('⏳ ProtectedRoute: Auth still loading, showing spinner');
    // Show loading state while checking authentication
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eztv-600"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    console.log('🚫 ProtectedRoute: Not authenticated, redirecting to login');
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles.length > 0 && user?.role && !allowedRoles.includes(user.role)) {
    console.log('🚫 ProtectedRoute: Role not allowed, redirecting based on user role');
    // Redirect based on role if not allowed
    const redirectPath = user.role === 'admin' ? '/admin' : '/reseller';
    return <Navigate to={redirectPath} replace />;
  }
  
  console.log('✅ ProtectedRoute: Access granted, rendering children');
  // If authenticated and authorized, render the route
  return <>{children}</>;
};
