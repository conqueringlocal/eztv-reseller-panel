
import React, { useState, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';
import { Image, Upload, Palette } from 'lucide-react';

export default function ResellerSettings() {
  const { user } = useAuth();
  const { updateResellerBranding, refreshData, resellers } = useApp();
  
  const [isUploading, setIsUploading] = useState(false);
  const [accentColor, setAccentColor] = useState(user && resellers.length > 0 ? 
    resellers.find(r => r.id === user.id)?.accentColor || '#6E59A5' : '#6E59A5');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentReseller = user ? resellers.find(r => r.id === user.id) : undefined;
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    // Only allow image files under 2MB
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Create a storage bucket if it doesn't exist (this would normally be done at setup)
      const bucketName = 'reseller_logos';
      
      // Upload file to Supabase Storage
      const filename = `logo-${user.id}-${Date.now()}`;
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filename, file, {
          contentType: file.type,
          upsert: true
        });
      
      if (error) {
        throw error;
      }
      
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filename);
      
      // Update reseller profile with logo URL - Fixed function call
      const success = await updateResellerBranding(user.id, { logoUrl: publicUrlData.publicUrl });
      
      if (success) {
        toast.success('Logo uploaded and updated successfully');
      } else {
        toast.error('Failed to update logo in profile');
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Error uploading logo');
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAccentColor(e.target.value);
  };
  
  const handleColorSubmit = async () => {
    if (!user) return;
    
    try {
      // Fixed function call - pass branding object as second parameter
      const success = await updateResellerBranding(user.id, { accentColor });
      
      if (success) {
        toast.success('Accent color updated successfully');
      } else {
        toast.error('Failed to update accent color');
      }
    } catch (error) {
      console.error('Error updating accent color:', error);
      toast.error('Error updating accent color');
    }
  };
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Account Settings</h1>
        <p className="text-gray-500">Manage your reseller account settings</p>
      </div>
      
      <DashboardCard
        title="Branding Settings"
        description="Customize the appearance of your reseller dashboard"
      >
        <div className="space-y-6">
          {/* Logo Upload Section */}
          <div>
            <h3 className="text-lg font-medium mb-2">Company Logo</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload a logo to display in your dashboard. Recommended size: 250x60px.
            </p>
            
            <div className="flex items-center space-x-4">
              <div className="h-16 w-48 border rounded flex items-center justify-center bg-gray-50">
                {currentReseller?.logoUrl ? (
                  <img 
                    src={currentReseller.logoUrl} 
                    alt="Company Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Image className="h-8 w-8 text-gray-300" />
                )}
              </div>
              
              <div>
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileChange}
                />
                <Button
                  onClick={handleUploadClick}
                  disabled={isUploading}
                  variant="outline"
                  className="flex items-center space-x-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>{isUploading ? 'Uploading...' : 'Upload Logo'}</span>
                </Button>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* Color Picker Section */}
          <div>
            <h3 className="text-lg font-medium mb-2">Accent Color</h3>
            <p className="text-sm text-gray-500 mb-4">
              Choose a primary color for buttons, links and highlights.
            </p>
            
            <div className="flex items-center space-x-4">
              <div 
                className="h-10 w-10 rounded border" 
                style={{ backgroundColor: accentColor }}
              />
              
              <div className="flex items-center space-x-2">
                <Palette className="h-5 w-5 text-gray-500" />
                <Input
                  type="color"
                  value={accentColor}
                  onChange={handleColorChange}
                  className="w-16 h-10"
                />
                <Input
                  type="text"
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  className="w-32"
                  maxLength={7}
                />
                <Button onClick={handleColorSubmit}>
                  Save Color
                </Button>
              </div>
            </div>
            
            <div className="mt-4">
              <div className="flex space-x-2">
                <Button style={{ backgroundColor: accentColor }}>
                  Primary Button
                </Button>
                <Button variant="outline" style={{ borderColor: accentColor, color: accentColor }}>
                  Outline Button
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>
    </DashboardLayout>
  );
}
