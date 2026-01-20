import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getCustomerDisplayName, 
  getTotalConnections,
  getFieldValue 
} from '@/utils/customerConsolidation';
import { Users, Merge, AlertTriangle } from 'lucide-react';

interface ConvertToMultiConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceCustomer: any;
  allCustomers: any[];
  onSuccess: () => void;
}

export function ConvertToMultiConnectionDialog({
  open,
  onOpenChange,
  sourceCustomer,
  allCustomers,
  onSuccess,
}: ConvertToMultiConnectionDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'merge' | 'convert'>('merge');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');

  // Filter out the source customer and get eligible merge targets
  const eligibleTargets = useMemo(() => {
    const resellerId = getFieldValue(sourceCustomer, 'reseller_id', 'resellerId');
    
    return allCustomers.filter((c) => {
      // Must be same reseller
      if (getFieldValue(c, 'reseller_id', 'resellerId') !== resellerId) return false;
      // Must not be the source customer
      if (c.id === sourceCustomer.id) return false;
      // Must be active (not cancelled)
      if (c.status === 'cancelled') return false;
      return true;
    });
  }, [allCustomers, sourceCustomer]);

  const sourceDisplayName = getCustomerDisplayName(sourceCustomer);
  const isTrial = getFieldValue(sourceCustomer, 'is_trial', 'isTrial');

  const handleMerge = async () => {
    if (!selectedTargetId) {
      toast.error('Please select a target customer');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('merge-customer-into-group', {
        body: {
          sourceCustomerId: sourceCustomer.id,
          targetCustomerId: selectedTargetId,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to merge customers');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Merge operation failed');
      }

      toast.success(`Successfully merged ${sourceDisplayName} into the target customer`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error merging customers:', error);
      toast.error(`Failed to merge: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConvert = async () => {
    setIsSubmitting(true);

    try {
      // For converting a single trial to a multi-connection capable account,
      // we just need to initialize the connection_list with the current credentials
      const sourceUsername = getFieldValue(sourceCustomer, 'username', 'username');
      const sourcePassword = getFieldValue(sourceCustomer, 'password', 'password');
      const sourceM3uUrl = getFieldValue(sourceCustomer, 'm3u_url', 'm3uUrl');
      const sourceExpiration = getFieldValue(sourceCustomer, 'expiration_date', 'expirationDate');

      const connectionList = [
        {
          connection_number: 1,
          username: sourceUsername,
          password: sourcePassword,
          m3u_url: sourceM3uUrl,
          expiration_date: sourceExpiration,
          status: 'active',
        },
      ];

      const { error } = await supabase
        .from('customers')
        .update({
          connection_list: connectionList as any,
          total_connections: 1,
          is_trial: false,
        })
        .eq('id', sourceCustomer.id);

      if (error) {
        throw error;
      }

      toast.success(`${sourceDisplayName} converted to multi-connection format. You can now add additional connections.`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error converting customer:', error);
      toast.error(`Failed to convert: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (mode === 'merge') {
      handleMerge();
    } else {
      handleConvert();
    }
  };

  const selectedTarget = eligibleTargets.find((c) => c.id === selectedTargetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge or Convert Customer
          </DialogTitle>
          <DialogDescription>
            Choose how to handle {sourceDisplayName}'s account.
            {isTrial && (
              <Badge variant="secondary" className="ml-2">
                Trial Account
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <RadioGroup
            value={mode}
            onValueChange={(value: 'merge' | 'convert') => setMode(value)}
            className="space-y-4"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem value="merge" id="merge" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="merge" className="text-base font-medium cursor-pointer">
                  Merge into existing customer
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Move this account's connection to another customer. The current record will be deleted.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem value="convert" id="convert" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="convert" className="text-base font-medium cursor-pointer">
                  Convert to multi-connection format
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Keep this as a standalone customer but enable multi-connection support for future additions.
                </p>
              </div>
            </div>
          </RadioGroup>

          {mode === 'merge' && (
            <div className="space-y-3">
              <Label>Select target customer</Label>
              <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer to merge into..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleTargets.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No eligible customers found
                    </SelectItem>
                  ) : (
                    eligibleTargets.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        <div className="flex items-center gap-2">
                          <span>{getCustomerDisplayName(customer)}</span>
                          <Badge variant="outline" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {getTotalConnections(customer)}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {selectedTarget && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{sourceDisplayName}</strong>'s connection will be added to{' '}
                    <strong>{getCustomerDisplayName(selectedTarget)}</strong>.
                    The source customer record will be deleted after the merge.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {mode === 'convert' && (
            <Alert>
              <Users className="h-4 w-4" />
              <AlertDescription>
                This will initialize {sourceDisplayName}'s account with multi-connection support.
                You can then use "Add Connection" to add more devices.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (mode === 'merge' && !selectedTargetId)}
          >
            {isSubmitting
              ? 'Processing...'
              : mode === 'merge'
              ? 'Merge Customer'
              : 'Convert Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
