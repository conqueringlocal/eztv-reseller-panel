 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 // M3U streaming domain for Trex provider
 const TREX_M3U_DOMAIN = 'vpn.eztvclub.online';
 
 serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     // Use service role for admin operations
     const supabaseClient = createClient(
       Deno.env.get('SUPABASE_URL') ?? '',
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
     );
 
     console.log('🔧 Starting M3U URL fix for all Trex customers...');
 
     // Fetch all Trex customers
     const { data: customers, error: fetchError } = await supabaseClient
       .from('customers')
       .select('id, username, password, m3u_url, connection_list')
       .eq('provider', 'trex');
 
     if (fetchError) {
       throw new Error(`Failed to fetch customers: ${fetchError.message}`);
     }
 
     console.log(`📊 Found ${customers?.length || 0} Trex customers to process`);
 
     let updatedCount = 0;
     let connectionListUpdatedCount = 0;
     const errors: string[] = [];
 
     for (const customer of customers || []) {
       try {
         const updates: any = {};
 
         // Fix top-level m3u_url if customer has username/password
         if (customer.username && customer.password) {
           const correctUrl = `http://${TREX_M3U_DOMAIN}/get.php?username=${customer.username}&password=${customer.password}&type=m3u_plus&output=ts`;
           
           if (customer.m3u_url !== correctUrl) {
             updates.m3u_url = correctUrl;
           }
         }
 
         // Fix connection_list m3u_urls
         if (customer.connection_list && Array.isArray(customer.connection_list) && customer.connection_list.length > 0) {
           const updatedConnectionList = customer.connection_list.map((conn: any) => {
             if (conn.username && conn.password) {
               const correctUrl = `http://${TREX_M3U_DOMAIN}/get.php?username=${conn.username}&password=${conn.password}&type=m3u_plus&output=ts`;
               return {
                 ...conn,
                 m3u_url: correctUrl
               };
             }
             return conn;
           });
 
           // Check if any connection was updated
           const hasChanges = JSON.stringify(updatedConnectionList) !== JSON.stringify(customer.connection_list);
           if (hasChanges) {
             updates.connection_list = updatedConnectionList;
             connectionListUpdatedCount++;
           }
         }
 
         // Apply updates if any
         if (Object.keys(updates).length > 0) {
           const { error: updateError } = await supabaseClient
             .from('customers')
             .update(updates)
             .eq('id', customer.id);
 
           if (updateError) {
             errors.push(`Customer ${customer.id}: ${updateError.message}`);
           } else {
             updatedCount++;
           }
         }
       } catch (err: any) {
         errors.push(`Customer ${customer.id}: ${err.message}`);
       }
     }
 
     console.log(`✅ Updated ${updatedCount} customers, ${connectionListUpdatedCount} had connection_list updates`);
     if (errors.length > 0) {
       console.log(`❌ Errors: ${errors.length}`);
     }
 
     return new Response(
       JSON.stringify({
         success: true,
         totalProcessed: customers?.length || 0,
         updated: updatedCount,
         connectionListUpdated: connectionListUpdatedCount,
         errors: errors.length > 0 ? errors : undefined
       }),
       { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
 
   } catch (error: any) {
     console.error('❌ Error:', error);
     return new Response(
       JSON.stringify({ error: error.message }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });