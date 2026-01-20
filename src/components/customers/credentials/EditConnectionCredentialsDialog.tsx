import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ConnectionCredential {
  connection_number: number;
  username: string;
  password: string;
  m3u_url?: string;
  status?: string;
  expiration_date?: string;
}

interface EditConnectionCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  connection: ConnectionCredential;
  connectionList: ConnectionCredential[];
  onSuccess: () => void;
}

export function EditConnectionCredentialsDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  connection,
  connectionList,
  onSuccess,
}: EditConnectionCredentialsDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [username, setUsername] = useState(connection.username || '');
  const [password, setPassword] = useState(connection.password || '');
  const [m3uUrl, setM3uUrl] = useState(connection.m3u_url || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error('Username and password are required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build the updated connection list
      const updatedConnectionList = connectionList.map((conn) => {
        if (conn.connection_number === connection.connection_number) {
          return {
            ...conn,
            username: username.trim(),
            password: password.trim(),
            m3u_url: m3uUrl.trim() || conn.m3u_url,
          };
        }
        return conn;
      });

      // Update the customer record
      const { error } = await supabase
        .from('customers')
        .update({
          connection_list: updatedConnectionList as any,
        })
        .eq('id', customerId);

      if (error) {
        throw error;
      }

      // Log the security event
      await supabase.rpc('log_security_event', {
        p_action: 'update_connection_credentials',
        p_resource_type: 'customer_connection',
        p_resource_id: customerId,
        p_success: true,
        p_details: {
          customer_name: customerName,
          connection_number: connection.connection_number,
          old_username: connection.username,
          new_username: username.trim(),
        },
      });

      toast.success(`Connection ${connection.connection_number} credentials updated successfully`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating connection credentials:', error);
      toast.error(`Failed to update credentials: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Connection {connection.connection_number} Credentials</DialogTitle>
          <DialogDescription>
            Update the login credentials for {customerName}'s connection {connection.connection_number}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="m3uUrl">M3U URL (Optional)</Label>
            <Input
              id="m3uUrl"
              value={m3uUrl}
              onChange={(e) => setM3uUrl(e.target.value)}
              placeholder="http://example.com/get.php?username=..."
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to keep the existing URL, or enter a new URL to update it.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
