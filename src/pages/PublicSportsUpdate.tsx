import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Clock, Tv, Share, Copy, MessageCircle, Phone, Mail } from 'lucide-react';
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

export default function PublicSportsUpdate() {
  const { updateId } = useParams<{ updateId: string }>();
  const [update, setUpdate] = useState<SportsUpdate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const {
    formatSportsUpdate,
    copyToClipboard,
    shareViaWhatsApp,
    shareViaSMS,
    shareViaEmail
  } = useSportsSharing();

  useEffect(() => {
    const fetchUpdate = async () => {
      if (!updateId) {
        setError('No update ID provided');
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('sports_ppv_updates')
          .select('*')
          .eq('id', updateId)
          .single();

        if (error) {
          console.error('Error fetching update:', error);
          setError('Update not found');
          return;
        }

        if (data) {
          setUpdate({
            ...data,
            channel_info: Array.isArray(data.channel_info) 
              ? data.channel_info.filter((info: any) => 
                  info && typeof info === 'object' && 'game' in info && 'time' in info && 'channel' in info
                ).map((info: any) => ({
                  game: String(info.game || ''),
                  time: String(info.time || ''),
                  channel: String(info.channel || '')
                }))
              : [],
            posted_to_highlevel: !!data.posted_to_highlevel,
          });
        }
      } catch (error) {
        console.error('Error in fetchUpdate:', error);
        setError('Failed to load update');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUpdate();
  }, [updateId]);

  const getSportColor = (category: string) => {
    const colors: Record<string, string> = {
      'MLB': 'bg-blue-500',
      'MILB': 'bg-cyan-500',
      'NBA': 'bg-orange-500',
      'WNBA': 'bg-pink-500',
      'NFL': 'bg-green-500',
      'TENNIS': 'bg-yellow-500',
      'UEFA': 'bg-indigo-500',
      'MLS': 'bg-emerald-500',
      'UFC': 'bg-red-600',
      'PPV': 'bg-red-500',
      'PARAMOUNT+': 'bg-blue-600',
      'DIRTVISION': 'bg-stone-600',
      'FLO RACING': 'bg-orange-500',
      'FLO COLLEGE': 'bg-teal-500'
    };
    return colors[category] || 'bg-gray-500';
  };

  const formatTime = (timeString: string) => {
    try {
      return new Date(timeString).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return timeString;
    }
  };

  const sortChannelInfo = (channelInfo: Array<{game: string; time: string; channel: string}>) => {
    return [...channelInfo].sort((a, b) => {
      const getChannelNumber = (channel: string) => {
        const match = channel.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };
      
      const aNum = getChannelNumber(a.channel);
      const bNum = getChannelNumber(b.channel);
      
      if (a.channel.startsWith('US |') && !b.channel.startsWith('US |')) return 1;
      if (!a.channel.startsWith('US |') && b.channel.startsWith('US |')) return -1;
      if (a.channel.startsWith('US |') && b.channel.startsWith('US |')) return 0;
      
      return aNum - bNum;
    });
  };

  const handleShare = (method: 'copy' | 'whatsapp' | 'sms' | 'email') => {
    if (!update) return;
    
    const formatted = formatSportsUpdate(update, { includeResellerInfo: false });
    
    switch (method) {
      case 'copy':
        copyToClipboard(formatted);
        break;
      case 'whatsapp':
        shareViaWhatsApp(formatted);
        break;
      case 'sms':
        shareViaSMS(formatted);
        break;
      case 'email':
        shareViaEmail(formatted, undefined, `${update.sport_category} Sports Update`);
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted rounded w-1/3"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-2/3"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !update) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="text-center py-12">
              <Tv className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Update Not Found</h3>
              <p className="text-muted-foreground">
                {error || "The sports update you're looking for doesn't exist or has been removed."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sports Update</h1>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {new Date(update.game_date).toLocaleDateString()}
          </div>
        </div>

        {/* Sports Update Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Badge className={`${getSportColor(update.sport_category)} text-white`}>
                  {update.sport_category}
                </Badge>
                <span className="text-lg">{update.sport_category} Updates</span>
              </CardTitle>
              
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatTime(update.created_at)}
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-3">
              {sortChannelInfo(update.channel_info)
                .filter(info => info.game || !info.channel?.startsWith('US |'))
                .map((info, index) => (
                <div 
                  key={index}
                  className="flex flex-col gap-2 p-3 bg-accent/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{info.game || 'Event Information'}</div>
                    {info.time && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {info.time}
                      </div>
                    )}
                  </div>
                  
                  {info.channel && (
                    <Badge variant="secondary" className="flex items-center gap-1 w-fit max-w-full">
                      <Tv className="h-3 w-3 shrink-0" />
                      <span className="truncate text-xs">{info.channel}</span>
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Share Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share className="h-5 w-5" />
              Share This Update
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                onClick={() => handleShare('copy')}
                className="flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => handleShare('whatsapp')}
                className="flex items-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => handleShare('sms')}
                className="flex items-center gap-2"
              >
                <Phone className="h-4 w-4" />
                SMS
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => handleShare('email')}
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Shared from IPTV Sports Updates</p>
        </div>
      </div>
    </div>
  );
}