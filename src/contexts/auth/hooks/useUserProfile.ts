
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '../types';

export const useUserProfile = () => {
  const [user, setUser] = useState<User | null>(null);

  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('Fetching user profile for ID:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }

      if (data) {
        console.log('User profile data:', data);
        setUser({
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          credits: data.credits,
          provider: data.provider
        });
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  };

  return {
    user,
    setUser,
    fetchUserProfile
  };
};
