
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Eye, EyeOff, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Customer } from '@/contexts/AppContext';

interface CustomerCredentialsProps {
  customer: Customer;
  onSendCredentials?: (customer: Customer, method: 'email' | 'sms') => void;
}

export function CustomerCredentials({ customer, onSendCredentials }: CustomerCredentialsProps) {
  const [showPassword, setShowPassword] = useState(false);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const copyAllCredentials = async () => {
    const credentialsText = `
IPTV Account Details for ${customer.name}
Username: ${customer.username}
Password: ${customer.password}
Server: my8k.me
Expires: ${new Date(customer.expirationDate).toLocaleDateString()}
Max Connections: ${customer.totalConnections || 1}
    `.trim();

    try {
      await navigator.clipboard.writeText(credentialsText);
      toast.success('All credentials copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy credentials');
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
                  onClick={() => onSendCredentials(customer, 'email')}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSendCredentials(customer, 'sms')}
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
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                type={showPassword ? 'text' : 'password'}
                value={customer.password || 'Not available'}
                readOnly
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
              value={customer.totalConnections || 1} 
              readOnly 
            />
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-2">Setup Instructions</h4>
          <p className="text-sm text-gray-600">
            Use these credentials in your IPTV app. Server URL: my8k.me
            <br />
            Username: {customer.username}
            <br />
            Password: {customer.password}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
