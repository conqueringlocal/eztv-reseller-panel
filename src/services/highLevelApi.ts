
interface HighLevelApiConfig {
  apiKey: string;
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
  private baseUrl = 'https://services.leadconnectorhq.com';

  constructor(config: HighLevelApiConfig) {
    this.config = config;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    };
  }

  async sendMessage(payload: SendMessagePayload): Promise<boolean> {
    try {
      console.log('🚀 Sending message via HighLevel API:', payload);

      const response = await fetch(`${this.baseUrl}/conversations/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
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
        
        // Log detailed error information
        console.error('Request details:', {
          url: `${this.baseUrl}/conversations/messages`,
          method: 'POST',
          headers: { ...this.getHeaders(), Authorization: `Bearer ${this.config.apiKey.slice(0, 10)}...` },
          body: {
            type: payload.type || 'SMS',
            contactId: payload.contactId,
            message: payload.message,
            locationId: this.config.locationId
          }
        });
        
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

      const response = await fetch(`${this.baseUrl}/contacts/${contactId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to fetch contact:', response.status, errorText);
        
        // Log detailed error information
        console.error('Request details:', {
          url: `${this.baseUrl}/contacts/${contactId}`,
          method: 'GET',
          headers: { ...this.getHeaders(), Authorization: `Bearer ${this.config.apiKey.slice(0, 10)}...` }
        });
        
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
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('📡 HighLevel API response status:', response.status);
      console.log('📡 HighLevel API response:', responseText);

      if (!response.ok) {
        console.error('❌ HighLevel API error:', response.status, responseText);
        
        // Log detailed error information
        console.error('Request details:', {
          url: `${this.baseUrl}/contacts/`,
          method: 'POST',
          headers: { ...this.getHeaders(), Authorization: `Bearer ${this.config.apiKey.slice(0, 10)}...` },
          body: payload
        });

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
