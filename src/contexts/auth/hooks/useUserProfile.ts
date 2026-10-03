
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '../types';

export const useUserProfile = () => {
  const [user, setUser] = useState<User | null>(null);

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {

      const { data, error } = await supabase
        .from('profiles')
        .select('id,name,email,credits,provider')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }

      if (data) {
        const { data: admin, error: roleError } = await supabase.rpc('is_admin');
        if(roleError) throw roleError;
        setUser({
          id: data.id,
          name: data.name,
          email: data.email,
          role: admin ? 'admin' : 'reseller',
          credits: data.credits,
          provider: data.provider
        });
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  }, []);

  return {
    user,
    setUser,
    fetchUserProfile
  };
};
