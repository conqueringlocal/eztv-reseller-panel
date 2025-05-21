
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

export default function ResellerSettings() {
  const { user } = useAuth();
  
  // In a real app, this would be dynamically generated per reseller
  const webhookApiKey = "rs_" + Math.random().toString(36).substring(2, 10);
  const webhookUrl = `${window.location.origin}/api/webhook`;
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-500">Manage your account settings and integrations</p>
      </div>
      
      <div className="grid gap-6">
        {/* Account Settings */}
        <DashboardCard
          title="Account Information"
          description="Your account details"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1.5">Name</p>
              <Input value={user?.name || ''} readOnly className="bg-gray-50" />
            </div>
            
            <div>
              <p className="text-sm font-medium mb-1.5">Email</p>
              <Input value={user?.email || ''} readOnly className="bg-gray-50" />
            </div>
            
            <div>
              <p className="text-sm font-medium mb-1.5">Account ID</p>
              <Input value={user?.id || ''} readOnly className="bg-gray-50" />
            </div>
          </div>
        </DashboardCard>
        
        {/* Integration Settings */}
        <DashboardCard
          title="HighLevel Integration"
          description="Use these settings to configure your HighLevel funnel integration"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1.5">Reseller ID</p>
              <div className="flex gap-2">
                <Input value={user?.id || ''} readOnly className="bg-gray-50" />
                <Button 
                  variant="outline" 
                  onClick={() => copyToClipboard(user?.id || '')}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Include this ID in your webhook payload to identify yourself
              </p>
            </div>
            
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
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-yellow-800">
              <p className="text-sm font-medium">Integration Instructions</p>
              <p className="text-xs mt-1">
                Configure your HighLevel workflow to send a webhook to the URL above with your
                reseller ID and customer information when a purchase is completed.
              </p>
            </div>
          </div>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
