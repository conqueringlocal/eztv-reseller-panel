import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { CreditManageForm } from '@/components/credits/CreditManageForm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function AdminResellers() {
  const { resellers, customers } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedResellerId, setSelectedResellerId] = useState<string | null>(null);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  
  // Filter resellers based on search
  const filteredResellers = resellers.filter(
    (reseller) =>
      reseller.name.toLowerCase().includes(search.toLowerCase()) ||
      reseller.email.toLowerCase().includes(search.toLowerCase())
  );
  
  // Get customer count per reseller
  const getCustomerCount = (resellerId: string) => {
    return customers.filter(c => c.resellerId === resellerId).length;
  };

  // Handle manage credits click
  const handleManageCredits = (resellerId: string) => {
    setSelectedResellerId(resellerId);
    setIsCreditModalOpen(true);
  };
  
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
            {/* We'll implement add reseller functionality in Phase 3 */}
          </div>
          
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-gray-500">
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
                        {getCustomerCount(reseller.id)}
                      </TableCell>
                      <TableCell>
                        <div className="space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleManageCredits(reseller.id)}
                          >
                            Manage Credits
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => navigate(`/admin/resellers/${reseller.id}`)}
                          >
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DashboardCard>

      {/* Manage Credits Dialog */}
      {selectedResellerId && (
        <Dialog open={isCreditModalOpen} onOpenChange={setIsCreditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Credits</DialogTitle>
              <DialogDescription>
                Add or remove credits from this reseller's account.
              </DialogDescription>
            </DialogHeader>
            <CreditManageForm 
              resellerId={selectedResellerId} 
              type="add"
              onSuccess={() => {
                setIsCreditModalOpen(false);
                setSelectedResellerId(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
