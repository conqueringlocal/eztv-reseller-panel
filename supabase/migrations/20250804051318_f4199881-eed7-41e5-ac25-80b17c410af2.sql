-- Create funnel_leads table for storing lead data
CREATE TABLE public.funnel_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  ip_address INET,
  user_agent TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  additional_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funnel_leads ENABLE ROW LEVEL SECURITY;

-- Create policies for funnel leads
CREATE POLICY "Admins can view all leads" 
ON public.funnel_leads 
FOR SELECT 
USING (is_admin());

CREATE POLICY "Funnel owners can view their leads" 
ON public.funnel_leads 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.funnels 
    WHERE funnels.id = funnel_leads.funnel_id 
    AND funnels.reseller_id = auth.uid()
  )
);

CREATE POLICY "Anyone can insert leads" 
ON public.funnel_leads 
FOR INSERT 
WITH CHECK (true);

-- Add foreign key constraint
ALTER TABLE public.funnel_leads 
ADD CONSTRAINT funnel_leads_funnel_id_fkey 
FOREIGN KEY (funnel_id) REFERENCES public.funnels(id) ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX idx_funnel_leads_funnel_id ON public.funnel_leads(funnel_id);
CREATE INDEX idx_funnel_leads_created_at ON public.funnel_leads(created_at);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_funnel_leads_updated_at
BEFORE UPDATE ON public.funnel_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();