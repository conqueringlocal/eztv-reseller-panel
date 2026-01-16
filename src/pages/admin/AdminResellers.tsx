
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { CreditManageForm } from '@/components/credits/CreditManageForm';
import { AddResellerForm } from '@/components/resellers/AddResellerForm';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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

export default function AdminResellers() {
  const { resellers, customers, refreshData } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedResellerId, setSelectedResellerId] = useState<string | null>(null);
  const [creditAction, setCreditAction] = useState<'add' | 'remove'>('add');
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [isAddResellerModalOpen, setIsAddResellerModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [resellerToDelete, setResellerToDelete] = useState<{ id: string; name: string; email: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
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
  
  // Get active connections per reseller - updated to exclude cancelled customers
  const getActiveConnectionsCount = (resellerId: string) => {
    return customers.filter(c => c.resellerId === resellerId && c.status === 'active' && !c.isDeactivated).length;
  };

  // Check if reseller has low credits (< 10)
  const hasLowCredits = (credits: number) => {
    return credits < 10;
  };

  // Handle manage credits click
  const handleManageCredits = (resellerId: string, action: 'add' | 'remove') => {
    setSelectedResellerId(resellerId);
    setCreditAction(action);
    setIsCreditModalOpen(true);
  };

  // Handle add reseller success
  const handleAddResellerSuccess = () => {
    setIsAddResellerModalOpen(false);
    refreshData();
  };

  // Handle delete reseller click
  const handleDeleteClick = (reseller: { id: string; name: string; email: string }) => {
    setResellerToDelete(reseller);
    setIsDeleteDialogOpen(true);
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!resellerToDelete) return;

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-reseller', {
        body: { resellerId: resellerToDelete.id }
      });

      // Handle edge function errors - the error object contains the response body
      if (error) {
        // Try to extract error message from the response
        const errorMessage = data?.error || error.message || 'Failed to delete reseller';
        toast.error(errorMessage);
        return;
      }

      if (data?.success) {
        toast.success(`Reseller "${resellerToDelete.name}" has been deleted`);
        setIsDeleteDialogOpen(false);
        setResellerToDelete(null);
        refreshData();
      } else {
        // Edge function returned success: false
        toast.error(data?.error || 'Failed to delete reseller');
      }
    } catch (error: any) {
      console.error('Error deleting reseller:', error);
      toast.error(error.message || 'Failed to delete reseller');
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
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
            <Button 
              onClick={() => setIsAddResellerModalOpen(true)}
              className="bg-eztv-700 hover:bg-eztv-800"
            >
              Add Reseller
            </Button>
          </div>
          
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Connections</TableHead>
                  <TableHead>Branding</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                      No resellers found matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResellers.map((reseller) => (
                    <TableRow key={reseller.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{reseller.name}</TableCell>
                      <TableCell>{reseller.email}</TableCell>
                      <TableCell>
                        {hasLowCredits(reseller.credits) ? (
                          <div className="flex items-center">
                            <CreditsBadge credits={reseller.credits} />
                            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Low</span>
                          </div>
                        ) : (
                          <CreditsBadge credits={reseller.credits} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{getActiveConnectionsCount(reseller.id)}</span>
                          <span className="text-gray-500 text-xs ml-1">
                            of {getCustomerCount(reseller.id)} total
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {reseller.logoUrl && (
                            <div className="h-6 w-6 bg-gray-100 rounded overflow-hidden">
                              <img 
                                src={reseller.logoUrl} 
                                alt="Logo" 
                                className="h-full w-full object-contain"
                              />
                            </div>
                          )}
                          {reseller.accentColor && (
                            <div 
                              className="h-4 w-4 rounded-full border"
                              style={{ backgroundColor: reseller.accentColor }}
                            ></div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleManageCredits(reseller.id, 'add')}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                          >
                            Add Credits
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleManageCredits(reseller.id, 'remove')}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            Remove Credits
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => navigate(`/admin/resellers/${reseller.id}`)}
                          >
                            Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick({ id: reseller.id, name: reseller.name, email: reseller.email })}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Add Reseller Dialog */}
      <Dialog open={isAddResellerModalOpen} onOpenChange={setIsAddResellerModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Reseller</DialogTitle>
            <DialogDescription>
              Create a new reseller account with login credentials, initial credits, and IPTV provider selection.
            </DialogDescription>
          </DialogHeader>
          <AddResellerForm onSuccess={handleAddResellerSuccess} />
        </DialogContent>
      </Dialog>

      {/* Manage Credits Dialog */}
      {selectedResellerId && (
        <Dialog open={isCreditModalOpen} onOpenChange={setIsCreditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {creditAction === 'add' ? 'Add Credits' : 'Remove Credits'}
              </DialogTitle>
              <DialogDescription>
                {creditAction === 'add' 
                  ? 'Add credits to this reseller\'s account.'
                  : 'Remove credits from this reseller\'s account.'
                }
              </DialogDescription>
            </DialogHeader>
            <CreditManageForm 
              resellerId={selectedResellerId!} 
              type={creditAction}
              onSuccess={() => {
                setIsCreditModalOpen(false);
                setSelectedResellerId(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reseller</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to permanently delete the reseller{' '}
                <strong>{resellerToDelete?.name}</strong> ({resellerToDelete?.email})?
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone. All associated data including credit logs, 
                API keys, SSO tokens, and funnels will be permanently deleted.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Reseller'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
