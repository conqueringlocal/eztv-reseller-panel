
import React from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { formatCredentialsForDisplay, getCustomerDisplayName } from '@/utils/customerConsolidation';

interface CredentialsActionsProps {
  customer: any;
}

export function CredentialsActions({ customer }: CredentialsActionsProps) {
  const displayName = getCustomerDisplayName(customer);

  const copyAllCredentials = () => {
    const formattedCredentials = formatCredentialsForDisplay(customer);
    navigator.clipboard.writeText(formattedCredentials);
    toast.success('All credentials copied to clipboard');
  };

  const downloadCredentials = () => {
    const formattedCredentials = formatCredentialsForDisplay(customer);
    const blob = new Blob([formattedCredentials], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayName.replace(/\s+/g, '_')}_credentials.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Credentials downloaded');
  };

  return (
    <div className="flex justify-end space-x-2 pt-4 border-t">
      <Button
        variant="outline"
        onClick={copyAllCredentials}
        className="flex items-center gap-2"
      >
        <Copy size={16} />
        Copy All Credentials
      </Button>
      
      <Button
        variant="outline"
        onClick={downloadCredentials}
        className="flex items-center gap-2"
      >
        <Download size={16} />
        Download as Text
      </Button>
    </div>
  );
}
