
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  isConsolidatedCustomer, 
  getCustomerDisplayName, 
  getTotalConnections,
  getFieldValue
} from '@/utils/customerConsolidation';

interface CustomerInfoCardProps {
  customer: any;
}

export function CustomerInfoCard({ customer }: CustomerInfoCardProps) {
  const { user } = useAuth();
  const displayName = getCustomerDisplayName(customer);
  const totalConnections = getTotalConnections(customer);
  const isAdmin = user?.role === 'admin';
  const deviceType = getFieldValue(customer, 'device_type', 'deviceType');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CardTitle className="text-lg">Customer Information</CardTitle>
            {totalConnections > 1 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Users size={12} />
                {totalConnections} Connections
              </Badge>
            )}
            {isConsolidatedCustomer(customer) && (
              <Badge variant="outline" className="text-xs">
                Consolidated Account
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-4 ${isAdmin ? 'grid-cols-2' : 'grid-cols-2'}`}>
          <div>
            <p className="text-sm font-medium text-gray-500">Name</p>
            <p className="text-sm">{displayName}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Email</p>
            <p className="text-sm">{customer.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Connections</p>
            <p className="text-sm">{totalConnections}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Device Type</p>
            <p className="text-sm">{deviceType || 'Not specified'}</p>
          </div>
          {isAdmin && (
            <div>
              <p className="text-sm font-medium text-gray-500">Provider</p>
              <p className="text-sm">{customer.provider || 'Default'}</p>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-500">Status</p>
            <Badge className={
              customer.status === 'active' ? 'bg-green-100 text-green-800' :
              customer.status === 'expired' ? 'bg-red-100 text-red-800' :
              customer.status === 'expiring_soon' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }>
              {customer.status}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
