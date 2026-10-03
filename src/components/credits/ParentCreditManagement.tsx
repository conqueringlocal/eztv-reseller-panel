import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, CreditCard, Users } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

interface CreditRequest {
  id: string;
  requester_id: string;
  credits_requested: number;
  price_per_credit: number;
  total_amount: number;
  status: string;
  message?: string;
  created_at: string;
  profiles: {
    name: string;
    email: string;
  };
}

interface SubReseller {
  id: string;
  name: string;
  email: string;
  credits: number;
  credit_price_per_unit: number;
}

export const ParentCreditManagement: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refreshData } = useApp();
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);
  const [subResellers, setSubResellers] = useState<SubReseller[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // Fetch pending credit requests
      const { data: requests, error: requestsError } = await supabase
        .from('credit_requests')
        .select(`
          *,
          profiles!credit_requests_requester_id_fkey (name, email)
        `)
        .eq('parent_reseller_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (requestsError) {
        console.error('Error fetching credit requests:', requestsError);
      } else {
        setCreditRequests(requests || []);
      }

      // Fetch sub-resellers
      const { data: subResellerData, error: subResellerError } = await supabase
        .from('profiles')
        .select('id, name, email, credits, credit_price_per_unit')
        .eq('parent_reseller_id', user.id)
        .eq('role', 'reseller');

      if (subResellerError) {
        console.error('Error fetching sub-resellers:', subResellerError);
      } else {
        setSubResellers(subResellerData || []);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleRequestAction = async (requestId: string, action: 'approved' | 'denied', request: CreditRequest) => {
    if (!user) return;
    
    setProcessingRequest(requestId);

    try {
      const { error } = await supabase.rpc('review_parent_credits', {p_id:requestId,p_approve:action==='approved'});
      if(error) throw error;

      toast({
        title: "Success",
        description: `Credit request ${action} successfully`,
      });

      // Refresh data and trigger user profile refresh across the app
      await fetchData();
      await refreshData();
      
      // Broadcast refresh event for other components
      window.dispatchEvent(new CustomEvent('creditsUpdated'));
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessingRequest(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Loading credit management...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Credit Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Pending Credit Requests</span>
            {creditRequests.length > 0 && (
              <Badge variant="secondary">{creditRequests.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Approve or deny credit requests from your sub-resellers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {creditRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No pending credit requests
            </p>
          ) : (
            <div className="space-y-4">
              {creditRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{request.profiles.name}</h4>
                      <p className="text-sm text-muted-foreground">{request.profiles.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{request.credits_requested} Credits</p>
                      <p className="text-sm text-muted-foreground">
                        ${request.total_amount.toFixed(2)} total
                      </p>
                    </div>
                  </div>
                  
                  {request.message && (
                    <div className="bg-gray-50 p-2 rounded text-sm mb-3">
                      <strong>Message:</strong> {request.message}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Requested: {new Date(request.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRequestAction(request.id, 'denied', request)}
                        disabled={processingRequest === request.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRequestAction(request.id, 'approved', request)}
                        disabled={processingRequest === request.id}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-Reseller Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Sub-Reseller Credits Overview</span>
          </CardTitle>
          <CardDescription>
            Monitor your sub-resellers' credit balances and pricing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subResellers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No sub-resellers created yet
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subResellers.map((subReseller) => (
                <div key={subReseller.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{subReseller.name}</h4>
                      <p className="text-sm text-muted-foreground">{subReseller.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold flex items-center">
                        <CreditCard className="h-4 w-4 mr-1" />
                        {subReseller.credits} Credits
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Price per credit: ${(subReseller.credit_price_per_unit || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};