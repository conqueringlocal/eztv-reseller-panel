
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Eye, EyeOff, Mail, MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Customer } from '@/contexts/AppContext';
import { ConsolidatedCustomer } from '@/utils/customerGrouping';

interface CustomerCredentialsProps {
  customer: Customer | ConsolidatedCustomer;
  onSendCredentials?: (customer: Customer, method: 'email' | 'sms') => void;
}

function isConsolidatedCustomer(customer: Customer | ConsolidatedCustomer): customer is ConsolidatedCustomer {
  return 'connectionDetails' in customer && 'totalConnections' in customer;
}

export function CustomerCredentials({ customer, onSendCredentials }: CustomerCredentialsProps) {
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});

  const togglePasswordVisibility = (index: number) => {
    setShowPasswords(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const copyAllCredentials = async () => {
    let credentialsText = `IPTV Account Details for ${customer.name}\n`;
    
    if (isConsolidatedCustomer(customer)) {
      credentialsText += `Total Connections: ${customer.totalConnections}\n`;
      credentialsText += `Server: my8k.me\n`;
      credentialsText += `Expires: ${new Date(customer.expirationDate).toLocaleDateString()}\n\n`;
      
      customer.connectionDetails.forEach((conn, index) => {
        credentialsText += `Connection ${conn.connectionNumber}:\n`;
        credentialsText += `Username: ${conn.username}\n`;
        credentialsText += `Password: ${conn.password}\n`;
        if (conn.macAddress) {
          credentialsText += `MAC Address: ${conn.macAddress}\n`;
        }
        if (conn.m3uUrl) {
          credentialsText += `M3U URL: ${conn.m3uUrl}\n`;
        }
        credentialsText += '\n';
      });
    } else {
      credentialsText += `Username: ${customer.username}\n`;
      credentialsText += `Password: ${customer.password}\n`;
      credentialsText += `Server: my8k.me\n`;
      credentialsText += `Expires: ${new Date(customer.expirationDate).toLocaleDateString()}\n`;
      credentialsText += `Max Connections: ${customer.maxConnections || 1}\n`;
      if (customer.m3uUrl) {
        credentialsText += `M3U URL: ${customer.m3uUrl}\n`;
      }
    }

    try {
      await navigator.clipboard.writeText(credentialsText.trim());
      toast.success('All credentials copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy credentials');
    }
  };

  const handleSendCredentials = (method: 'email' | 'sms') => {
    if (onSendCredentials) {
      // For consolidated customers, use the first connection entry
      const customerToSend = isConsolidatedCustomer(customer) ? customer.connectionEntries[0] : customer;
      onSendCredentials(customerToSend, method);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          IPTV Account Credentials
          <div className="flex gap-2">
            {onSendCredentials && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendCredentials('email')}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendCredentials('sms')}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  SMS
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={copyAllCredentials}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy All
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Customer: {customer.name} ({customer.email})
          {isConsolidatedCustomer(customer) && (
            <span className="block text-sm mt-1">
              Total Connections: {customer.totalConnections}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isConsolidatedCustomer(customer) ? (
          // Show multiple connections for consolidated customers
          <div className="space-y-6">
            {customer.connectionDetails.map((connection, index) => (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-medium mb-3">Connection {connection.connectionNumber}</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`username-${index}`}>Username</Label>
                    <div className="flex">
                      <Input
                        id={`username-${index}`}
                        value={connection.username || 'Not available'}
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => copyToClipboard(connection.username || '', 'Username')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`password-${index}`}>Password</Label>
                    <div className="flex">
                      <Input
                        id={`password-${index}`}
                        type={showPasswords[index] ? 'text' : 'password'}
                        value={connection.password || 'Not available'}
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => togglePasswordVisibility(index)}
                      >
                        {showPasswords[index] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => copyToClipboard(connection.password || '', 'Password')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {connection.macAddress && (
                  <div className="space-y-2 mt-4">
                    <Label htmlFor={`mac-${index}`}>MAC Address</Label>
                    <div className="flex">
                      <Input
                        id={`mac-${index}`}
                        value={connection.macAddress}
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => copyToClipboard(connection.macAddress || '', 'MAC Address')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {connection.m3uUrl && (
                  <div className="space-y-2 mt-4">
                    <Label htmlFor={`m3u-${index}`}>M3U URL</Label>
                    <div className="flex">
                      <Input
                        id={`m3u-${index}`}
                        value={connection.m3uUrl}
                        readOnly
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => copyToClipboard(connection.m3uUrl || '', 'M3U URL')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => window.open(connection.m3uUrl, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Show single connection for regular customers
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="flex">
                <Input
                  id="username"
                  value={customer.username || 'Not available'}
                  readOnly
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => copyToClipboard(customer.username || '', 'Username')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="flex">
                <Input
                  id="password"
                  type={showPasswords[0] ? 'text' : 'password'}
                  value={customer.password || 'Not available'}
                  readOnly
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => togglePasswordVisibility(0)}
                >
                  {showPasswords[0] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => copyToClipboard(customer.password || '', 'Password')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Server</Label>
            <Input value="my8k.me" readOnly />
          </div>
          
          <div className="space-y-2">
            <Label>Expires</Label>
            <Input 
              value={new Date(customer.expirationDate).toLocaleDateString()} 
              readOnly 
            />
          </div>
          
          <div className="space-y-2">
            <Label>Max Connections</Label>
            <Input 
              value={isConsolidatedCustomer(customer) ? customer.totalConnections : (customer.maxConnections || 1)} 
              readOnly 
            />
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-2">Setup Instructions</h4>
          <p className="text-sm text-gray-600">
            Use these credentials in your IPTV app. Server URL: my8k.me
            {isConsolidatedCustomer(customer) ? (
              <>
                <br />
                <br />
                <strong>Multiple Connections Available:</strong>
                <br />
                You have {customer.totalConnections} connection{customer.totalConnections !== 1 ? 's' : ''} available. 
                Use any of the username/password combinations shown above.
              </>
            ) : (
              <>
                <br />
                Username: {customer.username}
                <br />
                Password: {customer.password}
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
