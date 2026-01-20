
import React, { useState } from 'react';
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
import { Copy, Eye, EyeOff, ExternalLink, RefreshCw, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { 
  getConnectionCredentials,
  getCustomerDisplayName,
  isConsolidatedCustomer,
  getTotalConnections
} from '@/utils/customerConsolidation';
import { RenewSingleConnectionDialog } from './RenewSingleConnectionDialog';
import { EditConnectionCredentialsDialog } from './credentials/EditConnectionCredentialsDialog';
import { useAuth } from '@/contexts/AuthContext';

interface CustomerCredentialsDialogProps {
  customer: any;
  onClose: () => void;
}

export function CustomerCredentialsDialog({ customer, onClose }: CustomerCredentialsDialogProps) {
  const { user } = useAuth();
  const [showPasswords, setShowPasswords] = useState<{ [key: number]: boolean }>({});
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<{
    connectionNumber: number;
    expirationDate: string;
  } | null>(null);
  const [editingConnection, setEditingConnection] = useState<any>(null);
  
  const isAdmin = user?.role === 'admin';
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

  const getConnectionExpirationDate = (connectionNumber: number): string => {
    // For consolidated customers, check connection_list
    if (customer.connection_list && Array.isArray(customer.connection_list)) {
      const connection = customer.connection_list.find(
        (conn: any) => conn.connection_number === connectionNumber
      );
      if (connection?.expiration_date) {
        return connection.expiration_date;
      }
    }
    // Fall back to top-level expiration date
    return customer.expiration_date || customer.expirationDate || '';
  };

  const handleRenewConnection = (connectionNumber: number) => {
    const expirationDate = getConnectionExpirationDate(connectionNumber);
    setSelectedConnection({ connectionNumber, expirationDate });
    setRenewDialogOpen(true);
  };

  const handleRenewalSuccess = () => {
    toast.success("Connection renewed! Refreshing...");
    setTimeout(() => window.location.reload(), 1000);
  };

  const handleEditConnection = (credential: any) => {
    setEditingConnection(credential);
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    toast.success("Credentials updated! Refreshing...");
    setTimeout(() => window.location.reload(), 1000);
  };

  // Build connection list for editing
  const getConnectionListForEditing = (): any[] => {
    if (customer.connection_list && Array.isArray(customer.connection_list)) {
      return customer.connection_list;
    }
    // For single connection customers, create a list from primary credentials
    return [{
      connection_number: 1,
      username: customer.username,
      password: customer.password,
      m3u_url: customer.m3u_url,
      expiration_date: customer.expiration_date || customer.expirationDate,
      status: customer.status || 'active',
    }];
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
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
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
                      <p className="text-sm text-muted-foreground">
                        Expires: {new Date(getConnectionExpirationDate(credential.connection_number)).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditConnection(credential)}
                          className="shrink-0"
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRenewConnection(credential.connection_number)}
                        className="shrink-0"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Renew
                      </Button>
                    </div>
                  </div>
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

        {selectedConnection && (
          <RenewSingleConnectionDialog
            open={renewDialogOpen}
            onOpenChange={setRenewDialogOpen}
            customerId={customer.id}
            customerName={customerName}
            connectionNumber={selectedConnection.connectionNumber}
            currentExpirationDate={selectedConnection.expirationDate}
            onSuccess={handleRenewalSuccess}
          />
        )}

        {editingConnection && (
          <EditConnectionCredentialsDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            customerId={customer.id}
            customerName={customerName}
            connection={editingConnection}
            connectionList={getConnectionListForEditing()}
            onSuccess={handleEditSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
