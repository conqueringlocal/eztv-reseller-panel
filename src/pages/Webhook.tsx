
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { processWebhook, WebhookPayload } from '@/utils/webhookHandler';
import { Button } from '@/components/ui/button';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { CheckCircle, XCircle } from 'lucide-react';

// This endpoint handles both GET parameters and POST JSON payloads
// In a real app, this would be a server-side API endpoint

export default function Webhook() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const processRequest = async () => {
      try {
        let payload: WebhookPayload;
        
        // Check if this is a POST request with JSON body or GET with query params
        // For demo purposes, we'll check for query parameters
        if (window.location.search) {
          // Extract webhook data from query parameters
          const resellerId = searchParams.get('resellerId');
          const customerName = searchParams.get('customerName') || searchParams.get('name');
          const customerEmail = searchParams.get('customerEmail') || searchParams.get('email');
          const macAddress = searchParams.get('macAddress') || searchParams.get('mac');
          const deviceType = searchParams.get('deviceType') || searchParams.get('device_type');
          const planDuration = searchParams.get('planDuration') || searchParams.get('plan_duration_months');
          
          payload = {
            resellerId: resellerId || '',
            customerName: customerName || '',
            customerEmail: customerEmail || '',
            macAddress: macAddress || '',
            deviceType: deviceType || '',
            planDuration: planDuration ? parseInt(planDuration, 10) : 0
          };
        } else {
          // In a real implementation, this would parse the POST body
          // For demo purposes, we'll show an error
          setResult({
            success: false,
            message: "No data provided in webhook request"
          });
          setIsLoading(false);
          return;
        }
        
        // Process the webhook
        const response = await processWebhook(payload);
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
    
    processRequest();
  }, [searchParams]);
  
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
