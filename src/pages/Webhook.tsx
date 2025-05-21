
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { processWebhook, WebhookPayload } from '@/utils/webhookHandler';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { CheckCircle, XCircle } from 'lucide-react';

// This is a demo webhook receiver that processes GET parameters
// In a real app, this would be a server-side API endpoint

export default function Webhook() {
  const [searchParams] = useSearchParams();
  const { addCustomer } = useApp();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const processQuery = async () => {
      try {
        // Extract webhook data from query parameters
        const resellerId = searchParams.get('resellerId');
        const customerName = searchParams.get('customerName');
        const customerEmail = searchParams.get('customerEmail');
        const macAddress = searchParams.get('macAddress');
        const deviceType = searchParams.get('deviceType');
        const planDuration = searchParams.get('planDuration');
        
        if (!resellerId || !customerName || !customerEmail || !macAddress || !planDuration) {
          setResult({
            success: false,
            message: "Missing required parameters"
          });
          return;
        }
        
        // Create webhook payload
        const payload: WebhookPayload = {
          resellerId,
          customerName,
          customerEmail,
          macAddress,
          deviceType: deviceType || 'Smart TV',
          planDuration: parseInt(planDuration, 10)
        };
        
        // Process the webhook
        const response = await processWebhook(payload, addCustomer);
        setResult(response);
      } catch (error) {
        setResult({
          success: false,
          message: error instanceof Error ? error.message : "An unknown error occurred"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    processQuery();
  }, [searchParams, addCustomer]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <DashboardCard title="Webhook Response">
          {isLoading ? (
            <div className="flex flex-col items-center py-6">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-eztv-700"></div>
              <p className="mt-4 text-gray-500">Processing webhook...</p>
            </div>
          ) : result ? (
            <div className="flex flex-col items-center py-4">
              {result.success ? (
                <CheckCircle className="h-16 w-16 text-green-500" />
              ) : (
                <XCircle className="h-16 w-16 text-red-500" />
              )}
              <h3 className={`text-lg font-medium mt-4 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.success ? 'Success!' : 'Error!'}
              </h3>
              <p className="text-gray-600 text-center mt-2">{result.message}</p>
              
              <Button 
                onClick={() => window.close()} 
                className="mt-6"
                variant="outline"
              >
                Close Window
              </Button>
            </div>
          ) : null}
        </DashboardCard>
      </div>
    </div>
  );
}
