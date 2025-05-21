
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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
  FileText
} from 'lucide-react';

export function AppSidebar() {
  const { user } = useAuth();
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
      return [
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
          title: 'Credits',
          path: '/reseller/credits',
          icon: <CreditCard className="w-5 h-5" />,
        },
        {
          title: 'Settings',
          path: '/reseller/settings',
          icon: <Settings className="w-5 h-5" />,
        },
      ];
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
