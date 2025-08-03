import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeOff, Save, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { GlobalHighLevelSettings } from '@/components/admin/GlobalHighLevelSettings';
import { SecurityAuditLogs } from '@/components/admin/SecurityAuditLogs';

interface SystemSetting {
  id: string;
  value: string;
  description?: string;
}

export default function AdminSettings() {
  // 8K Provider settings
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [defaultPackageId, setDefaultPackageId] = useState("");
  
  // Trex Provider settings
  const [trexApiKey, setTrexApiKey] = useState("");
  const [showTrexApiKey, setShowTrexApiKey] = useState(false);
  const [trexPanelUrl, setTrexPanelUrl] = useState("");
  const [trexDefaultPackageId, setTrexDefaultPackageId] = useState("");
  
  // Trial limits (Trex only)
  const [trexTrialLimit, setTrexTrialLimit] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Generate webhook URL with correct Supabase edge function format
  const webhookUrl = `https://hddnqgggjjlildufirof.supabase.co/functions/v1/webhook`;
  
  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .in('id', [
            'iptv_api_key', 'default_package_id', 
            'trex_api_key', 'trex_panel_url', 'trex_default_package_id',
            'trex_trial_daily_limit'
          ]);
        
        if (error) throw error;
        
        const settings = data || [];
        settings.forEach((setting: SystemSetting) => {
          switch (setting.id) {
            case 'iptv_api_key':
              setApiKey(setting.value);
              break;
            case 'default_package_id':
              setDefaultPackageId(setting.value);
              break;
            case 'trex_api_key':
              setTrexApiKey(setting.value);
              break;
            case 'trex_panel_url':
              setTrexPanelUrl(setting.value);
              break;
            case 'trex_default_package_id':
              setTrexDefaultPackageId(setting.value);
              break;
            case 'trex_trial_daily_limit':
              setTrexTrialLimit(setting.value);
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
      toast.error('8K API Key cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('iptv_api_key', apiKey, '8K IPTV API key for user provisioning');
      if (success) {
        toast.success('8K IPTV API Key saved successfully');
      } else {
        toast.error('Failed to save 8K IPTV API Key');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveDefaultPackage = async () => {
    if (!defaultPackageId.trim()) {
      toast.error('8K Default Package ID cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('default_package_id', defaultPackageId, 'Default 8K IPTV package ID for new accounts');
      if (success) {
        toast.success('8K Default Package ID saved successfully');
      } else {
        toast.error('Failed to save 8K Default Package ID');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveTrexApiKey = async () => {
    if (!trexApiKey.trim()) {
      toast.error('Trex API Key cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('trex_api_key', trexApiKey, 'Trex IPTV API key for user provisioning');
      if (success) {
        toast.success('Trex IPTV API Key saved successfully');
      } else {
        toast.error('Failed to save Trex IPTV API Key');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveTrexPanelUrl = async () => {
    if (!trexPanelUrl.trim()) {
      toast.error('Trex Panel URL cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('trex_panel_url', trexPanelUrl, 'Trex IPTV panel URL for API calls');
      if (success) {
        toast.success('Trex Panel URL saved successfully');
      } else {
        toast.error('Failed to save Trex Panel URL');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveTrexDefaultPackage = async () => {
    if (!trexDefaultPackageId.trim()) {
      toast.error('Trex Default Package ID cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('trex_default_package_id', trexDefaultPackageId, 'Default Trex IPTV package ID for new accounts');
      if (success) {
        toast.success('Trex Default Package ID saved successfully');
      } else {
        toast.error('Failed to save Trex Default Package ID');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const saveTrialLimits = async () => {
    if (!trexTrialLimit.trim()) {
      toast.error('Trex Trial Limit cannot be empty');
      return;
    }
    
    setIsSaving(true);
    try {
      const success = await saveSetting('trex_trial_daily_limit', trexTrialLimit, 'Daily trial limit for Trex provider');
      
      if (success) {
        toast.success('Trial limit saved successfully');
      } else {
        toast.error('Failed to save trial limit');
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
      
      <div className="container mx-auto">
        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings">System Settings</TabsTrigger>
            <TabsTrigger value="highlevel">HighLevel</TabsTrigger>
            <TabsTrigger value="security">Security Audit</TabsTrigger>
          </TabsList>
          
          <TabsContent value="settings">
            <div className="grid gap-6">
              {/* 8K IPTV API Settings */}
              <DashboardCard
                title="8K IPTV API Configuration"
                description="Your 8K IPTV API connection settings (paid accounts only)"
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

              {/* Trex IPTV API Settings */}
              <DashboardCard
                title="Trex IPTV API Configuration"
                description="Your Trex IPTV API connection settings (supports trials and paid accounts)"
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-1.5">Trex API Key</p>
                    <div className="flex gap-2">
                      <Input 
                        value={trexApiKey} 
                        onChange={(e) => setTrexApiKey(e.target.value)}
                        type={showTrexApiKey ? "text" : "password"} 
                        className="flex-1"
                        placeholder="Enter your Trex API key" 
                        disabled={isLoading}
                      />
                      <Button 
                        variant="outline" 
                        onClick={() => setShowTrexApiKey(!showTrexApiKey)}
                        disabled={isLoading}
                      >
                        {showTrexApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                      <Button 
                        onClick={saveTrexApiKey}
                        disabled={isLoading || isSaving}
                      >
                        <Save size={16} className="mr-2" />
                        Save
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-1.5">Trex Panel URL</p>
                    <div className="flex gap-2">
                      <Input 
                        value={trexPanelUrl} 
                        onChange={(e) => setTrexPanelUrl(e.target.value)}
                        className="flex-1"
                        placeholder="https://trex.example.com/api/api.php" 
                        disabled={isLoading}
                      />
                      <Button 
                        onClick={saveTrexPanelUrl}
                        disabled={isLoading || isSaving}
                      >
                        <Save size={16} className="mr-2" />
                        Save
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-1.5">Trex Default Package ID</p>
                    <div className="flex gap-2">
                      <Input 
                        value={trexDefaultPackageId} 
                        onChange={(e) => setTrexDefaultPackageId(e.target.value)}
                        className="flex-1"
                        placeholder="Enter default Trex package ID (e.g., 14826)" 
                        disabled={isLoading}
                      />
                      <Button 
                        onClick={saveTrexDefaultPackage}
                        disabled={isLoading || isSaving}
                      >
                        <Save size={16} className="mr-2" />
                        Save
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Default package ID used for Trex when none is specified in webhook requests
                    </p>
                  </div>
                </div>
              </DashboardCard>

              {/* Trial Limits Settings - Trex Only */}
              <DashboardCard
                title="Daily Trial Limits"
                description="Configure daily trial limits for Trex provider to control costs"
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-1.5">Trex Daily Trial Limit</p>
                    <Input 
                      value={trexTrialLimit} 
                      onChange={(e) => setTrexTrialLimit(e.target.value)}
                      type="number"
                      min="0"
                      placeholder="10" 
                      disabled={isLoading}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={saveTrialLimits}
                      disabled={isLoading || isSaving}
                    >
                      <Save size={16} className="mr-2" />
                      Save Trial Limit
                    </Button>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-blue-800">
                    <p className="text-sm font-medium">Trial Information</p>
                    <p className="text-xs mt-1">
                      Trial accounts are only available for Trex resellers. 8K provider does not support trial functionality.
                      This limit prevents excessive trial creation per day. When reached, new trial requests will be rejected with a 429 error.
                    </p>
                  </div>
                </div>
              </DashboardCard>
              
              {/* Webhook Settings */}
              <DashboardCard
                title="HighLevel Webhook Integration"
                description="Use these settings to configure your HighLevel webhook workflow with multi-credential support"
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
                    <h3 className="text-sm font-medium mb-2">Enhanced Multi-Connection Webhook Format</h3>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <pre className="text-xs overflow-x-auto">
{`{
  "api_key": "YOUR_API_KEY",
  "contact_id": "{{contact.id}}",
  "action": "create",
  "connections": 3,
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
                      This will create 3 IPTV accounts and automatically sync all credentials to HighLevel custom fields (iptv_username_1, iptv_password_1, etc.)
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">Trial Account Webhook Format (Trex Only)</h3>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <pre className="text-xs overflow-x-auto">
{`{
  "api_key": "YOUR_TREX_API_KEY",
  "contact_id": "{{contact.id}}",
  "action": "trial",
  "connections": 1,
  "trial_duration_hours": 24,
  "customer": {
    "name": "{{contact.first_name}} {{contact.last_name}}",
    "email": "{{contact.email}}",
    "device_type": "Smart TV"
  }
}`}
                      </pre>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Creates a trial account with the specified duration in hours. Only available for Trex resellers. 8K provider does not support trials.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">Renewal Webhook Format</h3>
                    <div className="bg-gray-50 p-3 rounded-md">
                      <pre className="text-xs overflow-x-auto">
{`{
  "api_key": "YOUR_API_KEY",
  "contact_id": "{{contact.id}}",
  "action": "renew",
  "customer": {
    "name": "{{contact.first_name}} {{contact.last_name}}",
    "email": "{{contact.email}}",
    "plan_duration_months": 3
  }
}`}
                      </pre>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Renews existing customer accounts and sends confirmation via HighLevel
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-blue-800">
                    <p className="text-sm font-medium">Multi-Credential HighLevel Integration</p>
                    <p className="text-xs mt-1">
                      The system now automatically syncs up to 3 sets of IPTV credentials to your HighLevel custom fields:
                      <br />• iptv_username_1, iptv_password_1, iptv_m3u_url_1
                      <br />• iptv_username_2, iptv_password_2, iptv_m3u_url_2  
                      <br />• iptv_username_3, iptv_password_3, iptv_m3u_url_3
                      <br />Make sure these custom fields exist in your HighLevel account.
                    </p>
                  </div>
                  
                  <div className="flex">
                    <Button 
                      variant="outline" 
                      className="flex items-center"
                      onClick={() => {
                        window.open(`${webhookUrl}?api_key=test&contact_id=test123&action=trial&connections=1&customerName=Test+Customer&customerEmail=test@example.com&deviceType=Test+Device&trial_duration_hours=24`, '_blank');
                      }}
                    >
                      <Webhook size={16} className="mr-2" />
                      Test Trex Trial Webhook
                    </Button>
                    <p className="text-xs text-muted-foreground ml-3 flex items-center">
                      This will test creating a Trex trial account
                    </p>
                  </div>
                </div>
              </DashboardCard>
            </div>
          </TabsContent>
          
          <TabsContent value="highlevel">
            <GlobalHighLevelSettings />
          </TabsContent>
          
          <TabsContent value="security">
            <SecurityAuditLogs />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
