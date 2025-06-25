
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TrexUserParams {
  username: string;
  password: string;
  maxConnections: number;
  expiryDate: string; // ISO string
  isTrial: boolean;
  bouquet?: string;
  output?: string;
  ip?: string;
  customerName?: string;
  resellerName?: string;
}

// Helper function to calculate subscription months from expiry date
function calculateSubscriptionMonths(expiryDateStr: string): number {
  const expiryDate = new Date(expiryDateStr);
  const today = new Date();
  const diffTime = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  console.log(`📊 Days until expiry: ${diffDays}`);
  
  // Use proper day-based thresholds to determine subscription duration
  if (diffDays <= 45) {
    console.log(`📅 Mapping to 1 month (${diffDays} days <= 45 days)`);
    return 1;
  } else if (diffDays <= 120) {
    console.log(`📅 Mapping to 3 months (${diffDays} days <= 120 days)`);
    return 3;
  } else if (diffDays <= 210) {
    console.log(`📅 Mapping to 6 months (${diffDays} days <= 210 days)`);
    return 6;
  } else {
    console.log(`📅 Mapping to 12 months (${diffDays} days > 210 days)`);
    return 12;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userParams }: { userParams: TrexUserParams } = await req.json()

    // Get configuration from environment
    const API_KEY = Deno.env.get('TREX_API_KEY')
    const PANEL_URL = Deno.env.get('TREX_PANEL_URL')
    
    if (!API_KEY) {
      console.error('❌ Trex API key not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Trex API key not configured'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    if (!PANEL_URL) {
      console.error('❌ Trex Panel URL not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Trex Panel URL not configured'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    // Calculate subscription duration in months
    const subscriptionMonths = calculateSubscriptionMonths(userParams.expiryDate);

    console.log(`🔄 Creating Trex user: ${userParams.username}`)
    console.log(`📅 Expiry date: ${userParams.expiryDate}`)
    console.log(`📦 Subscription duration: ${subscriptionMonths} months`)
    console.log(`📦 Package ID: ${userParams.bouquet}`)
    console.log(`🌐 Panel URL: ${PANEL_URL}`)

    try {
      // Construct the URL with the correct parameters as specified
      const apiUrl = new URL(PANEL_URL);
      apiUrl.searchParams.append('action', 'new');
      apiUrl.searchParams.append('type', 'm3u');
      apiUrl.searchParams.append('sub', subscriptionMonths.toString());
      apiUrl.searchParams.append('pack', userParams.bouquet || '1');
      apiUrl.searchParams.append('api_key', API_KEY);
      
      // Add notes parameter with customer and reseller names
      if (userParams.customerName && userParams.resellerName) {
        const notes = `Customer: ${userParams.customerName} | Reseller: ${userParams.resellerName}`;
        apiUrl.searchParams.append('notes', notes);
        console.log(`📝 Adding notes: ${notes}`);
      }
      
      // Optional parameters
      if (userParams.ip && userParams.ip !== '*') {
        apiUrl.searchParams.append('country', 'ALL'); // Use ALL for VPN as suggested
      }
      
      console.log(`🔗 API URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`);
      
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'IPTV-Management-System/1.0',
          'Accept': 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
      
      const responseText = await response.text();
      console.log(`📡 Response Status: ${response.status}`);
      console.log(`📡 Response: ${responseText}`);

      if (!response.ok) {
        console.log(`❌ HTTP Error: ${response.status} - ${response.statusText}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `HTTP ${response.status}: ${response.statusText}`,
            debug_info: {
              panel_url: PANEL_URL,
              package_id: userParams.bouquet,
              subscription_months: subscriptionMonths,
              response_text: responseText
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // Check if it's an HTML error page
      if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
        console.log(`❌ Received HTML error page`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Received HTML error page instead of API response',
            debug_info: {
              panel_url: PANEL_URL,
              package_id: userParams.bouquet,
              subscription_months: subscriptionMonths,
              response_preview: responseText.substring(0, 200)
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // Try to parse as JSON first
      let data;
      try {
        data = JSON.parse(responseText);
        console.log(`📋 Parsed JSON response:`, data);
      } catch (parseError) {
        // If it's not JSON, treat as text response
        console.log(`📄 Response is not JSON, treating as text`);
        
        // For the Trex API, a successful response might be plain text with credentials
        if (responseText.length > 10 && !responseText.toLowerCase().includes('error') && 
            !responseText.toLowerCase().includes('fail')) {
          // Try to extract credentials from text response
          const lines = responseText.split('\n').filter(line => line.trim());
          const credentialData = {
            success: true,
            response: responseText,
            message: 'Account created successfully'
          };
          
          // Look for username/password patterns in the response
          for (const line of lines) {
            if (line.toLowerCase().includes('username') || line.toLowerCase().includes('user')) {
              credentialData.username = line.split(':')[1]?.trim() || userParams.username;
            }
            if (line.toLowerCase().includes('password') || line.toLowerCase().includes('pass')) {
              credentialData.password = line.split(':')[1]?.trim() || userParams.password;
            }
          }
          
          data = credentialData;
        } else {
          console.log(`❌ Invalid response format: ${responseText.substring(0, 100)}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Invalid response format: ${responseText.substring(0, 100)}`,
              debug_info: {
                panel_url: PANEL_URL,
                package_id: userParams.bouquet,
                subscription_months: subscriptionMonths,
                full_response: responseText
              }
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            },
          )
        }
      }

      // Check for API errors in the response
      if (data.error || data.status === 'error' || data.result?.includes?.('error')) {
        const errorMsg = data.error || data.result || data.message || 'API returned error status';
        console.log(`❌ API Error: ${errorMsg}`);
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `API Error: ${errorMsg}`,
            debug_info: {
              panel_url: PANEL_URL,
              package_id: userParams.bouquet,
              subscription_months: subscriptionMonths,
              api_response: data
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // Process successful response and extract credentials from URL
      let extractedUsername = userParams.username;
      let extractedPassword = userParams.password;
      let m3uUrl = '';
      
      // Extract credentials from the URL field in the API response
      if (data.url) {
        console.log(`🔗 Extracting credentials from URL: ${data.url}`);
        
        try {
          const urlObj = new URL(data.url);
          const urlUsername = urlObj.searchParams.get('username');
          const urlPassword = urlObj.searchParams.get('password');
          
          if (urlUsername && urlPassword) {
            extractedUsername = urlUsername;
            extractedPassword = urlPassword;
            console.log(`✅ Extracted credentials from URL - Username: ${extractedUsername}, Password: ${extractedPassword}`);
          } else {
            console.log(`⚠️ Could not extract credentials from URL, using original credentials`);
          }
        } catch (urlError) {
          console.log(`⚠️ Error parsing URL for credentials: ${urlError.message}`);
        }
        
        // Use the URL provided by the API as the M3U URL
        m3uUrl = data.url;
      } else {
        // Fallback: Check if response contains credentials directly
        if (data.username && data.password) {
          extractedUsername = data.username;
          extractedPassword = data.password;
          console.log(`✅ Using credentials from response data - Username: ${extractedUsername}, Password: ${extractedPassword}`);
        }
        
        // Generate M3U URL based on panel URL structure as fallback
        const baseUrl = PANEL_URL.replace('/api/api.php', '').replace('/player_api.php', '');
        m3uUrl = `${baseUrl}/get.php?username=${extractedUsername}&password=${extractedPassword}&type=m3u_plus&output=ts`;
      }

      const createdUser = {
        username: extractedUsername,
        password: extractedPassword,
        expiryDate: userParams.expiryDate,
        connections: userParams.maxConnections,
        accountType: 'M3U',
        m3uUrl: m3uUrl,
        userId: data.user_id || data.id || null,
        apiResponse: data
      };
      
      console.log(`✅ SUCCESS: Trex user created successfully`);
      console.log(`👤 Username: ${extractedUsername}`);
      console.log(`🔑 Password: ${extractedPassword}`);
      console.log(`🔗 M3U URL: ${m3uUrl}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: data,
          user: createdUser,
          message: `Trex M3U account created successfully for ${createdUser.username}`,
          m3uUrl: createdUser.m3uUrl,
          debug_info: {
            panel_url: PANEL_URL,
            package_used: userParams.bouquet,
            subscription_months: subscriptionMonths,
            api_response: data
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
      
    } catch (error) {
      console.error(`💥 Error during API call:`, error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `API call failed: ${error.message}`,
          debug_info: {
            panel_url: PANEL_URL,
            package_id: userParams.bouquet,
            subscription_months: subscriptionMonths,
            error_details: error.stack
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

  } catch (error) {
    console.error('💥 Unexpected error in create-trex-user function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
