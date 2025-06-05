
import React, { useState } from 'react';
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
import { CustomerCredentialsDialog } from './CustomerCredentialsDialog';
import { MoreVertical, Eye, RotateCcw, UserX, Settings, Sync, Crown } from 'lucide-react';
import { formatDate, isExpiringSoon } from '@/lib/utils';

interface CustomerTableProps {
  customers: Customer[];
  onAddClick: () => void;
  onCancel: (customerId: string) => void;
  onRenew: (customer: Customer) => void;
  onDeactivate: (customerId: string) => void;
  onManageCrm?: (customer: Customer) => void;
  onSyncToCrm?: (customer: Customer) => void;
}

export function CustomerTable({ 
  customers, 
  onAddClick, 
  onCancel, 
  onRenew, 
  onDeactivate,
  onManageCrm,
  onSyncToCrm
}: CustomerTableProps) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false);

  // Filter customers based on search
  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      customer.email.toLowerCase().includes(search.toLowerCase()) ||
      customer.deviceType.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (customer: Customer) => {
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

  const handleViewCredentials = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsCredentialsOpen(true);
  };

  const handleRenew = (customer: Customer) => {
    onRenew(customer);
  };

  const handleDeactivate = (customerId: string) => {
    onDeactivate(customerId);
  };

  const handleCancel = (customerId: string) => {
    onCancel(customerId);
  };

  if (customers.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-4">No customers found. Start by adding your first customer.</p>
        <Button onClick={onAddClick}>Add Customer</Button>
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
              <TableHead>Customer</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                  No customers found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
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
                      {customer.macAddress && (
                        <div className="text-sm text-gray-500">{customer.macAddress}</div>
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
                        
                        {!customer.isDeactivated && customer.status !== 'cancelled' && (
                          <>
                            <DropdownMenuItem 
                              onClick={() => handleRenew(customer)}
                              className="cursor-pointer"
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Renew
                            </DropdownMenuItem>
                            
                            {customer.highlevelContactId && onManageCrm && (
                              <DropdownMenuItem 
                                onClick={() => onManageCrm(customer)}
                                className="cursor-pointer"
                              >
                                <Settings className="mr-2 h-4 w-4" />
                                Manage CRM
                              </DropdownMenuItem>
                            )}
                            
                            {!customer.highlevelContactId && onSyncToCrm && (
                              <DropdownMenuItem 
                                onClick={() => onSyncToCrm(customer)}
                                className="cursor-pointer"
                              >
                                <Sync className="mr-2 h-4 w-4" />
                                Sync to CRM
                              </DropdownMenuItem>
                            )}
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem 
                              onClick={() => handleDeactivate(customer.id)}
                              className="cursor-pointer text-orange-600"
                            >
                              <UserX className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem 
                              onClick={() => handleCancel(customer.id)}
                              className="cursor-pointer text-red-600"
                            >
                              <UserX className="mr-2 h-4 w-4" />
                              Cancel
                            </DropdownMenuItem>
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
          isOpen={isCredentialsOpen}
          onClose={() => {
            setIsCredentialsOpen(false);
            setSelectedCustomer(null);
          }}
        />
      )}
    </div>
  );
}
