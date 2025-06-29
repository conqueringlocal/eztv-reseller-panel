
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginBrandHeader } from '@/components/auth/LoginBrandHeader';
import { LoginForm } from '@/components/auth/LoginForm';
import { PasswordResetDialog } from '@/components/auth/PasswordResetDialog';

type LoginFormData = {
  email: string;
  password: string;
};

export default function Login() {
  const { login, isAuthenticated, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Handle redirect for already authenticated users
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      console.log('🔄 Login: User already authenticated, redirecting to dashboard');
      const targetPath = user.role === 'admin' ? '/admin' : '/reseller';
      navigate(targetPath, { replace: true });
    }
  }, [isAuthenticated, user, isLoading, navigate]);
  
  // Handle login form submission
  const onLoginSubmit = async (data: LoginFormData) => {
    console.log('🔐 Login: Starting login process for:', data.email);
    setIsSubmitting(true);
    try {
      const success = await login(data.email, data.password);
      console.log('🔐 Login: Login result:', success);
      if (success) {
        console.log('✅ Login: Login successful, redirect will be handled by useEffect');
        // Don't navigate here - let useEffect handle it after state updates
      }
    } catch (error) {
      console.error('❌ Login: Login error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eztv-600"></div>
      </div>
    );
  }

  // Don't render login form if already authenticated (prevents flash)
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eztv-600"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-4">
      <div className="w-full max-w-md">
        <LoginBrandHeader />
        
        <Card className="w-full shadow-2xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="text-center pb-6 pt-8">
            <CardTitle className="text-2xl text-eztv-700 mb-2">Welcome Back</CardTitle>
            <CardDescription className="text-center text-gray-600">
              Sign in to access your reseller dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <LoginForm onSubmit={onLoginSubmit} isLoading={isSubmitting} />
            <PasswordResetDialog />
          </CardContent>
        </Card>
        
        {/* Subtle footer branding */}
        <div className="text-center mt-6 text-sm text-gray-500">
          Powered by EZTV Club Platform
        </div>
      </div>
    </div>
  );
}
