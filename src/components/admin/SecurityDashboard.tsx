import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle, RefreshCw, TrendingUp, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface SecurityMetric {
  metric_name: string;
  metric_value: string;
  description: string;
  last_updated: string;
}

export const SecurityDashboard: React.FC = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<SecurityMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async () => {
    if (user?.role !== 'admin') {
      return;
    }

    try {
      setLoading(true);
      
      // Refresh the metrics first
      await supabase.rpc('refresh_security_dashboard');
      
      // Then fetch the updated metrics
      const { data, error } = await supabase
        .from('security_dashboard_metrics')
        .select('*')
        .order('metric_name');

      if (error) {
        throw error;
      }

      setMetrics(data || []);
    } catch (error) {
      console.error('Error fetching security metrics:', error);
      toast.error('Failed to fetch security metrics');
    } finally {
      setLoading(false);
    }
  };

  const refreshMetrics = async () => {
    setRefreshing(true);
    await fetchMetrics();
    setRefreshing(false);
    toast.success('Security metrics refreshed');
  };

  useEffect(() => {
    fetchMetrics();
  }, [user]);

  const getMetricIcon = (metricName: string) => {
    switch (metricName) {
      case 'failed_logins_24h':
        return <AlertTriangle className="h-6 w-6 text-destructive" />;
      case 'successful_logins_24h':
        return <CheckCircle className="h-6 w-6 text-success" />;
      case 'blocked_ips_active':
        return <Lock className="h-6 w-6 text-warning" />;
      case 'password_resets_24h':
        return <Shield className="h-6 w-6 text-primary" />;
      case 'permission_denials_24h':
        return <Users className="h-6 w-6 text-destructive" />;
      default:
        return <TrendingUp className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const getMetricColor = (metricName: string, value: string): "default" | "destructive" | "outline" | "secondary" => {
    const numValue = parseInt(value) || 0;
    
    switch (metricName) {
      case 'failed_logins_24h':
        return numValue > 10 ? 'destructive' : numValue > 5 ? 'secondary' : 'default';
      case 'blocked_ips_active':
        return numValue > 0 ? 'secondary' : 'default';
      case 'permission_denials_24h':
        return numValue > 5 ? 'destructive' : 'default';
      default:
        return 'default';
    }
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Dashboard
              </CardTitle>
              <CardDescription>
                Real-time security metrics and monitoring
              </CardDescription>
            </div>
            <Button 
              onClick={refreshMetrics} 
              variant="outline" 
              size="sm"
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading security metrics...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics.map((metric) => (
                <Card key={metric.metric_name} className="relative">
                  <CardContent className="pt-6">
                    <div className="flex items-center space-x-2">
                      {getMetricIcon(metric.metric_name)}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-2xl font-bold">{metric.metric_value}</p>
                          <Badge variant={getMetricColor(metric.metric_name, metric.metric_value)}>
                            {metric.metric_name.includes('failed') || metric.metric_name.includes('blocked') || metric.metric_name.includes('denials') 
                              ? 'Alert' : 'Normal'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {metric.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {metrics.length > 0 && (
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Security Status Summary</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• Monitor these metrics regularly for unusual patterns</p>
                <p>• Failed login spikes may indicate brute force attacks</p>
                <p>• Blocked IPs show active rate limiting protection</p>
                <p>• Permission denials help identify unauthorized access attempts</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};