import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const host = req.headers.get('host') || '';
    
    console.log(`[Funnel Router] Request to host: ${host}, path: ${url.pathname}`);

    // Extract subdomain from path (e.g., /my-funnel or /my-funnel/)
    const pathParts = url.pathname.split('/').filter(part => part.length > 0);
    if (pathParts.length === 0) {
      console.log('[Funnel Router] No subdomain in path');
      return new Response('Invalid path - subdomain required', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const subdomain = pathParts[0];
    console.log(`[Funnel Router] Extracted subdomain from path: ${subdomain}`);

    // Look up funnel by subdomain or custom domain
    const { data: funnel, error } = await supabase
      .from('funnels')
      .select(`
        *,
        template:funnel_templates(*)
      `)
      .or(`subdomain.eq.${subdomain},custom_domain.eq.${host}`)
      .eq('is_published', true)
      .single();

    if (error || !funnel) {
      console.log(`[Funnel Router] Funnel not found for subdomain: ${subdomain}`, error);
      return new Response('Funnel not found', { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    console.log(`[Funnel Router] Found funnel: ${funnel.name} (ID: ${funnel.id})`);

    // Get UTM parameters
    const utmSource = url.searchParams.get('utm_source') || '';
    const utmMedium = url.searchParams.get('utm_medium') || '';
    const utmCampaign = url.searchParams.get('utm_campaign') || '';

    // Build the complete HTML with injected analytics and form handling
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${funnel.name}</title>
    <style>
        ${funnel.css_content || ''}
    </style>
</head>
<body>
    ${funnel.html_content}
    
    <script>
        // UTM tracking
        const urlParams = new URLSearchParams(window.location.search);
        const utmData = {
            utm_source: urlParams.get('utm_source') || '${utmSource}',
            utm_medium: urlParams.get('utm_medium') || '${utmMedium}',
            utm_campaign: urlParams.get('utm_campaign') || '${utmCampaign}'
        };

        // Form submission handler
        document.addEventListener('DOMContentLoaded', function() {
            const forms = document.querySelectorAll('form');
            forms.forEach(form => {
                form.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    
                    const formData = new FormData(form);
                    const leadData = {
                        funnel_id: '${funnel.id}',
                        name: formData.get('name') || '',
                        email: formData.get('email') || '',
                        phone: formData.get('phone') || '',
                        utm_source: utmData.utm_source,
                        utm_medium: utmData.utm_medium,
                        utm_campaign: utmData.utm_campaign,
                        additional_data: {}
                    };

                    try {
                        const response = await fetch('https://hddnqgggjjlildufirof.supabase.co/functions/v1/capture-lead', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(leadData)
                        });

                        if (response.ok) {
                            // Show success message or redirect
                            alert('Thank you! Your information has been submitted.');
                            form.reset();
                        } else {
                            throw new Error('Submission failed');
                        }
                    } catch (error) {
                        console.error('Form submission error:', error);
                        alert('Something went wrong. Please try again.');
                    }
                });
            });
        });

        // Custom JS from template
        ${funnel.js_content || ''}
    </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html',
      },
    });

  } catch (error) {
    console.error('[Funnel Router] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});