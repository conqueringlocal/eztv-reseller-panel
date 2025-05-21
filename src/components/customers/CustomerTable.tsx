
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
import { Users, Edit, Trash2, Clock } from 'lucide-react';
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

interface CustomerTableProps {
  customers: Customer[];
  onAddClick?: () => void;
  onEdit?: (customer: Customer) => void;
  onDelete?: (customerId: string) => void;
  onRenew?: (customer: Customer) => void;
}

export function CustomerTable({ 
  customers, 
  onAddClick, 
  onEdit,
  onDelete,
  onRenew
}: CustomerTableProps) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  
  // Filter customers based on search
  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      customer.email.toLowerCase().includes(search.toLowerCase()) ||
      customer.macAddress.toLowerCase().includes(search.toLowerCase())
  );
  
  // Format date to be more readable
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  // Check if subscription is expiring soon (within 7 days)
  const isExpiringSoon = (expiryDateString: string) => {
    try {
      const today = new Date();
      const expiryDate = new Date(expiryDateString);
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(today.getDate() + 7);
      
      return expiryDate <= sevenDaysFromNow && expiryDate >= today;
    } catch (e) {
      return false;
    }
  };

  // Check if subscription is expired
  const isExpired = (expiryDateString: string) => {
    try {
      const today = new Date();
      const expiryDate = new Date(expiryDateString);
      return expiryDate < today;
    } catch (e) {
      return false;
    }
  };

  // Get status badge for customer
  const getStatusBadge = (expirationDate: string) => {
    if (isExpired(expirationDate)) {
      return (
        <Badge variant="destructive" className="flex items-center space-x-1">
          <Clock size={12} />
          <span>Expired</span>
        </Badge>
      );
    } else if (isExpiringSoon(expirationDate)) {
      return (
        <Badge variant="warning" className="bg-yellow-100 text-yellow-800 border-yellow-200 flex items-center space-x-1">
          <Clock size={12} />
          <span>Expiring Soon</span>
        </Badge>
      );
    } else {
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

  // Handle delete button click
  const handleDeleteClick = (customerId: string) => {
    setCustomerToDelete(customerId);
    setIsDeleteDialogOpen(true);
  };

  // Handle confirm delete
  const handleConfirmDelete = () => {
    if (customerToDelete && onDelete) {
      onDelete(customerToDelete);
    }
    setIsDeleteDialogOpen(false);
    setCustomerToDelete(null);
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
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {onAddClick && (
          <Button onClick={onAddClick} size="sm">
            Add Customer
          </Button>
        )}
      </div>
      
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>MAC Address</TableHead>
              <TableHead>Plan Length</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                  No customers found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-gray-50">
                  <TableCell>{getStatusBadge(customer.expirationDate)}</TableCell>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell>
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">
                      {customer.macAddress}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-eztv-50 text-eztv-700 border-eztv-200">
                      {customer.planDuration} {customer.planDuration === 1 ? 'Month' : 'Months'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(customer.expirationDate)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end space-x-2">
                      {onRenew && isExpired(customer.expirationDate) && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleRenewClick(customer)}
                        >
                          Renew
                        </Button>
                      )}
                      {onEdit && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEditClick(customer)}
                        >
                          <Edit size={16} />
                        </Button>
                      )}
                      {onDelete && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDeleteClick(customer.id)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-100"
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this customer and revoke their IPTV access.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
