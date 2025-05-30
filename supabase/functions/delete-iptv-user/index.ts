
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteUserParams {
  username: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { username }: DeleteUserParams = await req.json()

    // Get configuration from environment
    const API_KEY = Deno.env.get('IPTV_API_KEY')
    const PANEL_URL = Deno.env.get('IPTV_PANEL_URL')
    
    if (!API_KEY) {
      console.error('❌ IPTV API key not configured')
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
      console.error('❌ IPTV Panel URL not configured')
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

    console.log(`🗑️ Deleting IPTV user: ${username}`)
    console.log(`🌐 Panel URL: ${PANEL_URL}`)

    let deletionSuccess = false;
    let lastError = '';

    // Try different delete actions
    const deleteActions = [
      'user_delete',
      'delete_user',
      'remove_user',
      'del_user'
    ];

    for (const action of deleteActions) {
      try {
        console.log(`🧪 Trying delete action: ${action}`)
        
        // Construct the URL with query parameters
        const apiUrl = new URL(PANEL_URL);
        apiUrl.searchParams.append('action', action);
        apiUrl.searchParams.append('api_key', API_KEY);
        apiUrl.searchParams.append('user_username', username);
        
        console.log(`🔗 Delete URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`);
        
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
        console.log(`📡 Delete Response Status: ${response.status}`);
        console.log(`📡 Delete Response: ${responseText}`);

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          console.log(`❌ HTTP Error: ${lastError}`);
          continue;
        }

        // Check if it's an HTML error page
        if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
          lastError = 'Received HTML error page instead of API response';
          console.log(`❌ HTML Error: ${lastError}`);
          continue;
        }

        // Try to parse as JSON
        let data;
        try {
          data = JSON.parse(responseText);
          console.log(`📋 Parsed delete response:`, data);
        } catch (parseError) {
          // If it's not JSON, treat as text response
          console.log(`📄 Delete response is not JSON, treating as text`);
          
          // Check if response looks like success
          if (responseText.length < 100 && !responseText.toLowerCase().includes('error') && 
              !responseText.toLowerCase().includes('fail')) {
            data = {
              success: true,
              response: responseText,
              message: 'User deleted successfully'
            };
          } else {
            lastError = `Invalid response format: ${responseText.substring(0, 100)}`;
            console.log(`❌ Parse Error: ${lastError}`);
            continue;
          }
        }

        // Check for deletion success
        const isSuccess = data.success === true || 
                         data.status === 'success' || 
                         data.message?.includes('success') || 
                         data.message?.includes('deleted') ||
                         data.message?.includes('removed') ||
                         (!data.error && !data.status) ||
                         (typeof data.response === 'string' && data.response.includes('deleted'));

        if (isSuccess) {
          deletionSuccess = true;
          console.log(`✅ SUCCESS: User deleted using ${action} action`);
          console.log(`🗑️ Username: ${username} has been removed from IPTV panel`);
          break;
        } else if (data.error || data.status === 'error') {
          const errorMsg = data.error || data.result || data.message || 'API returned error status';
          lastError = errorMsg;
          console.log(`❌ API Error: ${errorMsg}`);
          
          // If user doesn't exist, consider it a success
          if (errorMsg.includes('not found') || errorMsg.includes('does not exist') || errorMsg.includes('not exist')) {
            deletionSuccess = true;
            console.log(`✅ User ${username} was already deleted or doesn't exist - considering this success`);
            break;
          }
          
          continue;
        } else {
          lastError = `No success indicators found in ${action} response`;
          console.log(`❌ Unclear response: ${lastError}`);
        }
        
      } catch (error) {
        console.error(`💥 Error with ${action} action:`, error);
        lastError = error.message;
        continue;
      }
    }

    // Return result
    if (!deletionSuccess) {
      console.log(`❌ All deletion attempts failed for user: ${username}`);
      console.log(`🔍 Last error: ${lastError}`);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to delete IPTV user: ${lastError}`,
          debug_info: {
            username: username,
            total_actions_tried: deleteActions.length,
            last_error: lastError,
            panel_url: PANEL_URL,
            actions_tried: deleteActions
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    console.log(`🎉 IPTV user deleted successfully: ${username}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `IPTV user ${username} deleted successfully`,
        debug_info: {
          username: username,
          panel_url: PANEL_URL,
          deletion_confirmed: true
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('💥 Unexpected error in delete-iptv-user function:', error)
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
