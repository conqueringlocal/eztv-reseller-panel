
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { Button } from '@/components/ui/button';
import { CreditCard, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const creditPackages = [
  { id: 'price_1RUeGZDUqLxD4hMqrbZxgfR0', name: '5 Credits', price: '$15', description: 'Basic package for small needs' },
  { id: 'price_1RUeGrDUqLxD4hMqBk7JdjJH', name: '10 Credits', price: '$30', description: 'Standard package, most popular' },
  { id: 'price_1RUeHFDUqLxD4hMqwhdgyVa8', name: '20 Credits', price: '$60', description: 'Premium package with better value' },
  { id: 'price_1RUeHXDUqLxD4hMqkX5XE0PR', name: '50 Credits', price: '$150', description: 'Bulk package for best value' }
];

export default function ResellerCredits() {
  const { user } = useAuth();
  const { creditLogs, refreshData } = useApp();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Filter credit logs for current reseller
  const userCreditLogs = creditLogs.filter(log => log.reseller_id === user?.id);

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
        console.log('Redirecting to Stripe checkout:', data.url);
        window.location.href = data.url;
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

      <div className="mb-6">
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
                    <p className="text-2xl font-bold text-eztv-600 my-2">{pack.price}</p>
                    <p className="text-gray-500 text-sm">{pack.description}</p>
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
            
            <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h4 className="font-medium">About Credits</h4>
              <p className="text-sm text-gray-600 mt-1">
                Credits are used to provision new customer accounts. 1 credit equals 1 month of service for one customer.
                After purchasing, credits will be immediately added to your account balance.
              </p>
              
              <div className="mt-4 flex items-start space-x-2">
                <Check size={20} className="text-green-500 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-600">
                  All payments are processed securely through Stripe
                </span>
              </div>
              <div className="mt-2 flex items-start space-x-2">
                <Check size={20} className="text-green-500 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-600">
                  Credits never expire and can be used at any time
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
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
