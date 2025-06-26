
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, Users } from 'lucide-react';
import { AddSubResellerDialog } from '@/components/resellers/AddSubResellerDialog';

export default function ResellerSubResellers() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sub-Resellers</h1>
            <p className="text-gray-600 mt-2">
              Manage your sub-resellers and monitor their activity
            </p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Sub-Reseller
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Your Sub-Resellers
            </CardTitle>
            <CardDescription>
              View and manage resellers under your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No sub-resellers yet</p>
              <p className="text-sm">
                Create your first sub-reseller to start building your network
              </p>
            </div>
          </CardContent>
        </Card>

        <AddSubResellerDialog 
          open={isAddDialogOpen} 
          onOpenChange={setIsAddDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}
