import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Clock, Tv, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  const sportCategories = ['ALL', 'MLB', 'NBA', 'NFL', 'TENNIS', 'SOCCER', 'PPV', 'RACING', 'GENERAL'];

  const fetchUpdates = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('sports_ppv_updates')
        .select('*')
        .eq('game_date', today)
        .order('created_at', { ascending: false });

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
    ? updates 
    : updates.filter(update => update.sport_category === activeTab);

  const getSportColor = (category: string) => {
    const colors: Record<string, string> = {
      'MLB': 'bg-blue-500',
      'NBA': 'bg-orange-500',
      'NFL': 'bg-green-500',
      'TENNIS': 'bg-yellow-500',
      'SOCCER': 'bg-purple-500',
      'PPV': 'bg-red-500',
      'RACING': 'bg-amber-500',
      'GENERAL': 'bg-gray-500'
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
          <TabsList className="grid grid-cols-4 lg:grid-cols-9 gap-1">
            {sportCategories.map((category) => (
              <TabsTrigger key={category} value={category} className="text-xs">
                {category}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {/* US Channel Categories Section - Filtered by active tab */}
            {filteredUSChannelCategories.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    📺 {activeTab === 'ALL' ? 'US Channel Categories' : `${activeTab} Channel Categories`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredUSChannelCategories.map((category, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200"
                      >
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="font-medium text-blue-800">{category}</span>
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
            ) : filteredUpdates.length === 0 ? (
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
                {filteredUpdates.map((update) => (
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
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatTime(update.created_at)}
                          </div>
                          {update.posted_to_highlevel && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Posted to HighLevel
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="space-y-3">
                        {update.channel_info.filter(info => info.game || !info.channel?.startsWith('US |')).map((info, index) => (
                          <div 
                            key={index}
                            className="flex items-center justify-between p-3 bg-accent/50 rounded-lg"
                          >
                            <div className="flex-1">
                              <div className="font-medium">{info.game || 'Event Information'}</div>
                              {info.time && (
                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {info.time}
                                </div>
                              )}
                            </div>
                            
                            {info.channel && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Tv className="h-3 w-3" />
                                {info.channel}
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