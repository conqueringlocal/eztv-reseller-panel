
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface CreateTrialFormProps {
  onSuccess: () => void;
}

export function CreateTrialForm({ onSuccess }: CreateTrialFormProps) {
  const { user } = useAuth();
  const { refreshData } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    macAddress: '',
    deviceType: 'Smart TV',
    contactId: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id || !formData.customerName || !formData.customerEmail || !formData.macAddress) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('🆕 Creating trial account for:', formData.customerName);

      // Call the webhook with trial parameters
      const { data, error } = await supabase.functions.invoke('webhook', {
        body: {
          resellerId: user.id,
          action: 'create',
          customer: {
            name: formData.customerName,
            email: formData.customerEmail,
            mac: formData.macAddress,
            device_type: formData.deviceType,
            plan_duration_months: 1 // Trial accounts get 1 month
          },
          contact_id: formData.contactId || undefined,
          is_trial: true // Mark as trial account
        }
      });

      if (error || !data?.success) {
        console.error('❌ Trial creation failed:', error || data);
        toast.error(data?.message || 'Failed to create trial account');
        return;
      }

      console.log('✅ Trial account created successfully');
      toast.success('Trial account created successfully!');
      
      // Reset form
      setFormData({
        customerName: '',
        customerEmail: '',
        macAddress: '',
        deviceType: 'Smart TV',
        contactId: ''
      });
      
      await refreshData();
      onSuccess();
      
    } catch (error) {
      console.error('💥 Error creating trial account:', error);
      toast.error('An error occurred while creating the trial account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="customerName">Customer Name *</Label>
        <Input
          id="customerName"
          value={formData.customerName}
          onChange={(e) => handleInputChange('customerName', e.target.value)}
          placeholder="Enter customer name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerEmail">Email Address *</Label>
        <Input
          id="customerEmail"
          type="email"
          value={formData.customerEmail}
          onChange={(e) => handleInputChange('customerEmail', e.target.value)}
          placeholder="customer@example.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="macAddress">MAC Address *</Label>
        <Input
          id="macAddress"
          value={formData.macAddress}
          onChange={(e) => handleInputChange('macAddress', e.target.value)}
          placeholder="00:00:00:00:00:00"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="deviceType">Device Type</Label>
        <Select value={formData.deviceType} onValueChange={(value) => handleInputChange('deviceType', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select device type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Smart TV">Smart TV</SelectItem>
            <SelectItem value="Android Box">Android Box</SelectItem>
            <SelectItem value="Firestick">Firestick</SelectItem>
            <SelectItem value="iPhone">iPhone</SelectItem>
            <SelectItem value="iPad">iPad</SelectItem>
            <SelectItem value="Android Phone">Android Phone</SelectItem>
            <SelectItem value="Android Tablet">Android Tablet</SelectItem>
            <SelectItem value="PC/Mac">PC/Mac</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactId">HighLevel Contact ID (Optional)</Label>
        <Input
          id="contactId"
          value={formData.contactId}
          onChange={(e) => handleInputChange('contactId', e.target.value)}
          placeholder="Enter HighLevel contact ID"
        />
        <p className="text-sm text-gray-500">
          If provided, credentials will be sent to this HighLevel contact
        </p>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Trial Account Details</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Duration: 1 month</li>
          <li>• Cost: Free (no credits used)</li>
          <li>• Full access to IPTV services</li>
          <li>• Automatic expiration after 30 days</li>
        </ul>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating Trial Account...
          </>
        ) : (
          'Create Trial Account'
        )}
      </Button>
    </form>
  );
}
