import { paidOperationFailure, paidOperationKey, clearPaidOperationKey } from '@/utils/paidOperationFeedback';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getTotalConnections, getCustomerDisplayName } from '@/utils/customerConsolidation';
import { Users, CreditCard } from 'lucide-react';

interface AddConnectionDialogProps {
  customer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddConnectionDialog({
  customer,
  open,
  onOpenChange,
  onSuccess,
}: AddConnectionDialogProps) {
  const { user } = useAuth();
  const [planDuration, setPlanDuration] = useState<string>('1');
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = user?.role === 'admin';
  const currentConnections = getTotalConnections(customer);
  const displayName = getCustomerDisplayName(customer);
  const creditsRequired = isAdmin ? 0 : parseInt(planDuration);

  const handleAddConnection = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-connection-to-customer', {
        body: {
          customer_id: customer.id,
          operationKey: paidOperationKey('add',customer.id,parseInt(planDuration)),
          plan_duration: parseInt(planDuration),
        },
      });

      if (error) { let result; try { result = await error.context?.json(); } catch { /* Unknown outcome. */ } throw new Error(paidOperationFailure(result)); }

      if (data.success) {
        toast.success(`Connection ${data.connection_number} added successfully!`);
        clearPaidOperationKey('add',customer.id,parseInt(planDuration));
        window.dispatchEvent(new CustomEvent('creditsUpdated'));
        onSuccess();
        onOpenChange(false);
      } else {
        throw new Error(data.error || 'Failed to add connection');
      }
    } catch (error: any) {
      console.error('Error adding connection:', error);
      toast.error(error.message || 'Failed to add connection');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Connection</DialogTitle>
          <DialogDescription>
            Add a new connection to {displayName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Info */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Customer</span>
              <span className="text-sm">{displayName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Email</span>
              <span className="text-sm text-muted-foreground">{customer.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Connections</span>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Users size={12} />
                {currentConnections}
              </Badge>
            </div>
          </div>

          {/* Plan Duration */}
          <div className="space-y-2">
            <Label htmlFor="plan-duration">Plan Duration</Label>
            <Select value={planDuration} onValueChange={setPlanDuration}>
              <SelectTrigger id="plan-duration">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Month</SelectItem>
                <SelectItem value="3">3 Months</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Credit Cost */}
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard size={16} />
                <span className="font-medium">Cost</span>
              </div>
              {isAdmin ? (
                <Badge variant="default">FREE (Admin Override)</Badge>
              ) : (
                <span className="font-semibold">
                  {creditsRequired} {creditsRequired === 1 ? 'credit' : 'credits'}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleAddConnection} disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Connection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
