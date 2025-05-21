
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function AdminResellers() {
  const { resellers } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  
  // Filter resellers based on search
  const filteredResellers = resellers.filter(
    (reseller) =>
      reseller.name.toLowerCase().includes(search.toLowerCase()) ||
      reseller.email.toLowerCase().includes(search.toLowerCase())
  );
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Manage Resellers</h1>
        <p className="text-gray-500">View and manage all reseller accounts</p>
      </div>
      
      <DashboardCard
        title="Reseller List"
        description="All active resellers in your system"
      >
        <div className="space-y-4">
          <div className="flex justify-between">
            <Input
              placeholder="Search resellers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            {/* We'll implement add reseller functionality in Phase 2 */}
          </div>
          
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-gray-500">
                      No resellers found matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResellers.map((reseller) => (
                    <TableRow key={reseller.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{reseller.name}</TableCell>
                      <TableCell>{reseller.email}</TableCell>
                      <TableCell>
                        <CreditsBadge credits={reseller.credits} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/resellers/${reseller.id}`)}
                        >
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DashboardCard>
    </DashboardLayout>
  );
}
