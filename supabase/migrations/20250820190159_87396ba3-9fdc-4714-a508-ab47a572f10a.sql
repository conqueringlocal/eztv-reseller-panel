-- Phase 1: Database Schema Updates for Hierarchical Credit Management

-- Add fields to profiles table for credit pricing and purchase control
ALTER TABLE public.profiles 
ADD COLUMN credit_price_per_unit DECIMAL(10,2),
ADD COLUMN credit_purchase_enabled BOOLEAN DEFAULT true;

-- Create credit_requests table for Level 2 resellers to request credits from their parents
CREATE TABLE public.credit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_reseller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits_requested INTEGER NOT NULL,
  price_per_credit DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  message TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Enable RLS on credit_requests
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for credit_requests
CREATE POLICY "Users can view their own credit requests" 
ON public.credit_requests 
FOR SELECT 
USING (requester_id = auth.uid());

CREATE POLICY "Parent resellers can view requests for their sub-resellers" 
ON public.credit_requests 
FOR SELECT 
USING (parent_reseller_id = auth.uid());

CREATE POLICY "Users can create their own credit requests" 
ON public.credit_requests 
FOR INSERT 
WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Parent resellers can update requests for their sub-resellers" 
ON public.credit_requests 
FOR UPDATE 
USING (parent_reseller_id = auth.uid());

CREATE POLICY "Admins can view all credit requests" 
ON public.credit_requests 
FOR ALL 
USING (is_admin());

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_credit_requests_updated_at
  BEFORE UPDATE ON public.credit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for better performance
CREATE INDEX idx_credit_requests_requester ON public.credit_requests(requester_id);
CREATE INDEX idx_credit_requests_parent ON public.credit_requests(parent_reseller_id);
CREATE INDEX idx_credit_requests_status ON public.credit_requests(status);