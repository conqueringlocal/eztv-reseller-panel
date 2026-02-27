
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { SubResellerCreditsView } from '@/components/credits/SubResellerCreditsView';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { Button } from '@/components/ui/button';
import { CreditCard, Check, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Toggle this flag to re-enable Stripe credit purchases when the account is restored
const PURCHASES_ENABLED = false;

const creditPackages = [
  { id: 'price_1RUeGZDUqLxD4hMqrbZxgfR0', name: '5 Credits', price: '$15', description: 'Basic package for small needs', credits: 5 },
  { id: 'price_1RUeGrDUqLxD4hMqBk7JdjJH', name: '10 Credits', price: '$30', description: 'Standard package, most popular', credits: 10 },
  { id: 'price_1RUeHFDUqLxD4hMqwhdgyVa8', name: '20 Credits', price: '$60', description: 'Premium package with better value', credits: 20 },
  { id: 'price_1RUeHXDUqLxD4hMqkX5XE0PR', name: '50 Credits', price: '$150', description: 'Bulk package for best value', credits: 50 }
];

export default function ResellerCredits() {
  const { user } = useAuth();
  const { creditLogs, refreshData } = useApp();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [resellerInfo, setResellerInfo] = useState<{
    reseller_level: number;
    credit_purchase_enabled: boolean;
    credit_price_per_unit: number | null;
    parent_reseller_id: string | null;
  } | null>(null);

  // Filter credit logs for current reseller
  const userCreditLogs = creditLogs.filter(log => log.reseller_id === user?.id);

  // Fetch reseller information
  useEffect(() => {
    const fetchResellerInfo = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('reseller_level, credit_purchase_enabled, credit_price_per_unit, parent_reseller_id')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching reseller info:', error);
        } else {
          setResellerInfo(data);
        }
      } catch (error) {
        console.error('Unexpected error:', error);
      }
    };

    fetchResellerInfo();
  }, [user]);

  // Handle success/cancel URL parameters
  useEffect(() => {
    const success = searchParams.get('success');
    const sessionId = searchParams.get('session_id');
    const creditsAdded = searchParams.get('credits');
    const canceled = searchParams.get('canceled');

    if (success === 'true' && sessionId && creditsAdded) {
      handlePaymentSuccess(sessionId, parseInt(creditsAdded));
    } else if (canceled === 'true') {
      toast.error('Payment was canceled. No charges were made.');
      // Clear URL parameters
      navigate('/reseller/credits', { replace: true });
    }
  }, [searchParams, navigate]);

  const handlePaymentSuccess = async (sessionId: string, creditsAdded: number) => {
    try {
      // Verify the payment with our backend
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        console.error('Session error during verification:', sessionError);
        toast.error('Authentication error. Please refresh and try again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('verify-checkout', {
        body: { sessionId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        }
      });

      if (error) {
        console.error('Verification error:', error);
        toast.error('Payment verification failed. Please contact support if credits were not added.');
        return;
      }

      if (data?.success) {
        toast.success(`Successfully added ${creditsAdded} credits to your account!`);
        // Refresh the app data to update credit balance
        await refreshData();
      } else {
        toast.error('Payment verification failed. Please contact support.');
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      toast.error('Error verifying payment. Please contact support if needed.');
    } finally {
      // Clear URL parameters
      navigate('/reseller/credits', { replace: true });
    }
  };

  const handlePurchase = async (priceId: string) => {
    if (!user) {
      toast.error('You must be logged in to purchase credits');
      return;
    }
    
    setIsLoading(priceId);
    
    try {
      console.log('Starting purchase for price ID:', priceId);
      console.log('User authenticated:', !!user);
      
      // Get the current session to ensure we have a valid auth token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Authentication session error: ' + sessionError.message);
      }
      
      if (!session?.access_token) {
        console.error('No access token found');
        throw new Error('No valid authentication session found. Please log in again.');
      }
      
      console.log('Valid session found, calling create-checkout function...');
      
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        }
      });
      
      if (error) {
        console.error('Function invocation error:', error);
        throw new Error(error.message || 'Failed to create checkout session');
      }
      
      console.log('Function response:', data);
      
      if (data?.url) {
        console.log('Opening Stripe checkout in new tab:', data.url);
        // Open Stripe checkout in a new tab instead of redirecting current window
        const newWindow = window.open(data.url, '_blank');
        
        if (!newWindow) {
          toast.error('Pop-up blocked. Please allow pop-ups and try again.');
          return;
        }
        
        toast.success('Stripe checkout opened in new tab. Complete your payment there.');
      } else {
        throw new Error('No checkout URL returned from server');
      }
    } catch (error: any) {
      console.error('Purchase error details:', error);
      
      // Provide more specific error messages
      if (error.message?.includes('Authentication')) {
        toast.error('Authentication error. Please log out and log back in.');
      } else if (error.message?.includes('Invalid price ID')) {
        toast.error('Invalid product selected. Please try again.');
      } else if (error.message?.includes('Stripe not configured')) {
        toast.error('Payment system is not configured. Please contact support.');
      } else if (error.message?.includes('Pop-up blocked')) {
        toast.error('Pop-up was blocked. Please allow pop-ups for this site and try again.');
      } else {
        toast.error('Failed to start checkout: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">Credits & Usage</h1>
            <p className="text-gray-500">Monitor your credit usage and EZTV streaming service transaction history</p>
          </div>
          <CreditsBadge credits={user?.credits || 0} />
        </div>
      </div>

      {/* Dynamic content based on reseller level */}
      <div className="mb-6">
        {resellerInfo?.credit_purchase_enabled ? (
          PURCHASES_ENABLED ? (
            // Level 1 Reseller - Show purchase options (currently disabled)
            <Card>
              <CardHeader>
                <CardTitle>Purchase Credits</CardTitle>
                <CardDescription>
                  Add more credits to your account to provision new customer accounts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {creditPackages.map((pack) => (
                    <Card key={pack.id} className="flex flex-col p-4 hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold">{pack.name}</h3>
                        <p className="text-2xl font-bold text-primary my-2">{pack.price}</p>
                        <p className="text-muted-foreground text-sm">{pack.description}</p>
                      </div>
                      <Button 
                        onClick={() => handlePurchase(pack.id)}
                        disabled={!!isLoading}
                        className="w-full mt-4"
                      >
                        {isLoading === pack.id ? (
                          <span className="flex items-center">
                            <span className="animate-spin mr-2">
                              <CreditCard size={16} />
                            </span>
                            Processing...
                          </span>
                        ) : (
                          <span className="flex items-center">
                            <CreditCard className="mr-2" size={16} />
                            Buy Now
                          </span>
                        )}
                      </Button>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            // Purchases temporarily disabled
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Credit Purchases Temporarily Unavailable</AlertTitle>
              <AlertDescription>
                Online credit purchases are temporarily unavailable. Please contact your administrator to have credits added to your account manually.
              </AlertDescription>
            </Alert>
          )
        ) : (
          // Level 2+ Reseller - Show request credits interface
          resellerInfo && (
            <SubResellerCreditsView
              userCredits={user?.credits || 0}
              creditPricePerUnit={resellerInfo.credit_price_per_unit || 5.00}
              parentResellerId={resellerInfo.parent_reseller_id || ''}
            />
          )
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credit History</CardTitle>
          <CardDescription>
            All credit transactions and account creations for your EZTV streaming service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreditLogTable logs={userCreditLogs} />
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
