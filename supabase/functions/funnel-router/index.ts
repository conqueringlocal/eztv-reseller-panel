import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const htmlHeaders = {
  ...corsHeaders,
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
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
    
    console.log(`[Funnel Router] Request to host: ${host}, path: ${url.pathname}, full URL: ${req.url}`);

    // Extract subdomain from path
    // When called via /functions/v1/funnel-router/subdomain, the path becomes /funnel-router/subdomain
    // So we need to skip the function name (first segment) and get the actual subdomain (second segment)
    let subdomain = '';
    
    // Remove leading slash and get path segments
    const cleanPath = url.pathname.replace(/^\/+/, ''); // Remove leading slashes
    const pathParts = cleanPath.split('/').filter(part => part.length > 0);
    
    console.log(`[Funnel Router] Clean path: "${cleanPath}", path parts:`, pathParts);
    
    // Path should be: [function-name, subdomain, ...optional-path]
    // We need the second segment as the subdomain
    if (pathParts.length < 2) {
      console.log('[Funnel Router] No subdomain in path - need at least function-name/subdomain');
      return new Response('Funnel not found - subdomain required in path', { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    subdomain = pathParts[1]; // Skip function name, get actual subdomain
    console.log(`[Funnel Router] Extracted subdomain from path: "${subdomain}"`);

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

    // Check if the funnel content is a complete HTML document
    const htmlContent = funnel.html_content || '';
    const isCompleteDocument = htmlContent.trim().toLowerCase().startsWith('<!doctype html') || 
                              htmlContent.trim().toLowerCase().startsWith('<html');

    let html;
    
    if (isCompleteDocument) {
      console.log(`[Funnel Router] Injecting scripts into complete HTML document for funnel: ${funnel.name}`);
      
      // Parse and inject into existing HTML structure
      let modifiedHtml = htmlContent;
      
      // Ensure proper meta tags and charset
      if (!modifiedHtml.includes('<meta charset')) {
        modifiedHtml = modifiedHtml.replace('<head>', '<head>\n    <meta charset="UTF-8">');
      }
      
      if (!modifiedHtml.includes('viewport')) {
        modifiedHtml = modifiedHtml.replace('</head>', '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n</head>');
      }
      
      // Add compatibility meta tags
      const compatibilityMeta = `
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">`;
      
      if (!modifiedHtml.includes('X-UA-Compatible')) {
        modifiedHtml = modifiedHtml.replace('</head>', `${compatibilityMeta}\n</head>`);
      }
      
      // Inject CSS into head (before closing </head> tag)
      if (funnel.css_content) {
        const cssToInject = `
    <style>
        ${funnel.css_content}
    </style>`;
        modifiedHtml = modifiedHtml.replace('</head>', `${cssToInject}\n</head>`);
      }
      
      // Update title if head exists but no title
      if (!modifiedHtml.includes('<title>')) {
        modifiedHtml = modifiedHtml.replace('</head>', `    <title>${funnel.name}</title>\n</head>`);
      }
      
      // Inject tracking and form scripts before closing </body> tag
      const scriptsToInject = `
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
    </script>`;
      
      modifiedHtml = modifiedHtml.replace('</body>', `${scriptsToInject}\n</body>`);
      html = modifiedHtml;
      
    } else {
      console.log(`[Funnel Router] Wrapping HTML fragment for funnel: ${funnel.name}`);
      
      // Build the complete HTML with injected analytics and form handling (original behavior)
      html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
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
    }

    console.log(`[Funnel Router] Returning HTML response for funnel: ${funnel.name}, length: ${html.length} chars`);
    console.log(`[Funnel Router] Response headers:`, htmlHeaders);
    
    return new Response(html, {
      headers: htmlHeaders,
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