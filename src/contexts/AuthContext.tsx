
import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from "sonner";

// Define types for our context
export type UserRole = 'admin' | 'reseller' | null;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  credits?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
});

// Mock users for demonstration
const MOCK_USERS = [
  {
    id: '1',
    email: 'admin@eztv.club',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin' as UserRole,
  },
  {
    id: '2',
    email: 'reseller@eztv.club',
    password: 'reseller123',
    name: 'Demo Reseller',
    role: 'reseller' as UserRole,
    credits: 100,
  }
];

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check for stored authentication on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('eztvUser');
    
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('eztvUser');
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // In a real app, this would be an API call
    const foundUser = MOCK_USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (foundUser) {
      const { password: _, ...userWithoutPassword } = foundUser;
      setUser(userWithoutPassword);
      localStorage.setItem('eztvUser', JSON.stringify(userWithoutPassword));
      toast.success(`Welcome back, ${foundUser.name}!`);
      return true;
    }

    toast.error('Invalid email or password');
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('eztvUser');
    toast.info('You have been logged out');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};
