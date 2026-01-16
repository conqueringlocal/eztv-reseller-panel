
import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, Users, DollarSign, Activity, Calendar, Key, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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

  const reseller = resellers.find(r => r.id === id);
  const resellerCustomers = customers.filter(c => c.resellerId === id);
  const resellerCreditLogs = creditLogs.filter(log => log.reseller_id === id);

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

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-reseller', {
        body: { resellerId: id }
      });

      if (error) throw error;

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
      setIsDeleteDialogOpen(false);
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
        <HighLevelSettings resellerId={id!} isAdminView={true} />
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reseller</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to permanently delete the reseller{' '}
                <strong>{reseller.name}</strong> ({reseller.email})?
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
