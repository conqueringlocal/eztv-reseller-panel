
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
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface CustomerTableProps {
  customers: Customer[];
  onAddClick?: () => void;
}

export function CustomerTable({ customers, onAddClick }: CustomerTableProps) {
  const [search, setSearch] = useState('');
  
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>MAC Address</TableHead>
              <TableHead>Plan Length</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>Expiration Date</TableHead>
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
                  <TableCell>{formatDate(customer.startDate)}</TableCell>
                  <TableCell>{formatDate(customer.expirationDate)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
