
import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreditLog } from '@/contexts/AppContext';
import { format } from 'date-fns';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { CreditCard } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface CreditLogTableProps {
  logs: CreditLog[];
  filter?: 'all' | 'additions' | 'deductions';
}

export function CreditLogTable({ logs, filter = 'all' }: CreditLogTableProps) {
  const [search, setSearch] = useState('');
  
  // Filter logs based on filter type and search
  const filteredLogs = logs
    .filter((log) => {
      if (filter === 'all') return true;
      if (filter === 'additions') return log.action === 'addition';
      if (filter === 'deductions') return log.action === 'deduction' || log.action === 'account_creation';
      return true;
    })
    .filter(
      (log) =>
        log.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        log.notes?.toLowerCase().includes(search.toLowerCase()) ||
        ''
    );
  
  // Format date to be more readable
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy h:mm a');
    } catch (e) {
      return dateString;
    }
  };

  // Get action label and style
  const getActionDetails = (action: string) => {
    switch (action) {
      case 'addition':
        return { label: 'Credit Addition', className: 'bg-green-100 text-green-800' };
      case 'deduction':
        return { label: 'Credit Deduction', className: 'bg-red-100 text-red-800' };
      case 'account_creation':
        return { label: 'Account Creation', className: 'bg-blue-100 text-blue-800' };
      default:
        return { label: action, className: 'bg-gray-100 text-gray-800' };
    }
  };

  if (logs.length === 0) {
    return (
      <EmptyState
        title="No credit activity yet"
        description="Credit activity will appear here"
        icon={<CreditCard size={40} />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search logs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                  No logs found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => {
                const { label, className } = getActionDetails(log.action);
                
                return (
                  <TableRow key={log.id} className="hover:bg-gray-50">
                    <TableCell className="text-sm text-gray-500">{formatDate(log.date)}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs rounded-full ${className}`}>
                        {label}
                      </span>
                    </TableCell>
                    <TableCell 
                      className={
                        log.action === 'addition'
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'
                      }
                    >
                      {log.action === 'addition' ? '+' : '-'}{log.credits_used}
                    </TableCell>
                    <TableCell>{log.customer_name || 'N/A'}</TableCell>
                    <TableCell className="text-sm text-gray-600">{log.notes || 'No notes'}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
