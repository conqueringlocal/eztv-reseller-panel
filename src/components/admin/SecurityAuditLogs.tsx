import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Shield, AlertTriangle, CheckCircle, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { SecurityDashboard } from './SecurityDashboard';

interface SecurityAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: unknown;
  user_agent: string | null;
  success: boolean;
  details: any;
  created_at: string;
}

export const SecurityAuditLogs: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<SecurityAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [successFilter, setSuccessFilter] = useState('all');

  const fetchLogs = async () => {
    if (user?.role !== 'admin') {
      toast.error('Unauthorized access');
      return;
    }

    try {
      setLoading(true);
      let query = supabase
        .from('security_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (searchTerm) {
        query = query.or(`action.ilike.%${searchTerm}%,resource_type.ilike.%${searchTerm}%,resource_id.ilike.%${searchTerm}%`);
      }

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (successFilter !== 'all') {
        query = query.eq('success', successFilter === 'success');
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching security logs:', error);
      toast.error('Failed to fetch security audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchLogs();
    }
  }, [user?.role, searchTerm, actionFilter, successFilter]);

  const getActionIcon = (action: string, success: boolean) => {
    if (!success) {
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    }
    
    if (action.includes('login')) {
      return <Shield className="h-4 w-4 text-primary" />;
    }
    
    return <CheckCircle className="h-4 w-4 text-success" />;
  };

  const getActionBadge = (action: string, success: boolean) => {
    const variant = success ? 'default' : 'destructive';
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {getActionIcon(action, success)}
        {action}
      </Badge>
    );
  };

  if (user?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Access denied. Admin privileges required.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SecurityDashboard />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Audit Logs
          </CardTitle>
          <CardDescription>
            Monitor security events and authentication attempts across the platform
          </CardDescription>
        </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search actions, resources, or IDs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="w-full sm:w-48">
            <Label htmlFor="action-filter">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="login_success">Login Success</SelectItem>
                <SelectItem value="login_failed">Login Failed</SelectItem>
                <SelectItem value="password_reset_requested">Password Reset</SelectItem>
                <SelectItem value="permission_denied">Permission Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-full sm:w-48">
            <Label htmlFor="success-filter">Status</Label>
            <Select value={successFilter} onValueChange={setSuccessFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-end">
            <Button 
              onClick={fetchLogs} 
              variant="outline" 
              size="icon"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading security logs...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No security logs found
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getActionBadge(log.action, log.success)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{log.resource_type}</div>
                        {log.resource_id && (
                          <div className="text-sm text-muted-foreground font-mono">
                            {log.resource_id}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.user_id ? log.user_id.substring(0, 8) + '...' : 'N/A'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.ip_address?.toString() || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {log.details && (
                        <div className="text-sm text-muted-foreground max-w-xs truncate">
                          {JSON.stringify(log.details)}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {logs.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {logs.length} recent security events
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};