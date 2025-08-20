import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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

interface ShareOptions {
  includeResellerInfo?: boolean;
  customMessage?: string;
  format?: 'text' | 'whatsapp' | 'sms' | 'email';
}

export const useSportsSharing = () => {
  const { toast } = useToast();

  const formatSportsUpdate = (update: SportsUpdate, options: ShareOptions = {}) => {
    const { includeResellerInfo = false, customMessage = '', format = 'text' } = options;
    
    let formattedText = '';
    
    // Custom header message
    if (customMessage) {
      formattedText += `${customMessage}\n\n`;
    }
    
    // Sport category header
    formattedText += `🏆 ${update.sport_category} SPORTS UPDATE\n`;
    
    // Format the date properly to avoid timezone issues
    const gameDate = update.game_date.includes('T') 
      ? new Date(update.game_date).toLocaleDateString()
      : new Date(update.game_date + 'T00:00:00').toLocaleDateString();
    formattedText += `📅 ${gameDate}\n\n`;
    
    // Channel information
    if (update.channel_info && update.channel_info.length > 0) {
      const gameChannels = update.channel_info.filter(info => info.game && !info.channel?.startsWith('US |'));
      
      if (gameChannels.length > 0) {
        formattedText += `📺 GAMES & CHANNELS:\n`;
        gameChannels.forEach((info, index) => {
          formattedText += `${index + 1}. ${info.game}\n`;
          if (info.time) {
            formattedText += `   ⏰ ${info.time}\n`;
          }
          if (info.channel) {
            formattedText += `   📺 ${info.channel}\n`;
          }
          formattedText += '\n';
        });
      }
      
      // US Channel categories
      const usChannels = update.channel_info.filter(info => info.channel?.startsWith('US |') && !info.game);
      if (usChannels.length > 0) {
        formattedText += `🇺🇸 US CHANNEL CATEGORIES:\n`;
        usChannels.forEach(info => {
          formattedText += `• ${info.channel}\n`;
        });
        formattedText += '\n';
      }
    }
    
    // Reseller information
    if (includeResellerInfo) {
      formattedText += `\n📞 Contact us for IPTV services and more sports updates!\n`;
    }
    
    // Format-specific adjustments
    if (format === 'whatsapp') {
      formattedText = formattedText.replace(/\n/g, '%0A');
    } else if (format === 'sms') {
      // Truncate for SMS length limits
      if (formattedText.length > 1500) {
        formattedText = formattedText.substring(0, 1500) + '...';
      }
    }
    
    return formattedText.trim();
  };

  const generateDailyDigest = (updates: SportsUpdate[], options: ShareOptions = {}) => {
    const { customMessage = '', includeResellerInfo = false } = options;
    
    let digest = '';
    
    if (customMessage) {
      digest += `${customMessage}\n\n`;
    }
    
    digest += `📊 DAILY SPORTS DIGEST\n`;
    digest += `📅 ${new Date().toLocaleDateString()}\n\n`;
    
    // Group updates by sport category
    const groupedUpdates = updates.reduce((acc, update) => {
      if (!acc[update.sport_category]) {
        acc[update.sport_category] = [];
      }
      acc[update.sport_category].push(update);
      return acc;
    }, {} as Record<string, SportsUpdate[]>);
    
    // Add each sport category
    Object.entries(groupedUpdates).forEach(([category, categoryUpdates]) => {
      digest += `🏆 ${category}\n`;
      
      const allChannelInfo = categoryUpdates.flatMap(update => update.channel_info || []);
      const gameChannels = allChannelInfo.filter(info => info.game && !info.channel?.startsWith('US |'));
      
      if (gameChannels.length > 0) {
        gameChannels.forEach((info, index) => {
          digest += `${index + 1}. ${info.game}`;
          if (info.time) digest += ` - ${info.time}`;
          if (info.channel) digest += ` (${info.channel})`;
          digest += '\n';
        });
      }
      
      digest += '\n';
    });
    
    if (includeResellerInfo) {
      digest += `📞 Contact us for IPTV services and daily sports updates!\n`;
    }
    
    return digest.trim();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Sports update copied to clipboard",
      });
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
      return false;
    }
  };

  const shareViaWhatsApp = (text: string, phoneNumber?: string) => {
    const encodedText = encodeURIComponent(text);
    const url = phoneNumber 
      ? `https://wa.me/${phoneNumber}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
    
    window.open(url, '_blank');
  };

  const shareViaSMS = (text: string, phoneNumber?: string) => {
    const encodedText = encodeURIComponent(text);
    const url = phoneNumber
      ? `sms:${phoneNumber}?body=${encodedText}`
      : `sms:?body=${encodedText}`;
    
    window.open(url, '_blank');
  };

  const shareViaEmail = (text: string, email?: string, subject?: string) => {
    const encodedSubject = encodeURIComponent(subject || 'Sports Update');
    const encodedBody = encodeURIComponent(text);
    const url = email
      ? `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`
      : `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
    
    window.open(url, '_blank');
  };



  const exportToPDF = async (updates: SportsUpdate[], title: string = 'Sports Updates') => {
    try {
      // This would require a PDF library like jsPDF or html2pdf
      // For now, we'll generate HTML content that can be printed to PDF
      const htmlContent = generateHTMLExport(updates, title);
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
      }
      
      toast({
        title: "Export Ready",
        description: "Print dialog opened for PDF export",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export to PDF",
        variant: "destructive",
      });
    }
  };

  const generateHTMLExport = (updates: SportsUpdate[], title: string) => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .update { margin-bottom: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          .sport-badge { background: #007bff; color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px; }
          .channel-info { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 3px; }
          .game-title { font-weight: bold; }
          .time { color: #666; font-size: 14px; }
          .channel { color: #007bff; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>
        ${updates.map(update => `
          <div class="update">
            <div class="sport-badge">${update.sport_category}</div>
            <h3>${update.sport_category} Updates</h3>
            <p><strong>Date:</strong> ${update.game_date.includes('T') 
              ? new Date(update.game_date).toLocaleDateString()
              : new Date(update.game_date + 'T00:00:00').toLocaleDateString()}</p>
            
            ${update.channel_info?.map(info => `
              <div class="channel-info">
                ${info.game ? `<div class="game-title">${info.game}</div>` : ''}
                ${info.time ? `<div class="time">⏰ ${info.time}</div>` : ''}
                ${info.channel ? `<div class="channel">📺 ${info.channel}</div>` : ''}
              </div>
            `).join('') || ''}
          </div>
        `).join('')}
      </body>
      </html>
    `;
    
    return html;
  };

  return {
    formatSportsUpdate,
    generateDailyDigest,
    copyToClipboard,
    shareViaWhatsApp,
    shareViaSMS,
    shareViaEmail,
    exportToPDF
  };
};