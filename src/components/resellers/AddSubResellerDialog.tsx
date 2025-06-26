
import React, { useState } from 'react';
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
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    credits: 0,
  });

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

    setIsLoading(true);

    try {
      console.log('Creating sub-reseller with data:', formData);
      
      const { data, error } = await supabase.functions.invoke('create-reseller', {
        body: {
          name: formData.name,
          email: formData.email,
          credits: formData.credits,
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
        description: "Sub-reseller created successfully",
      });

      // Reset form and close dialog
      setFormData({ name: '', email: '', credits: 0 });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Sub-Reseller</DialogTitle>
          <DialogDescription>
            Create a new sub-reseller account under your organization.
          </DialogDescription>
        </DialogHeader>
        
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
            <Label htmlFor="credits">Initial Credits</Label>
            <Input
              id="credits"
              type="number"
              min="0"
              value={formData.credits}
              onChange={(e) => handleInputChange('credits', parseInt(e.target.value) || 0)}
              placeholder="Enter initial credits"
              required
            />
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
              Create Sub-Reseller
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
