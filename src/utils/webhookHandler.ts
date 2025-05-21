
import { Customer } from "../contexts/AppContext";
import { createUser, generateUsername, generatePassword, dateToUnixTimestamp, IPTVUserParams } from "./iptvApi";

// Define webhook payload structure
export interface WebhookPayload {
  resellerId: string;
  customerName: string;
  customerEmail: string;
  macAddress: string;
  deviceType: string;
  planDuration: number;
}

// Process incoming webhook
export const processWebhook = async (
  payload: WebhookPayload, 
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'startDate' | 'expirationDate'>) => Promise<boolean>
): Promise<{
  success: boolean;
  message: string;
  customer?: Omit<Customer, 'id' | 'createdAt' | 'startDate' | 'expirationDate'>;
}> => {
  try {
    // Validate payload
    if (!payload.resellerId || !payload.customerName || !payload.customerEmail || 
        !payload.macAddress || !payload.planDuration) {
      return {
        success: false,
        message: "Missing required fields in webhook payload"
      };
    }

    // Generate IPTV credentials
    const username = generateUsername(payload.customerName);
    const password = generatePassword();

    // Calculate expiration date
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + payload.planDuration);

    // Create IPTV API params
    const iptvParams: IPTVUserParams = {
      username,
      password,
      maxConnections: 1,
      expiryDate,
      isTrial: false,
      output: "ts"
    };

    // Call IPTV API (in a real app, this would be a server-side call)
    const userCreated = await createUser(iptvParams);
    
    if (!userCreated) {
      return {
        success: false,
        message: "Failed to create IPTV user"
      };
    }

    // Create customer record
    const customer = {
      resellerId: payload.resellerId,
      name: payload.customerName,
      email: payload.customerEmail,
      macAddress: payload.macAddress,
      deviceType: payload.deviceType || "Unknown",
      planDuration: payload.planDuration
    };

    // Add customer to system
    const success = await addCustomer(customer);

    if (!success) {
      return {
        success: false,
        message: "Failed to add customer to system"
      };
    }

    return {
      success: true,
      message: "Customer provisioned successfully",
      customer
    };
  } catch (error) {
    console.error("Error processing webhook:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
