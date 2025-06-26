
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
  UserPlus
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
      ];

      // Add Credits menu item with different accessibility
      resellerItems.push({
        title: canPurchaseCredits ? 'Credits' : 'Credits (View Only)',
        path: '/reseller/credits',
        icon: <CreditCard className="w-5 h-5" />,
      });

      // Add Sub-Resellers menu for level 1 resellers
      if (resellerLevel === 1) {
        resellerItems.push({
          title: 'Sub-Resellers',
          path: '/reseller/sub-resellers',
          icon: <UserPlus className="w-5 h-5" />,
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
    <Sidebar>
      <SidebarContent className="py-4">
        <div className="px-3 py-2 mb-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-eztv-700">EZTV Club</h1>
            <p className="text-xs text-gray-500 mt-1">Reseller Dashboard</p>
            {resellerLevel && (
              <p className="text-xs text-gray-400 mt-1">Level {resellerLevel} Reseller</p>
            )}
          </div>
        </div>
        
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    className={isActive(item.path) ? 'bg-eztv-100 text-eztv-700 font-medium' : ''}
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
