
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { ProviderSelect } from '@/components/customers/ProviderSelect';

interface AddSubResellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddSubResellerDialog: React.FC<AddSubResellerDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [availableCredits, setAvailableCredits] = useState<number>(0);
  const [loadingCredits, setLoadingCredits] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    credits: 100,
    provider: '8k',
  });

  // Fetch available credits when dialog opens
  useEffect(() => {
    if (open && user) {
      fetchAvailableCredits();
    }
  }, [open, user]);

  const fetchAvailableCredits = async () => {
    if (!user) return;
    
    setLoadingCredits(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching credits:', error);
        toast({
          title: "Error",
          description: "Failed to fetch your available credits",
          variant: "destructive",
        });
      } else {
        setAvailableCredits(data.credits || 0);
      }
    } catch (error) {
      console.error('Unexpected error fetching credits:', error);
    } finally {
      setLoadingCredits(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a sub-reseller",
        variant: "destructive",
      });
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    if (formData.credits < 100) {
      toast({
        title: "Error",
        description: "Minimum credit requirement is 100 credits for sub-resellers",
        variant: "destructive",
      });
      return;
    }

    if (formData.credits > availableCredits) {
      toast({
        title: "Error",
        description: `Insufficient credits. You have ${availableCredits} credits available, but trying to allocate ${formData.credits} credits.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log('Creating sub-reseller with data:', formData);
      
      const { data, error } = await supabase.functions.invoke('create-reseller', {
        body: {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          credits: formData.credits,
          provider: formData.provider,
          parent_reseller_id: user.id,
        },
      });

      if (error) {
        console.error('Error creating sub-reseller:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to create sub-reseller",
          variant: "destructive",
        });
        return;
      }

      console.log('Sub-reseller created successfully:', data);
      
      toast({
        title: "Success",
        description: `Sub-reseller created successfully! ${formData.credits} credits allocated. You have ${data.parentCreditsRemaining || 0} credits remaining.`,
      });

      // Reset form and close dialog
      setFormData({ name: '', email: '', password: '', credits: 100, provider: '8k' });
      onOpenChange(false);
      
      // Refresh the page to show the new sub-reseller
      window.location.reload();
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

  const handleCreditsChange = (value: number) => {
    // Ensure credits don't exceed available credits or go below minimum
    const clampedValue = Math.max(100, Math.min(value, availableCredits));
    handleInputChange('credits', clampedValue);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Sub-Reseller</DialogTitle>
          <DialogDescription>
            Create a new sub-reseller account under your organization.
          </DialogDescription>
        </DialogHeader>
        
        {loadingCredits ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading your available credits...</span>
          </div>
        ) : (
          <>
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-900">
                Available Credits: <span className="font-bold">{availableCredits}</span>
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Credits will be transferred from your account to the new sub-reseller.
              </p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Enter reseller name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter email address"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="Enter password (min 6 characters)"
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider">IPTV Provider</Label>
                <ProviderSelect
                  value={formData.provider}
                  onChange={(value) => handleInputChange('provider', value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="credits">
                  Credits to Allocate (Min: 100, Max: {availableCredits})
                </Label>
                <Input
                  id="credits"
                  type="number"
                  min="100"
                  max={availableCredits}
                  value={formData.credits}
                  onChange={(e) => handleCreditsChange(parseInt(e.target.value) || 100)}
                  placeholder={`Enter credits (100-${availableCredits})`}
                  required
                  disabled={availableCredits < 100}
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Sub-resellers require minimum 100 credits</span>
                  <span>Available: {availableCredits}</span>
                </div>
                {availableCredits < 100 && (
                  <p className="text-sm text-red-600">
                    You need at least 100 credits to create a sub-reseller.
                  </p>
                )}
                {formData.credits > availableCredits && (
                  <p className="text-sm text-red-600">
                    Cannot allocate more credits than available.
                  </p>
                )}
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
                  disabled={isLoading || availableCredits < 100 || formData.credits > availableCredits}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Sub-Reseller
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
