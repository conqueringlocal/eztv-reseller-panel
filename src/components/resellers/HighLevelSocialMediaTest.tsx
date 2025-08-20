import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, TestTube, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface HighLevelSocialMediaTestProps {
  resellerId: string;
}

interface SocialMediaAccount {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

export function HighLevelSocialMediaTest({ resellerId }: HighLevelSocialMediaTestProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [accounts, setAccounts] = useState<SocialMediaAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  const testSocialMediaAPI = async () => {
    setIsLoading(true);
    setError(null);
    setAccounts([]);

    try {
      // First, get the reseller's HighLevel settings
      const { data: settings, error: settingsError } = await supabase
        .from('reseller_highlevel_settings')
        .select('location_id, location_api_key')
        .eq('reseller_id', resellerId)
        .eq('is_active', true)
        .single();

      if (settingsError || !settings) {
        throw new Error('HighLevel settings not found or not active. Please configure HighLevel integration first.');
      }

      if (!settings.location_api_key) {
        throw new Error('HighLevel Location API Key not found. Please configure HighLevel integration first.');
      }

      // Make the API call to get social media accounts
      const response = await fetch(`https://services.leadconnectorhq.com/social-media-posting/${settings.location_id}/accounts`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${settings.location_api_key}`,
          'Version': '2021-07-28'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('Social Media API Response:', data);

      // Parse the response to extract accounts
      if (data.accounts && Array.isArray(data.accounts)) {
        setAccounts(data.accounts.map((account: any) => ({
          id: account.id || account.accountId,
          name: account.name || account.displayName || 'Unknown',
          type: account.type || account.platform || 'Unknown',
          isActive: account.isActive !== false
        })));
        toast.success(`Found ${data.accounts.length} social media accounts`);
      } else if (data.length && Array.isArray(data)) {
        // Handle case where accounts are returned as array directly
        setAccounts(data.map((account: any) => ({
          id: account.id || account.accountId,
          name: account.name || account.displayName || 'Unknown',
          type: account.type || account.platform || 'Unknown',
          isActive: account.isActive !== false
        })));
        toast.success(`Found ${data.length} social media accounts`);
      } else {
        setAccounts([]);
        toast.info('No social media accounts found or unexpected response format');
      }

    } catch (error) {
      console.error('Error testing social media API:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`Failed to fetch social media accounts: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Social Media Channels Test
        </CardTitle>
        <CardDescription>
          Test the HighLevel Social Media API to see available channels for posting
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4 border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            This will call the HighLevel Social Media API to retrieve all available social media accounts/channels 
            connected to your HighLevel location. You need this to find Community channel IDs for posting sports updates.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <Button 
            onClick={testSocialMediaAPI}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing Social Media API...
              </>
            ) : (
              <>
                <TestTube className="mr-2 h-4 w-4" />
                Test Social Media Channels API
              </>
            )}
          </Button>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                <strong>Error:</strong> {error}
              </AlertDescription>
            </Alert>
          )}

          {accounts.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Available Social Media Accounts:</h4>
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div 
                    key={account.id} 
                    className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Type: {account.type}
                        </p>
                        <p className="text-xs font-mono text-blue-600 dark:text-blue-400">
                          ID: {account.id}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        account.isActive 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                      }`}>
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isLoading && !error && accounts.length === 0 && (
            <Alert>
              <AlertDescription>
                No social media accounts found. Click the test button to check for available channels.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}