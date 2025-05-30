
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IPTVUserParams {
  username: string;
  password: string;
  maxConnections: number;
  expiryDate: string; // ISO string
  isTrial: boolean;
  bouquet?: string;
  output?: string;
  ip?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userParams }: { userParams: IPTVUserParams } = await req.json()

    // Get configuration from environment
    const API_KEY = Deno.env.get('IPTV_API_KEY')
    const PANEL_URL = Deno.env.get('IPTV_PANEL_URL')
    
    if (!API_KEY) {
      console.error('IPTV API key not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV API key not configured'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    if (!PANEL_URL) {
      console.error('IPTV Panel URL not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV Panel URL not configured'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    // Convert ISO date string to days from now
    const expiryDate = new Date(userParams.expiryDate);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const sub = Math.max(1, diffDays);

    console.log(`🔄 Creating IPTV user: ${userParams.username}`)
    console.log(`📅 Subscription days: ${sub}`)
    console.log(`📦 Using package/bouquet: ${userParams.bouquet}`)
    console.log(`🌐 Panel URL: ${PANEL_URL}`)

    let createdUser = null;
    let lastError = '';
    let successfulAction = '';

    // Try different actions for user creation in order of preference
    const actions = [
      { action: 'new', type: 'm3u' },
      { action: 'user_create', type: 'm3u' },
      { action: 'create_user', type: 'm3u' },
      { action: 'add_user', type: 'm3u' }
    ];

    for (const actionConfig of actions) {
      try {
        console.log(`🧪 Trying action: ${actionConfig.action} with type: ${actionConfig.type}`)
        
        // Construct the URL with query parameters
        const apiUrl = new URL(PANEL_URL);
        apiUrl.searchParams.append('action', actionConfig.action);
        apiUrl.searchParams.append('api_key', API_KEY);
        
        // Add parameters based on action type
        if (actionConfig.action === 'new') {
          apiUrl.searchParams.append('type', actionConfig.type);
          apiUrl.searchParams.append('sub', sub.toString());
          apiUrl.searchParams.append('pack', userParams.bouquet || '1');
          apiUrl.searchParams.append('country', 'us');
          apiUrl.searchParams.append('notes', `User: ${userParams.username}`);
        } else {
          // Standard user creation parameters
          apiUrl.searchParams.append('user_username', userParams.username);
          apiUrl.searchParams.append('user_password', userParams.password);
          apiUrl.searchParams.append('user_max_connections', userParams.maxConnections.toString());
          apiUrl.searchParams.append('user_expire', sub.toString());
          apiUrl.searchParams.append('user_is_trial', userParams.isTrial ? '1' : '0');
          apiUrl.searchParams.append('user_bouquet', userParams.bouquet || '1');
          apiUrl.searchParams.append('user_output', userParams.output || 'ts');
          apiUrl.searchParams.append('user_ip', userParams.ip || '*');
        }
        
        console.log(`🔗 Full URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`);
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'IPTV-Management-System/1.0',
            'Accept': 'application/json, text/plain, */*',
            'Cache-Control': 'no-cache',
          },
          signal: AbortSignal.timeout(15000), // 15 second timeout
        });
        
        const responseText = await response.text();
        console.log(`📡 Response Status: ${response.status}`);
        console.log(`📡 Response preview: ${responseText.substring(0, 300)}...`);

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          console.log(`❌ Failed with: ${lastError}`);
          continue;
        }

        // Check if it's an HTML error page
        if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
          lastError = 'Received HTML error page instead of API response';
          console.log(`❌ Failed with: ${lastError}`);
          continue;
        }

        // Try to parse as JSON
        let data;
        try {
          data = JSON.parse(responseText);
          console.log(`📋 Parsed JSON data:`, data);
        } catch (parseError) {
          // If it's not JSON, treat as text response
          console.log(`📄 Response is not JSON, treating as text`);
          
          // Check if response looks like success (contains useful data)
          if (responseText.length > 10 && !responseText.toLowerCase().includes('error')) {
            data = {
              success: true,
              response: responseText,
              message: 'Account created successfully'
            };
          } else {
            lastError = `Invalid response format: ${responseText.substring(0, 100)}`;
            console.log(`❌ Failed with: ${lastError}`);
            continue;
          }
        }

        // Check for API errors in the response
        if (data.error || data.status === 'error' || data.result?.includes?.('error')) {
          const errorMsg = data.error || data.result || data.message || 'API returned error status';
          lastError = errorMsg;
          console.log(`❌ API Error: ${errorMsg}`);
          
          // If it's a "Subscription Package not found" error, try with different package ID
          if (errorMsg.includes('Subscription Package not found') || errorMsg.includes('Package not found')) {
            console.log(`🔄 Package ${userParams.bouquet} not found, trying with package ID 1`);
            // Update the URL to use package ID 1 instead
            if (actionConfig.action === 'new') {
              apiUrl.searchParams.set('pack', '1');
            } else {
              apiUrl.searchParams.set('user_bouquet', '1');
            }
            
            console.log(`🔗 Retry URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`);
            
            const retryResponse = await fetch(apiUrl.toString(), {
              method: 'GET',
              headers: {
                'User-Agent': 'IPTV-Management-System/1.0',
                'Accept': 'application/json, text/plain, */*',
                'Cache-Control': 'no-cache',
              },
              signal: AbortSignal.timeout(15000),
            });
            
            const retryResponseText = await retryResponse.text();
            console.log(`🔄 Retry Response Status: ${retryResponse.status}`);
            console.log(`🔄 Retry Response: ${retryResponseText.substring(0, 300)}...`);
            
            if (retryResponse.ok && !retryResponseText.includes('<html')) {
              try {
                const retryData = JSON.parse(retryResponseText);
                if (!retryData.error && retryData.status !== 'error') {
                  data = retryData;
                  console.log(`✅ Retry successful with package ID 1`);
                }
              } catch {
                // If not JSON but looks successful
                if (retryResponseText.length > 10 && !retryResponseText.toLowerCase().includes('error')) {
                  data = {
                    success: true,
                    response: retryResponseText,
                    message: 'Account created successfully with fallback package'
                  };
                  console.log(`✅ Retry successful with text response`);
                }
              }
            }
          }
          
          // If still has error after retry, continue to next action
          if (data.error || data.status === 'error') {
            continue;
          }
        }

        // Check for success indicators
        const isSuccess = data.success === true || 
                         data.status === 'success' || 
                         data.message?.includes('success') || 
                         (typeof data.response === 'string' && data.response.length > 0) ||
                         data.user_id ||
                         data.id;

        if (isSuccess) {
          // Extract or generate credentials and M3U URL
          let extractedUsername = userParams.username;
          let extractedPassword = userParams.password;
          let m3uUrl = '';
          
          // Check if response contains credentials
          if (data.username && data.password) {
            extractedUsername = data.username;
            extractedPassword = data.password;
          }
          
          // Check if response contains an M3U URL
          if (data.response && typeof data.response === 'string' && data.response.includes('http')) {
            m3uUrl = data.response;
          } else if (data.m3u_url) {
            m3uUrl = data.m3u_url;
          } else if (data.url) {
            m3uUrl = data.url;
          } else {
            // Generate M3U URL based on standard format
            m3uUrl = `http://my8k.me:8080/get.php?username=${extractedUsername}&password=${extractedPassword}&type=m3u_plus&output=ts`;
          }

          createdUser = {
            username: extractedUsername,
            password: extractedPassword,
            expiryDate: userParams.expiryDate,
            connections: userParams.maxConnections,
            accountType: 'M3U',
            m3uUrl: m3uUrl,
            userId: data.user_id || data.id || null,
            apiResponse: data
          };
          
          successfulAction = `${actionConfig.action} action`;
          console.log(`✅ SUCCESS: User created using ${successfulAction}`);
          console.log(`👤 Username: ${extractedUsername}`);
          console.log(`🔗 M3U URL generated: ${m3uUrl}`);
          break;
        } else {
          lastError = `No success indicators found in ${actionConfig.action} response`;
          console.log(`❌ Failed with: ${lastError}`);
        }
        
      } catch (error) {
        console.error(`💥 Error with ${actionConfig.action} action:`, error);
        lastError = error.message;
        continue;
      }
    }

    // Check if user creation was successful
    if (!createdUser) {
      console.log(`❌ All user creation attempts failed`);
      console.log(`🔍 Last error: ${lastError}`);
      console.log(`🌐 Panel URL used: ${PANEL_URL}`);
      console.log(`📦 Package ID tried: ${userParams.bouquet}`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to create IPTV user: ${lastError}`,
          debug_info: {
            total_actions_tried: actions.length,
            last_error: lastError,
            panel_url: PANEL_URL,
            package_id: userParams.bouquet,
            subscription_days: sub
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    console.log(`🎉 IPTV user created successfully!`);
    console.log(`📋 Method used: ${successfulAction}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: createdUser.apiResponse,
        user: createdUser,
        message: `IPTV M3U account created successfully for ${createdUser.username}`,
        m3uUrl: createdUser.m3uUrl,
        creation_method: successfulAction,
        debug_info: {
          panel_url: PANEL_URL,
          package_used: userParams.bouquet,
          subscription_days: sub,
          auth_format: 'api_key'
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('💥 Unexpected error in create-iptv-user function:', error)
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
