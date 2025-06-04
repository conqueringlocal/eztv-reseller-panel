
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

  constructor(config: HighLevelApiConfig) {
    this.config = config;
  }

  async sendMessage(payload: SendMessagePayload): Promise<boolean> {
    try {
      console.log('🚀 Sending message via HighLevel API:', payload);

      const response = await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
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

      const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Version': '2021-07-28'
        }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch contact:', response.status);
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
