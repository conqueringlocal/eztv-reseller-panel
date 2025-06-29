
export type UserRole = 'admin' | 'reseller' | null;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  credits?: number;
  provider?: string;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  signup: (email: string, password: string, name: string, role?: UserRole) => Promise<boolean>;
}
