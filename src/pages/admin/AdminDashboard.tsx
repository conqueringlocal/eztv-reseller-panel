
import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { RenewalAuditTool } from '@/components/admin/RenewalAuditTool';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMrrData } from '@/hooks/useMrrData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, DollarSign, Activity, TrendingUp, AlertCircle, Calculator, Percent } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';

export default function AdminDashboard() {
  const { customers, resellers, creditLogs, isLoading: appLoading } = useApp();
  const { isLoading: authLoading } = useAuth();
  const { mrrData, historicalData, isLoading: mrrLoading, fetchMrrData } = useMrrData();

  // Fetch MRR data when component mounts
  useEffect(() => {
    if (!authLoading && !appLoading) {
      fetchMrrData();
    }
  }, [authLoading, appLoading, fetchMrrData]);

  console.log('📊 AdminDashboard: Loading states -', {
    appLoading,
    authLoading,
    customersCount: customers.length,
    resellersCount: resellers.length,
    mrrLoading
  });

  // Show loading state while auth or app data is loading
  if (authLoading || appLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eztv-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  // Calculate stats
  const totalCustomers = customers.length;
  const totalResellers = resellers.length;
  const totalCreditsDistributed = resellers.reduce((sum, reseller) => sum + reseller.credits, 0);
  
  // MRR-related calculations
  const currentMonthRevenue = mrrData?.current_month_revenue || 0;
  const projectedMrr = mrrData?.projected_mrr || 0;
  const growthRate = mrrData?.growth_rate || 0;
  const avgSaleAmount = mrrData?.avg_sale_amount || 0;
  
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
      customer: log.customer_name || 'N/A',
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
          className="bg-card border-border"
        />
        <StatCard
          title="Total Resellers"
          value={totalResellers}
          icon={<TrendingUp className="h-5 w-5" />}
          className="bg-card border-border"
        />
        <StatCard
          title="Credits Distributed"
          value={totalCreditsDistributed}
          icon={<DollarSign className="h-5 w-5" />}
          className="bg-card border-border"
        />
        <StatCard
          title="Recent Activity"
          value={recentActivity}
          icon={<Activity className="h-5 w-5" />}
          className="bg-card border-border"
        />
      </div>

      {/* MRR Dashboard Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard
          title="Current Month Revenue"
          value={`$${currentMonthRevenue.toFixed(2)}`}
          icon={<DollarSign className="h-5 w-5" />}
          className="bg-card border-border"
          description="Revenue from credit sales this month"
        />
        <StatCard
          title="Projected MRR"
          value={`$${projectedMrr.toFixed(2)}`}
          icon={<Calculator className="h-5 w-5" />}
          className="bg-card border-border"
          description="3-month average projection"
          trend={growthRate > 0 ? 'up' : growthRate < 0 ? 'down' : 'neutral'}
          trendValue={growthRate !== 0 ? `${growthRate.toFixed(1)}%` : undefined}
        />
        <StatCard
          title="Average Sale Amount"
          value={`$${avgSaleAmount.toFixed(2)}`}
          icon={<TrendingUp className="h-5 w-5" />}
          className="bg-card border-border"
          description="Average revenue per credit sale"
        />
        <StatCard
          title="Growth Rate"
          value={`${growthRate.toFixed(1)}%`}
          icon={<Percent className="h-5 w-5" />}
          className="bg-card border-border"
          description="Month-over-month growth"
          trend={growthRate > 0 ? 'up' : growthRate < 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Revenue Charts and Audit Tool */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <RevenueChart historicalData={historicalData} isLoading={mrrLoading} />
        <RenewalAuditTool />
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
              <EmptyState
                title="No Recent Activity"
                description="No credit transactions have been recorded recently"
                icon={<AlertCircle className="h-12 w-12" />}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
