
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ChangeProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reseller: {
    id: string;
    name: string;
    email: string;
    provider?: string;
  };
  onSuccess?: () => void;
}

export const ChangeProviderDialog: React.FC<ChangeProviderDialogProps> = ({
  open,
  onOpenChange,
  reseller,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>(reseller.provider || 'trex');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedProvider === (reseller.provider || 'trex')) {
      toast({
        title: "No Change",
        description: "The selected provider is the same as the current provider",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log('Changing provider for reseller:', reseller.id, 'to:', selectedProvider);
      
      const { data, error } = await supabase.functions.invoke('update-reseller-provider', {
        body: {
          reseller_id: reseller.id,
          new_provider: selectedProvider,
        },
      });

      if (error) {
        console.error('Error changing provider:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to change provider",
          variant: "destructive",
        });
        return;
      }

      console.log('Provider changed successfully:', data);
      
      toast({
        title: "Success",
        description: `Provider changed from ${data.old_provider} to ${data.new_provider} for ${reseller.name}`,
      });

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatProvider = (provider: string) => {
    return provider === '8k' ? '8K' : provider === 'trex' ? 'Trex' : provider;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Provider</DialogTitle>
          <DialogDescription>
            Change the IPTV provider for {reseller.name} ({reseller.email})
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-900">
              Current Provider: <span className="font-bold">{formatProvider(reseller.provider || 'trex')}</span>
            </p>
            <p className="text-xs text-blue-700 mt-1">
              Changing the provider will affect all future operations for this reseller.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">New Provider</Label>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trex">Trex</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || selectedProvider === (reseller.provider || 'trex')}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Provider
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
