
import React, { useState, useMemo } from 'react';
import { Customer } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CustomerCredentialsDialog } from './CustomerCredentialsDialog';
import { EditCustomerForm } from './EditCustomerForm';
import { MoreVertical, Eye, RotateCcw, UserX, Settings, RefreshCw, Crown, ChevronUp, ChevronDown, Edit } from 'lucide-react';
import { formatDate, isExpiringSoon } from '@/lib/utils';
import { consolidateCustomers, ConsolidatedCustomer, getCustomerDisplayName } from '@/utils/customerGrouping';

type SortField = 'name' | 'status' | 'device' | 'plan' | 'expiration';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'cancelled' | 'deactivated';

interface CustomerTableProps {
  customers: Customer[];
  onAddClick?: () => void;
  onCancel?: (customerId: string) => void;
  onRenew?: (customer: Customer) => void;
  onDeactivate?: (customerId: string) => void;
  onManageCrm?: (customer: Customer) => void;
  onSyncToCrm?: (customer: Customer) => void;
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (filter: StatusFilter) => void;
}

export function CustomerTable({ 
  customers, 
  onAddClick, 
  onCancel, 
  onRenew, 
  onDeactivate,
  onManageCrm,
  onSyncToCrm,
  statusFilter = 'all',
  onStatusFilterChange
}: CustomerTableProps) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<ConsolidatedCustomer | null>(null);
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<ConsolidatedCustomer | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Consolidate customers for display
  const consolidatedCustomers = consolidateCustomers(customers);

  // Define getStatusValue function BEFORE using it in useMemo
  const getStatusValue = (customer: ConsolidatedCustomer) => {
    if (customer.isDeactivated) return 4;
    if (customer.status === 'cancelled') return 3;
    if (customer.status === 'expired') return 2;
    if (isExpiringSoon(customer.expirationDate)) return 1;
    return 0; // active
  };

  // Filter and sort customers
  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = consolidatedCustomers;

    // Apply search filter
    if (search) {
      filtered = filtered.filter(
        (customer) =>
          customer.name.toLowerCase().includes(search.toLowerCase()) ||
          customer.email.toLowerCase().includes(search.toLowerCase()) ||
          customer.deviceType.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      const today = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(today.getDate() + 7);

      filtered = filtered.filter(customer => {
        switch (statusFilter) {
          case 'active':
            return customer.status === 'active' && !customer.isDeactivated && !customer.cancelledAt;
          case 'expiring':
            if (customer.isDeactivated || customer.cancelledAt || customer.status === 'expired') return false;
            const expirationDate = new Date(customer.expirationDate);
            return expirationDate > today && expirationDate <= sevenDaysFromNow;
          case 'expired':
            return customer.status === 'expired' && !customer.isDeactivated && !customer.cancelledAt;
          case 'cancelled':
            return customer.cancelledAt || customer.status === 'cancelled';
          case 'deactivated':
            return customer.isDeactivated;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'name':
          aValue = getCustomerDisplayName(a).toLowerCase();
          bValue = getCustomerDisplayName(b).toLowerCase();
          break;
        case 'status':
          aValue = getStatusValue(a);
          bValue = getStatusValue(b);
          break;
        case 'device':
          aValue = a.deviceType.toLowerCase();
          bValue = b.deviceType.toLowerCase();
          break;
        case 'plan':
          aValue = a.planDuration;
          bValue = b.planDuration;
          break;
        case 'expiration':
          aValue = new Date(a.expirationDate).getTime();
          bValue = new Date(b.expirationDate).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [consolidatedCustomers, search, statusFilter, sortField, sortDirection, getStatusValue]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4 ml-1" /> : 
      <ChevronDown className="h-4 w-4 ml-1" />;
  };

  const getStatusBadge = (customer: ConsolidatedCustomer) => {
    if (customer.isDeactivated) {
      return <Badge variant="secondary">Deactivated</Badge>;
    }
    
    if (customer.status === 'cancelled') {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    
    if (customer.status === 'expired') {
      return <Badge variant="destructive">Expired</Badge>;
    }
    
    if (isExpiringSoon(customer.expirationDate)) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Expiring Soon</Badge>;
    }
    
    return <Badge variant="default" className="bg-green-600">Active</Badge>;
  };

  const handleViewCredentials = (customer: ConsolidatedCustomer) => {
    setSelectedCustomer(customer);
    setIsCredentialsOpen(true);
  };

  const handleEditCustomer = (customer: ConsolidatedCustomer) => {
    setCustomerToEdit(customer);
    setIsEditOpen(true);
  };

  const handleRenew = (customer: ConsolidatedCustomer) => {
    // Use the primary customer for renewal
    onRenew?.(customer.connectionEntries[0]);
  };

  const handleDeactivate = (customerId: string) => {
    onDeactivate?.(customerId);
  };

  const handleCancel = (customerId: string) => {
    onCancel?.(customerId);
  };

  const handleManageCrm = (customer: ConsolidatedCustomer) => {
    // Use the primary customer for CRM management
    onManageCrm?.(customer.connectionEntries[0]);
  };

  const handleSyncToCrm = (customer: ConsolidatedCustomer) => {
    // Use the primary customer for CRM sync
    onSyncToCrm?.(customer.connectionEntries[0]);
  };

  if (customers.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-4">No customers found. Start by adding your first customer.</p>
        {onAddClick && <Button onClick={onAddClick}>Add Customer</Button>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search customers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>
                <Button 
                  variant="ghost" 
                  className="h-auto p-0 font-medium hover:bg-transparent flex items-center"
                  onClick={() => handleSort('name')}
                >
                  Customer
                  {getSortIcon('name')}
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  className="h-auto p-0 font-medium hover:bg-transparent flex items-center"
                  onClick={() => handleSort('device')}
                >
                  Device
                  {getSortIcon('device')}
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  className="h-auto p-0 font-medium hover:bg-transparent flex items-center"
                  onClick={() => handleSort('plan')}
                >
                  Plan
                  {getSortIcon('plan')}
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  className="h-auto p-0 font-medium hover:bg-transparent flex items-center"
                  onClick={() => handleSort('status')}
                >
                  Status
                  {getSortIcon('status')}
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  className="h-auto p-0 font-medium hover:bg-transparent flex items-center"
                  onClick={() => handleSort('expiration')}
                >
                  Expiration
                  {getSortIcon('expiration')}
                </Button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                  No customers found matching your search or filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div>
                      <div className="flex items-center space-x-2">
                        <div className="font-medium">{customer.name}</div>
                        {customer.isTrial && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            <Crown className="h-3 w-3 mr-1" />
                            Trial
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{customer.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{customer.deviceType}</div>
                      {customer.totalConnections > 1 ? (
                        <div className="text-sm text-gray-500">
                          {customer.totalConnections} connections
                        </div>
                      ) : (
                        customer.macAddress && (
                          <div className="text-sm text-gray-500">{customer.macAddress}</div>
                        )
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{customer.planDuration} month{customer.planDuration !== 1 ? 's' : ''}</div>
                      <div className="text-sm text-gray-500">Started {formatDate(customer.startDate)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(customer)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {formatDate(customer.expirationDate)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem 
                          onClick={() => handleViewCredentials(customer)}
                          className="cursor-pointer"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Credentials
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem 
                          onClick={() => handleEditCustomer(customer)}
                          className="cursor-pointer"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Customer
                        </DropdownMenuItem>
                        
                        {!customer.isDeactivated && customer.status !== 'cancelled' && (
                          <>
                            {onRenew && (
                              <DropdownMenuItem 
                                onClick={() => handleRenew(customer)}
                                className="cursor-pointer"
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Renew
                              </DropdownMenuItem>
                            )}
                            
                            {customer.highlevelContactId && onManageCrm && (
                              <DropdownMenuItem 
                                onClick={() => handleManageCrm(customer)}
                                className="cursor-pointer"
                              >
                                <Settings className="mr-2 h-4 w-4" />
                                Manage CRM
                              </DropdownMenuItem>
                            )}
                            
                            {!customer.highlevelContactId && onSyncToCrm && (
                              <DropdownMenuItem 
                                onClick={() => handleSyncToCrm(customer)}
                                className="cursor-pointer"
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Sync to CRM
                              </DropdownMenuItem>
                            )}
                            
                            {(onDeactivate || onCancel) && <DropdownMenuSeparator />}
                            
                            {onDeactivate && (
                              <DropdownMenuItem 
                                onClick={() => handleDeactivate(customer.id)}
                                className="cursor-pointer text-orange-600"
                              >
                                <UserX className="mr-2 h-4 w-4" />
                                Deactivate
                              </DropdownMenuItem>
                            )}
                            
                            {onCancel && (
                              <DropdownMenuItem 
                                onClick={() => handleCancel(customer.id)}
                                className="cursor-pointer text-red-600"
                              >
                                <UserX className="mr-2 h-4 w-4" />
                                Cancel
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedCustomer && (
        <CustomerCredentialsDialog
          customer={selectedCustomer}
          open={isCredentialsOpen}
          onOpenChange={(open) => {
            setIsCredentialsOpen(open);
            if (!open) {
              setSelectedCustomer(null);
            }
          }}
        />
      )}

      {customerToEdit && (
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>
                Update customer information. Changes will be applied to all connections for this customer.
              </DialogDescription>
            </DialogHeader>
            <EditCustomerForm 
              customer={customerToEdit.connectionEntries[0]} 
              onSuccess={() => {
                setIsEditOpen(false);
                setCustomerToEdit(null);
              }} 
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
