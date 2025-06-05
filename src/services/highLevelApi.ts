
interface HighLevelApiConfig {
  locationId: string;
}

interface SendMessagePayload {
  contactId: string;
  message: string;
  type?: 'SMS' | 'Email';
}

interface HighLevelContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export class HighLevelApiService {
  private config: HighLevelApiConfig;
  private baseUrl = 'https://rest.gohighlevel.com/v1';

  constructor(config: HighLevelApiConfig) {
    this.config = config;
  }

  private async getGlobalApiKey(): Promise<string | null> {
    try {
      // Get the global Agency API Key from system settings via Supabase
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data: systemSettings, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('id', 'highlevel_agency_api_key')
        .single();

      if (error || !systemSettings?.value) {
        console.error('❌ No global HighLevel Agency API Key found:', error);
        return null;
      }

      return systemSettings.value;
    } catch (error) {
      console.error('💥 Error fetching global API key:', error);
      return null;
    }
  }

  private async getHeaders() {
    const apiKey = await this.getGlobalApiKey();
    if (!apiKey) {
      throw new Error('HighLevel Agency API Key not configured at system level');
    }

    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async sendMessage(payload: SendMessagePayload): Promise<boolean> {
    try {
      console.log('🚀 Sending message via HighLevel API:', payload);

      const headers = await this.getHeaders();

      const response = await fetch(`${this.baseUrl}/conversations/messages`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          type: payload.type || 'SMS',
          contactId: payload.contactId,
          message: payload.message,
          locationId: this.config.locationId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HighLevel API error:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('✅ Message sent successfully:', result);
      return true;
    } catch (error) {
      console.error('💥 Error sending HighLevel message:', error);
      return false;
    }
  }

  async getContact(contactId: string): Promise<HighLevelContact | null> {
    try {
      console.log('🔍 Fetching contact from HighLevel:', contactId);

      const headers = await this.getHeaders();

      const response = await fetch(`${this.baseUrl}/contacts/${contactId}?locationId=${this.config.locationId}`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to fetch contact:', response.status, errorText);
        return null;
      }

      const result = await response.json();
      console.log('✅ Contact fetched successfully:', result);
      return result.contact;
    } catch (error) {
      console.error('💥 Error fetching contact:', error);
      return null;
    }
  }

  async createContact(contactData: {
    firstName: string;
    lastName?: string;
    email: string;
  }): Promise<{ success: boolean; contactId?: string; error?: string }> {
    try {
      console.log('📞 Creating contact in HighLevel:', contactData);

      const headers = await this.getHeaders();

      const payload = {
        firstName: contactData.firstName,
        lastName: contactData.lastName || '',
        email: contactData.email,
        locationId: this.config.locationId,
        source: 'IPTV Customer Creation'
      };

      console.log('📤 Contact creation payload:', payload);

      const response = await fetch(`${this.baseUrl}/contacts/`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('📡 HighLevel API response status:', response.status);
      console.log('📡 HighLevel API response:', responseText);

      if (!response.ok) {
        console.error('❌ HighLevel API error:', response.status, responseText);
        return {
          success: false,
          error: `HighLevel API error: ${response.status} - ${responseText}`
        };
      }

      const result = JSON.parse(responseText);
      const contactId = result.contact?.id || result.id;

      if (!contactId) {
        console.error('❌ No contact ID returned from HighLevel');
        return {
          success: false,
          error: 'Contact created but no ID returned'
        };
      }

      console.log('✅ Contact created successfully:', contactId);
      return {
        success: true,
        contactId: contactId
      };

    } catch (error) {
      console.error('💥 Error creating HighLevel contact:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      console.log('🔑 Validating HighLevel Agency API Key...');

      const headers = await this.getHeaders();

      const response = await fetch(`${this.baseUrl}/locations/`, {
        method: 'GET',
        headers: headers
      });

      if (response.status === 401) {
        return {
          valid: false,
          error: 'Invalid Agency API Key - authentication failed'
        };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          valid: false,
          error: `API validation failed: ${response.status} - ${errorText}`
        };
      }

      const result = await response.json();
      console.log('✅ Agency API Key validation successful');
      
      const locations = result.locations || [];
      const locationExists = locations.some((loc: any) => loc.id === this.config.locationId);
      
      if (!locationExists) {
        return {
          valid: false,
          error: `Location ID ${this.config.locationId} not accessible with this Agency API Key`
        };
      }

      return { valid: true };
    } catch (error) {
      console.error('💥 Error validating Agency API Key:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }

  formatCredentialsMessage(customerName: string, username: string, password: string, m3uUrl?: string): string {
    return `🎉 Hi ${customerName}! Your IPTV account has been successfully created.

📺 Your Login Credentials:
• Username: ${username}
• Password: ${password}

${m3uUrl ? `🔗 M3U URL: ${m3uUrl}` : ''}

You can now enjoy your IPTV service! If you need any assistance, please don't hesitate to reach out.

Thank you for choosing our service! 🙏`;
  }
}
