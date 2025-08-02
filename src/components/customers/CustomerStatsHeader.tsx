
import React from 'react';
import { StatCard } from '@/components/dashboard/StatCard';
import { UserCheck, Clock, AlertTriangle, Ban, UserX } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'cancelled' | 'deactivated';

interface CustomerStatsHeaderProps {
  customers: any[];
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
}

export function CustomerStatsHeader({ 
  customers, 
  statusFilter, 
  onStatusFilterChange 
}: CustomerStatsHeaderProps) {
  // Get customer counts by status
  const today = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(today.getDate() + 7);
  
  const activeCount = customers.filter(c => 
    c.status === 'active' && !c.isDeactivated && !c.cancelledAt
  ).length;
  
  const expiringSoonCount = customers.filter(c => {
    if (c.isDeactivated || c.cancelledAt || c.status === 'expired') return false;
    const expirationDate = new Date(c.expirationDate);
    return expirationDate > today && expirationDate <= sevenDaysFromNow;
  }).length;
  
  const expiredCount = customers.filter(c => {
    if (c.isDeactivated || c.cancelledAt) return false;
    const expirationDate = new Date(c.expirationDate);
    return expirationDate < today;
  }).length;
  
  const deactivatedCount = customers.filter(c => c.isDeactivated).length;
  const cancelledCount = customers.filter(c => c.cancelledAt || c.status === 'cancelled').length;
  
  const handleStatusClick = (status: StatusFilter) => {
    onStatusFilterChange(statusFilter === status ? 'all' : status);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div 
        className={`cursor-pointer transition-all ${statusFilter === 'active' ? 'ring-2 ring-green-500' : ''}`}
        onClick={() => handleStatusClick('active')}
      >
        <StatCard
          title="Active Subscriptions"
          value={activeCount}
          icon={<UserCheck className="h-5 w-5" />}
          className="border-green-200 bg-green-50 hover:bg-green-100 h-full"
        />
      </div>
      
      <div 
        className={`cursor-pointer transition-all ${statusFilter === 'expiring' ? 'ring-2 ring-yellow-500' : ''}`}
        onClick={() => handleStatusClick('expiring')}
      >
        <StatCard
          title="Expiring Soon"
          value={expiringSoonCount}
          icon={<Clock className="h-5 w-5" />}
          className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100 h-full"
        />
      </div>
      
      <div 
        className={`cursor-pointer transition-all ${statusFilter === 'expired' ? 'ring-2 ring-red-500' : ''}`}
        onClick={() => handleStatusClick('expired')}
      >
        <StatCard
          title="Expired"
          value={expiredCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          className="border-red-200 bg-red-50 hover:bg-red-100 h-full"
        />
      </div>
      
      <div 
        className={`cursor-pointer transition-all ${statusFilter === 'cancelled' ? 'ring-2 ring-orange-500' : ''}`}
        onClick={() => handleStatusClick('cancelled')}
      >
        <StatCard
          title="Cancelled"
          value={cancelledCount}
          icon={<Ban className="h-5 w-5" />}
          className="border-orange-200 bg-orange-50 hover:bg-orange-100 h-full"
        />
      </div>
      
      <div 
        className={`cursor-pointer transition-all ${statusFilter === 'deactivated' ? 'ring-2 ring-gray-500' : ''}`}
        onClick={() => handleStatusClick('deactivated')}
      >
        <StatCard
          title="Deactivated"
          value={deactivatedCount}
          icon={<UserX className="h-5 w-5" />}
          className="border-gray-200 bg-gray-50 hover:bg-gray-100 h-full"
        />
      </div>
    </div>
  );
}
