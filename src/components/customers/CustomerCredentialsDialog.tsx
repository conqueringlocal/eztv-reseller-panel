
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { 
  isConsolidatedCustomer, 
  getCustomerDisplayName, 
  getTotalConnections, 
  getCustomerCredentials,
  formatCredentialsForDisplay
} from '@/utils/consolidatedCustomerUtils';

interface CustomerCredentialsDialogProps {
  customer: any;
  onClose: () => void;
}

export function CustomerCredentialsDialog({ customer, onClose }: CustomerCredentialsDialogProps) {
  const { user } = useAuth();
  const displayName = getCustomerDisplayName(customer);
  const totalConnections = getTotalConnections(customer);
  const credentials = getCustomerCredentials(customer);
  
  // Check if current user is admin
  const isAdmin = user?.role === 'admin';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

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
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <DialogTitle>Customer Credentials - {displayName}</DialogTitle>
              {totalConnections > 1 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Users size={12} />
                  {totalConnections} Connections
                </Badge>
              )}
              {isConsolidatedCustomer(customer) && (
                <Badge variant="outline" className="text-xs">
                  Consolidated Account
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid gap-4 ${isAdmin ? 'grid-cols-2' : 'grid-cols-2'}`}>
                <div>
                  <p className="text-sm font-medium text-gray-500">Name</p>
                  <p className="text-sm">{displayName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <p className="text-sm">{customer.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Connections</p>
                  <p className="text-sm">{totalConnections}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Device Type</p>
                  <p className="text-sm">{customer.device_type || 'Not specified'}</p>
                </div>
                {/* Only show provider field to admin users */}
                {isAdmin && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Provider</p>
                    <p className="text-sm">{customer.provider || 'Default'}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-500">Status</p>
                  <Badge className={
                    customer.status === 'active' ? 'bg-green-100 text-green-800' :
                    customer.status === 'expired' ? 'bg-red-100 text-red-800' :
                    customer.status === 'expiring_soon' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }>
                    {customer.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {credentials.map((connection, index) => (
            <Card key={`connection-${connection.connection_number || index}`}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {totalConnections > 1 ? `Connection ${connection.connection_number}` : 'IPTV Credentials'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-500">Username</label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(connection.username, 'Username')}
                          className="h-6 px-2"
                        >
                          <Copy size={12} />
                        </Button>
                      </div>
                      <p className="text-sm font-mono bg-gray-50 p-2 rounded border">
                        {connection.username}
                      </p>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-500">Password</label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(connection.password, 'Password')}
                          className="h-6 px-2"
                        >
                          <Copy size={12} />
                        </Button>
                      </div>
                      <p className="text-sm font-mono bg-gray-50 p-2 rounded border">
                        {connection.password}
                      </p>
                    </div>
                  </div>

                  {connection.m3u_url && (
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-500">M3U URL</label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(connection.m3u_url!, 'M3U URL')}
                          className="h-6 px-2"
                        >
                          <Copy size={12} />
                        </Button>
                      </div>
                      <p className="text-sm font-mono bg-gray-50 p-2 rounded border break-all">
                        {connection.m3u_url}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-gray-500">Connection Status</label>
                    <Badge className={
                      connection.status === 'active' ? 'bg-green-100 text-green-800' :
                      connection.status === 'expired' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }>
                      {connection.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
