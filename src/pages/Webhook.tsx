
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { processEnhancedWebhook, EnhancedWebhookPayload } from '@/utils/enhancedWebhookHandler';
import { Button } from '@/components/ui/button';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { CheckCircle, XCircle, Info, Zap, Users, Clock, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Webhook() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const processRequest = async () => {
      try {
        let payload: EnhancedWebhookPayload;
        
        if (window.location.search) {
          // Extract enhanced webhook data from query parameters
          const resellerId = searchParams.get('resellerId');
          const apiKey = searchParams.get('api_key') || searchParams.get('apiKey');
          const action = searchParams.get('action') as 'create' | 'renew' | 'trial' || 'create';
          const connections = parseInt(searchParams.get('connections') || '1', 10);
          const customerName = searchParams.get('customerName') || searchParams.get('name');
          const customerEmail = searchParams.get('customerEmail') || searchParams.get('email');
          const macAddress = searchParams.get('macAddress') || searchParams.get('mac');
          const deviceType = searchParams.get('deviceType') || searchParams.get('device_type');
          const planDuration = searchParams.get('planDuration') || searchParams.get('plan_duration_months');
          const contactId = searchParams.get('contact_id') || searchParams.get('contactId');
          const isTrial = searchParams.get('is_trial') === 'true' || action === 'trial';
          const trialDurationHours = parseInt(searchParams.get('trial_duration_hours') || '24', 10);
          
          payload = {
            api_key: apiKey || undefined,
            resellerId: resellerId || '',
            action: action,
            connections: connections,
            contact_id: contactId || undefined,
            is_trial: isTrial,
            trial_duration_hours: trialDurationHours,
            customer: {
              name: customerName || '',
              email: customerEmail || '',
              mac: macAddress || '',
              device_type: deviceType || '',
              plan_duration_months: planDuration ? parseInt(planDuration, 10) : 0,
              package_id: searchParams.get('package_id') || undefined
            }
          };
        } else {
          setResult({
            success: false,
            message: "No data provided in webhook request"
          });
          setIsLoading(false);
          return;
        }
        
        // Process the enhanced webhook
        const response = await processEnhancedWebhook(payload);
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">EZTV Club Enhanced Webhook System</h1>
          <p className="text-gray-600">Automated IPTV account management with multi-connection support</p>
        </div>

        {/* Webhook Response */}
        <div className="mb-8">
          <DashboardCard title="Webhook Response">
            {isLoading ? (
              <div className="flex flex-col items-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
                <p className="mt-4 text-gray-500">Processing webhook...</p>
              </div>
            ) : result ? (
              <div className="flex flex-col items-center py-6">
                {result.success ? (
                  <CheckCircle className="h-20 w-20 text-green-500" />
                ) : (
                  <XCircle className="h-20 w-20 text-red-500" />
                )}
                <h3 className={`text-xl font-bold mt-4 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                  {result.success ? 'Success!' : 'Error!'}
                </h3>
                <p className="text-gray-600 text-center mt-2 mb-4">{result.message}</p>
                
                {/* Display additional data if available */}
                {result.success && result.data && (
                  <div className="bg-gray-50 p-4 rounded-lg w-full max-w-md">
                    <h4 className="font-semibold text-gray-800 mb-2">Details:</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      {result.data.totalConnections && (
                        <div>Connections: {result.data.totalConnections}</div>
                      )}
                      {result.data.creditsUsed && (
                        <div>Credits Used: {result.data.creditsUsed}</div>
                      )}
                      {result.data.accountsRenewed && (
                        <div>Accounts Renewed: {result.data.accountsRenewed}</div>
                      )}
                      {result.data.accountType && (
                        <div>Account Type: {result.data.accountType.toUpperCase()}</div>
                      )}
                      {result.data.trialExpiresAt && (
                        <div>Trial Expires: {new Date(result.data.trialExpiresAt).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                )}
                
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

        {/* Enhanced Webhook Documentation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          
          {/* Account Creation */}
          <DashboardCard title="Account Creation" className="h-fit">
            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-3">
                <Users className="h-6 w-6 text-blue-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    Multi-Connection Support
                    <Badge variant="secondary">Enhanced</Badge>
                  </h4>
                  <p className="text-sm text-gray-600">Create accounts with 1-10 connections automatically</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs font-mono text-gray-800">
                  POST /webhook<br/>
                  Content-Type: application/json<br/><br/>
                  {`{
  "api_key": "your_api_key",
  "action": "create",
  "connections": 3,
  "contact_id": "hl_contact_id",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "mac": "00:11:22:33:44:55",
    "device_type": "Smart TV",
    "plan_duration_months": 3,
    "package_id": "premium"
  }
}`}
                </p>
              </div>
              
              <div className="text-xs text-gray-600">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>Automatic credit calculation (connections × months)</li>
                  <li>M3U or MAG account type detection</li>
                  <li>HighLevel integration for credential delivery</li>
                  <li>Customer grouping for multi-connection accounts</li>
                </ul>
              </div>
            </div>
          </DashboardCard>

          {/* Account Renewal */}
          <DashboardCard title="Group-Aware Renewal" className="h-fit">
            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-3">
                <Repeat className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    Smart Group Renewal
                    <Badge variant="secondary">Enhanced</Badge>
                  </h4>
                  <p className="text-sm text-gray-600">Automatically renew all accounts in a customer group</p>
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
    "plan_duration_months": 6
  }
}`}
                </p>
              </div>
              
              <div className="text-xs text-gray-600">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>Finds all accounts for a customer automatically</li>
                  <li>Renews entire group with one request</li>
                  <li>Proper credit calculation for all accounts</li>
                  <li>Renewal confirmation via HighLevel</li>
                </ul>
              </div>
            </div>
          </DashboardCard>

          {/* Trial Accounts */}
          <DashboardCard title="Trial Account Automation" className="h-fit">
            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-3">
                <Clock className="h-6 w-6 text-purple-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    Automated Trials
                    <Badge variant="secondary">New</Badge>
                  </h4>
                  <p className="text-sm text-gray-600">Create 24-hour trial accounts with no credit deduction</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs font-mono text-gray-800">
                  POST /webhook<br/>
                  Content-Type: application/json<br/><br/>
                  {`{
  "api_key": "your_api_key",
  "action": "trial",
  "connections": 1,
  "trial_duration_hours": 24,
  "contact_id": "hl_contact_id",
  "customer": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "device_type": "Smart TV",
    "plan_duration_months": 1
  }
}`}
                </p>
              </div>
              
              <div className="text-xs text-gray-600">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>No credit deduction for trial accounts</li>
                  <li>Automatic expiration after specified hours</li>
                  <li>Support for multi-connection trials</li>
                  <li>Instant credential delivery via HighLevel</li>
                </ul>
              </div>
            </div>
          </DashboardCard>

          {/* Enhanced Features */}
          <DashboardCard title="Enhanced Features" className="h-fit">
            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-3">
                <Zap className="h-6 w-6 text-yellow-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900">Advanced Capabilities</h4>
                  <p className="text-sm text-gray-600">Enterprise-grade webhook automation</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="bg-blue-50 p-3 rounded-md">
                  <h5 className="font-medium text-blue-800">Smart Routing</h5>
                  <p className="text-sm text-blue-600">Automatic detection of webhook type and processing</p>
                </div>
                
                <div className="bg-green-50 p-3 rounded-md">
                  <h5 className="font-medium text-green-800">Error Handling</h5>
                  <p className="text-sm text-green-600">Comprehensive validation and detailed error messages</p>
                </div>
                
                <div className="bg-purple-50 p-3 rounded-md">
                  <h5 className="font-medium text-purple-800">Credit Management</h5>
                  <p className="text-sm text-purple-600">Intelligent credit calculation and validation</p>
                </div>
                
                <div className="bg-orange-50 p-3 rounded-md">
                  <h5 className="font-medium text-orange-800">HighLevel Integration</h5>
                  <p className="text-sm text-orange-600">Automatic credential delivery and account updates</p>
                </div>
              </div>
            </div>
          </DashboardCard>
        </div>

        {/* Backward Compatibility */}
        <div className="mb-8">
          <DashboardCard title="Backward Compatibility">
            <div className="p-4">
              <div className="flex items-start space-x-3 mb-4">
                <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900">Legacy Webhook Support</h4>
                  <p className="text-sm text-gray-600">All existing webhook integrations continue to work unchanged</p>
                </div>
              </div>
              
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• <strong>Legacy Format:</strong> Old webhook payloads are automatically converted</li>
                <li>• <strong>Feature Detection:</strong> System detects enhanced vs legacy webhooks automatically</li>
                <li>• <strong>No Breaking Changes:</strong> Existing HighLevel automations work without modification</li>
                <li>• <strong>Progressive Enhancement:</strong> Add new features when ready, no rush to upgrade</li>
              </ul>
            </div>
          </DashboardCard>
        </div>

        {/* Quick Reference */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-semibold text-gray-800 mb-2">Actions</h4>
            <div className="space-y-1 text-sm">
              <div><Badge variant="outline">create</Badge> - New accounts</div>
              <div><Badge variant="outline">renew</Badge> - Extend existing</div>
              <div><Badge variant="outline">trial</Badge> - 24-hour trials</div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-semibold text-gray-800 mb-2">Connections</h4>
            <div className="space-y-1 text-sm">
              <div>Range: 1-10 connections</div>
              <div>Credit formula: connections × months</div>
              <div>Auto-grouped internally</div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-semibold text-gray-800 mb-2">Account Types</h4>
            <div className="space-y-1 text-sm">
              <div><Badge variant="secondary">M3U</Badge> - Multi-connection</div>
              <div><Badge variant="secondary">MAG</Badge> - Single + MAC</div>
              <div><Badge variant="secondary">Trial</Badge> - Time-limited</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
