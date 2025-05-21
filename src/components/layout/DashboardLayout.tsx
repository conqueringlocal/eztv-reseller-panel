
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white shadow-sm z-10">
            <div className="mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 items-center">
                <div className="flex">
                  <SidebarTrigger />
                  <span className="ml-3 text-xl font-bold text-eztv-700">EZTV Club</span>
                </div>
                
                <div className="flex items-center">
                  {user && (
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-500">
                        {user.name} ({user.role})
                      </span>
                      <Button 
                        onClick={handleLogout} 
                        variant="outline"
                        size="sm"
                      >
                        Logout
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
