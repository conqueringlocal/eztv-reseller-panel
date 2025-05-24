
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CustomerCredentials } from './CustomerCredentials';
import { Customer } from '@/contexts/AppContext';

interface CustomerCredentialsDialogProps {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendCredentials?: (customer: Customer, method: 'email' | 'sms') => void;
}

export function CustomerCredentialsDialog({ 
  customer, 
  open, 
  onOpenChange, 
  onSendCredentials 
}: CustomerCredentialsDialogProps) {
  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Customer IPTV Credentials</DialogTitle>
          <DialogDescription>
            Share these credentials with your customer for IPTV access
          </DialogDescription>
        </DialogHeader>
        <CustomerCredentials 
          customer={customer} 
          onSendCredentials={onSendCredentials}
        />
      </DialogContent>
    </Dialog>
  );
}
