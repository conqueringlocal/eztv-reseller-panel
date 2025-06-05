
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { processWebhook, WebhookPayload } from '@/utils/webhookHandler';
import { Button } from '@/components/ui/button';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { CheckCircle, XCircle, Info } from 'lucide-react';

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
          const apiKey = searchParams.get('api_key') || searchParams.get('apiKey');
          const action = searchParams.get('action') as 'create' | 'renew' || 'create';
          const customerName = searchParams.get('customerName') || searchParams.get('name');
          const customerEmail = searchParams.get('customerEmail') || searchParams.get('email');
          const macAddress = searchParams.get('macAddress') || searchParams.get('mac');
          const deviceType = searchParams.get('deviceType') || searchParams.get('device_type');
          const planDuration = searchParams.get('planDuration') || searchParams.get('plan_duration_months');
          const contactId = searchParams.get('contact_id') || searchParams.get('contactId');
          
          payload = {
            api_key: apiKey || undefined,
            resellerId: resellerId || '',
            action: action,
            contact_id: contactId || undefined,
            customer: {
              name: customerName || '',
              email: customerEmail || '',
              mac: macAddress || '',
              device_type: deviceType || '',
              plan_duration_months: planDuration ? parseInt(planDuration, 10) : 0
            }
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
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
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

        {/* Webhook Documentation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DashboardCard title="Create Customer Webhook" className="h-fit">
            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-2">
                <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900">Create New Customer</h4>
                  <p className="text-sm text-gray-600">Use this format to create new IPTV customers</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs font-mono text-gray-800">
                  POST /webhook<br/>
                  Content-Type: application/json<br/><br/>
                  {`{
  "api_key": "your_api_key",
  "action": "create",
  "contact_id": "hl_contact_id",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "mac": "00:11:22:33:44:55",
    "device_type": "Smart TV",
    "plan_duration_months": 3
  }
}`}
                </p>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard title="Renew Customer Webhook" className="h-fit">
            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-2">
                <Info className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900">Renew Existing Customer</h4>
                  <p className="text-sm text-gray-600">Use this format to renew existing customers</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs font-mono text-gray-800">
                  POST /webhook<br/>
                  Content-Type: application/json<br/><br/>
                  {`{
  "api_key": "your_api_key",
  "action": "renew",
  "contact_id": "hl_contact_id",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "plan_duration_months": 3
  }
}`}
                </p>
              </div>
              
              <div className="text-xs text-gray-600">
                <strong>Note:</strong> For renewals, only name, email, and plan_duration_months are required. 
                The system will find the existing customer by name and email.
              </div>
            </div>
          </DashboardCard>
        </div>

        <div className="mt-6">
          <DashboardCard title="Webhook Features">
            <div className="p-4">
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• <strong>Customer Creation:</strong> Automatically provisions new IPTV accounts with credentials</li>
                <li>• <strong>Customer Renewal:</strong> Extends existing customer subscriptions by finding them by name and email</li>
                <li>• <strong>Credit Management:</strong> Automatically deducts credits from reseller accounts</li>
                <li>• <strong>HighLevel Integration:</strong> Sends credentials and updates via HighLevel when contact_id is provided</li>
                <li>• <strong>IPTV Panel Integration:</strong> Creates/renews users in the IPTV panel automatically</li>
                <li>• <strong>Audit Logging:</strong> All transactions are logged with detailed information</li>
              </ul>
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
