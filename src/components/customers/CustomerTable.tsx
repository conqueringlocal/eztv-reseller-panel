import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Customer } from '@/contexts/AppContext';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Users, Edit, Trash2, Clock, ShieldOff, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EditCustomerForm } from '@/components/customers/EditCustomerForm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface CustomerTableProps {
  customers: Customer[];
  onAddClick?: () => void;
  onEdit?: (customer: Customer) => void;
  onCancel?: (customerId: string) => void; // Changed from onDelete to onCancel
  onRenew?: (customer: Customer) => void;
  onDeactivate?: (customerId: string) => void;
}

type FilterStatus = 'all' | 'active' | 'expiring_soon' | 'expired';

export function CustomerTable({ 
  customers, 
  onAddClick, 
  onEdit,
  onCancel, // Changed from onDelete to onCancel
  onRenew,
  onDeactivate
}: CustomerTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false); // Changed from isDeleteDialogOpen
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [customerToCancel, setCustomerToCancel] = useState<string | null>(null); // Changed from customerToDelete
  const [customerToDeactivate, setCustomerToDeactivate] = useState<string | null>(null);
  
  // Filter customers based on search and status
  const filteredCustomers = customers.filter(
    (customer) => {
      // Search filter
      const matchesSearch = 
        customer.name.toLowerCase().includes(search.toLowerCase()) ||
        customer.email.toLowerCase().includes(search.toLowerCase()) ||
        customer.macAddress.toLowerCase().includes(search.toLowerCase());
      
      // Status filter
      const matchesStatus = 
        statusFilter === 'all' || 
        customer.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    }
  );
  
  // Group customers by customer group ID for multi-connection display
  const groupedCustomers = filteredCustomers.reduce((acc, customer) => {
    if (customer.customerGroupId) {
      if (!acc[customer.customerGroupId]) {
        acc[customer.customerGroupId] = [];
      }
      acc[customer.customerGroupId].push(customer);
    } else {
      // For legacy data without group ID
      const singleGroupId = `single-${customer.id}`;
      acc[singleGroupId] = [customer];
    }
    return acc;
  }, {} as Record<string, Customer[]>);
  
  // Format date to be more readable
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  // Get status badge for customer - updated to handle cancelled status
  const getStatusBadge = (customer: Customer) => {
    if (customer.isDeactivated) {
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200 flex items-center space-x-1">
          <ShieldOff size={12} />
          <span>Deactivated</span>
        </Badge>
      );
    }
    
    if (customer.status === 'cancelled') {
      return (
        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 flex items-center space-x-1">
          <Clock size={12} />
          <span>Cancelled</span>
        </Badge>
      );
    }
    
    switch (customer.status) {
      case 'expired':
        return (
          <Badge variant="destructive" className="flex items-center space-x-1">
            <Clock size={12} />
            <span>Expired</span>
          </Badge>
        );
      case 'expiring_soon':
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 flex items-center space-x-1">
            <Clock size={12} />
            <span>Expiring Soon</span>
          </Badge>
        );
      case 'active':
      default:
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 flex items-center space-x-1">
            <Clock size={12} />
            <span>Active</span>
          </Badge>
        );
    }
  };

  // Handle edit button click
  const handleEditClick = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsEditDialogOpen(true);
  };

  // Handle cancel button click - updated from handleDeleteClick
  const handleCancelClick = (customerId: string) => {
    setCustomerToCancel(customerId);
    setIsCancelDialogOpen(true);
  };

  // Handle customer cancel - updated from handleDeleteCustomer
  const handleCancelCustomer = async (customerId: string) => {
    console.log(`🚫 CustomerTable: Initiating cancel for customer ID: ${customerId}`);
    
    try {
      if (onCancel) {
        await onCancel(customerId);
        console.log(`✅ CustomerTable: Customer ${customerId} cancelled successfully`);
        // Don't show toast here as AppContext already shows it
      }
    } catch (error) {
      console.error('💥 CustomerTable: Error during customer cancellation:', error);
      toast.error('An error occurred while cancelling the customer account');
    }
  };

  // Handle confirm cancel - updated from handleConfirmDelete
  const handleConfirmCancel = () => {
    if (customerToCancel) {
      console.log(`🔄 CustomerTable: Confirming cancellation of customer: ${customerToCancel}`);
      handleCancelCustomer(customerToCancel);
    } else {
      console.error('❌ CustomerTable: No customer selected for cancellation');
    }
    setIsCancelDialogOpen(false);
    setCustomerToCancel(null);
  };

  // Handle deactivate button click
  const handleDeactivateClick = (customerId: string) => {
    setCustomerToDeactivate(customerId);
    setIsDeactivateDialogOpen(true);
  };

  // Handle confirm deactivate
  const handleConfirmDeactivate = () => {
    if (customerToDeactivate && onDeactivate) {
      onDeactivate(customerToDeactivate);
    }
    setIsDeactivateDialogOpen(false);
    setCustomerToDeactivate(null);
  };

  // Handle renew subscription
  const handleRenewClick = (customer: Customer) => {
    if (onRenew) {
      onRenew(customer);
    }
  };

  if (customers.length === 0) {
    return (
      <EmptyState
        title="No customers yet"
        description="Add your first customer to get started"
        icon={<Users size={40} />}
        action={
          onAddClick && (
            <Button onClick={onAddClick} className="mt-2">
              Add Customer
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="w-full sm:max-w-sm">
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as FilterStatus)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          
          {onAddClick && (
            <Button onClick={onAddClick} size="sm">
              Add Customer
            </Button>
          )}
        </div>
      </div>
      
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>MAC Address</TableHead>
              <TableHead>Connections</TableHead>
              <TableHead>Plan Length</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(groupedCustomers).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                  No customers found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              Object.entries(groupedCustomers).flatMap(([groupId, groupCustomers]) => (
                groupCustomers.map((customer, index) => (
                  <TableRow 
                    key={customer.id} 
                    className={
                      index > 0 && index < groupCustomers.length 
                        ? "hover:bg-gray-50 border-t-0" 
                        : "hover:bg-gray-50"
                    }
                  >
                    <TableCell>{getStatusBadge(customer)}</TableCell>
                    <TableCell className="font-medium">
                      {customer.name}
                      {customer.totalConnections && customer.totalConnections > 1 && (
                        <div className="text-xs text-gray-500">
                          Connection {customer.connectionNumber} of {customer.totalConnections}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">
                        {customer.macAddress}
                      </code>
                    </TableCell>
                    <TableCell>
                      {customer.username && (
                        <div className="text-xs">
                          <div className="font-medium">Username: {customer.username}</div>
                          <div className="font-medium">Password: {customer.password}</div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-eztv-50 text-eztv-700 border-eztv-200">
                        {customer.planDuration} {customer.planDuration === 1 ? 'Month' : 'Months'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(customer.expirationDate)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end space-x-2">
                        {/* Only show renew for non-cancelled customers - Fixed logic */}
                        {onRenew && (customer.status === 'expired' || customer.status === 'expiring_soon') && customer.status !== 'cancelled' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="flex items-center space-x-1"
                            onClick={() => handleRenewClick(customer)}
                          >
                            <Repeat size={14} />
                            <span>Renew</span>
                          </Button>
                        )}
                        
                        {/* Only show deactivate for expired, non-cancelled customers - Fixed logic */}
                        {onDeactivate && customer.status === 'expired' && !customer.isDeactivated && customer.status !== 'cancelled' && (
                          <Button 
                            variant="outline"
                            size="sm"
                            className="flex items-center space-x-1 text-orange-600 hover:text-orange-800 hover:bg-orange-50"
                            onClick={() => handleDeactivateClick(customer.id)}
                          >
                            <ShieldOff size={14} />
                            <span>Deactivate</span>
                          </Button>
                        )}
                        
                        {/* Only show edit for non-cancelled customers */}
                        {onEdit && customer.status !== 'cancelled' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEditClick(customer)}
                          >
                            <Edit size={16} />
                          </Button>
                        )}
                        
                        {/* Only show cancel for active customers */}
                        {onCancel && customer.status === 'active' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleCancelClick(customer.id)}
                            className="text-orange-600 hover:text-orange-800 hover:bg-orange-100"
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Customer Dialog */}
      {selectedCustomer && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>
                Update customer details. Note that changes to plan duration will not extend the subscription.
              </DialogDescription>
            </DialogHeader>
            <EditCustomerForm 
              customer={selectedCustomer} 
              onSuccess={() => {
                setIsEditDialogOpen(false);
                setSelectedCustomer(null);
              }} 
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Confirmation Dialog - updated from Delete Confirmation Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this customer's account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the customer's account and stop any future billing or renewals. 
              The customer will keep access until their current subscription expires.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmCancel}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Cancel Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable the customer's IPTV service access. They can be reactivated later by renewing their subscription.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDeactivate}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
