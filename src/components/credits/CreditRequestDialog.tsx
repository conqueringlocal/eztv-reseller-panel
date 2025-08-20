import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CreditCard } from 'lucide-react';

interface CreditRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  creditPricePerUnit: number;
  parentResellerId: string;
}

export const CreditRequestDialog: React.FC<CreditRequestDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  creditPricePerUnit,
  parentResellerId,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    credits: 10,
    message: '',
  });

  const totalAmount = formData.credits * creditPricePerUnit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to request credits",
        variant: "destructive",
      });
      return;
    }

    if (formData.credits < 1) {
      toast({
        title: "Error",
        description: "You must request at least 1 credit",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('credit_requests')
        .insert({
          requester_id: user.id,
          parent_reseller_id: parentResellerId,
          credits_requested: formData.credits,
          price_per_credit: creditPricePerUnit,
          total_amount: totalAmount,
          message: formData.message,
        });

      if (error) {
        console.error('Error creating credit request:', error);
        toast({
          title: "Error",
          description: "Failed to create credit request",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Credit request for ${formData.credits} credits submitted successfully!`,
      });

      // Reset form and close dialog
      setFormData({ credits: 10, message: '' });
      onOpenChange(false);
      
      // Call onSuccess callback if provided
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

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Request Credits</DialogTitle>
          <DialogDescription>
            Request credits from your parent reseller. They will need to approve this request.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credits">Number of Credits</Label>
            <Input
              id="credits"
              type="number"
              min="1"
              value={formData.credits}
              onChange={(e) => handleInputChange('credits', parseInt(e.target.value) || 1)}
              placeholder="Enter number of credits"
              required
            />
            <div className="text-sm text-muted-foreground">
              <p>Price per credit: ${creditPricePerUnit.toFixed(2)}</p>
              <p className="font-semibold">Total cost: ${totalAmount.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (Optional)</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => handleInputChange('message', e.target.value)}
              placeholder="Add a note for your parent reseller..."
              rows={3}
            />
          </div>

          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-2 text-blue-900">
              <CreditCard size={16} />
              <span className="text-sm font-medium">Request Summary</span>
            </div>
            <div className="mt-2 text-sm text-blue-800">
              <p>Credits requested: {formData.credits}</p>
              <p>Price per credit: ${creditPricePerUnit.toFixed(2)}</p>
              <p className="font-semibold">Total amount: ${totalAmount.toFixed(2)}</p>
            </div>
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
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};