
import React, { useState, useMemo } from 'react';
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

const ROWS_PER_PAGE = 20;

interface CreditLogTableProps {
  logs: CreditLog[];
  filter?: 'all' | 'additions' | 'deductions';
}

export function CreditLogTable({ logs, filter = 'all' }: CreditLogTableProps) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filter logs based on filter type and search
  const filteredLogs = useMemo(() => {
    const result = logs
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
    return result;
  }, [logs, filter, search]);

  // Reset to page 1 when search changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ROWS_PER_PAGE));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };
  
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
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Search logs..."
          value={search}
          onChange={handleSearchChange}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {filteredLogs.length} entries
        </span>
      </div>
      
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  No logs found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              paginatedLogs.map((log) => {
                const { label, className } = getActionDetails(log.action);
                
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(log.date)}</TableCell>
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
                    <TableCell className="text-sm text-muted-foreground">{log.notes || 'No notes'}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {getPageNumbers().map((page, i) =>
              page === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationLink
                    isActive={currentPage === page}
                    onClick={() => setCurrentPage(page)}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
