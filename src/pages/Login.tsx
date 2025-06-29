
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginBrandHeader } from '@/components/auth/LoginBrandHeader';
import { LoginForm } from '@/components/auth/LoginForm';
import { PasswordResetDialog } from '@/components/auth/PasswordResetDialog';
import { useLoginRedirect } from '@/hooks/useLoginRedirect';

type LoginFormData = {
  email: string;
  password: string;
};

export default function Login() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  // Handle redirect logic
  useLoginRedirect();
  
  // Handle login form submission
  const onLoginSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const success = await login(data.email, data.password);
      if (success) {
        // Auth context will handle the redirect
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
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
            <LoginForm onSubmit={onLoginSubmit} isLoading={isLoading} />
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
