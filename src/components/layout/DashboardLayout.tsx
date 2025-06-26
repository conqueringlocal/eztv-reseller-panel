
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { logout, user } = useAuth();
  const { resellers } = useApp();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Get current reseller's branding if available
  const currentReseller = user ? resellers.find(r => r.id === user.id) : undefined;
  
  // Define dynamic styles based on reseller branding
  const headerStyle = {
    backgroundColor: user?.role === 'reseller' && currentReseller?.accentColor 
      ? `${currentReseller.accentColor}10` // 10% opacity version of the color
      : 'white',
  };
  
  // Apply CSS variable for accent color for use throughout the app
  useEffect(() => {
    if (user?.role === 'reseller' && currentReseller?.accentColor) {
      document.documentElement.style.setProperty('--reseller-brand-color', currentReseller.accentColor);
    } else {
      document.documentElement.style.removeProperty('--reseller-brand-color');
    }
  }, [currentReseller?.accentColor, user?.role]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  // Check for low credits warning (< 10 credits)
  const showCreditsWarning = user?.role === 'reseller' && user?.credits < 10;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="shadow-sm z-10 bg-white border-b border-brand-primary/10" style={headerStyle}>
            <div className="mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 items-center">
                <div className="flex items-center">
                  <SidebarTrigger />
                  
                  {user?.role === 'reseller' && currentReseller?.logoUrl ? (
                    <div className="ml-3 h-8 max-w-[180px]">
                      <img 
                        src={currentReseller.logoUrl} 
                        alt="Reseller Logo"
                        className="h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="ml-3 flex items-center">
                      <div className="text-xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
                        EZTV Club
                      </div>
                      <div className="ml-2 px-2 py-1 bg-brand-primary/10 rounded-md">
                        <span className="text-xs font-medium text-brand-primary">
                          {user?.role === 'admin' ? 'Admin' : 'Reseller'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-4">
                  {showCreditsWarning && (
                    <div className="hidden sm:flex items-center px-3 py-1 bg-red-50 text-red-800 rounded-md space-x-1">
                      <AlertTriangle size={14} />
                      <span className="text-sm font-medium">Low credits: {user?.credits}</span>
                    </div>
                  )}
                  
                  {user && (
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-500">
                        {user.name} ({user.role})
                      </span>
                      <Button 
                        onClick={handleLogout} 
                        variant="outline"
                        size="sm"
                        className="border-brand-primary/20 hover:bg-brand-primary hover:text-white transition-colors"
                      >
                        Logout
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Mobile credits warning banner */}
            {showCreditsWarning && (
              <div className="sm:hidden flex items-center justify-center py-2 px-4 bg-red-50 text-red-800 space-x-1">
                <AlertTriangle size={14} />
                <span className="text-sm font-medium">Low credits: {user?.credits}</span>
              </div>
            )}
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
