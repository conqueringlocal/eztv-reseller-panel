import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Eye, Edit, Trash2, Globe, Copy } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Funnel } from '@/hooks/useFunnels';
import { format } from 'date-fns';

interface FunnelCardProps {
  funnel: Funnel;
  onEdit: (funnel: Funnel) => void;
  onDelete: (funnel: Funnel) => void;
  onTogglePublish: (funnel: Funnel) => void;
  onPreview: (funnel: Funnel) => void;
  onCopyLink: (funnel: Funnel) => void;
}

export const FunnelCard: React.FC<FunnelCardProps> = ({
  funnel,
  onEdit,
  onDelete,
  onTogglePublish,
  onPreview,
  onCopyLink,
}) => {
  const getFunnelUrl = () => {
    if (funnel.custom_domain) {
      return `https://${funnel.custom_domain}`;
    }
    return `https://funnels.streamlo.tv/${funnel.subdomain}`;
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{funnel.name}</CardTitle>
            <CardDescription>
              {funnel.template?.name} • Created {format(new Date(funnel.created_at), 'MMM d, yyyy')}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPreview(funnel)}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(funnel)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCopyLink(funnel)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onTogglePublish(funnel)}
                className={funnel.is_published ? 'text-orange-600' : 'text-green-600'}
              >
                <Globe className="h-4 w-4 mr-2" />
                {funnel.is_published ? 'Unpublish' : 'Publish'}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(funnel)}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge variant={funnel.is_published ? 'default' : 'secondary'}>
                {funnel.is_published ? 'Published' : 'Draft'}
              </Badge>
              <Badge variant="outline">{funnel.template?.template_type}</Badge>
            </div>
          </div>
          
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              <strong>URL:</strong> {getFunnelUrl()}
            </div>
            {funnel.analytics?.visits && (
              <div>
                <strong>Visits:</strong> {funnel.analytics.visits}
              </div>
            )}
          </div>

          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onPreview(funnel)}
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button 
              size="sm" 
              onClick={() => onEdit(funnel)}
              className="flex-1"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};