
import React from 'react';
import { Navigate } from 'react-router-dom';
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
  
  if (isLoading) {
    // Show loading state while checking authentication
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eztv-600"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles.length > 0 && user?.role && !allowedRoles.includes(user.role)) {
    // Redirect based on role if not allowed
    const redirectPath = user.role === 'admin' ? '/admin' : '/reseller';
    return <Navigate to={redirectPath} replace />;
  }
  
  // If authenticated and authorized, render the route
  return <>{children}</>;
};
