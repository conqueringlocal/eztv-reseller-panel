
// IPTV API Integration

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

const API_KEY = "89c1247e5b70f6b18665734b735d2cad";
const API_BASE_URL = "https://my8k.me/player_api.php";

// Helper to convert Date to Unix timestamp
export const dateToUnixTimestamp = (date: Date): number => {
  return Math.floor(date.getTime() / 1000);
};

// Create a new user in the IPTV system
export const createUser = async (params: IPTVUserParams): Promise<boolean> => {
  try {
    // In a real implementation, this would be a server-side API call to prevent
    // exposing the API key to the client. For this demo, we'll simulate the request.
    
    // Construct the URL with parameters
    const url = new URL(API_BASE_URL);
    url.searchParams.append("username", "admin");
    url.searchParams.append("password", "admin");
    url.searchParams.append("action", "create_user");
    url.searchParams.append("user_username", params.username);
    url.searchParams.append("user_password", params.password);
    url.searchParams.append("user_max_connections", params.maxConnections.toString());
    url.searchParams.append("user_expire", dateToUnixTimestamp(params.expiryDate).toString());
    url.searchParams.append("user_is_trial", params.isTrial ? "1" : "0");
    url.searchParams.append("user_bouquet", params.bouquet || "1");
    url.searchParams.append("user_output", params.output || "ts");
    url.searchParams.append("user_ip", params.ip || "0.0.0.0");
    url.searchParams.append("user_allowed_output", params.output || "ts");
    
    console.log(`[Demo] IPTV API call: ${url.toString()}`);
    
    // In a real app, this would be:
    // const response = await fetch(url);
    // const data = await response.json();
    // return data.result === "success";
    
    // Simulate API response
    return true;
  } catch (error) {
    console.error("Error creating IPTV user:", error);
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
