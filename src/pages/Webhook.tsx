
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { processEnhancedWebhook, EnhancedWebhookPayload } from '@/utils/enhancedWebhookHandler';
import { Button } from '@/components/ui/button';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { CheckCircle, XCircle, Info, Zap, Users, Clock, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Define the flattened result interface for display
interface WebhookResultDisplay {
  success: boolean;
  message: string;
  name?: string;
  email?: string;
  device_type?: string;
  start_date?: string;
  end_date?: string;
  total_connections?: number;
  account_type?: string;
  credits_used?: number;
  accounts_renewed?: number;
  trial_expires_at?: string;
  username_1?: string;
  password_1?: string;
  m3u_url_1?: string;
  username_2?: string;
  password_2?: string;
  m3u_url_2?: string;
  username_3?: string;
  password_3?: string;
  m3u_url_3?: string;
  errors?: string[];
}

export default function Webhook() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<WebhookResultDisplay | null>(null);
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
            message: "No data provided in webhook request",
            errors: ['no_data']
          });
          setIsLoading(false);
          return;
        }
        
        // Process the enhanced webhook and get flattened response
        const response = await processEnhancedWebhook(payload);
        setResult(response as WebhookResultDisplay);
      } catch (error) {
        setResult({
          success: false,
          message: error instanceof Error ? error.message : "An unknown error occurred",
          errors: ['processing_error']
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
          <p className="text-gray-600">Automated IPTV account management with flattened response for HighLevel</p>
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
                
                {/* Display flattened response data if available */}
                {result.success && (
                  <div className="bg-gray-50 p-4 rounded-lg w-full max-w-4xl">
                    <h4 className="font-semibold text-gray-800 mb-4">Response Data (HighLevel Compatible):</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      {/* Customer Information */}
                      {result.name && (
                        <div><strong>name:</strong> {result.name}</div>
                      )}
                      {result.email && (
                        <div><strong>email:</strong> {result.email}</div>
                      )}
                      {result.device_type && (
                        <div><strong>device_type:</strong> {result.device_type}</div>
                      )}
                      {result.start_date && (
                        <div><strong>start_date:</strong> {result.start_date}</div>
                      )}
                      {result.end_date && (
                        <div><strong>end_date:</strong> {result.end_date}</div>
                      )}
                      {result.account_type && (
                        <div><strong>account_type:</strong> {result.account_type.toUpperCase()}</div>
                      )}
                      {result.total_connections && (
                        <div><strong>total_connections:</strong> {result.total_connections}</div>
                      )}
                      {result.credits_used && (
                        <div><strong>credits_used:</strong> {result.credits_used}</div>
                      )}
                      {result.accounts_renewed && (
                        <div><strong>accounts_renewed:</strong> {result.accounts_renewed}</div>
                      )}
                      {result.trial_expires_at && (
                        <div><strong>trial_expires_at:</strong> {new Date(result.trial_expires_at).toLocaleString()}</div>
                      )}
                      
                      {/* Connection Credentials */}
                      {result.username_1 && (
                        <div><strong>username_1:</strong> {result.username_1}</div>
                      )}
                      {result.password_1 && (
                        <div><strong>password_1:</strong> {result.password_1}</div>
                      )}
                      {result.m3u_url_1 && (
                        <div className="col-span-full"><strong>m3u_url_1:</strong> <span className="break-all">{result.m3u_url_1}</span></div>
                      )}
                      
                      {result.username_2 && (
                        <div><strong>username_2:</strong> {result.username_2}</div>
                      )}
                      {result.password_2 && (
                        <div><strong>password_2:</strong> {result.password_2}</div>
                      )}
                      {result.m3u_url_2 && (
                        <div className="col-span-full"><strong>m3u_url_2:</strong> <span className="break-all">{result.m3u_url_2}</span></div>
                      )}
                      
                      {result.username_3 && (
                        <div><strong>username_3:</strong> {result.username_3}</div>
                      )}
                      {result.password_3 && (
                        <div><strong>password_3:</strong> {result.password_3}</div>
                      )}
                      {result.m3u_url_3 && (
                        <div className="col-span-full"><strong>m3u_url_3:</strong> <span className="break-all">{result.m3u_url_3}</span></div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Error details */}
                {!result.success && result.errors && result.errors.length > 0 && (
                  <div className="bg-red-50 p-4 rounded-lg w-full max-w-md mt-4">
                    <h4 className="font-semibold text-red-800 mb-2">Error Details:</h4>
                    <ul className="list-disc list-inside text-sm text-red-600">
                      {result.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
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
                    <Badge variant="secondary">Flattened Response</Badge>
                  </h4>
                  <p className="text-sm text-gray-600">Create accounts with 1-10 connections, response flattened for HighLevel</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs font-mono text-gray-800">
                  Response Format:<br/>
                  {`{
  "success": true,
  "message": "Account created...",
  "name": "John Doe",
  "email": "john@example.com",
  "device_type": "Smart TV",
  "start_date": "2025-01-29",
  "end_date": "2025-04-29",
  "account_type": "m3u",
  "total_connections": 3,
  "credits_used": 9,
  "username_1": "johndoe123",
  "password_1": "pass123",
  "m3u_url_1": "https://...",
  "username_2": "johndoe124",
  "password_2": "pass124",
  "m3u_url_2": "https://..."
}`}
                </p>
              </div>
              
              <div className="text-xs text-gray-600">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>Direct field mapping for HighLevel workflows</li>
                  <li>Up to 3 connection credentials (username_1, password_1, etc.)</li>
                  <li>Start and end dates for automation triggers</li>
                  <li>Account type and connection count information</li>
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
                    <Badge variant="secondary">Flattened Response</Badge>
                  </h4>
                  <p className="text-sm text-gray-600">Automatically renew all accounts with flat response structure</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs font-mono text-gray-800">
                  Response Format:<br/>
                  {`{
  "success": true,
  "message": "Customer renewed...",
  "name": "John Doe",
  "email": "john@example.com",
  "device_type": "Smart TV",
  "start_date": "2025-01-29",
  "end_date": "2025-10-29",  
  "account_type": "m3u",
  "accounts_renewed": 3,
  "credits_used": 18
}`}
                </p>
              </div>
              
              <div className="text-xs text-gray-600">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>Simple renewal confirmation fields</li>
                  <li>Updated end_date for automation triggers</li>
                  <li>Accounts renewed count for reporting</li>
                  <li>Credits used for billing integration</li>
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
                    <Badge variant="secondary">Flattened Response</Badge>
                  </h4>
                  <p className="text-sm text-gray-600">Create trial accounts with hour-based expiration</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-xs font-mono text-gray-800">
                  Response Format:<br/>
                  {`{
  "success": true,
  "message": "Trial account created...",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "device_type": "Smart TV",
  "start_date": "2025-01-29",
  "end_date": "2025-01-30",
  "account_type": "trial",
  "total_connections": 1,
  "trial_expires_at": "2025-01-30T14:30:00Z",
  "username_1": "janesmith456",
  "password_1": "trial123",
  "m3u_url_1": "https://..."
}`}
                </p>
              </div>
              
              <div className="text-xs text-gray-600">
                <strong>Features:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>Trial-specific expiration timestamp</li>
                  <li>No credit deduction (credits_used not included)</li>
                  <li>Immediate credential delivery</li>
                  <li>Account type marked as "trial"</li>
                </ul>
              </div>
            </div>
          </DashboardCard>

          {/* Enhanced Features */}
          <DashboardCard title="HighLevel Integration Benefits" className="h-fit">
            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-3">
                <Zap className="h-6 w-6 text-yellow-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900">Flattened Response Structure</h4>
                  <p className="text-sm text-gray-600">Optimized for HighLevel workflow mapping</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="bg-blue-50 p-3 rounded-md">
                  <h5 className="font-medium text-blue-800">Direct Field Mapping</h5>
                  <p className="text-sm text-blue-600">No nested objects - all fields accessible at root level</p>
                </div>
                
                <div className="bg-green-50 p-3 rounded-md">
                  <h5 className="font-medium text-green-800">Multi-Connection Support</h5>
                  <p className="text-sm text-green-600">username_1, username_2, username_3 fields for up to 3 connections</p>
                </div>
                
                <div className="bg-purple-50 p-3 rounded-md">
                  <h5 className="font-medium text-purple-800">Date Fields</h5>
                  <p className="text-sm text-purple-600">start_date and end_date for automation triggers</p>
                </div>
                
                <div className="bg-orange-50 p-3 rounded-md">
                  <h5 className="font-medium text-orange-800">Backward Compatible</h5>
                  <p className="text-sm text-orange-600">Legacy webhooks still work, enhanced responses available</p>
                </div>
              </div>
            </div>
          </DashboardCard>
        </div>

        {/* Backward Compatibility */}
        <div className="mb-8">
          <DashboardCard title="Response Structure">
            <div className="p-4">
              <div className="flex items-start space-x-3 mb-4">
                <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900">Flattened for HighLevel Compatibility</h4>
                  <p className="text-sm text-gray-600">All response fields are at the root level for easy workflow mapping</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h5 className="font-semibold text-gray-800 mb-2">Customer Fields</h5>
                  <ul className="space-y-1 text-gray-600">
                    <li>• <code>name</code> - Customer name</li>
                    <li>• <code>email</code> - Customer email</li>
                    <li>• <code>device_type</code> - Device type</li>
                    <li>• <code>start_date</code> - Service start date</li>
                    <li>• <code>end_date</code> - Service expiration date</li>
                    <li>• <code>account_type</code> - m3u, mag, or trial</li>
                  </ul>
                </div>
                
                <div>
                  <h5 className="font-semibold text-gray-800 mb-2">Connection Fields</h5>
                  <ul className="space-y-1 text-gray-600">
                    <li>• <code>username_1</code> - First connection username</li>
                    <li>• <code>password_1</code> - First connection password</li>
                    <li>• <code>m3u_url_1</code> - First connection M3U URL</li>
                    <li>• <code>username_2</code> - Second connection (if exists)</li>
                    <li>• <code>username_3</code> - Third connection (if exists)</li>
                    <li>• <code>total_connections</code> - Total number of connections</li>
                  </ul>
                </div>
              </div>
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
            <h4 className="font-semibold text-gray-800 mb-2">Response Format</h4>
            <div className="space-y-1 text-sm">
              <div>Flattened structure</div>
              <div>Direct field access</div>
              <div>HighLevel compatible</div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-semibold text-gray-800 mb-2">Connections</h4>
            <div className="space-y-1 text-sm">
              <div>username_1, password_1</div>
              <div>username_2, password_2</div>
              <div>username_3, password_3</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
