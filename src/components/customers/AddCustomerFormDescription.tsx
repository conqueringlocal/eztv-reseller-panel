
import React from 'react';

interface AddCustomerFormDescriptionProps {
  accountType: 'mag' | 'm3u';
  maxConnections: number;
}

export function AddCustomerFormDescription({ accountType, maxConnections }: AddCustomerFormDescriptionProps) {
  if (accountType === 'mag') {
    return (
      <span className="text-sm text-muted-foreground">
        Creating a MAG device account with MAC address authentication
      </span>
    );
  }

  if (maxConnections > 1) {
    return (
      <span className="text-sm text-muted-foreground">
        Creating an M3U account with {maxConnections} connections. This will create {maxConnections} linked accounts in the same customer group.
      </span>
    );
  }

  return (
    <span className="text-sm text-muted-foreground">
      Creating a single M3U account with username/password authentication
    </span>
  );
}
