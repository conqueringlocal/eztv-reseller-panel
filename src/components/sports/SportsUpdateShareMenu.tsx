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
import { 
  Share, 
  Copy, 
  MessageCircle, 
  Phone, 
  Mail, 
  Settings
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

interface SportsUpdateShareMenuProps {
  update: SportsUpdate;
  resellerId?: string;
}

export const SportsUpdateShareMenu: React.FC<SportsUpdateShareMenuProps> = ({ 
  update, 
  resellerId 
}) => {
  const [showCustomizeDialog, setShowCustomizeDialog] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [includeResellerInfo, setIncludeResellerInfo] = useState(true);
  
  const {
    formatSportsUpdate,
    copyToClipboard,
    shareViaWhatsApp,
    shareViaSMS,
    shareViaEmail
  } = useSportsSharing();

  const handleQuickCopy = () => {
    const formatted = formatSportsUpdate(update, { includeResellerInfo });
    copyToClipboard(formatted);
  };

  const handleWhatsAppShare = () => {
    const formatted = formatSportsUpdate(update, { 
      includeResellerInfo, 
      format: 'whatsapp' 
    });
    shareViaWhatsApp(formatted);
  };

  const handleSMSShare = () => {
    const formatted = formatSportsUpdate(update, { 
      includeResellerInfo, 
      format: 'sms' 
    });
    shareViaSMS(formatted);
  };

  const handleEmailShare = () => {
    const formatted = formatSportsUpdate(update, { 
      includeResellerInfo, 
      format: 'email' 
    });
    shareViaEmail(formatted, undefined, `${update.sport_category} Sports Update`);
  };

  const handleCustomShare = () => {
    const formatted = formatSportsUpdate(update, { 
      includeResellerInfo, 
      customMessage 
    });
    copyToClipboard(formatted);
    setShowCustomizeDialog(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleQuickCopy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy to Clipboard
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleWhatsAppShare}>
            <MessageCircle className="h-4 w-4 mr-2" />
            Share via WhatsApp
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleSMSShare}>
            <Phone className="h-4 w-4 mr-2" />
            Share via SMS
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleEmailShare}>
            <Mail className="h-4 w-4 mr-2" />
            Share via Email
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setShowCustomizeDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Customize & Share
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCustomizeDialog} onOpenChange={setShowCustomizeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Customize Sports Update</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="custom-message">Custom Message (Optional)</Label>
              <Textarea
                id="custom-message"
                placeholder="Add a personal message to include at the top..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-reseller-info"
                checked={includeResellerInfo}
                onCheckedChange={(checked) => setIncludeResellerInfo(!!checked)}
              />
              <Label htmlFor="include-reseller-info" className="text-sm">
                Include contact information
              </Label>
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button 
                onClick={handleCustomShare}
                className="flex-1"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Custom
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};