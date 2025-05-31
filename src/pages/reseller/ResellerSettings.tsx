
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { ApiKeyManager } from '@/components/api-keys/ApiKeyManager';
import { Separator } from '@/components/ui/separator';

export default function ResellerSettings() {
  // Get the Supabase project URL for the webhook endpoint
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookUrl = `${supabaseUrl}/functions/v1/webhook`;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-500">Manage your account settings and integrations</p>
      </div>
      
      <div className="space-y-6">
        <ApiKeyManager />
        
        <Separator />
        
        <DashboardCard
          title="Webhook Integration"
          description="Use your API keys to integrate with HighLevel funnels"
        >
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Webhook URL</h4>
              <code className="text-sm bg-white p-2 rounded border w-full block break-all">
                {webhookUrl}
              </code>
              <p className="text-sm text-gray-600 mt-2">
                Use this URL in your HighLevel automation workflows
              </p>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Integration Instructions</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Create an API key above and copy it</li>
                <li>In your HighLevel funnel, add a webhook action</li>
                <li>Set the webhook URL to the one shown above</li>
                <li>Set the method to <strong>POST</strong></li>
                <li>Set content type to <strong>application/json</strong></li>
                <li>Include your API key and customer data in the JSON payload</li>
                <li>Test the integration to ensure customers are created automatically</li>
              </ol>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Required Payload Format</h4>
              <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
{`{
  "api_key": "your_api_key_here",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com", 
    "mac": "00:11:22:33:44:55",
    "device_type": "Smart TV",
    "plan_duration_months": 12
  }
}`}
              </pre>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <h4 className="font-medium text-yellow-900 mb-2">HighLevel Setup Tips</h4>
              <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                <li>Make sure to use <strong>POST</strong> method, not GET</li>
                <li>Set Content-Type header to <strong>application/json</strong></li>
                <li>Use the exact JSON structure shown above</li>
                <li>Test your webhook in HighLevel's test mode first</li>
                <li>Check the webhook logs if accounts aren't being created</li>
              </ul>
            </div>
          </div>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
