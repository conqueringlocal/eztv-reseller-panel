
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Users, Mail, CreditCard, RefreshCw } from 'lucide-react';
import { AddSubResellerDialog } from '@/components/resellers/AddSubResellerDialog';
import { useSubResellers } from '@/hooks/useSubResellers';
import { formatDistanceToNow } from 'date-fns';

export default function ResellerSubResellers() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { subResellers, isLoading, fetchSubResellers } = useSubResellers();

  const handleSubResellerCreated = () => {
    setIsAddDialogOpen(false);
    fetchSubResellers(); // Refresh the list
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sub-Resellers</h1>
            <p className="text-muted-foreground mt-2">
              Manage your sub-resellers and monitor their activity
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchSubResellers} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Sub-Reseller
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Your Sub-Resellers
              {subResellers.length > 0 && (
                <Badge variant="secondary">{subResellers.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              View and manage resellers under your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading sub-resellers...</p>
              </div>
            ) : subResellers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No sub-resellers yet</p>
                <p className="text-sm">
                  Create your first sub-reseller to start building your network
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {subResellers.map((subReseller) => (
                  <div key={subReseller.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{subReseller.name}</h3>
                          <Badge variant="outline">Level {subReseller.reseller_level || 2}</Badge>
                          {subReseller.provider && (
                            <Badge variant="secondary">{subReseller.provider.toUpperCase()}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            {subReseller.email}
                          </div>
                          <div className="flex items-center gap-1">
                            <CreditCard className="h-4 w-4" />
                            {subReseller.credits} credits
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {formatDistanceToNow(new Date(subReseller.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <AddSubResellerDialog 
          open={isAddDialogOpen} 
          onOpenChange={setIsAddDialogOpen}
          onSuccess={handleSubResellerCreated}
        />
      </div>
    </DashboardLayout>
  );
}
