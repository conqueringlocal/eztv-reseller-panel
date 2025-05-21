
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { useApp } from '@/contexts/AppContext';
import { CreditCard, Users, FileText } from 'lucide-react';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  const { resellers, customers } = useApp();
  const navigate = useNavigate();
  
  // Calculate total credits across all resellers
  const totalCredits = resellers.reduce((sum, reseller) => sum + reseller.credits, 0);
  
  // Calculate total customers
  const totalCustomers = customers.length;
  
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
          title="Total Customers"
          value={totalCustomers}
          icon={<Users className="h-5 w-5" />}
        />
      </div>
      
      {/* Reseller Overview */}
      <div className="mb-6">
        <DashboardCard
          title="Reseller Overview"
          description="View and manage all resellers"
        >
          <div className="space-y-3">
            {resellers.map((reseller) => (
              <div
                key={reseller.id}
                className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50"
              >
                <div>
                  <h3 className="font-medium">{reseller.name}</h3>
                  <p className="text-sm text-gray-500">{reseller.email}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <CreditsBadge credits={reseller.credits} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/admin/resellers/${reseller.id}`)}
                  >
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
      
      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-medium mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
        </div>
      </div>
    </DashboardLayout>
  );
}
