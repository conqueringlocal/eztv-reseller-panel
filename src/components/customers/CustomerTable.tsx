
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Edit, Trash2, RotateCcw, Eye, Users } from 'lucide-react';
import { EditCustomerForm } from './EditCustomerForm';
import { RenewCustomerForm } from './RenewCustomerForm';
import { CustomerCredentialsDialog } from './CustomerCredentialsDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  isConsolidatedCustomer, 
  getCustomerDisplayName, 
  getTotalConnections, 
  getConnectionSummary,
  processCustomersForDisplay
} from '@/utils/consolidatedCustomerUtils';
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
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [renewingCustomer, setRenewingCustomer] = useState<any>(null);
  const [viewingCredentials, setViewingCredentials] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Process customers to handle both consolidated and legacy formats
  const processedCustomers = processCustomersForDisplay(customers);

  // Filter customers based on statusFilter if provided
  const filteredCustomers = statusFilter && statusFilter !== 'all' 
    ? processedCustomers.filter(customer => {
        const today = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(today.getDate() + 7);
        const expirationDate = new Date(customer.expiration_date);
        
        switch (statusFilter) {
          case 'active':
            return customer.status === 'active' && !customer.is_deactivated && !customer.cancelled_at;
          case 'expiring':
            return !customer.is_deactivated && !customer.cancelled_at && customer.status !== 'expired' && 
                   expirationDate > today && expirationDate <= sevenDaysFromNow;
          case 'expired':
            return customer.status === 'expired' && !customer.is_deactivated && !customer.cancelled_at;
          case 'cancelled':
            return customer.cancelled_at || customer.status === 'cancelled';
          case 'deactivated':
            return customer.is_deactivated;
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
        // The connection_list contains all the connection details
        const { error } = await supabase
          .from('customers')
          .delete()
          .eq('id', customer.id);
          
        deleteResult = { error };
      } else {
        // For legacy customers, check if part of a group
        if (customer.customer_group) {
          // Delete all customers in the same group
          const { error } = await supabase
            .from('customers')
            .delete()
            .eq('customer_group', customer.customer_group)
            .eq('reseller_id', customer.reseller_id);
            
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
        throw deleteResult.error;
      }

      toast.success(`Customer ${getCustomerDisplayName(customer)} has been deleted successfully`);
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      toast.error('Failed to delete customer: ' + error.message);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getDaysUntilExpiration = (expirationDate: string) => {
    const expDate = new Date(expirationDate);
    const today = new Date();
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
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
          const daysUntilExpiration = getDaysUntilExpiration(customer.expiration_date);
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
                    {isConsolidatedCustomer(customer) && (
                      <Badge variant="outline" className="text-xs">
                        Consolidated
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Device Type</p>
                    <p className="text-sm">{customer.device_type}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Connections</p>
                    <p className="text-sm">{totalConnections}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Plan Duration</p>
                    <p className="text-sm">{customer.plan_duration} month{customer.plan_duration > 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Provider</p>
                    <p className="text-sm">{customer.provider || '8K'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Start Date</p>
                    <p className="text-sm">{formatDate(customer.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Expiration Date</p>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm">{formatDate(customer.expiration_date)}</p>
                      {daysUntilExpiration <= 7 && daysUntilExpiration > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {daysUntilExpiration} days left
                        </Badge>
                      )}
                      {daysUntilExpiration <= 0 && (
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
    </>
  );
}
