
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Copy, Plus, Trash2, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SsoToken {
  id: string;
  reseller_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  usage_count: number;
  profiles: {
    name: string;
    email: string;
  };
}

export const SsoTokenManager: React.FC = () => {
  const { resellers } = useApp();
  const [tokens, setTokens] = useState<SsoToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResellerId, setSelectedResellerId] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [showGeneratedToken, setShowGeneratedToken] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('sso_tokens')
        .select(`
          id,
          reseller_id,
          name,
          is_active,
          created_at,
          expires_at,
          last_used_at,
          usage_count,
          profiles!reseller_id (
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTokens(data || []);
    } catch (error) {
      console.error('Error fetching SSO tokens:', error);
      toast.error('Failed to load SSO tokens');
    } finally {
      setLoading(false);
    }
  };

  const generateTokenHash = async (token: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const createToken = async () => {
    if (!selectedResellerId || !tokenName.trim()) {
      toast.error('Please select a reseller and enter a token name');
      return;
    }

    try {
      // Generate a secure token
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('generate_sso_token');

      if (tokenError || !tokenData) {
        throw new Error('Failed to generate token');
      }

      const token = tokenData;
      const tokenHash = await generateTokenHash(token);

      // Save the token to database
      const { error } = await supabase
        .from('sso_tokens')
        .insert({
          reseller_id: selectedResellerId,
          token_hash: tokenHash,
          name: tokenName.trim()
        });

      if (error) throw error;

      // Log the creation
      await supabase
        .from('sso_audit_logs')
        .insert({
          reseller_id: selectedResellerId,
          action: 'token_created',
          additional_data: { token_name: tokenName.trim() }
        });

      setGeneratedToken(token);
      setShowGeneratedToken(true);
      setTokenName('');
      setSelectedResellerId('');
      fetchTokens();
      toast.success('SSO token created successfully');

    } catch (error) {
      console.error('Error creating SSO token:', error);
      toast.error('Failed to create SSO token');
    }
  };

  const revokeToken = async (tokenId: string, resellerId: string) => {
    try {
      const { error } = await supabase
        .from('sso_tokens')
        .update({ 
          is_active: false,
          revoked_at: new Date().toISOString()
        })
        .eq('id', tokenId);

      if (error) throw error;

      // Log the revocation
      await supabase
        .from('sso_audit_logs')
        .insert({
          token_id: tokenId,
          reseller_id: resellerId,
          action: 'token_revoked'
        });

      fetchTokens();
      toast.success('Token revoked successfully');
    } catch (error) {
      console.error('Error revoking token:', error);
      toast.error('Failed to revoke token');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getLoginUrl = (token: string) => {
    return `${window.location.origin}/auth/token?token=${token}`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SSO Tokens</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>SSO Tokens</CardTitle>
            <CardDescription>
              Manage secure single sign-on tokens for HighLevel integration
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-eztv-700 hover:bg-eztv-800">
                <Plus className="h-4 w-4 mr-2" />
                Create Token
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create SSO Token</DialogTitle>
                <DialogDescription>
                  Generate a new SSO token for a reseller to use in HighLevel
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="reseller">Reseller</Label>
                  <select
                    id="reseller"
                    value={selectedResellerId}
                    onChange={(e) => setSelectedResellerId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-eztv-500"
                  >
                    <option value="">Select a reseller...</option>
                    {resellers.map((reseller) => (
                      <option key={reseller.id} value={reseller.id}>
                        {reseller.name} ({reseller.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="tokenName">Token Name</Label>
                  <Input
                    id="tokenName"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="e.g., HighLevel Production"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createToken}>Create Token</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {tokens.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No SSO tokens created yet. Create your first token to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reseller</TableHead>
                <TableHead>Token Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usage Count</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{token.profiles.name}</div>
                      <div className="text-sm text-gray-500">{token.profiles.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{token.name}<div className="text-xs text-muted-foreground">Expires {new Date(token.expires_at).toLocaleDateString()}</div></TableCell>
                  <TableCell>
                    <Badge variant={token.is_active ? "default" : "secondary"}>
                      {!token.is_active ? 'Revoked' : new Date(token.expires_at) <= new Date() ? 'Expired' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>{token.usage_count}</TableCell>
                  <TableCell>
                    {token.last_used_at 
                      ? formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true })
                      : 'Never'
                    }
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(token.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {token.is_active && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke Token</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to revoke this SSO token? This action cannot be undone and the token will no longer work for authentication.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => revokeToken(token.id, token.reseller_id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Revoke Token
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Token Generated Success Dialog */}
        <Dialog open={showGeneratedToken} onOpenChange={setShowGeneratedToken}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>SSO Token Created Successfully</DialogTitle>
              <DialogDescription>
                Your SSO token has been generated. Copy the login URL below and add it to HighLevel.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {generatedToken && (
                <>
                  <div>
                    <Label>Login URL for HighLevel</Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <Input 
                        value={getLoginUrl(generatedToken)} 
                        readOnly 
                        className="font-mono text-sm"
                      />
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => copyToClipboard(getLoginUrl(generatedToken))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-800 mb-2">Important Security Notes:</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• This token provides direct access to the reseller dashboard</li>
                      <li>• Store it securely and only share with authorized personnel</li>
                      <li>• You can revoke this token at any time from this admin panel</li>
                      <li>• Monitor usage in the audit logs for security purposes</li>
                    </ul>
                  </div>
                </>
              )}
              <div className="flex justify-end">
                <Button onClick={() => {
                  setShowGeneratedToken(false);
                  setGeneratedToken(null);
                }}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
