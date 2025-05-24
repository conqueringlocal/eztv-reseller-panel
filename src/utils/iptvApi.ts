
// IPTV API Integration for my8k.me panel

export interface IPTVUserParams {
  username: string;
  password: string;
  maxConnections: number;
  expiryDate: Date;
  isTrial: boolean;
  bouquet?: string;
  output?: string;
  ip?: string;
}

export interface IPTVCredentials {
  username: string;
  password: string;
}

// The panel URL for my8k.me
const PANEL_URL = "https://my8k.me/player_api.php";

// Helper to convert Date to Unix timestamp
export const dateToUnixTimestamp = (date: Date): number => {
  return Math.floor(date.getTime() / 1000);
};

// Create a new user in the IPTV system using my8k.me API
export const createUser = async (params: IPTVUserParams, resellerCredentials: IPTVCredentials): Promise<boolean> => {
  try {
    // Construct the URL with parameters for creating a user
    const url = new URL(PANEL_URL);
    url.searchParams.append("username", resellerCredentials.username);
    url.searchParams.append("password", resellerCredentials.password);
    url.searchParams.append("action", "user_create");
    url.searchParams.append("user_username", params.username);
    url.searchParams.append("user_password", params.password);
    url.searchParams.append("user_max_connections", params.maxConnections.toString());
    url.searchParams.append("user_expire", dateToUnixTimestamp(params.expiryDate).toString());
    url.searchParams.append("user_is_trial", params.isTrial ? "1" : "0");
    url.searchParams.append("user_bouquet", params.bouquet || "1");
    url.searchParams.append("user_output", params.output || "ts");
    url.searchParams.append("user_ip", params.ip || "*");
    
    console.log(`Making IPTV API call to create user: ${params.username}`);
    console.log('API URL:', url.toString().replace(resellerCredentials.password, '[REDACTED]'));
    
    const response = await fetch(url.toString());
    const data = await response.json();
    
    console.log('IPTV API Response:', data);
    
    // Check if the user was created successfully based on my8k.me API response format
    if (response.ok && data && !data.error) {
      console.log(`Successfully created IPTV user: ${params.username}`);
      return true;
    } else {
      console.error('Failed to create IPTV user:', data);
      return false;
    }
  } catch (error) {
    console.error("Error creating IPTV user:", error);
    return false;
  }
};

// Check if a user exists in the IPTV system
export const checkUserExists = async (username: string, resellerCredentials: IPTVCredentials): Promise<boolean> => {
  try {
    const url = new URL(PANEL_URL);
    url.searchParams.append("username", resellerCredentials.username);
    url.searchParams.append("password", resellerCredentials.password);
    url.searchParams.append("action", "user_info");
    url.searchParams.append("user_username", username);
    
    const response = await fetch(url.toString());
    const data = await response.json();
    
    return response.ok && data && !data.error && data.user_info;
  } catch (error) {
    console.error("Error checking user existence:", error);
    return false;
  }
};

// Generate a username from customer details
export const generateUsername = (name: string): string => {
  // Remove spaces, special chars and convert to lowercase
  return name
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .substring(0, 10) + Math.floor(Math.random() * 1000);
};

// Generate a random secure password
export const generatePassword = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Delete a user from the IPTV system
export const deleteUser = async (username: string, resellerCredentials: IPTVCredentials): Promise<boolean> => {
  try {
    const url = new URL(PANEL_URL);
    url.searchParams.append("username", resellerCredentials.username);
    url.searchParams.append("password", resellerCredentials.password);
    url.searchParams.append("action", "user_delete");
    url.searchParams.append("user_username", username);
    
    const response = await fetch(url.toString());
    const data = await response.json();
    
    console.log('Delete user response:', data);
    return response.ok && !data.error;
  } catch (error) {
    console.error("Error deleting IPTV user:", error);
    return false;
  }
};
