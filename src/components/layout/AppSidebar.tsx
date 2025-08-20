import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useResellerLevel } from '@/hooks/useResellerLevel';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { 
  Users, 
  CreditCard, 
  Settings, 
  Database,
  FileText,
  UserPlus,
  Zap,
  Tv
} from 'lucide-react';

export function AppSidebar() {
  const { user } = useAuth();
  const { canPurchaseCredits, resellerLevel } = useResellerLevel();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  // Define menu items based on user role
  const getMenuItems = () => {
    if (user?.role === 'admin') {
      return [
        {
          title: 'Dashboard',
          path: '/admin',
          icon: <Database className="w-5 h-5" />,
        },
        {
          title: 'Resellers',
          path: '/admin/resellers',
          icon: <Users className="w-5 h-5" />,
        },
        {
          title: 'Credits',
          path: '/admin/credits',
          icon: <CreditCard className="w-5 h-5" />,
        },
        {
          title: 'Logs',
          path: '/admin/logs',
          icon: <FileText className="w-5 h-5" />,
        },
        {
          title: 'Settings',
          path: '/admin/settings',
          icon: <Settings className="w-5 h-5" />,
        },
      ];
    } else {
      const resellerItems = [
        {
          title: 'Dashboard',
          path: '/reseller',
          icon: <Database className="w-5 h-5" />,
        },
        {
          title: 'Customers',
          path: '/reseller/customers',
          icon: <Users className="w-5 h-5" />,
        },
        {
          title: 'Sports Updates',
          path: '/reseller/sports-updates',
          icon: <Tv className="w-5 h-5" />,
        },
      ];

      // Add Credits menu item with different accessibility
      resellerItems.push({
        title: canPurchaseCredits ? 'Credits' : 'Credits (View Only)',
        path: '/reseller/credits',
        icon: <CreditCard className="w-5 h-5" />,
      });

      // Funnel feature is hidden from resellers

      // Add Sub-Resellers menu for level 1 resellers
      if (resellerLevel === 1) {
        resellerItems.push({
          title: 'Sub-Resellers',
          path: '/reseller/sub-resellers',
          icon: <UserPlus className="w-5 h-5" />,
        });
        
        // Add Credit Management for Level 1 resellers
        resellerItems.push({
          title: 'Credit Management',
          path: '/reseller/credit-management',
          icon: <Zap className="w-5 h-5" />,
        });
      }

      resellerItems.push({
        title: 'Settings',
        path: '/reseller/settings',
        icon: <Settings className="w-5 h-5" />,
      });

      return resellerItems;
    }
  };

  const menuItems = getMenuItems();
  
  return (
    <Sidebar className="border-r border-brand-primary/10">
      <SidebarContent className="py-4 bg-gradient-to-b from-white to-brand-light">
        <div className="px-3 py-2 mb-6">
          <div className="text-center">
            <div className="mb-2 flex justify-center">
              <div className="h-16 w-full max-w-[140px] flex items-center justify-center">
                <img 
                  src="/lovable-uploads/f71dcfeb-b101-4ccc-abc8-d4e8bb8811a4.png" 
                  alt="EZTV Club"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Reseller Dashboard</p>
            {resellerLevel && (
              <div className="mt-2 inline-flex items-center px-2 py-1 bg-brand-primary/10 rounded-full">
                <span className="text-xs text-brand-primary font-medium">Level {resellerLevel} Reseller</span>
              </div>
            )}
          </div>
        </div>
        
        <SidebarGroup>
          <SidebarGroupLabel className="text-brand-secondary">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    className={isActive(item.path) 
                      ? 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-medium shadow-sm' 
                      : 'hover:bg-brand-primary/5 hover:text-brand-primary transition-colors'
                    }
                    onClick={() => navigate(item.path)}
                  >
                    {item.icon}
                    <span className="ml-3">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
