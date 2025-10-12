import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useIptvPackages } from '@/hooks/useIptvPackages';
import { toast } from 'sonner';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { checkForExistingCustomer } from '@/utils/customerConsolidation/duplicateDetection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Form schema with validation - updated to support multi-connection accounts
const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  accountType: z.enum(['m3u', 'mag'], { 
    errorMap: () => ({ message: 'Please select an account type.' })
  }),
  macAddress: z.string().optional(),
  deviceType: z.string().min(1, { message: 'Please select a device type.' }),
  packageId: z.string().min(1, { message: 'Please select a package.' }),
  planDuration: z.enum(['1', '3', '6', '12'], { 
    errorMap: () => ({ message: 'Please select a valid plan duration.' })
  }),
  connections: z.coerce
    .number()  
    .int()
    .min(1, { message: 'Must have at least 1 connection.' })
    .max(5, { message: 'Cannot exceed 5 connections.' }),
}).refine((data) => {
  // MAC address is required for MAG devices
  if (data.accountType === 'mag' && (!data.macAddress || data.macAddress.trim() === '')) {
    return false;
  }
  return true;
}, {
  message: "MAC address is required for MAG devices",
  path: ["macAddress"],
});

type FormData = z.infer<typeof formSchema>;

interface AddCustomerFormProps {
  onSuccess?: () => void;
}

export function AddCustomerForm({ onSuccess }: AddCustomerFormProps) {
  const { user } = useAuth();
  const { addCustomer, customers } = useApp();
  const { packages, isLoading: packagesLoading, error: packagesError, source, debugInfo, refetch } = useIptvPackages(undefined, false);
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      accountType: 'm3u',
      macAddress: '',
      deviceType: 'Smart TV',
      packageId: '',
      planDuration: '1',
      connections: 1,
    },
  });

  // Watch account type to show/hide MAC address field
  const watchAccountType = form.watch('accountType');
  
  // Calculate total credits needed using the new calculation
  const watchPlanDuration = form.watch('planDuration');
  const watchConnections = form.watch('connections');
  
  // Calculate credits based on connections and duration
  const calculateCreditsNeeded = async (connections: number, duration: number) => {
    try {
      const { data, error } = await supabase.rpc('calculate_credits_required', {
        connections: connections,
        duration_months: duration
      });
      
      if (error) {
        console.error('Error calculating credits:', error);
        return connections * duration; // Fallback calculation
      }
      
      return data;
    } catch (error) {
      console.error('Error calculating credits:', error);
      return connections * duration; // Fallback calculation
    }
  };

  const [totalCreditsNeeded, setTotalCreditsNeeded] = React.useState(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [duplicateCustomer, setDuplicateCustomer] = React.useState<any>(null);
  
  // Watch name and email for duplicate detection
  const watchName = form.watch('name');
  const watchEmail = form.watch('email');
  
  // Check for duplicates when name or email changes
  React.useEffect(() => {
    if (watchName && watchEmail) {
      const existing = checkForExistingCustomer(
        watchName, 
        watchEmail, 
        customers.filter(c => c.resellerId === user?.id)
      );
      setDuplicateCustomer(existing);
    } else {
      setDuplicateCustomer(null);
    }
  }, [watchName, watchEmail, customers, user?.id]);

  React.useEffect(() => {
    const updateCredits = async () => {
      const credits = await calculateCreditsNeeded(watchConnections, parseInt(watchPlanDuration));
      setTotalCreditsNeeded(credits);
    };
    updateCredits();
  }, [watchConnections, watchPlanDuration]);

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You need to be logged in to add a customer.');
      return;
    }
    
    if (isSubmitting) {
      return; // Prevent multiple submissions
    }
    
    setIsSubmitting(true);
    
    try {
      // For admin, we'd need to select a reseller
      // For simplicity in this demo, we'll use the first reseller ID for admin
      const resellerId = user.role === 'admin' ? '2' : user.id;
      
      // Calculate start and expiration dates
      const startDate = new Date().toISOString().split('T')[0];
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + parseInt(data.planDuration));
      const expirationDateString = expirationDate.toISOString().split('T')[0];
      
      // Generate username for the customer
      const username = `${data.name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`;
      
      const success = await addCustomer({
        resellerId,
        name: data.name,
        email: data.email,
        username: username, // Fixed: Added missing username
        macAddress: data.macAddress || '',
        deviceType: data.deviceType,
        packageId: data.packageId,
        planDuration: parseInt(data.planDuration),
        maxConnections: data.connections,
        currentConnections: 0,
        connectionDetails: [],
        startDate,
        expirationDate: expirationDateString,
        status: 'active',
        isDeactivated: false,
        provider: user?.provider || '8k',
      });
      
      if (success) {
        toast.success(`${data.accountType.toUpperCase()} customer added successfully with ${data.connections} connection${data.connections > 1 ? 's' : ''}!`);
        form.reset();
        if (onSuccess) onSuccess();
      } else {
        toast.error(`Failed to add ${data.accountType.toUpperCase()} customer. Please check your credits balance.`);
      }
    } catch (error) {
      toast.error(`An error occurred while adding the ${data.accountType.toUpperCase()} customer.`);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Test connection handler
  const handleTestConnection = async () => {
    console.log('🧪 Manual connection test triggered');
    toast.info('🔄 Testing streaming service connection...');
    await refetch();
  };
  
  return (
    <div className="p-1">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Duplicate customer warning */}
          {duplicateCustomer && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Duplicate Customer Detected</AlertTitle>
              <AlertDescription>
                <p className="mb-2">
                  A customer with similar information already exists:
                </p>
                <div className="bg-red-50 p-2 rounded border border-red-200">
                  <p className="text-sm"><strong>Name:</strong> {duplicateCustomer.name}</p>
                  <p className="text-sm"><strong>Email:</strong> {duplicateCustomer.email}</p>
                  <p className="text-sm"><strong>Status:</strong> {duplicateCustomer.status}</p>
                </div>
                <p className="mt-2 text-sm font-semibold">
                  Creating a duplicate customer will cause double charges during renewals. 
                  Please verify this is a different customer before proceeding.
                </p>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-1 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="accountType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="m3u">M3U (Multi-Connection Support)</SelectItem>
                    <SelectItem value="mag">MAG (Single Connection Only)</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs">
                  {watchAccountType === 'm3u' 
                    ? 'M3U accounts support multiple connections and work with any streaming player'
                    : 'MAG accounts are single-connection and designed for STB/MAG devices'
                  }
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {watchAccountType === 'mag' && (
            <FormField
              control={form.control}
              name="macAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MAC Address *</FormLabel>
                  <FormControl>
                    <Input placeholder="00:1A:79:XX:XX:XX" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Required for MAG devices. Enter the MAC address of the STB/MAG device.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          
          <FormField
            control={form.control}
            name="deviceType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Device Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a device type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {watchAccountType === 'mag' ? (
                      <>
                        <SelectItem value="MAG Box">MAG Box</SelectItem>
                        <SelectItem value="STB Device">STB Device</SelectItem>
                        <SelectItem value="MAG 254">MAG 254</SelectItem>
                        <SelectItem value="MAG 256">MAG 256</SelectItem>
                        <SelectItem value="MAG 322">MAG 322</SelectItem>
                        <SelectItem value="MAG 424">MAG 424</SelectItem>
                        <SelectItem value="Other MAG">Other MAG</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="Smart TV">Smart TV</SelectItem>
                        <SelectItem value="Android Box">Android Box</SelectItem>
                        <SelectItem value="Apple TV">Apple TV</SelectItem>
                        <SelectItem value="Fire TV">Fire TV</SelectItem>
                        <SelectItem value="Mobile Device">Mobile Device</SelectItem>
                        <SelectItem value="Tablet">Tablet</SelectItem>
                        <SelectItem value="Computer">Computer</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="packageId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center justify-between">
                  <span>Streaming Package</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={packagesLoading}
                    className="h-8 px-3"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${packagesLoading ? 'animate-spin' : ''}`} />
                    Test Connection
                  </Button>
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={packagesLoading ? "Testing connection..." : "Select a package"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        <div>
                          <div className="font-medium">{pkg.name}</div>
                          {pkg.description && (
                            <div className="text-sm text-gray-500">{pkg.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Enhanced status indicators */}
                {packagesError && (
                  <FormDescription className="text-red-500 space-y-1 text-xs">
                    <div className="font-medium">❌ Connection Failed</div>
                    <div>{packagesError}</div>
                  </FormDescription>
                )}
                
                {source === 'default' && (
                  <FormDescription className="text-amber-600 space-y-2 text-xs">
                    <div className="font-medium">⚠️ Using Fallback Packages</div>
                    <div>Streaming service API connection failed - using default options for testing</div>
                    {debugInfo && (
                      <div className="text-xs space-y-1 p-2 bg-amber-50 rounded border">
                        <div><strong>Debug Info:</strong></div>
                        <div>• Auth format: {debugInfo.auth_format}</div>
                        <div>• Actions tried: {debugInfo.total_actions_tried}</div>
                        {debugInfo.last_error && (
                          <div>• Last error: {debugInfo.last_error}</div>
                        )}
                      </div>
                    )}
                  </FormDescription>
                )}
                
                {source === 'api' && packages.length > 0 && (
                  <FormDescription className="text-green-600 text-xs">
                    <div className="flex items-center space-x-1">
                      <span>✅</span>
                      <span>Connected to streaming service ({packages.length} packages loaded)</span>
                    </div>
                  </FormDescription>
                )}
                
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="planDuration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan Duration</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">1 Month</SelectItem>
                      <SelectItem value="3">3 Months</SelectItem>
                      <SelectItem value="6">6 Months</SelectItem>
                      <SelectItem value="12">12 Months</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {watchAccountType === 'm3u' && (
              <FormField
                control={form.control}
                name="connections"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Connections</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select connections" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 Connection</SelectItem>
                        <SelectItem value="2">2 Connections</SelectItem>
                        <SelectItem value="3">3 Connections</SelectItem>
                        <SelectItem value="4">4 Connections</SelectItem>
                        <SelectItem value="5">5 Connections</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Multiple connections allow simultaneous streaming on different devices
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
          
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800 mb-2">
              <strong>Account Type:</strong> {watchAccountType.toUpperCase()} 
              {watchAccountType === 'm3u' ? ` with ${watchConnections} connection${watchConnections > 1 ? 's' : ''}` : ' (Single connection)'}
            </p>
            <p className="text-sm text-amber-600 font-medium">
              This will consume {totalCreditsNeeded} credit{totalCreditsNeeded !== 1 ? 's' : ''} 
              {watchAccountType === 'm3u' && watchConnections > 1 && (
                <span> ({parseInt(watchPlanDuration)} month{parseInt(watchPlanDuration) !== 1 ? 's' : ''} × {watchConnections} connection{watchConnections !== 1 ? 's' : ''})</span>
              )}
            </p>
          </div>
          
          <div className="pt-2">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting || !form.formState.isValid}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating {watchAccountType.toUpperCase()} Customer...
                </>
              ) : (
                <>
                  Add {watchAccountType.toUpperCase()} Customer ({totalCreditsNeeded} credits)
                  {watchAccountType === 'm3u' && watchConnections > 1 && (
                    <span> • {watchConnections} Connections</span>
                  )}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
