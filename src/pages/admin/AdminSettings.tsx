
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

export default function AdminSettings() {
  // In a real app, we would load these from API/backend
  const webhookUrl = `${window.location.origin}/api/webhook`;
  const apiKey = "89c1247e5b70f6b18665734b735d2cad";
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-500">Manage system settings and integrations</p>
      </div>
      
      <div className="grid gap-6">
        {/* Webhook Settings */}
        <DashboardCard
          title="HighLevel Webhook Integration"
          description="Use these settings to configure your HighLevel integration"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1.5">Webhook URL</p>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="bg-gray-50" />
                <Button 
                  variant="outline" 
                  onClick={() => copyToClipboard(webhookUrl)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Use this URL in your HighLevel webhook settings
              </p>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-sm font-medium mb-2">Webhook Format</h3>
              <div className="bg-gray-50 p-3 rounded-md">
                <pre className="text-xs overflow-x-auto">
{`{
  "resellerId": "RESELLER_ID", 
  "customerName": "Customer Name",
  "customerEmail": "customer@example.com",
  "macAddress": "00:1A:2B:3C:4D:5E",
  "deviceType": "Smart TV",
  "planDuration": 3
}`}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Configure your HighLevel workflow to send data in this format
              </p>
            </div>
          </div>
        </DashboardCard>
        
        {/* API Settings */}
        <DashboardCard
          title="IPTV API Configuration"
          description="Your IPTV API connection settings"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1.5">API Key</p>
              <div className="flex gap-2">
                <Input value={apiKey} type="password" readOnly className="bg-gray-50" />
                <Button 
                  variant="outline" 
                  onClick={() => copyToClipboard(apiKey)}
                >
                  Copy
                </Button>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-1.5">API Endpoint</p>
              <Input value="https://my8k.me/player_api.php" readOnly className="bg-gray-50" />
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-yellow-800">
              <p className="text-sm font-medium">Demo Mode</p>
              <p className="text-xs mt-1">
                This is a demo application and doesn't make actual API calls. In a production environment,
                these API calls would be made server-side for security.
              </p>
            </div>
          </div>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
