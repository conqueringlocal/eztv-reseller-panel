
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { Badge } from '@/components/ui/badge';

export default function ResellerSettings() {
  const { user } = useAuth();
  const { getReseller, customers } = useApp();
  
  // Get reseller data
  const reseller = getReseller(user?.id || '');
  
  // Get customer statistics
  const resellerCustomers = customers.filter(c => c.resellerId === user?.id);
  const activeConnections = resellerCustomers.filter(c => c.status === 'active' && !c.isDeactivated).length;

  // Format provider display
  const formatProvider = (provider: string) => {
    return provider === '8k' ? '8K' : provider === 'trex' ? 'Trex' : provider;
  };

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
                      <span className="text-sm font-medium">{reseller?.name || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Email:</span>
                      <span className="text-sm font-medium">{reseller?.email || user?.email || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Provider:</span>
                      <Badge variant="secondary">
                        {formatProvider(reseller?.provider || '8k')}
                      </Badge>
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
                      <CreditsBadge credits={reseller?.credits || 0} />
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

            {/* Contact Admin Info */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Need Help?</h4>
              <p className="text-sm text-blue-800">
                For account changes, additional settings, or technical support, please contact your administrator. 
                API integrations and advanced configurations are managed centrally for security and consistency.
              </p>
            </div>
          </div>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
