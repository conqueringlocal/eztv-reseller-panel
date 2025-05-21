
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { useApp } from '@/contexts/AppContext';
import { CreditCard, Users, FileText, Calendar, CreditCardIcon } from 'lucide-react';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { CreditManageForm } from '@/components/credits/CreditManageForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

export default function AdminDashboard() {
  const { resellers, customers, creditLogs } = useApp();
  const navigate = useNavigate();
  const [searchReseller, setSearchReseller] = useState('');
  const [searchLog, setSearchLog] = useState('');
  const [selectedResellerId, setSelectedResellerId] = useState<string | null>(null);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  
  // Calculate total credits across all resellers
  const totalCredits = resellers.reduce((sum, reseller) => sum + reseller.credits, 0);
  
  // Calculate total customers and active connections
  const totalCustomers = customers.length;
  const activeConnections = customers.filter(c => c.status === 'active' && !c.isDeactivated).length;

  // Filter resellers based on search
  const filteredResellers = resellers.filter(
    (reseller) =>
      reseller.name.toLowerCase().includes(searchReseller.toLowerCase()) ||
      reseller.email.toLowerCase().includes(searchReseller.toLowerCase())
  );

  // Filter logs based on search
  const filteredLogs = creditLogs.filter(
    (log) =>
      log.customerName?.toLowerCase().includes(searchLog.toLowerCase()) ||
      log.action.toLowerCase().includes(searchLog.toLowerCase())
  );
  
  // Get customer count per reseller
  const getCustomerCount = (resellerId: string) => {
    return customers.filter(c => c.resellerId === resellerId).length;
  };

  // Get active connections per reseller
  const getActiveConnectionsCount = (resellerId: string) => {
    return customers.filter(c => c.resellerId === resellerId && c.status === 'active' && !c.isDeactivated).length;
  };

  // Check if reseller has low credits (< 10)
  const hasLowCredits = (credits: number) => {
    return credits < 10;
  };

  // Handle manage credits click
  const handleManageCredits = (resellerId: string) => {
    setSelectedResellerId(resellerId);
    setIsCreditModalOpen(true);
  };
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-gray-500">Welcome to your EZTV Club admin dashboard</p>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Active Resellers"
          value={resellers.length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Total Credits Assigned"
          value={totalCredits}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <StatCard
          title="Active Connections"
          value={activeConnections}
          icon={<Users className="h-5 w-5" />}
          description={`${totalCustomers} total customers`}
        />
      </div>
      
      {/* Tabs for Dashboard Sections */}
      <Tabs defaultValue="resellers" className="space-y-6">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="resellers">Resellers</TabsTrigger>
          <TabsTrigger value="activities">System Activity</TabsTrigger>
        </TabsList>

        {/* Resellers Tab */}
        <TabsContent value="resellers">
          <DashboardCard
            title="Reseller Overview"
            description="View and manage all resellers"
          >
            <div className="space-y-4">
              <Input
                placeholder="Search resellers..."
                value={searchReseller}
                onChange={(e) => setSearchReseller(e.target.value)}
                className="max-w-sm"
              />
              
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium text-gray-500">Name</th>
                      <th className="py-3 px-4 text-left font-medium text-gray-500">Email</th>
                      <th className="py-3 px-4 text-left font-medium text-gray-500">Credits</th>
                      <th className="py-3 px-4 text-left font-medium text-gray-500">Active Connections</th>
                      <th className="py-3 px-4 text-left font-medium text-gray-500">Branding</th>
                      <th className="py-3 px-4 text-right font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredResellers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-gray-500">
                          No resellers found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredResellers.map((reseller) => (
                        <tr key={reseller.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium">{reseller.name}</td>
                          <td className="py-3 px-4">{reseller.email}</td>
                          <td className="py-3 px-4">
                            {hasLowCredits(reseller.credits) ? (
                              <div className="flex items-center">
                                <CreditsBadge credits={reseller.credits} />
                                <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Low</span>
                              </div>
                            ) : (
                              <CreditsBadge credits={reseller.credits} />
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {getActiveConnectionsCount(reseller.id)}
                            <span className="text-gray-500 text-xs ml-1">
                              ({getCustomerCount(reseller.id)} total)
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              {reseller.logoUrl && (
                                <div className="h-6 w-6 bg-gray-100 rounded overflow-hidden">
                                  <img 
                                    src={reseller.logoUrl} 
                                    alt="Logo" 
                                    className="h-full w-full object-contain"
                                  />
                                </div>
                              )}
                              {reseller.accentColor && (
                                <div 
                                  className="h-4 w-4 rounded-full border"
                                  style={{ backgroundColor: reseller.accentColor }}
                                ></div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleManageCredits(reseller.id)}
                              >
                                Manage Credits
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => navigate(`/admin/resellers/${reseller.id}`)}
                              >
                                View Details
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </DashboardCard>
        </TabsContent>

        {/* Activities Tab */}
        <TabsContent value="activities">
          <DashboardCard
            title="System Activity Log"
            description="Complete history of all system activity"
          >
            <div className="space-y-4">
              <Input
                placeholder="Search logs..."
                value={searchLog}
                onChange={(e) => setSearchLog(e.target.value)}
                className="max-w-sm"
              />
              <CreditLogTable logs={filteredLogs.slice(0, 100)} />
            </div>
          </DashboardCard>
        </TabsContent>
      </Tabs>
      
      {/* Quick Actions */}
      <div className="mt-6">
        <h2 className="text-lg font-medium mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Button 
            variant="outline" 
            className="h-auto flex flex-col items-center justify-center px-4 py-6 space-y-2 hover:bg-gray-50"
            onClick={() => navigate('/admin/resellers')}
          >
            <Users className="h-6 w-6 text-eztv-600" />
            <span>Manage Resellers</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto flex flex-col items-center justify-center px-4 py-6 space-y-2 hover:bg-gray-50"
            onClick={() => navigate('/admin/credits')}
          >
            <CreditCard className="h-6 w-6 text-eztv-600" />
            <span>Manage Credits</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto flex flex-col items-center justify-center px-4 py-6 space-y-2 hover:bg-gray-50"
            onClick={() => navigate('/admin/logs')}
          >
            <FileText className="h-6 w-6 text-eztv-600" />
            <span>View Logs</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto flex flex-col items-center justify-center px-4 py-6 space-y-2 hover:bg-gray-50"
            onClick={() => navigate('/admin/settings')}
          >
            <Calendar className="h-6 w-6 text-eztv-600" />
            <span>System Settings</span>
          </Button>
        </div>
      </div>
      
      {/* Manage Credits Dialog */}
      {selectedResellerId && (
        <Dialog open={isCreditModalOpen} onOpenChange={setIsCreditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Credits</DialogTitle>
              <DialogDescription>
                Add or remove credits from this reseller's account.
              </DialogDescription>
            </DialogHeader>
            <CreditManageForm 
              resellerId={selectedResellerId} 
              type="add"
              onSuccess={() => {
                setIsCreditModalOpen(false);
                setSelectedResellerId(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
