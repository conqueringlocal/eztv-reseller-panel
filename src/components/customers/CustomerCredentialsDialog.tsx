
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  getCustomerDisplayName, 
  getTotalConnections, 
  getCustomerCredentials
} from '@/utils/customerConsolidation';
import { CustomerInfoCard } from './credentials/CustomerInfoCard';
import { ConnectionCard } from './credentials/ConnectionCard';
import { CredentialsActions } from './credentials/CredentialsActions';

interface CustomerCredentialsDialogProps {
  customer: any;
  onClose: () => void;
}

export function CustomerCredentialsDialog({ customer, onClose }: CustomerCredentialsDialogProps) {
  const displayName = getCustomerDisplayName(customer);
  const totalConnections = getTotalConnections(customer);
  const credentials = getCustomerCredentials(customer);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customer Credentials - {displayName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <CustomerInfoCard customer={customer} />

          {credentials.map((connection, index) => (
            <ConnectionCard
              key={`connection-${connection.connection_number || index}`}
              connection={connection}
              totalConnections={totalConnections}
              index={index}
            />
          ))}

          <CredentialsActions customer={customer} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
