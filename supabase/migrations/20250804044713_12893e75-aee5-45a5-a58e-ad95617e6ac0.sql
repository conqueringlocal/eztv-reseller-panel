-- Create funnel templates table
CREATE TABLE public.funnel_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  template_type text NOT NULL, -- 'lead_capture', 'subscription', 'app_setup', 'referral', 'plan_comparison', 'trial_expired'
  preview_image_url text,
  html_content text NOT NULL,
  css_content text,
  js_content text,
  form_fields jsonb DEFAULT '[]'::jsonb, -- Array of form field configurations
  integrations jsonb DEFAULT '{}'::jsonb, -- HighLevel, webhooks, etc.
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create funnels table (user instances of templates)
CREATE TABLE public.funnels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.funnel_templates(id),
  name text NOT NULL,
  subdomain text NOT NULL UNIQUE, -- e.g., 'my-iptv-offer' for my-iptv-offer.eztvclub.com
  custom_domain text, -- Optional custom domain
  is_published boolean NOT NULL DEFAULT false,
  html_content text NOT NULL, -- Customized content from template
  css_content text,
  js_content text,
  form_fields jsonb DEFAULT '[]'::jsonb,
  integrations jsonb DEFAULT '{}'::jsonb,
  analytics jsonb DEFAULT '{}'::jsonb, -- Visit counts, conversion rates, etc.
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funnel_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;

-- RLS Policies for funnel_templates
CREATE POLICY "Anyone can view active templates"
ON public.funnel_templates
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage all templates"
ON public.funnel_templates
FOR ALL
USING (is_admin());

-- RLS Policies for funnels  
CREATE POLICY "Resellers can view own funnels"
ON public.funnels
FOR SELECT
USING (reseller_id = auth.uid());

CREATE POLICY "Resellers can create own funnels"
ON public.funnels
FOR INSERT
WITH CHECK (reseller_id = auth.uid());

CREATE POLICY "Resellers can update own funnels"
ON public.funnels
FOR UPDATE
USING (reseller_id = auth.uid());

CREATE POLICY "Resellers can delete own funnels"
ON public.funnels
FOR DELETE
USING (reseller_id = auth.uid());

CREATE POLICY "Admins can view all funnels"
ON public.funnels
FOR SELECT
USING (is_admin());

-- Create update trigger for updated_at
CREATE TRIGGER update_funnel_templates_updated_at
BEFORE UPDATE ON public.funnel_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_funnels_updated_at
BEFORE UPDATE ON public.funnels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default IPTV funnel templates
INSERT INTO public.funnel_templates (name, description, template_type, html_content, css_content, form_fields, integrations) VALUES 
(
  'Lead Capture - IPTV Free Trial',
  'Capture leads with a compelling free trial offer for IPTV services',
  'lead_capture',
  '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Free 24-Hour IPTV Trial</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="hero-section">
            <h1>Get Your FREE 24-Hour IPTV Trial</h1>
            <p class="subtitle">Access 15,000+ channels, premium sports, movies & TV shows instantly</p>
            <ul class="benefits">
                <li>✓ 15,000+ Live TV Channels</li>
                <li>✓ Premium Sports (NFL, NBA, UFC)</li>
                <li>✓ Latest Movies & TV Series</li>
                <li>✓ Works on Any Device</li>
                <li>✓ No Contract Required</li>
            </ul>
        </div>
        
        <div class="form-section">
            <form id="lead-form" class="lead-form">
                <h2>Start Your Free Trial Now</h2>
                <input type="text" name="name" placeholder="Full Name" required>
                <input type="email" name="email" placeholder="Email Address" required>
                <input type="tel" name="phone" placeholder="Phone Number" required>
                <button type="submit">Get Instant Access</button>
                <p class="disclaimer">No credit card required. Cancel anytime.</p>
            </form>
        </div>
    </div>
</body>
</html>',
  'body { font-family: "Inter", sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; display: grid; grid-template-columns: 1fr 400px; gap: 60px; align-items: center; min-height: 100vh; }
.hero-section { color: white; }
.hero-section h1 { font-size: 48px; font-weight: 700; margin-bottom: 20px; line-height: 1.2; }
.subtitle { font-size: 20px; margin-bottom: 30px; opacity: 0.9; }
.benefits { list-style: none; padding: 0; margin: 0; }
.benefits li { font-size: 18px; margin-bottom: 12px; opacity: 0.95; }
.form-section { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
.lead-form h2 { margin-bottom: 24px; color: #333; text-align: center; }
.lead-form input { width: 100%; padding: 16px; margin-bottom: 16px; border: 2px solid #e1e5e9; border-radius: 8px; font-size: 16px; }
.lead-form input:focus { outline: none; border-color: #667eea; }
.lead-form button { width: 100%; padding: 18px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 18px; font-weight: 600; cursor: pointer; }
.lead-form button:hover { background: #5a6fd8; }
.disclaimer { text-align: center; margin-top: 16px; font-size: 14px; color: #666; }
@media (max-width: 768px) { .container { grid-template-columns: 1fr; gap: 40px; } .hero-section h1 { font-size: 36px; } }',
  '[{"name": "name", "type": "text", "label": "Full Name", "required": true}, {"name": "email", "type": "email", "label": "Email Address", "required": true}, {"name": "phone", "type": "tel", "label": "Phone Number", "required": true}]',
  '{"highlevel": {"enabled": true, "webhook_url": ""}, "email": {"enabled": true, "autoresponder": true}}'
),
(
  'Subscription Plans - IPTV Packages',
  'Display subscription plans and pricing for IPTV packages',
  'plan_comparison',
  '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IPTV Subscription Plans</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Choose Your IPTV Plan</h1>
            <p>All plans include 15,000+ channels, premium content, and multi-device support</p>
        </div>
        
        <div class="pricing-grid">
            <div class="plan-card">
                <h3>1 Month</h3>
                <div class="price">$19.99<span>/month</span></div>
                <ul class="features">
                    <li>✓ 15,000+ Live Channels</li>
                    <li>✓ Premium Sports & Movies</li>
                    <li>✓ 1 Connection</li>
                    <li>✓ 24/7 Support</li>
                </ul>
                <button class="plan-btn" onclick="selectPlan(1, 19.99)">Get Started</button>
            </div>
            
            <div class="plan-card popular">
                <div class="badge">Most Popular</div>
                <h3>3 Months</h3>
                <div class="price">$49.99<span>/3 months</span></div>
                <div class="savings">Save $9.98</div>
                <ul class="features">
                    <li>✓ 15,000+ Live Channels</li>
                    <li>✓ Premium Sports & Movies</li>
                    <li>✓ 2 Connections</li>
                    <li>✓ 24/7 Support</li>
                    <li>✓ VPN Included</li>
                </ul>
                <button class="plan-btn" onclick="selectPlan(3, 49.99)">Get Started</button>
            </div>
            
            <div class="plan-card">
                <h3>12 Months</h3>
                <div class="price">$149.99<span>/year</span></div>
                <div class="savings">Save $89.89</div>
                <ul class="features">
                    <li>✓ 15,000+ Live Channels</li>
                    <li>✓ Premium Sports & Movies</li>
                    <li>✓ 3 Connections</li>
                    <li>✓ Priority Support</li>
                    <li>✓ VPN Included</li>
                    <li>✓ Mobile App</li>
                </ul>
                <button class="plan-btn" onclick="selectPlan(12, 149.99)">Get Started</button>
            </div>
        </div>
    </div>
</body>
</html>',
  'body { font-family: "Inter", sans-serif; margin: 0; padding: 0; background: #f8fafc; }
.container { max-width: 1200px; margin: 0 auto; padding: 60px 20px; }
.header { text-align: center; margin-bottom: 60px; }
.header h1 { font-size: 42px; font-weight: 700; color: #1a202c; margin-bottom: 16px; }
.header p { font-size: 18px; color: #64748b; }
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
.plan-card { background: white; border-radius: 16px; padding: 40px 30px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 2px solid transparent; position: relative; }
.plan-card.popular { border-color: #667eea; transform: scale(1.05); }
.badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #667eea; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; }
.plan-card h3 { font-size: 24px; font-weight: 600; color: #1a202c; margin-bottom: 16px; }
.price { font-size: 36px; font-weight: 700; color: #667eea; margin-bottom: 8px; }
.price span { font-size: 16px; color: #64748b; }
.savings { color: #10b981; font-weight: 600; margin-bottom: 24px; }
.features { list-style: none; padding: 0; margin: 24px 0; }
.features li { padding: 8px 0; color: #4a5568; }
.plan-btn { width: 100%; padding: 16px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
.plan-btn:hover { background: #5a6fd8; }',
  '[]',
  '{"payment": {"enabled": true, "processor": "stripe"}, "redirect": {"enabled": true, "success_url": "/setup"}}'
),
(
  'App Setup Guide',
  'Help users set up their IPTV app after subscription',
  'app_setup',
  '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup Your IPTV App</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome! Let''s Set Up Your IPTV</h1>
            <p>Follow these simple steps to start watching in minutes</p>
        </div>
        
        <div class="credentials-section">
            <h2>Your Login Details</h2>
            <div class="credential-item">
                <label>Server URL:</label>
                <div class="credential-value" id="server-url">Loading...</div>
                <button class="copy-btn" onclick="copyToClipboard(''server-url'')">Copy</button>
            </div>
            <div class="credential-item">
                <label>Username:</label>
                <div class="credential-value" id="username">Loading...</div>
                <button class="copy-btn" onclick="copyToClipboard(''username'')">Copy</button>
            </div>
            <div class="credential-item">
                <label>Password:</label>
                <div class="credential-value" id="password">Loading...</div>
                <button class="copy-btn" onclick="copyToClipboard(''password'')">Copy</button>
            </div>
        </div>
        
        <div class="setup-steps">
            <h2>Setup Instructions</h2>
            <div class="step">
                <div class="step-number">1</div>
                <div class="step-content">
                    <h3>Download the App</h3>
                    <p>Download TiviMate or IPTV Smarters from your device''s app store</p>
                </div>
            </div>
            
            <div class="step">
                <div class="step-number">2</div>
                <div class="step-content">
                    <h3>Add Your Playlist</h3>
                    <p>Open the app and add a new playlist using your credentials above</p>
                </div>
            </div>
            
            <div class="step">
                <div class="step-number">3</div>
                <div class="step-content">
                    <h3>Start Watching</h3>
                    <p>Your channels will load automatically. Enjoy your IPTV service!</p>
                </div>
            </div>
        </div>
        
        <div class="support-section">
            <h3>Need Help?</h3>
            <p>Contact our 24/7 support team</p>
            <button class="support-btn">Get Support</button>
        </div>
    </div>
</body>
</html>',
  'body { font-family: "Inter", sans-serif; margin: 0; padding: 0; background: #f8fafc; }
.container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
.header { text-align: center; margin-bottom: 40px; }
.header h1 { font-size: 32px; font-weight: 700; color: #1a202c; }
.header p { color: #64748b; font-size: 16px; }
.credentials-section, .setup-steps, .support-section { background: white; border-radius: 12px; padding: 30px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.credential-item { display: flex; align-items: center; margin-bottom: 16px; gap: 12px; }
.credential-item label { font-weight: 600; min-width: 100px; }
.credential-value { flex: 1; background: #f1f5f9; padding: 12px; border-radius: 6px; font-family: monospace; }
.copy-btn { padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; }
.step { display: flex; align-items: flex-start; margin-bottom: 24px; }
.step-number { width: 40px; height: 40px; background: #667eea; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; margin-right: 20px; flex-shrink: 0; }
.step-content h3 { margin: 0 0 8px 0; color: #1a202c; }
.step-content p { margin: 0; color: #64748b; }
.support-section { text-align: center; }
.support-btn { padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }',
  '[]',
  '{"customer_lookup": {"enabled": true, "url_param": "customer_id"}}'
);