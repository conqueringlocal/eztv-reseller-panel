
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Save, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function AdminSettings() {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Generate webhook URL based on current domain
  const webhookUrl = `${window.location.origin}/api/webhook`;
  
  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .eq('id', 'iptv_api_key')
          .single();
        
        if (error) throw error;
        
        if (data) {
          setApiKey(data.value);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        toast.error('Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, []);
  
  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error('API Key cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: apiKey })
        .eq('id', 'iptv_api_key');
      
      if (error) throw error;
      
      toast.success('API Key saved successfully');
    } catch (error) {
      console.error('Error saving API Key:', error);
      toast.error('Failed to save API Key');
    } finally {
      setIsSaving(false);
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-500">Manage system settings and integrations</p>
      </div>
      
      <div className="grid gap-6">
        {/* IPTV API Settings */}
        <DashboardCard
          title="IPTV API Configuration"
          description="Your IPTV API connection settings"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1.5">API Key</p>
              <div className="flex gap-2">
                <Input 
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)}
                  type={showApiKey ? "text" : "password"} 
                  className="flex-1"
                  placeholder="Enter your IPTV API key" 
                  disabled={isLoading}
                />
                <Button 
                  variant="outline" 
                  onClick={() => setShowApiKey(!showApiKey)}
                  disabled={isLoading}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
                <Button 
                  onClick={saveApiKey}
                  disabled={isLoading || isSaving}
                >
                  {isSaving ? (
                    <>
                      <span className="animate-spin mr-2">
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <circle 
                            className="opacity-25" 
                            cx="12" 
                            cy="12" 
                            r="10" 
                            stroke="currentColor" 
                            strokeWidth="4"
                          ></circle>
                          <path 
                            className="opacity-75" 
                            fill="currentColor" 
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      </span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} className="mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-1.5">API Endpoint</p>
              <Input value="https://my8k.me/player_api.php" readOnly className="bg-gray-50" />
            </div>
          </div>
        </DashboardCard>
        
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
  "customer": {
    "name": "John Doe",
    "email": "customer@example.com",
    "mac": "00:1A:2B:3C:4D:5E",
    "device_type": "Firestick",
    "plan_duration_months": 3
  }
}`}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Configure your HighLevel workflow to send data in this format
              </p>
            </div>
            
            <div className="flex">
              <Button 
                variant="outline" 
                className="flex items-center"
                onClick={() => {
                  window.open('/api/webhook?resellerId=2&customerName=Test+Customer&customerEmail=test@example.com&macAddress=00:1A:2B:3C:4D:5E&deviceType=Test+Device&planDuration=1', '_blank');
                }}
              >
                <Webhook size={16} className="mr-2" />
                Test Webhook
              </Button>
              <p className="text-xs text-muted-foreground ml-3 flex items-center">
                This will open a test webhook URL in a new tab
              </p>
            </div>
          </div>
        </DashboardCard>
        
        {/* System Information */}
        <DashboardCard
          title="System Information"
          description="Technical details about your EZTV Club installation"
        >
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <p className="text-sm font-medium">Version</p>
                <p className="text-sm text-gray-600">1.0.0</p>
              </div>
              <div>
                <p className="text-sm font-medium">Environment</p>
                <p className="text-sm text-gray-600">Production</p>
              </div>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-yellow-800 mt-4">
              <p className="text-sm font-medium">Demo Mode Notice</p>
              <p className="text-xs mt-1">
                This application is currently operating in demo mode. In a production environment,
                sensitive API calls would be secured through server-side processing.
              </p>
            </div>
          </div>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
