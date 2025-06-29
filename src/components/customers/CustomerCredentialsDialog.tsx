
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { 
  getConnectionCredentials,
  getCustomerDisplayName,
  isConsolidatedCustomer,
  getTotalConnections
} from '@/utils/customerConsolidation';

interface CustomerCredentialsDialogProps {
  customer: any;
  onClose: () => void;
}

export function CustomerCredentialsDialog({ customer, onClose }: CustomerCredentialsDialogProps) {
  const [showPasswords, setShowPasswords] = React.useState<{ [key: number]: boolean }>({});
  
  const customerName = getCustomerDisplayName(customer);
  const totalConnections = getTotalConnections(customer);
  const connectionCredentials = getConnectionCredentials(customer);
  const isConsolidated = isConsolidatedCustomer(customer);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} copied to clipboard`);
  };

  const togglePasswordVisibility = (connectionNumber: number) => {
    setShowPasswords(prev => ({
      ...prev,
      [connectionNumber]: !prev[connectionNumber]
    }));
  };

  const openM3UUrl = (url: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Customer Credentials - {customerName}
            {isConsolidated && totalConnections > 1 && (
              <Badge variant="secondary">
                {totalConnections} Connections
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {totalConnections === 1 
              ? 'View and copy the login credentials for this customer.'
              : `View and copy the login credentials for all ${totalConnections} connections.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {connectionCredentials.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-gray-500">No credentials available for this customer.</p>
              </CardContent>
            </Card>
          ) : (
            connectionCredentials.map((credential, index) => (
              <Card key={index} className="border-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {totalConnections > 1 ? (
                      <>
                        Connection {credential.connection_number}
                        {credential.status && (
                          <Badge variant={credential.status === 'active' ? 'default' : 'secondary'}>
                            {credential.status}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <>
                        Credentials
                        {credential.status && (
                          <Badge variant={credential.status === 'active' ? 'default' : 'secondary'}>
                            {credential.status}
                          </Badge>
                        )}
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {/* Username */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Username</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={credential.username || 'Not available'}
                          readOnly
                          className="flex-1 px-3 py-2 border rounded-md bg-gray-50 text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(credential.username || '', 'Username')}
                          disabled={!credential.username}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Password</label>
                      <div className="flex items-center gap-2">
                        <input
                          type={showPasswords[credential.connection_number] ? 'text' : 'password'}
                          value={credential.password || 'Not available'}
                          readOnly
                          className="flex-1 px-3 py-2 border rounded-md bg-gray-50 text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => togglePasswordVisibility(credential.connection_number)}
                          disabled={!credential.password}
                        >
                          {showPasswords[credential.connection_number] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(credential.password || '', 'Password')}
                          disabled={!credential.password}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* M3U URL */}
                    {credential.m3u_url && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">M3U URL</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={credential.m3u_url}
                            readOnly
                            className="flex-1 px-3 py-2 border rounded-md bg-gray-50 text-sm"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openM3UUrl(credential.m3u_url!)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(credential.m3u_url!, 'M3U URL')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
