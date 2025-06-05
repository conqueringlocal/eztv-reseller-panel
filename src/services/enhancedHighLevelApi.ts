
interface EnhancedHighLevelApiConfig {
  apiKey: string;
  locationId: string;
}

interface CustomFieldUpdate {
  key: string;
  value: string;
}

interface ContactNote {
  body: string;
  type?: 'general' | 'call' | 'meeting' | 'task' | 'email';
}

interface ContactTag {
  name: string;
}

interface HighLevelContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  customFields?: Record<string, any>;
  tags?: string[];
}

export class EnhancedHighLevelApiService {
  private config: EnhancedHighLevelApiConfig;

  constructor(config: EnhancedHighLevelApiConfig) {
    this.config = config;
  }

  async updateCustomFields(contactId: string, customFields: CustomFieldUpdate[]): Promise<boolean> {
    try {
      console.log('🏷️ Updating custom fields for contact:', contactId, customFields);

      const customFieldsObj = customFields.reduce((acc, field) => {
        acc[field.key] = field.value;
        return acc;
      }, {} as Record<string, string>);

      const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          customFields: customFieldsObj
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to update custom fields:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('✅ Custom fields updated successfully:', result);
      return true;
    } catch (error) {
      console.error('💥 Error updating custom fields:', error);
      return false;
    }
  }

  async addNote(contactId: string, note: ContactNote): Promise<boolean> {
    try {
      console.log('📝 Adding note to contact:', contactId, note);

      const response = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          type: 'Email',
          contactId: contactId,
          message: note.body,
          locationId: this.config.locationId,
          subject: `Note: ${note.type || 'general'}`,
          attachments: []
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to add note:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('✅ Note added successfully:', result);
      return true;
    } catch (error) {
      console.error('💥 Error adding note:', error);
      return false;
    }
  }

  async addTags(contactId: string, tags: string[]): Promise<boolean> {
    try {
      console.log('🏷️ Adding tags to contact:', contactId, tags);

      const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          tags: tags
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to add tags:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('✅ Tags added successfully:', result);
      return true;
    } catch (error) {
      console.error('💥 Error adding tags:', error);
      return false;
    }
  }

  async removeTags(contactId: string, tags: string[]): Promise<boolean> {
    try {
      console.log('🗑️ Removing tags from contact:', contactId, tags);

      // First get current contact to see existing tags
      const getResponse = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Version': '2021-07-28'
        }
      });

      if (!getResponse.ok) {
        console.error('❌ Failed to get contact for tag removal:', getResponse.status);
        return false;
      }

      const contactData = await getResponse.json();
      const currentTags = contactData.contact?.tags || [];
      const updatedTags = currentTags.filter((tag: string) => !tags.includes(tag));

      const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          tags: updatedTags
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to remove tags:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('✅ Tags removed successfully:', result);
      return true;
    } catch (error) {
      console.error('💥 Error removing tags:', error);
      return false;
    }
  }

  async getContactDetails(contactId: string): Promise<HighLevelContact | null> {
    try {
      console.log('🔍 Fetching detailed contact info:', contactId);

      const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Version': '2021-07-28'
        }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch contact details:', response.status);
        return null;
      }

      const result = await response.json();
      console.log('✅ Contact details fetched successfully:', result);
      return result.contact;
    } catch (error) {
      console.error('💥 Error fetching contact details:', error);
      return null;
    }
  }

  // Helper method to format standard IPTV custom fields
  formatIptvCustomFields(customer: any): CustomFieldUpdate[] {
    return [
      { key: 'iptv_username', value: customer.username || '' },
      { key: 'iptv_password', value: customer.password || '' },
      { key: 'iptv_plan_duration', value: customer.planDuration?.toString() || '' },
      { key: 'iptv_device_type', value: customer.deviceType || '' },
      { key: 'iptv_mac_address', value: customer.macAddress || '' },
      { key: 'iptv_expiration_date', value: customer.expirationDate || '' },
      { key: 'iptv_status', value: customer.status || 'active' }
    ];
  }

  // Helper method to generate standard IPTV tags
  generateIptvTags(customer: any): string[] {
    const tags = ['IPTV Customer'];
    
    if (customer.planDuration) {
      tags.push(`${customer.planDuration} Month Plan`);
    }
    
    if (customer.deviceType) {
      tags.push(customer.deviceType);
    }
    
    if (customer.status) {
      tags.push(`Status: ${customer.status}`);
    }
    
    return tags;
  }
}
