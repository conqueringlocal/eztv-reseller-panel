import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Zap } from 'lucide-react';
import { FunnelCard } from '@/components/funnels/FunnelCard';
import { CreateFunnelDialog } from '@/components/funnels/CreateFunnelDialog';
import { useFunnels, Funnel } from '@/hooks/useFunnels';
import { useToast } from '@/hooks/use-toast';
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

export default function ResellerFunnels() {
  const { funnels, templates, isLoading, createFunnel, deleteFunnel, publishFunnel } = useFunnels();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [funnelToDelete, setFunnelToDelete] = useState<Funnel | null>(null);
  const { toast } = useToast();

  const handleEdit = (funnel: Funnel) => {
    // TODO: Implement funnel editor
    toast({
      title: 'Coming Soon',
      description: 'Funnel editor will be available soon',
    });
  };

  const handleDelete = async (funnel: Funnel) => {
    if (funnelToDelete) {
      await deleteFunnel(funnelToDelete.id);
      setFunnelToDelete(null);
    }
  };

  const handleTogglePublish = async (funnel: Funnel) => {
    await publishFunnel(funnel.id, !funnel.is_published);
  };

  const handlePreview = (funnel: Funnel) => {
    const url = funnel.custom_domain 
      ? `https://${funnel.custom_domain}`
      : `https://${funnel.subdomain}.streamlo.tv`;
    window.open(url, '_blank');
  };

  const handleCopyLink = (funnel: Funnel) => {
    const url = funnel.custom_domain 
      ? `https://${funnel.custom_domain}`
      : `https://${funnel.subdomain}.streamlo.tv`;
    
    navigator.clipboard.writeText(url);
    toast({
      title: 'Success',
      description: 'Funnel link copied to clipboard',
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading funnels...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Funnel Builder</h1>
            <p className="text-muted-foreground">
              Create high-converting landing pages for your IPTV business
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Funnel
          </Button>
        </div>

        {/* Empty State */}
        {funnels.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Zap className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No funnels yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Create your first funnel to start capturing leads and converting visitors into customers.
                Choose from our IPTV-optimized templates to get started quickly.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Funnel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Funnels Grid */}
        {funnels.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {funnels.map((funnel) => (
              <FunnelCard
                key={funnel.id}
                funnel={funnel}
                onEdit={handleEdit}
                onDelete={(f) => setFunnelToDelete(f)}
                onTogglePublish={handleTogglePublish}
                onPreview={handlePreview}
                onCopyLink={handleCopyLink}
              />
            ))}
          </div>
        )}

        {/* Stats Cards */}
        {funnels.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Funnels</CardDescription>
                <CardTitle className="text-2xl">{funnels.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Published</CardDescription>
                <CardTitle className="text-2xl">
                  {funnels.filter(f => f.is_published).length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Visits</CardDescription>
                <CardTitle className="text-2xl">
                  {funnels.reduce((sum, f) => sum + (f.analytics?.visits || 0), 0)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Conversion Rate</CardDescription>
                <CardTitle className="text-2xl">
                  {funnels.reduce((sum, f) => sum + (f.analytics?.conversion_rate || 0), 0).toFixed(1)}%
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>

      {/* Create Funnel Dialog */}
      <CreateFunnelDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        templates={templates}
        onCreateFunnel={createFunnel}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!funnelToDelete} onOpenChange={() => setFunnelToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Funnel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{funnelToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(funnelToDelete)} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}