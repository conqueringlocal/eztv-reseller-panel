import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Clock, Tv, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth/AuthProvider';
import { SportsUpdateShareMenu } from '@/components/sports/SportsUpdateShareMenu';
import { SportsUpdatesBulkActions } from '@/components/sports/SportsUpdatesBulkActions';

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
  telegram_message_id: string;
}

export default function ResellerSportsUpdates() {
  const [updates, setUpdates] = useState<SportsUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const { toast } = useToast();
  const { user } = useAuth();

  const sportCategories = ['ALL', 'MLB', 'MILB', 'NBA', 'WNBA', 'NFL', 'NCAAF', 'TENNIS', 'UEFA', 'MLS', 'UFC', 'PPV', 'PARAMOUNT+', 'DIRTVISION', 'FLO RACING', 'FLO COLLEGE'];

  const fetchUpdates = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      console.log('🗓️ Date filtering:', { today });
      
      const { data, error } = await supabase
        .from('sports_ppv_updates')
        .select('*')
        .eq('game_date', today)
        .order('created_at', { ascending: false });

      console.log('📊 Raw updates fetched:', data?.length || 0);
      console.log('📊 Updates by category:', data?.reduce((acc, update) => {
        acc[update.sport_category] = (acc[update.sport_category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>));

      if (error) {
        console.error('Error fetching sports updates:', error);
        toast({
          title: "Error",
          description: "Failed to fetch sports updates",
          variant: "destructive",
        });
        return;
      }

      setUpdates((data || []).map(item => ({
        ...item,
        channel_info: Array.isArray(item.channel_info) 
          ? item.channel_info.filter((info: any) => 
              info && typeof info === 'object' && 'game' in info && 'time' in info && 'channel' in info
            ).map((info: any) => ({
              game: String(info.game || ''),
              time: String(info.time || ''),
              channel: String(info.channel || '')
            }))
          : [],
        posted_to_highlevel: !!item.posted_to_highlevel,
        telegram_message_id: item.telegram_message_id || ''
      })));
    } catch (error) {
      console.error('Error in fetchUpdates:', error);
      toast({
        title: "Error",
        description: "Failed to fetch sports updates",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();

    // Set up real-time subscription for new updates
    const channel = supabase
      .channel('sports-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sports_ppv_updates'
        },
        (payload) => {
          const newUpdate = payload.new as any;
          const today = new Date().toISOString().split('T')[0];
          const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          
          // Only add if it's for today
          if (newUpdate.game_date === today) {
            const processedUpdate: SportsUpdate = {
              ...newUpdate,
              channel_info: Array.isArray(newUpdate.channel_info) 
                ? newUpdate.channel_info.filter((info: any) => 
                    info && typeof info === 'object' && 'game' in info && 'time' in info && 'channel' in info
                  )
                : [],
              posted_to_highlevel: !!newUpdate.posted_to_highlevel,
              telegram_message_id: newUpdate.telegram_message_id || ''
            };
            setUpdates(prev => [processedUpdate, ...prev]);
            toast({
              title: "New Sports Update",
              description: `${processedUpdate.sport_category} updates received`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sports_ppv_updates'
        },
        (payload) => {
          const updatedUpdate = payload.new as any;
          const processedUpdate: SportsUpdate = {
            ...updatedUpdate,
            channel_info: Array.isArray(updatedUpdate.channel_info) 
              ? updatedUpdate.channel_info.filter((info: any) => 
                  info && typeof info === 'object' && 'game' in info && 'time' in info && 'channel' in info
                )
              : [],
            posted_to_highlevel: !!updatedUpdate.posted_to_highlevel,
            telegram_message_id: updatedUpdate.telegram_message_id || ''
          };
          setUpdates(prev => prev.map(update => 
            update.id === processedUpdate.id ? processedUpdate : update
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  const filteredUpdates = activeTab === 'ALL' 
    ? updates.filter(update => 
        // Show updates that have game info, non-US channels, or are in exception categories (NCAAF, MLS)
        update.channel_info.some(info => 
          info.game || (!info.channel?.startsWith('US |') && info.channel) || 
          ['NCAAF', 'MLS'].includes(update.sport_category)
        )
      )
    : updates.filter(update => 
        update.sport_category === activeTab &&
        // Show updates that have game info, non-US channels, or are in exception categories  
        update.channel_info.some(info => 
          info.game || (!info.channel?.startsWith('US |') && info.channel) || 
          ['NCAAF', 'MLS'].includes(update.sport_category)
        )
      );

  console.log('🎯 Filtered updates:', { 
    activeTab, 
    totalUpdates: updates.length, 
    filteredCount: filteredUpdates.length,
    categories: [...new Set(updates.map(u => u.sport_category))]
  });

  // Sort updates so that those with lower channel numbers appear first
  const sortedUpdates = [...filteredUpdates].sort((a, b) => {
    // If they're the same sport category, sort by lowest channel number
    if (a.sport_category === b.sport_category) {
      const getLowestChannelNumber = (update: SportsUpdate) => {
        const channelNumbers = update.channel_info
          .map(info => {
            const match = info.channel.match(/(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter(num => num > 0);
        return channelNumbers.length > 0 ? Math.min(...channelNumbers) : 0;
      };
      
      return getLowestChannelNumber(a) - getLowestChannelNumber(b);
    }
    
    // Different sport categories, sort by creation time (most recent first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const getSportColor = (category: string) => {
    const colors: Record<string, string> = {
      'MLB': 'bg-blue-500',
      'MILB': 'bg-cyan-500',
      'NBA': 'bg-orange-500',
      'WNBA': 'bg-pink-500',
      'NFL': 'bg-green-500',
      'NCAAF': 'bg-purple-500',
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

  // Extract US channel categories filtered by active tab
  const getFilteredUSChannelCategories = (sportCategory: string) => {
    const categories = new Set<string>();
    
    // Filter updates by sport category first
    const relevantUpdates = sportCategory === 'ALL' 
      ? updates 
      : updates.filter(update => update.sport_category === sportCategory);
    
    relevantUpdates.forEach(update => {
      update.channel_info?.forEach(info => {
        if (info.channel?.startsWith('US |') && !info.game) {
          categories.add(info.channel);
        }
      });
    });
    
    return Array.from(categories).sort();
  };

  const filteredUSChannelCategories = getFilteredUSChannelCategories(activeTab);

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

  // Function to sort channel info by channel number
  const sortChannelInfo = (channelInfo: Array<{game: string; time: string; channel: string}>) => {
    return [...channelInfo].sort((a, b) => {
      // Extract numbers from channel names for sorting
      const getChannelNumber = (channel: string) => {
        const match = channel.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };
      
      const aNum = getChannelNumber(a.channel);
      const bNum = getChannelNumber(b.channel);
      
      // Sort by channel number, but keep US | channels at the end
      if (a.channel.startsWith('US |') && !b.channel.startsWith('US |')) return 1;
      if (!a.channel.startsWith('US |') && b.channel.startsWith('US |')) return -1;
      if (a.channel.startsWith('US |') && b.channel.startsWith('US |')) return 0;
      
      return aNum - bNum;
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Sports Updates</h1>
            <p className="text-muted-foreground">
              Today's sports and PPV channel information
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {new Date().toLocaleDateString()}
            <button
              onClick={fetchUpdates}
              className="ml-2 p-1 hover:bg-accent rounded"
              title="Refresh updates"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 xl:grid-cols-11 gap-1 h-auto flex-wrap">
            {sportCategories.map((category) => (
              <TabsTrigger key={category} value={category} className="text-xs px-2 py-1 h-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {category}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {/* Bulk Actions */}
            <SportsUpdatesBulkActions 
              updates={filteredUpdates}
              activeTab={activeTab}
              resellerId={user?.id}
            />

            {/* US Channel Categories Section - Filtered by active tab */}
            {filteredUSChannelCategories.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    📺 {activeTab === 'ALL' ? 'US Channel Categories' : `${activeTab} Channel Categories`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredUSChannelCategories.map((category, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                      >
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="font-medium text-blue-800 dark:text-blue-200 text-sm">{category}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    These are the US channel categories where you can find the sports content in your IPTV system.
                  </p>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-4 bg-muted rounded w-1/4"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="h-3 bg-muted rounded w-3/4"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : sortedUpdates.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Tv className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Updates Yet</h3>
                  <p className="text-muted-foreground">
                    {activeTab === 'ALL' 
                      ? "No sports updates received today"
                      : `No ${activeTab} updates today`
                    }
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {sortedUpdates.map((update) => (
                  <Card key={update.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Badge className={`${getSportColor(update.sport_category)} text-white`}>
                            {update.sport_category}
                          </Badge>
                          <span className="text-lg">{update.sport_category} Updates</span>
                        </CardTitle>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {formatTime(update.created_at)}
                          </div>
                          
                          <SportsUpdateShareMenu 
                            update={update} 
                            resellerId={user?.id}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="space-y-3">
                        {sortChannelInfo(update.channel_info).filter(info => info.game || !info.channel?.startsWith('US |')).map((info, index) => (
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
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}