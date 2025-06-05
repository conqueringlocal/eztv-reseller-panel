
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function TokenAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processToken = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setError('No authentication token provided');
        setIsProcessing(false);
        return;
      }

      try {
        console.log('Processing SSO token authentication...');
        
        // Call our edge function to authenticate the token
        const { data, error } = await supabase.functions.invoke('authenticate-sso', {
          body: { token }
        });

        if (error) {
          console.error('SSO authentication failed:', error);
          setError('Authentication failed. Please check your token or contact support.');
          setIsProcessing(false);
          return;
        }

        if (data?.success && data?.redirect_url) {
          console.log('SSO authentication successful, redirecting...');
          toast.success('Login successful! Welcome back.');
          
          // Redirect to the magic link URL which will handle the session
          window.location.href = data.redirect_url;
          return;
        }

        setError('Invalid authentication response');
        setIsProcessing(false);

      } catch (err) {
        console.error('Token authentication error:', err);
        setError('An unexpected error occurred during authentication');
        setIsProcessing(false);
      }
    };

    // If user is already authenticated, redirect to dashboard
    if (isAuthenticated && user) {
      const redirectPath = user.role === 'admin' ? '/admin' : '/reseller';
      navigate(redirectPath);
      return;
    }

    processToken();
  }, [searchParams, navigate, user, isAuthenticated]);

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-eztv-600 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Authenticating...
          </h1>
          <p className="text-gray-600">
            Please wait while we log you in securely.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="text-red-600 mb-4">
              <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Authentication Failed
            </h1>
            <p className="text-gray-600 mb-6">
              {error}
            </p>
            <button
              onClick={() => navigate('/login')}
              className="bg-eztv-600 hover:bg-eztv-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
