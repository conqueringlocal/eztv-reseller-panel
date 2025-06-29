
// Enhanced auth state cleanup to prevent JWT corruption issues
export const cleanupAuthState = () => {
  console.log('🧹 Cleaning up auth state to prevent JWT corruption');
  
  // Remove standard auth tokens
  try {
    localStorage.removeItem('supabase.auth.token');
    console.log('✓ Removed supabase.auth.token');
  } catch (e) {
    console.warn('Could not remove supabase.auth.token:', e);
  }
  
  // Remove all Supabase auth keys from localStorage
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        localStorage.removeItem(key);
        console.log(`✓ Removed localStorage key: ${key}`);
      }
    });
  } catch (e) {
    console.warn('Error cleaning localStorage:', e);
  }
  
  // Remove from sessionStorage if available
  try {
    if (typeof sessionStorage !== 'undefined') {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
          sessionStorage.removeItem(key);
          console.log(`✓ Removed sessionStorage key: ${key}`);
        }
      });
    }
  } catch (e) {
    console.warn('Error cleaning sessionStorage:', e);
  }
  
  console.log('🧹 Auth state cleanup completed');
};

// Force a complete auth reset - use this for serious corruption issues
export const forceAuthReset = async () => {
  console.log('🔄 Forcing complete auth reset');
  
  // Clean up all storage first
  cleanupAuthState();
  
  // Clear any cached data
  try {
    // Clear any cached user data
    if (typeof window !== 'undefined') {
      // Force garbage collection if available
      if (window.gc) {
        window.gc();
      }
    }
  } catch (e) {
    console.warn('Could not force garbage collection:', e);
  }
  
  console.log('🔄 Complete auth reset finished');
};
