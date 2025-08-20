import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FileText, 
  Download, 
  MessageCircle, 
  Mail, 
  Calendar,
  Filter,
  ExternalLink,
  Copy
} from 'lucide-react';
import { useSportsSharing } from '@/hooks/useSportsSharing';

interface SportsUpdate {
  id: string;
  content: string;
  sport_category: string;
  game_date: string;
  channel_info: Array<{
    game: string;
    time: string;
    channel: string;
  }>;
  posted_to_highlevel: boolean;
  created_at: string;
}

interface SportsUpdatesBulkActionsProps {
  updates: SportsUpdate[];
  activeTab: string;
  resellerId?: string;
}

export const SportsUpdatesBulkActions: React.FC<SportsUpdatesBulkActionsProps> = ({ 
  updates, 
  activeTab,
  resellerId 
}) => {
  const [showDigestDialog, setShowDigestDialog] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [includeResellerInfo, setIncludeResellerInfo] = useState(true);
  const [digestFilter, setDigestFilter] = useState<'all' | 'today' | 'sport'>('today');
  
  const {
    generateDailyDigest,
    copyToClipboard,
    shareViaWhatsApp,
    shareViaEmail,
    exportToPDF,
    sendToHighLevel,
    isSharing
  } = useSportsSharing();

  const getFilteredUpdates = () => {
    let filtered = updates;
    
    if (digestFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      filtered = updates.filter(update => update.game_date === today);
    } else if (digestFilter === 'sport' && activeTab !== 'ALL') {
      filtered = updates.filter(update => update.sport_category === activeTab);
    }
    
    return filtered;
  };

  const handleDailyDigest = () => {
    const filteredUpdates = getFilteredUpdates();
    const digest = generateDailyDigest(filteredUpdates, { 
      customMessage, 
      includeResellerInfo 
    });
    copyToClipboard(digest);
    setShowDigestDialog(false);
  };

  const handleDigestWhatsApp = () => {
    const filteredUpdates = getFilteredUpdates();
    const digest = generateDailyDigest(filteredUpdates, { 
      customMessage, 
      includeResellerInfo 
    });
    shareViaWhatsApp(digest);
  };

  const handleDigestEmail = () => {
    const filteredUpdates = getFilteredUpdates();
    const digest = generateDailyDigest(filteredUpdates, { 
      customMessage, 
      includeResellerInfo 
    });
    shareViaEmail(digest, undefined, 'Daily Sports Digest');
  };

  const handleDigestHighLevel = () => {
    if (!resellerId) return;
    
    const filteredUpdates = getFilteredUpdates();
    const digest = generateDailyDigest(filteredUpdates, { 
      customMessage, 
      includeResellerInfo 
    });
    sendToHighLevel(resellerId, digest);
  };

  const handleExportPDF = () => {
    const filteredUpdates = getFilteredUpdates();
    const title = digestFilter === 'sport' && activeTab !== 'ALL' 
      ? `${activeTab} Sports Updates` 
      : 'Daily Sports Digest';
    exportToPDF(filteredUpdates, title);
  };

  const todayUpdates = updates.filter(update => {
    const today = new Date().toISOString().split('T')[0];
    return update.game_date === today;
  });

  if (updates.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Bulk Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setShowDigestDialog(true)}>
              <Calendar className="h-4 w-4 mr-2" />
              Create Daily Digest
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export to PDF
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {resellerId && (
              <DropdownMenuItem 
                onClick={handleDigestHighLevel}
                disabled={isSharing}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Send All via HighLevel
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Filter className="h-4 w-4" />
          {updates.length} total updates
          {todayUpdates.length !== updates.length && (
            <span>• {todayUpdates.length} today</span>
          )}
        </div>
      </div>

      <Dialog open={showDigestDialog} onOpenChange={setShowDigestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Daily Digest</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="digest-filter">Include Updates</Label>
              <Select value={digestFilter} onValueChange={(value) => setDigestFilter(value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today Only</SelectItem>
                  <SelectItem value="all">All Visible Updates</SelectItem>
                  {activeTab !== 'ALL' && (
                    <SelectItem value="sport">{activeTab} Only</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="digest-message">Custom Message (Optional)</Label>
              <Textarea
                id="digest-message"
                placeholder="Add a personal message to include at the top..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="digest-reseller-info"
                checked={includeResellerInfo}
                onCheckedChange={(checked) => setIncludeResellerInfo(!!checked)}
              />
              <Label htmlFor="digest-reseller-info" className="text-sm">
                Include contact information
              </Label>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Will include {getFilteredUpdates().length} updates
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-4">
              <Button 
                onClick={handleDailyDigest}
                variant="outline"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              
              <Button 
                onClick={handleDigestWhatsApp}
                variant="outline"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
              
              <Button 
                onClick={handleDigestEmail}
                variant="outline"
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
              
              {resellerId && (
                <Button
                  onClick={handleDigestHighLevel}
                  disabled={isSharing}
                  variant="outline"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  HighLevel
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};