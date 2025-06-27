
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeOff, Save, Webhook, Copy, ExternalLink, TestTube } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { GlobalHighLevelSettings } from '@/components/admin/GlobalHighLevelSettings';

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
  
  // Trial limits
  const [eightKTrialLimit, setEightKTrialLimit] = useState("");
  const [trexTrialLimit, setTrexTrialLimit] = useState("");
  
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
          .in('id', [
            'iptv_api_key', 'default_package_id', 
            'trex_api_key', 'trex_panel_url', 'trex_default_package_id',
            '8k_trial_daily_limit', 'trex_trial_daily_limit'
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
            case '8k_trial_daily_limit':
              setEightKTrialLimit(setting.value);
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
    setIsSaving(true);
    try {
      const promises = [];
      
      if (eightKTrialLimit.trim()) {
        promises.push(saveSetting('8k_trial_daily_limit', eightKTrialLimit, 'Daily trial limit for 8K provider'));
      }
      
      if (trexTrialLimit.trim()) {
        promises.push(saveSetting('trex_trial_daily_limit', trexTrialLimit, 'Daily trial limit for Trex provider'));
      }
      
      const results = await Promise.all(promises);
      const allSuccessful = results.every(Boolean);
      
      if (allSuccessful) {
        toast.success('Trial limits saved successfully');
      } else {
        toast.error('Failed to save some trial limits');
      }
    } finally {
      setIsSaving(false);
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const testWebhook = async (webhookType: 'legacy' | 'enhanced' | 'trial') => {
    const baseUrl = `${window.location.origin}/api/webhook`;
    let testUrl = '';
    
    switch (webhookType) {
      case 'legacy':
        testUrl = `${baseUrl}?api_key=test&customerName=Test+Customer&customerEmail=test@example.com&macAddress=00:1A:2B:3C:4D:5E&deviceType=Smart+TV&planDuration=1`;
        break;
      case 'enhanced':
        testUrl = `${baseUrl}?api_key=test&action=create&connections=2&customerName=Test+Customer&customerEmail=test@example.com&macAddress=00:1A:2B:3C:4D:5E&deviceType=Firestick&planDuration=3`;
        break;
      case 'trial':
        testUrl = `${baseUrl}?api_key=test&action=trial&connections=1&customerName=Trial+Customer&customerEmail=trial@example.com&deviceType=Smart+TV&planDuration=1&trialDurationHours=24`;
        break;
    }
    
    window.open(testUrl, '_blank');
    toast.success(`Opening ${webhookType} webhook test in new tab`);
  };
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-500">Manage system settings and integrations</p>
      </div>
      
      <div className="grid gap-6">
        {/* 8K IPTV API Settings */}
        <DashboardCard
          title="8K IPTV API Configuration"
          description="Your 8K IPTV API connection settings"
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
          description="Your Trex IPTV API connection settings"
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

        {/* Trial Limits Settings */}
        <DashboardCard
          title="Daily Trial Limits"
          description="Configure daily trial limits per provider to control costs"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium mb-1.5">8K Daily Trial Limit</p>
                <Input 
                  value={eightKTrialLimit} 
                  onChange={(e) => setEightKTrialLimit(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="50" 
                  disabled={isLoading}
                />
              </div>
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
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={saveTrialLimits}
                disabled={isLoading || isSaving}
              >
                <Save size={16} className="mr-2" />
                Save Trial Limits
              </Button>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-yellow-800">
              <p className="text-sm font-medium">Trial Limit Information</p>
              <p className="text-xs mt-1">
                These limits prevent excessive trial creation per provider per day. When the limit is reached, 
                new trial requests will be rejected with a 429 error until the next day.
              </p>
            </div>
          </div>
        </DashboardCard>

        {/* Enhanced Webhook Integration */}
        <DashboardCard
          title="Enhanced Webhook Integration"
          description="Comprehensive webhook system with multi-provider support, trials, and HighLevel integration"
        >
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="formats">Formats</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="testing">Testing</TabsTrigger>
              <TabsTrigger value="highlevel">HighLevel</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Webhook URL</h3>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly className="bg-gray-50" />
                  <Button variant="outline" onClick={() => copyToClipboard(webhookUrl)}>
                    <Copy size={16} className="mr-2" />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Use this URL in your webhook configurations (HighLevel, third-party systems, etc.)
                </p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="font-medium text-blue-900 mb-2">Key Features</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Multi-connection account support (1-10 connections)</li>
                  <li>• Trial account automation with custom durations</li>
                  <li>• Smart group-aware customer renewals</li>
                  <li>• Automatic HighLevel contact integration</li>
                  <li>• Multi-provider support (8K, Trex)</li>
                  <li>• Backward compatibility with legacy webhooks</li>
                  <li>• Enhanced error handling and validation</li>
                </ul>
              </div>
            </TabsContent>
            
            <TabsContent value="formats" className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Enhanced Webhook Format (Recommended)</h3>
                <div className="bg-gray-50 p-3 rounded-md">
                  <pre className="text-xs overflow-x-auto">
{`{
  "api_key": "YOUR_API_KEY",
  "action": "create",
  "connections": 2,
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => copyToClipboard(`{
  "api_key": "YOUR_API_KEY",
  "action": "create",
  "connections": 2,
  "contact_id": "{{contact.id}}",
  "customer": {
    "name": "{{contact.first_name}} {{contact.last_name}}",
    "email": "{{contact.email}}",
    "mac": "00:1A:2B:3C:4D:5E",
    "device_type": "Firestick",
    "plan_duration_months": 3,
    "package_id": "14826"
  }
}`)}
                  className="mt-2"
                >
                  <Copy size={14} className="mr-1" />
                  Copy JSON
                </Button>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Legacy Webhook Format (Backward Compatible)</h3>
                <div className="bg-gray-50 p-3 rounded-md">
                  <pre className="text-xs overflow-x-auto">
{`{
  "api_key": "YOUR_API_KEY",
  "customerName": "{{contact.first_name}} {{contact.last_name}}",
  "customerEmail": "{{contact.email}}",
  "macAddress": "00:1A:2B:3C:4D:5E",
  "deviceType": "Smart TV",
  "planDuration": 1,
  "packageId": "14826",
  "contactId": "{{contact.id}}"
}`}
                  </pre>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => copyToClipboard(`{
  "api_key": "YOUR_API_KEY",
  "customerName": "{{contact.first_name}} {{contact.last_name}}",
  "customerEmail": "{{contact.email}}",
  "macAddress": "00:1A:2B:3C:4D:5E",
  "deviceType": "Smart TV",
  "planDuration": 1,
  "packageId": "14826",
  "contactId": "{{contact.id}}"
}`)}
                  className="mt-2"
                >
                  <Copy size={14} className="mr-1" />
                  Copy JSON
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="actions" className="space-y-4">
              <div className="grid gap-4">
                <div className="p-4 border rounded-md">
                  <h4 className="font-medium mb-2">Create Account</h4>
                  <p className="text-sm text-muted-foreground mb-2">Creates new IPTV accounts with specified connections</p>
                  <div className="bg-gray-50 p-2 rounded text-xs">
                    <code>"action": "create"</code>
                  </div>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li>• Supports 1-10 connections per account</li>
                    <li>• Auto-detects MAG vs M3U based on MAC address</li>
                    <li>• Deducts credits: connections × plan_duration_months</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-md">
                  <h4 className="font-medium mb-2">Renew Account</h4>
                  <p className="text-sm text-muted-foreground mb-2">Renews existing customer accounts by group</p>
                  <div className="bg-gray-50 p-2 rounded text-xs">
                    <code>"action": "renew"</code>
                  </div>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li>• Finds customer by name and email</li>
                    <li>• Renews all accounts in customer group</li>
                    <li>• Extends expiration date by specified months</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-md">
                  <h4 className="font-medium mb-2">Create Trial</h4>
                  <p className="text-sm text-muted-foreground mb-2">Creates time-limited trial accounts</p>
                  <div className="bg-gray-50 p-2 rounded text-xs">
                    <code>"action": "trial"</code>
                  </div>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li>• Default: 24 hours duration</li>
                    <li>• Custom duration: "trial_duration_hours": 48</li>
                    <li>• No credit deduction required</li>
                    <li>• Respects daily trial limits</li>
                  </ul>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="testing" className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Test Webhook Endpoints</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Test different webhook scenarios with sample data
                </p>
              </div>
              
              <div className="grid gap-3">
                <div className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">Enhanced Create Account</p>
                    <p className="text-xs text-muted-foreground">Test creating account with 2 connections</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => testWebhook('enhanced')}
                  >
                    <ExternalLink size={14} className="mr-1" />
                    Test
                  </Button>
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">Trial Account Creation</p>
                    <p className="text-xs text-muted-foreground">Test 24-hour trial account creation</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => testWebhook('trial')}
                  >
                    <ExternalLink size={14} className="mr-1" />
                    Test
                  </Button>
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">Legacy Format</p>
                    <p className="text-xs text-muted-foreground">Test backward compatibility</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => testWebhook('legacy')}
                  >
                    <ExternalLink size={14} className="mr-1" />
                    Test
                  </Button>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <h4 className="font-medium text-yellow-900 mb-2">Testing Notes</h4>
                <ul className="text-xs text-yellow-800 space-y-1">
                  <li>• Test webhooks use "api_key=test" and sample data</li>
                  <li>• They will show validation errors in demo mode</li>
                  <li>• Use your actual API key for real testing</li>
                  <li>• Check browser console for detailed responses</li>
                </ul>
              </div>
            </TabsContent>
            
            <TabsContent value="highlevel" className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">HighLevel Integration Setup</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Step-by-step guide to integrate with HighLevel workflows
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 border rounded-md">
                  <h4 className="font-medium mb-2">1. Create Webhook in HighLevel</h4>
                  <ul className="text-sm space-y-1">
                    <li>• Go to Settings → Integrations → Webhooks</li>
                    <li>• Click "Create Webhook"</li>
                    <li>• Use webhook URL: <code className="bg-gray-100 px-1 rounded">{webhookUrl}</code></li>
                    <li>• Select trigger events (form submission, contact creation, etc.)</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-md">
                  <h4 className="font-medium mb-2">2. Configure Webhook Payload</h4>
                  <ul className="text-sm space-y-1">
                    <li>• Set method to POST</li>
                    <li>• Content-Type: application/json</li>
                    <li>• Include your API key in the payload</li>
                    <li>• Use HighLevel merge tags for dynamic data</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-md">
                  <h4 className="font-medium mb-2">3. Auto-Send Credentials</h4>
                  <ul className="text-sm space-y-1">
                    <li>• Include "contact_id": "{{contact.id}}" in payload</li>
                    <li>• System will automatically send credentials via HighLevel</li>
                    <li>• Credentials sent to contact's phone and email</li>
                    <li>• Configure HighLevel messaging templates as needed</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-md">
                  <h4 className="font-medium mb-2">4. Error Handling</h4>
                  <ul className="text-sm space-y-1">
                    <li>• Webhook returns detailed error messages</li>
                    <li>• Failed requests can be retried automatically</li>
                    <li>• Check HighLevel webhook logs for debugging</li>
                    <li>• Monitor credit usage in dashboard</li>
                  </ul>
                </div>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <h4 className="font-medium text-green-900 mb-2">Pro Tips</h4>
                <ul className="text-xs text-green-800 space-y-1">
                  <li>• Use different workflows for trials vs paid accounts</li>
                  <li>• Set up follow-up sequences for trial users</li>
                  <li>• Tag contacts based on account type and provider</li>
                  <li>• Create custom fields for connection count and expiration</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </DashboardCard>
        
        {/* Global HighLevel Settings */}
        <GlobalHighLevelSettings />
        
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
