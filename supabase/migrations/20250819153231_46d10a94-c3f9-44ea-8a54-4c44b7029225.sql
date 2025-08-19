-- Create sports_ppv_updates table for storing parsed Telegram updates
CREATE TABLE public.sports_ppv_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  sport_category TEXT NOT NULL,
  game_date DATE NOT NULL,
  channel_info JSONB DEFAULT '[]'::jsonb,
  posted_to_highlevel BOOLEAN DEFAULT false,
  telegram_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sports_ppv_updates ENABLE ROW LEVEL SECURITY;

-- Create policies for sports updates
CREATE POLICY "Admins can view all sports updates" 
ON public.sports_ppv_updates 
FOR SELECT 
USING (is_admin());

CREATE POLICY "Resellers can view sports updates" 
ON public.sports_ppv_updates 
FOR SELECT 
USING (true);

CREATE POLICY "System can insert sports updates" 
ON public.sports_ppv_updates 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update sports updates" 
ON public.sports_ppv_updates 
FOR UPDATE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_sports_ppv_updates_updated_at
BEFORE UPDATE ON public.sports_ppv_updates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for efficient queries
CREATE INDEX idx_sports_ppv_updates_game_date ON public.sports_ppv_updates(game_date);
CREATE INDEX idx_sports_ppv_updates_sport_category ON public.sports_ppv_updates(sport_category);
CREATE INDEX idx_sports_ppv_updates_telegram_message_id ON public.sports_ppv_updates(telegram_message_id);

-- Enable realtime for live updates
ALTER TABLE public.sports_ppv_updates REPLICA IDENTITY FULL;