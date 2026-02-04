
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import { CreditManageForm } from '@/components/credits/CreditManageForm';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { CustomerTable } from '@/components/customers/CustomerTable';
import { HighLevelSettings } from '@/components/resellers/HighLevelSettings';
import { AdminApiKeyManager } from '@/components/api-keys/AdminApiKeyManager';
import { SingleResellerSsoManager } from '@/components/sso/SingleResellerSsoManager';
import { ArrowLeft, Users, DollarSign, Activity, Calendar, Key, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export default function AdminResellerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { resellers, customers, creditLogs, addCredits, removeCredits, refreshData } = useApp();
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteAction, setDeleteAction] = useState<'transfer' | 'delete'>('transfer');
  const [targetResellerId, setTargetResellerId] = useState<string>('');

  const reseller = resellers.find(r => r.id === id);
  const resellerCustomers = customers.filter(c => c.resellerId === id);
  const resellerCreditLogs = creditLogs.filter(log => log.reseller_id === id);

  // Get other resellers for transfer dropdown
  const otherResellers = useMemo(() => {
    return resellers.filter(r => r.id !== id);
  }, [resellers, id]);

  useEffect(() => {
    if (!id) {
      console.warn('No reseller ID provided');
      navigate('/admin/resellers');
    }
  }, [id, navigate]);

  const handleAddCredits = async (credits: number, notes?: string) => {
    if (!id) {
      toast.error('Reseller ID is missing.');
      return;
    }

    const success = await addCredits(id, credits, notes);
    if (success) {
      toast.success(`${credits} credits added successfully`);
      setShowCreditForm(false);
    } else {
      toast.error('Failed to add credits');
    }
  };

  const handleRemoveCredits = async (credits: number, notes?: string) => {
    if (!id) {
      toast.error('Reseller ID is missing.');
      return;
    }

    const success = await removeCredits(id, credits, notes);
    if (success) {
      toast.success(`${credits} credits removed successfully`);
      setShowCreditForm(false);
    } else {
      toast.error('Failed to remove credits');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!id || !reseller) return;

    const customerCount = resellerCustomers.length;

    // If there are customers, we need to either transfer or delete them
    if (customerCount > 0) {
      if (deleteAction === 'transfer') {
        if (!targetResellerId) {
          toast.error('Please select a reseller to transfer customers to');
          return;
        }

        setIsDeleting(true);
        try {
          const { data, error } = await supabase.functions.invoke('transfer-customers', {
            body: { 
              sourceResellerId: id,
              targetResellerId,
              deleteSourceReseller: true
            }
          });

          if (error) {
            const errorMessage = data?.error || error.message || 'Failed to transfer customers';
            toast.error(errorMessage);
            return;
          }

          if (data?.success) {
            toast.success(data.message || `Transferred ${data.customersTransferred} customers and deleted reseller`);
            navigate('/admin/resellers');
          } else {
            toast.error(data?.error || 'Failed to transfer customers');
          }
        } catch (error: any) {
          console.error('Error transferring customers:', error);
          toast.error(error.message || 'Failed to transfer customers');
        } finally {
          setIsDeleting(false);
        }
      } else {
        // Delete all customers then delete reseller
        setIsDeleting(true);
        try {
          const { data, error } = await supabase.functions.invoke('admin-cleanup-customers', {
            body: { 
              resellerId: id,
              deleteReseller: true
            }
          });

          if (error) {
            const errorMessage = data?.error || error.message || 'Failed to delete customers';
            toast.error(errorMessage);
            return;
          }

          if (data?.success) {
            toast.success(data.message || `Deleted ${data.customersDeleted} customers and reseller`);
            navigate('/admin/resellers');
          } else {
            toast.error(data?.error || 'Failed to delete');
          }
        } catch (error: any) {
          console.error('Error deleting:', error);
          toast.error(error.message || 'Failed to delete');
        } finally {
          setIsDeleting(false);
        }
      }
    } else {
      // No customers, just delete the reseller directly
      setIsDeleting(true);
      try {
        const { data, error } = await supabase.functions.invoke('delete-reseller', {
          body: { resellerId: id }
        });

        if (error) {
          const errorMessage = data?.error || error.message || 'Failed to delete reseller';
          toast.error(errorMessage);
          return;
        }

        if (data?.success) {
          toast.success(`Reseller "${reseller.name}" has been deleted`);
          navigate('/admin/resellers');
        } else {
          toast.error(data?.error || 'Failed to delete reseller');
        }
      } catch (error: any) {
        console.error('Error deleting reseller:', error);
        toast.error(error.message || 'Failed to delete reseller');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  if (!reseller) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">
          <p className="text-gray-500">Reseller not found</p>
          <Button onClick={() => navigate('/admin/resellers')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Resellers
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const totalCustomers = resellerCustomers.length;
  const totalCredits = reseller.credits;
  const recentActivity = resellerCreditLogs.slice(0, 5);

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <Button onClick={() => navigate('/admin/resellers')} variant="ghost" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Resellers
            </Button>
            <h1 className="text-2xl font-bold mb-2">{reseller.name}</h1>
            <p className="text-gray-500">Manage reseller account and monitor activity</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              Reseller ID: {reseller.id}
            </Badge>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Reseller
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Total Customers
            </CardTitle>
            <CardDescription>Number of active customers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Available Credits
            </CardTitle>
            <CardDescription>Credits available for new accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCredits}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Last 5 credit transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.map(log => (
              <div key={log.id} className="py-2">
                {log.action}: {log.credits_used} credits - {new Date(log.date).toLocaleDateString()}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <HighLevelSettings resellerId={id!} />
      </div>

      <div className="mb-6">
        <AdminApiKeyManager resellerId={id!} resellerName={reseller.name} />
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              SSO Login Tokens
            </CardTitle>
            <CardDescription>
              Manage secure single sign-on tokens for HighLevel integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SingleResellerSsoManager resellerId={id!} resellerName={reseller.name} />
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Manage Credits</CardTitle>
                <CardDescription>Add or remove credits from this reseller</CardDescription>
              </div>
              <Button onClick={() => setShowCreditForm(!showCreditForm)}>
                {showCreditForm ? 'Hide Forms' : 'Show Forms'}
              </Button>
            </div>
          </CardHeader>
          {showCreditForm && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-green-700">Add Credits</h3>
                  <CreditManageForm 
                    resellerId={id!} 
                    type="add" 
                    onSuccess={() => setShowCreditForm(false)} 
                  />
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-red-700">Remove Credits</h3>
                  <CreditManageForm 
                    resellerId={id!} 
                    type="remove" 
                    onSuccess={() => setShowCreditForm(false)} 
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <div className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Credit Log
            </CardTitle>
            <CardDescription>History of credit transactions for this reseller</CardDescription>
          </CardHeader>
          <CardContent>
            <CreditLogTable logs={resellerCreditLogs} />
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customers
            </CardTitle>
            <CardDescription>List of customers associated with this reseller</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerTable customers={resellerCustomers} onRefresh={refreshData} />
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reseller</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  You are about to delete <strong>{reseller.name}</strong> ({reseller.email}).
                </p>
                
                {resellerCustomers.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                    <p className="text-amber-800 font-medium">
                      This reseller has {resellerCustomers.length} customer(s).
                    </p>
                    <p className="text-amber-700 text-sm mt-1">
                      Choose what to do with their customers:
                    </p>
                  </div>
                )}

                {resellerCustomers.length > 0 && (
                  <RadioGroup value={deleteAction} onValueChange={(v) => setDeleteAction(v as 'transfer' | 'delete')}>
                    <div className="flex items-start space-x-2 p-3 rounded-md border hover:bg-muted/50">
                      <RadioGroupItem value="transfer" id="transfer" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="transfer" className="font-medium cursor-pointer">
                          Transfer customers to another reseller
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Move all customers to a different reseller before deletion
                        </p>
                        {deleteAction === 'transfer' && (
                          <div className="mt-2">
                            <Select value={targetResellerId} onValueChange={setTargetResellerId}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select target reseller" />
                              </SelectTrigger>
                              <SelectContent>
                                {otherResellers.map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    <span className="flex items-center gap-2">
                                      {r.name}
                                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-muted-foreground text-xs">
                                        {customers.filter(c => c.resellerId === r.id).length} existing customers
                                      </span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-2 p-3 rounded-md border border-destructive/30 hover:bg-destructive/5">
                      <RadioGroupItem value="delete" id="delete" className="mt-1" />
                      <div>
                        <Label htmlFor="delete" className="font-medium cursor-pointer text-destructive">
                          Delete all customers permanently
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          This will permanently delete all customer data
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                )}

                <p className="text-destructive text-sm font-medium">
                  This action cannot be undone. All reseller data (credit logs, API keys, SSO tokens, funnels) will be permanently deleted.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting || (deleteAction === 'transfer' && !targetResellerId && resellerCustomers.length > 0)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Processing...' : deleteAction === 'transfer' && resellerCustomers.length > 0 ? 'Transfer & Delete' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
