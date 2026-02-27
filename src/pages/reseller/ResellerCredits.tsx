
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { SubResellerCreditsView } from '@/components/credits/SubResellerCreditsView';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { Button } from '@/components/ui/button';
import { CreditCard, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PURCHASES_ENABLED = true;

const creditPackages = [
  { id: 'credits_5', name: '5 Credits', price: '$15', description: 'Basic package for small needs', credits: 5 },
  { id: 'credits_10', name: '10 Credits', price: '$30', description: 'Standard package, most popular', credits: 10 },
  { id: 'credits_20', name: '20 Credits', price: '$60', description: 'Premium package with better value', credits: 20 },
  { id: 'credits_50', name: '50 Credits', price: '$150', description: 'Bulk package for best value', credits: 50 }
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

  // Handle PayPal success/cancel URL parameters
  useEffect(() => {
    const paypalSuccess = searchParams.get('paypal_success');
    const creditsParam = searchParams.get('credits');
    const paypalToken = searchParams.get('token'); // PayPal appends token as order ID
    const canceled = searchParams.get('canceled');

    if (paypalSuccess === 'true' && paypalToken) {
      handlePayPalSuccess(paypalToken, parseInt(creditsParam || '0'));
    } else if (canceled === 'true') {
      toast.error('Payment was canceled. No charges were made.');
      navigate('/reseller/credits', { replace: true });
    }
  }, [searchParams, navigate]);

  const handlePayPalSuccess = async (orderId: string, creditsExpected: number) => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        console.error('Session error during verification:', sessionError);
        toast.error('Authentication error. Please refresh and try again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('verify-paypal-order', {
        body: { orderId },
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
        toast.success(`Successfully added ${data.credits || creditsExpected} credits to your account!`);
        await refreshData();
      } else {
        toast.error('Payment verification failed. Please contact support.');
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      toast.error('Error verifying payment. Please contact support if needed.');
    } finally {
      navigate('/reseller/credits', { replace: true });
    }
  };

  const handlePurchase = async (packageId: string) => {
    if (!user) {
      toast.error('You must be logged in to purchase credits');
      return;
    }
    
    setIsLoading(packageId);
    
    try {
      console.log('Starting PayPal purchase for package:', packageId);
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error('Authentication session error: ' + sessionError.message);
      }
      
      if (!session?.access_token) {
        throw new Error('No valid authentication session found. Please log in again.');
      }
      
      const { data, error } = await supabase.functions.invoke('create-paypal-order', {
        body: { packageId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        }
      });
      
      if (error) {
        console.error('Function invocation error:', error);
        throw new Error(error.message || 'Failed to create PayPal order');
      }
      
      if (data?.approvalUrl) {
        console.log('Opening PayPal checkout in new tab:', data.approvalUrl);
        const newWindow = window.open(data.approvalUrl, '_blank');
        
        if (!newWindow) {
          toast.error('Pop-up blocked. Please allow pop-ups and try again.');
          return;
        }
        
        toast.success('PayPal checkout opened in new tab. Complete your payment there.');
      } else {
        throw new Error('No checkout URL returned from server');
      }
    } catch (error: any) {
      console.error('Purchase error details:', error);
      
      if (error.message?.includes('Authentication')) {
        toast.error('Authentication error. Please log out and log back in.');
      } else if (error.message?.includes('PayPal credentials')) {
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
            <p className="text-muted-foreground">Monitor your credit usage and EZTV streaming service transaction history</p>
          </div>
          <CreditsBadge credits={user?.credits || 0} />
        </div>
      </div>

      {/* Dynamic content based on reseller level */}
      <div className="mb-6">
        {resellerInfo?.credit_purchase_enabled ? (
          PURCHASES_ENABLED ? (
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
                            Buy with PayPal
                          </span>
                        )}
                      </Button>
                    </Card>
                  ))}
                </div>
                
                <div className="mt-6 bg-muted p-4 rounded-lg border">
                  <h4 className="font-medium mb-3">Important Information</h4>
                  
                  <div className="space-y-2">
                    <div className="flex items-start space-x-2">
                      <Check size={20} className="text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">
                        Credits are used to provision new customer accounts (1 credit = 1 month of service)
                      </span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Check size={20} className="text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">
                        All payments are processed securely through PayPal
                      </span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Check size={20} className="text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">
                        Credits never expire and can be used at any time
                      </span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <AlertCircle size={20} className="text-blue-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">
                        Checkout will open in a new tab. Complete payment there and return here to see updated balance
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Credit Purchases Temporarily Unavailable</CardTitle>
                <CardDescription>
                  Online credit purchases are temporarily unavailable. Please contact your administrator to have credits added to your account manually.
                </CardDescription>
              </CardHeader>
            </Card>
          )
        ) : (
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
