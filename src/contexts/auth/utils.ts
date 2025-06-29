
// Simplified auth state cleanup utility
export const cleanupAuthState = () => {
  console.log('🧹 Cleaning up auth state');
  
  try {
    // Only remove known problematic keys
    const keysToRemove = ['supabase.auth.token'];
    keysToRemove.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`✓ Removed localStorage key: ${key}`);
      }
    });
  } catch (e) {
    console.warn('Could not clean localStorage:', e);
  }
  
  console.log('🧹 Auth state cleanup completed');
};

// Minimal auth reset for logout only
export const forceAuthReset = async () => {
  console.log('🔄 Minimal auth reset for logout');
  cleanupAuthState();
  console.log('🔄 Auth reset finished');
};
