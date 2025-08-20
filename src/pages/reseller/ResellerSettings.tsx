
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { AccountUpdateForm } from '@/components/reseller/AccountUpdateForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Upload, Users, Link, KeyRound } from 'lucide-react';
import { ResellerApiCredentialsForm } from '@/components/reseller/ResellerApiCredentialsForm';
import { HighLevelSettings } from '@/components/resellers/HighLevelSettings';
import { HighLevelSocialMediaTest } from '@/components/resellers/HighLevelSocialMediaTest';

export default function ResellerSettings() {
  const { user } = useAuth();
  const { getReseller, customers } = useApp();
  
  // Get reseller data
  const reseller = getReseller(user?.id || '');
  
  // Get customer statistics
  const resellerCustomers = customers.filter(c => c.resellerId === user?.id);
  const activeConnections = resellerCustomers.filter(c => c.status === 'active' && !c.isDeactivated).length;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-500">Manage your account settings and view account information</p>
      </div>
      
      <div className="space-y-6">
        <DashboardCard
          title="Account Information"
          description="Your reseller account details and statistics"
        >
          <div className="space-y-6">
            {/* Basic Account Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Account Details</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Name:</span>
                      <span className="text-sm font-medium">{user?.name || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Email:</span>
                      <span className="text-sm font-medium">{user?.email || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Account Statistics</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Available Credits:</span>
                      <CreditsBadge credits={user?.credits || 0} />
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Total Customers:</span>
                      <span className="text-sm font-medium">{resellerCustomers.length}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Active Connections:</span>
                      <span className="text-sm font-medium text-green-600">{activeConnections}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Branding Information */}
            {(reseller?.logoUrl || reseller?.accentColor) && (
              <div className="border-t pt-6">
                <h4 className="font-medium text-gray-900 mb-4">Branding Settings</h4>
                <div className="flex items-center space-x-6">
                  {reseller.logoUrl && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">Logo:</span>
                      <div className="h-8 w-8 bg-gray-100 rounded overflow-hidden">
                        <img 
                          src={reseller.logoUrl} 
                          alt="Logo" 
                          className="h-full w-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                  {reseller.accentColor && (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">Accent Color:</span>
                      <div 
                        className="h-6 w-6 rounded-full border border-gray-300"
                        style={{ backgroundColor: reseller.accentColor }}
                      ></div>
                      <span className="text-sm font-mono text-gray-500">{reseller.accentColor}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Bulk Import Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Bulk Import Features
            </CardTitle>
            <CardDescription>
              Import existing customers from CSV files and link them to IPTV accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">CSV Template</h4>
                    <p className="text-sm text-gray-600">
                      Download a CSV template with all required fields for customer import
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Users className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">Account Verification</h4>
                    <p className="text-sm text-gray-600">
                      Automatically verifies that IPTV accounts exist before importing
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Link className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">CRM Integration</h4>
                    <p className="text-sm text-gray-600">
                      Links customers to HighLevel contacts and updates credentials automatically
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Upload className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900">Batch Processing</h4>
                    <p className="text-sm text-gray-600">
                      Process multiple customers at once with detailed progress tracking and error reporting
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">How to Use Bulk Import</h4>
              <ol className="text-sm text-blue-800 space-y-1">
                <li>1. Go to the Customers page and click "Bulk Import"</li>
                <li>2. Download the CSV template and fill it with your customer data</li>
                <li>3. Make sure the usernames match existing IPTV accounts</li>
                <li>4. Upload the CSV file and review the validation results</li>
                <li>5. The system will verify accounts and link customers automatically</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <DashboardCard
          title="Streaming API Credentials"
          description="Manage your IPTV provider API key and panel URL"
        >
          {user?.id && <ResellerApiCredentialsForm userId={user.id} />}
        </DashboardCard>

        {user?.id && <HighLevelSettings resellerId={user.id} />}
        
        {user?.id && <HighLevelSocialMediaTest resellerId={user.id} />}

        <DashboardCard
          title="Account Management"
          description="Update your email address and password"
        >
          <AccountUpdateForm />
        </DashboardCard>

        {/* Contact Admin Info */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">Need Help?</h4>
          <p className="text-sm text-blue-800">
            For account changes, additional settings, or technical support, please contact your administrator. 
            API integrations and advanced configurations are managed centrally for security and consistency.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
