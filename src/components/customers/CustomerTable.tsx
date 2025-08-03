
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Edit, Trash2, RotateCcw, Eye, Users, RefreshCw } from 'lucide-react';
import { EditCustomerForm } from './EditCustomerForm';
import { RenewCustomerForm } from './RenewCustomerForm';
import { CustomerCredentialsDialog } from './CustomerCredentialsDialog';
import { SyncDeviceDialog } from './SyncDeviceDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  isConsolidatedCustomer, 
  getCustomerDisplayName, 
  getTotalConnections, 
  getConnectionSummary,
  getFieldValue,
  processCustomersForDisplay
} from '@/utils/customerConsolidation';
import { formatDateSafely, getDaysUntilExpirationSafely } from '@/lib/utils';
import { useAllIptvPackages } from '@/hooks/useAllIptvPackages';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CustomerTableProps {
  customers: any[];
  onRefresh?: () => void;
  onAddClick?: () => void;
  onCancel?: (customerId: string) => Promise<void>;
  onRenew?: (customer: any) => void;
  onDeactivate?: (customerId: string) => Promise<void>;
  onManageCrm?: (customer: any) => void;
  onSyncToCrm?: (customer: any) => Promise<void>;
  statusFilter?: string;
  onStatusFilterChange?: (filter: string) => void;
}

export function CustomerTable({ 
  customers, 
  onRefresh = () => {},
  onAddClick,
  onCancel,
  onRenew,
  onDeactivate,
  onManageCrm,
  onSyncToCrm,
  statusFilter,
  onStatusFilterChange
}: CustomerTableProps) {
  const { user } = useAuth();
  const { getPackageName } = useAllIptvPackages();
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [renewingCustomer, setRenewingCustomer] = useState<any>(null);
  const [viewingCredentials, setViewingCredentials] = useState<any>(null);
  const [syncingCustomer, setSyncingCustomer] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Check if current user is admin
  const isAdmin = user?.role === 'admin';

  // Process customers to handle consolidated format
  const processedCustomers = processCustomersForDisplay(customers);

  // Filter customers based on statusFilter if provided
  const filteredCustomers = statusFilter && statusFilter !== 'all' 
    ? processedCustomers.filter(customer => {
        const today = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(today.getDate() + 7);
        
        const expirationDate = getFieldValue(customer, 'expiration_date', 'expirationDate');
        const daysUntilExpiration = getDaysUntilExpirationSafely(expirationDate);
        const isDeactivated = getFieldValue(customer, 'is_deactivated', 'isDeactivated');
        const cancelledAt = getFieldValue(customer, 'cancelled_at', 'cancelledAt');
        
        switch (statusFilter) {
          case 'active':
            return customer.status === 'active' && !isDeactivated && !cancelledAt;
          case 'expiring':
            return !isDeactivated && !cancelledAt && customer.status !== 'expired' && 
                   daysUntilExpiration !== null && daysUntilExpiration > 0 && daysUntilExpiration <= 7;
          case 'expired':
            return customer.status === 'expired' && !isDeactivated && !cancelledAt;
          case 'cancelled':
            return cancelledAt || customer.status === 'cancelled';
          case 'deactivated':
            return isDeactivated;
          default:
            return true;
        }
      })
    : processedCustomers;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'expiring_soon':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDelete = async (customer: any) => {
    if (!window.confirm(`Are you sure you want to delete ${getCustomerDisplayName(customer)}? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(customer.id);
    
    try {
      let deleteResult;
      
      if (isConsolidatedCustomer(customer)) {
        // For consolidated customers, delete the single record
        const { error } = await supabase
          .from('customers')
          .delete()
          .eq('id', customer.id);
          
        deleteResult = { error };
      } else {
        // For legacy customers, check if part of a group
        const customerGroup = getFieldValue(customer, 'customer_group', 'customerGroup');
        const resellerId = getFieldValue(customer, 'reseller_id', 'resellerId');
        
        if (customerGroup) {
          // Delete all customers in the same group
          const { error } = await supabase
            .from('customers')
            .delete()
            .eq('customer_group', customerGroup)
            .eq('reseller_id', resellerId);
            
          deleteResult = { error };
        } else {
          // Delete single customer
          const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', customer.id);
            
          deleteResult = { error };
        }
      }

      if (deleteResult.error) {
        console.error('Database deletion error:', deleteResult.error);
        
        // Check for specific error types
        if (deleteResult.error.code === '42501') {
          throw new Error('You do not have permission to delete this customer. Please contact your administrator.');
        } else if (deleteResult.error.code === 'PGRST116') {
          throw new Error('Customer not found or already deleted.');
        } else {
          throw new Error(`Database error: ${deleteResult.error.message}`);
        }
      }


      toast.success(`Customer ${getCustomerDisplayName(customer)} has been deleted successfully`);
      
      // Only refresh if deletion was successful
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      
      // Provide user-friendly error messages
      const errorMessage = error.message || 'An unexpected error occurred while deleting the customer.';
      toast.error(`Failed to delete customer: ${errorMessage}`);
      
      // Log additional context for debugging
      console.error('Customer deletion context:', {
        customerId: customer.id,
        customerName: getCustomerDisplayName(customer),
        isConsolidated: isConsolidatedCustomer(customer),
        userRole: user?.role
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleEditSuccess = () => {
    setEditingCustomer(null);
    onRefresh();
  };

  const handleRenewSuccess = () => {
    setRenewingCustomer(null);
    onRefresh();
  };

  if (filteredCustomers.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-gray-500">No customers found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {filteredCustomers.map((customer) => {
          const expirationDate = getFieldValue(customer, 'expiration_date', 'expirationDate');
          const startDate = getFieldValue(customer, 'start_date', 'startDate');
          const planDuration = getFieldValue(customer, 'plan_duration', 'planDuration');
          const deviceType = getFieldValue(customer, 'device_type', 'deviceType');
          const packageId = getFieldValue(customer, 'package_id', 'packageId') || getFieldValue(customer, 'packageId', 'packageId');
          const customerGroupId = getFieldValue(customer, 'customer_group_id', 'customerGroupId');
          
          let packageName = 'Default';
          if (packageId) {
            // Use the getPackageName function which looks up across all providers
            packageName = getPackageName(packageId);
          } else if (customerGroupId) {
            // For legacy customers with only customer_group_id, show "Legacy Package"
            packageName = 'Legacy Package';
          }
          
          const daysUntilExpiration = getDaysUntilExpirationSafely(expirationDate);
          const totalConnections = getTotalConnections(customer);
          const displayName = getCustomerDisplayName(customer);
          
          return (
            <Card key={customer.id} className="w-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CardTitle className="text-lg">{displayName}</CardTitle>
                    {totalConnections > 1 && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Users size={12} />
                        {getConnectionSummary(customer)}
                      </Badge>
                     )}
                  </div>
                  <Badge className={getStatusColor(customer.status)}>
                    {customer.status}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">{customer.email}</p>
              </CardHeader>
              
              <CardContent>
                <div className={`grid gap-4 mb-4 ${isAdmin ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Package</p>
                    <p className="text-sm">{packageName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Device Type</p>
                    <p className="text-sm">{deviceType || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Connections</p>
                    <p className="text-sm">{totalConnections}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Plan Duration</p>
                    <p className="text-sm">
                      {planDuration && planDuration > 0 
                        ? `${planDuration} month${planDuration > 1 ? 's' : ''}` 
                        : 'Not specified'}
                    </p>
                  </div>
                  {/* Only show provider field to admin users */}
                  {isAdmin && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Provider</p>
                      <p className="text-sm">{customer.provider || 'Default'}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Start Date</p>
                    <p className="text-sm">{formatDateSafely(startDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Expiration Date</p>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm">{formatDateSafely(expirationDate)}</p>
                      {daysUntilExpiration !== null && daysUntilExpiration <= 7 && daysUntilExpiration > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {daysUntilExpiration} days left
                        </Badge>
                      )}
                      {daysUntilExpiration !== null && daysUntilExpiration <= 0 && (
                        <Badge variant="destructive" className="text-xs">
                          Expired
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingCredentials(customer)}
                    className="flex items-center gap-1"
                  >
                    <Eye size={14} />
                    View Credentials
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingCustomer(customer)}
                    className="flex items-center gap-1"
                  >
                    <Edit size={14} />
                    Edit
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRenew ? onRenew(customer) : setRenewingCustomer(customer)}
                    className="flex items-center gap-1"
                  >
                    <RotateCcw size={14} />
                    Renew
                  </Button>

                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSyncingCustomer(customer)}
                      className="flex items-center gap-1"
                    >
                      <RefreshCw size={14} />
                      Sync Panel
                    </Button>
                  )}
                  
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(customer)}
                    disabled={isDeleting === customer.id}
                    className="flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    {isDeleting === customer.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editingCustomer && (
        <Dialog open={true} onOpenChange={() => setEditingCustomer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>
                Update customer information
              </DialogDescription>
            </DialogHeader>
            <EditCustomerForm
              customer={editingCustomer}
              onSuccess={handleEditSuccess}
            />
          </DialogContent>
        </Dialog>
      )}

      {renewingCustomer && !onRenew && (
        <Dialog open={true} onOpenChange={() => setRenewingCustomer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renew Customer</DialogTitle>
              <DialogDescription>
                Extend customer subscription
              </DialogDescription>
            </DialogHeader>
            <RenewCustomerForm
              customer={renewingCustomer}
              onSuccess={handleRenewSuccess}
            />
          </DialogContent>
        </Dialog>
      )}

      {viewingCredentials && (
        <CustomerCredentialsDialog
          customer={viewingCredentials}
          onClose={() => setViewingCredentials(null)}
        />
      )}

      {syncingCustomer && (
        <SyncDeviceDialog
          customer={syncingCustomer}
          open={true}
          onOpenChange={(open) => !open && setSyncingCustomer(null)}
          onSuccess={onRefresh}
        />
      )}
    </>
  );
}
