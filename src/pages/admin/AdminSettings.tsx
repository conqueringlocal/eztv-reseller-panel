
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Save, Webhook, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SystemSetting {
  id: string;
  value: string;
  description?: string;
}

export default function AdminSettings() {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [highLevelApiKey, setHighLevelApiKey] = useState("");
  const [showHighLevelApiKey, setShowHighLevelApiKey] = useState(false);
  const [highLevelLocationId, setHighLevelLocationId] = useState("");
  const [defaultPackageId, setDefaultPackageId] = useState("");
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
          .in('id', ['iptv_api_key', 'highlevel_api_key', 'highlevel_location_id', 'default_package_id']);
        
        if (error) throw error;
        
        const settings = data || [];
        settings.forEach((setting: SystemSetting) => {
          switch (setting.id) {
            case 'iptv_api_key':
              setApiKey(setting.value);
              break;
            case 'highlevel_api_key':
              setHighLevelApiKey(setting.value);
              break;
            case 'highlevel_location_id':
              setHighLevelLocationId(setting.value);
              break;
            case 'default_package_id':
              setDefaultPackageId(setting.value);
              break;
          }
        });
      } catch (error) {
        console.error('Error fetching settings:', error);
        toast.error('Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, []);
  
  const saveSetting = async (settingId: string, value: string, description?: string) => {
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ 
          id: settingId, 
          value: value,
          description: description 
        });
      
      if (error) throw error;
      
      return true;
    } catch (error) {
      console.error(`Error saving ${settingId}:`, error);
      return false;
    }
  };
  
  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error('API Key cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('iptv_api_key', apiKey, 'IPTV API key for user provisioning');
      if (success) {
        toast.success('IPTV API Key saved successfully');
      } else {
        toast.error('Failed to save IPTV API Key');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveHighLevelSettings = async () => {
    if (!highLevelApiKey.trim() || !highLevelLocationId.trim()) {
      toast.error('Both HighLevel API Key and Location ID are required');
      return;
    }
    
    setIsSaving(true);
    try {
      const apiKeySuccess = await saveSetting('highlevel_api_key', highLevelApiKey, 'HighLevel API key for sending messages');
      const locationSuccess = await saveSetting('highlevel_location_id', highLevelLocationId, 'HighLevel Location ID for message context');
      
      if (apiKeySuccess && locationSuccess) {
        toast.success('HighLevel settings saved successfully');
      } else {
        toast.error('Failed to save HighLevel settings');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveDefaultPackage = async () => {
    if (!defaultPackageId.trim()) {
      toast.error('Default Package ID cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('default_package_id', defaultPackageId, 'Default IPTV package ID for new accounts');
      if (success) {
        toast.success('Default Package ID saved successfully');
      } else {
        toast.error('Failed to save Default Package ID');
      }
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

            <div>
              <p className="text-sm font-medium mb-1.5">Default Package ID</p>
              <div className="flex gap-2">
                <Input 
                  value={defaultPackageId} 
                  onChange={(e) => setDefaultPackageId(e.target.value)}
                  className="flex-1"
                  placeholder="Enter default package ID (e.g., 14826)" 
                  disabled={isLoading}
                />
                <Button 
                  onClick={saveDefaultPackage}
                  disabled={isLoading || isSaving}
                >
                  <Save size={16} className="mr-2" />
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Default package ID used when none is specified in webhook requests
              </p>
            </div>
          </div>
        </DashboardCard>

        {/* HighLevel Integration Settings */}
        <DashboardCard
          title="HighLevel Integration"
          description="Configure HighLevel API for automatic credential delivery"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1.5">HighLevel API Key</p>
              <div className="flex gap-2">
                <Input 
                  value={highLevelApiKey} 
                  onChange={(e) => setHighLevelApiKey(e.target.value)}
                  type={showHighLevelApiKey ? "text" : "password"} 
                  className="flex-1"
                  placeholder="Enter your HighLevel API key" 
                  disabled={isLoading}
                />
                <Button 
                  variant="outline" 
                  onClick={() => setShowHighLevelApiKey(!showHighLevelApiKey)}
                  disabled={isLoading}
                >
                  {showHighLevelApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-1.5">Location ID</p>
              <Input 
                value={highLevelLocationId} 
                onChange={(e) => setHighLevelLocationId(e.target.value)}
                placeholder="Enter your HighLevel Location ID" 
                disabled={isLoading}
              />
            </div>

            <Button 
              onClick={saveHighLevelSettings}
              disabled={isLoading || isSaving}
              className="w-full"
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
                  Saving HighLevel Settings...
                </>
              ) : (
                <>
                  <MessageSquare size={16} className="mr-2" />
                  Save HighLevel Settings
                </>
              )}
            </Button>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-blue-800 mt-4">
              <p className="text-sm font-medium">Integration Status</p>
              <p className="text-xs mt-1">
                {highLevelApiKey && highLevelLocationId 
                  ? '✅ HighLevel integration is configured and ready'
                  : '⚠️ HighLevel integration requires both API Key and Location ID'
                }
              </p>
            </div>
          </div>
        </DashboardCard>
        
        {/* Webhook Settings */}
        <DashboardCard
          title="HighLevel Webhook Integration"
          description="Use these settings to configure your HighLevel webhook workflow"
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
              <h3 className="text-sm font-medium mb-2">Enhanced Webhook Format (with HighLevel Integration)</h3>
              <div className="bg-gray-50 p-3 rounded-md">
                <pre className="text-xs overflow-x-auto">
{`{
  "api_key": "YOUR_API_KEY",
  "contact_id": "{{contact.id}}",
  "customer": {
    "name": "{{contact.first_name}} {{contact.last_name}}",
    "email": "{{contact.email}}",
    "mac": "00:1A:2B:3C:4D:5E",
    "device_type": "Firestick",
    "plan_duration_months": 3,
    "package_id": "14826"
  }
}`}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Include the contact_id field to automatically send credentials via HighLevel
              </p>
            </div>
            
            <div className="flex">
              <Button 
                variant="outline" 
                className="flex items-center"
                onClick={() => {
                  window.open('/api/webhook?api_key=test&contact_id=test123&customerName=Test+Customer&customerEmail=test@example.com&macAddress=00:1A:2B:3C:4D:5E&deviceType=Test+Device&planDuration=1', '_blank');
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
