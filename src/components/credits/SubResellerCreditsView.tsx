import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditRequestDialog } from './CreditRequestDialog';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CreditRequest {
  id: string;
  credits_requested: number;
  price_per_credit: number;
  total_amount: number;
  status: string;
  message?: string;
  created_at: string;
  processed_at?: string;
}

interface SubResellerCreditsViewProps {
  userCredits: number;
  creditPricePerUnit: number;
  parentResellerId: string;
}

export const SubResellerCreditsView: React.FC<SubResellerCreditsViewProps> = ({
  userCredits,
  creditPricePerUnit,
  parentResellerId,
}) => {
  const { user } = useAuth();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCreditRequests = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('credit_requests')
        .select('*')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching credit requests:', error);
        toast.error('Failed to load credit requests');
      } else {
        setCreditRequests(data || []);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditRequests();
  }, [user]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'denied':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'denied':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Request Credits</CardTitle>
          <CardDescription>
            Request credits from your parent reseller at ${creditPricePerUnit.toFixed(2)} per credit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-2 text-blue-900 mb-2">
                <CreditCard size={20} />
                <span className="font-semibold">Current Balance: {userCredits} Credits</span>
              </div>
              <p className="text-sm text-blue-700">
                Price per credit: ${creditPricePerUnit.toFixed(2)}
              </p>
            </div>

            <Button 
              onClick={() => setShowRequestDialog(true)}
              className="w-full"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Request Credits
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit Request History</CardTitle>
          <CardDescription>
            Track your credit requests and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground">Loading requests...</p>
          ) : creditRequests.length === 0 ? (
            <p className="text-center text-muted-foreground">No credit requests yet</p>
          ) : (
            <div className="space-y-3">
              {creditRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(request.status)}
                      <span className="font-medium">
                        {request.credits_requested} Credits
                      </span>
                      <Badge className={getStatusColor(request.status)}>
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Badge>
                    </div>
                    <span className="font-semibold">
                      ${request.total_amount.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p>Requested: {new Date(request.created_at).toLocaleDateString()}</p>
                    {request.processed_at && (
                      <p>Processed: {new Date(request.processed_at).toLocaleDateString()}</p>
                    )}
                    {request.message && (
                      <p className="mt-1 italic">"{request.message}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreditRequestDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
        onSuccess={fetchCreditRequests}
        creditPricePerUnit={creditPricePerUnit}
        parentResellerId={parentResellerId}
      />
    </>
  );
};