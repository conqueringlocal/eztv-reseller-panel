
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { CustomerCredentials } from '@/utils/customerConsolidation';

interface ConnectionCardProps {
  connection: CustomerCredentials;
  totalConnections: number;
  index: number;
}

export function ConnectionCard({ connection, totalConnections, index }: ConnectionCardProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
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
  );
}
