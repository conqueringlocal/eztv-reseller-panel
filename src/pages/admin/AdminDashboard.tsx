
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, DollarSign, Activity, TrendingUp } from 'lucide-react';

export default function AdminDashboard() {
  const { customers, resellers, creditLogs } = useApp();

  // Calculate stats
  const totalCustomers = customers.length;
  const totalResellers = resellers.length;
  const totalCreditsDistributed = resellers.reduce((sum, reseller) => sum + reseller.credits, 0);
  
  // Calculate recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentActivity = creditLogs.filter(log => {
    const logDate = new Date(log.date);
    return logDate >= thirtyDaysAgo;
  }).length;

  // Recent credit logs for display
  const recentLogs = creditLogs
    .slice(0, 10)
    .map(log => ({
      id: log.id,
      action: log.action,
      credits: log.credits_used,
      reseller: resellers.find(r => r.id === log.reseller_id)?.name || 'Unknown',
      customer: log.customer_name || 'N/A', // Fixed: use customer_name instead of customerName
      date: new Date(log.date).toLocaleDateString()
    }));

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-gray-500">Monitor system performance and manage resellers</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard
          title="Total Customers"
          value={totalCustomers}
          icon={<Users className="h-5 w-5" />}
          className="border-blue-200 bg-blue-50"
        />
        <StatCard
          title="Total Resellers"
          value={totalResellers}
          icon={<TrendingUp className="h-5 w-5" />}
          className="border-green-200 bg-green-50"
        />
        <StatCard
          title="Credits Distributed"
          value={totalCreditsDistributed}
          icon={<DollarSign className="h-5 w-5" />}
          className="border-yellow-200 bg-yellow-50"
        />
        <StatCard
          title="Recent Activity"
          value={recentActivity}
          icon={<Activity className="h-5 w-5" />}
          className="border-purple-200 bg-purple-50"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Credit Activity</CardTitle>
          <CardDescription>Latest credit transactions across all resellers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{log.reseller}</p>
                    <p className="text-sm text-gray-500">{log.customer} • {log.date}</p>
                  </div>
                  <div className={`px-2 py-1 rounded text-sm ${
                    log.action === 'addition' ? 'bg-green-100 text-green-700' :
                    log.action === 'deduction' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {log.action === 'addition' ? '+' : '-'}{log.credits} credits
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No recent activity</p>
            )}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
