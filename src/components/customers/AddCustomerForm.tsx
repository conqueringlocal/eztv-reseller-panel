
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
import { RefreshCw } from 'lucide-react';

// Form schema with validation - updated to only allow specific duration values
const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  deviceType: z.string().min(1, { message: 'Please select a device type.' }),
  packageId: z.string().min(1, { message: 'Please select a package.' }),
  planDuration: z.enum(['1', '3', '6', '12'], { 
    errorMap: () => ({ message: 'Please select a valid plan duration.' })
  }),
  connections: z.coerce
    .number()
    .int()
    .min(1, { message: 'Must have at least 1 connection.' })
    .max(3, { message: 'Cannot exceed 3 connections.' }),
});

type FormData = z.infer<typeof formSchema>;

interface AddCustomerFormProps {
  onSuccess?: () => void;
}

export function AddCustomerForm({ onSuccess }: AddCustomerFormProps) {
  const { user } = useAuth();
  const { addCustomer } = useApp();
  const { packages, isLoading: packagesLoading, error: packagesError, source, debugInfo, refetch } = useIptvPackages();
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      deviceType: 'Smart TV',
      packageId: '',
      planDuration: '1',
      connections: 1,
    },
  });

  // Calculate total credits needed
  const watchPlanDuration = form.watch('planDuration');
  const watchConnections = form.watch('connections');
  const totalCreditsNeeded = parseInt(watchPlanDuration) * watchConnections;

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You need to be logged in to add a customer.');
      return;
    }
    
    // For admin, we'd need to select a reseller
    // For simplicity in this demo, we'll use the first reseller ID for admin
    const resellerId = user.role === 'admin' ? '2' : user.id;
    
    // Calculate start and expiration dates
    const startDate = new Date().toISOString().split('T')[0];
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + parseInt(data.planDuration));
    const expirationDateString = expirationDate.toISOString().split('T')[0];
    
    try {
      const success = await addCustomer({
        resellerId,
        name: data.name,
        email: data.email,
        macAddress: '', // Not required for M3U accounts
        deviceType: data.deviceType,
        packageId: data.packageId, // Include the selected package
        planDuration: parseInt(data.planDuration),
        connections: data.connections,
        startDate,
        expirationDate: expirationDateString,
      });
      
      if (success) {
        toast.success('M3U customer added successfully!');
        form.reset();
        if (onSuccess) onSuccess();
      } else {
        toast.error('Failed to add M3U customer. Please check your credits balance.');
      }
    } catch (error) {
      toast.error('An error occurred while adding the M3U customer.');
      console.error(error);
    }
  };
  
  // Test connection handler
  const handleTestConnection = async () => {
    console.log('🧪 Manual connection test triggered');
    toast.info('🔄 Testing IPTV connection...');
    await refetch();
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  <SelectItem value="Smart TV">Smart TV</SelectItem>
                  <SelectItem value="Android Box">Android Box</SelectItem>
                  <SelectItem value="Apple TV">Apple TV</SelectItem>
                  <SelectItem value="Fire TV">Fire TV</SelectItem>
                  <SelectItem value="Mobile Device">Mobile Device</SelectItem>
                  <SelectItem value="Tablet">Tablet</SelectItem>
                  <SelectItem value="Computer">Computer</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
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
                <span>IPTV Package</span>
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
                <FormDescription className="text-red-500 space-y-1">
                  <div className="font-medium">❌ Connection Failed</div>
                  <div>{packagesError}</div>
                </FormDescription>
              )}
              
              {source === 'default' && (
                <FormDescription className="text-amber-600 space-y-2">
                  <div className="font-medium">⚠️ Using Fallback Packages</div>
                  <div>IPTV API connection failed - using default options for testing</div>
                  {debugInfo && (
                    <div className="text-xs space-y-1 p-2 bg-amber-50 rounded border">
                      <div><strong>Debug Info:</strong></div>
                      <div>• Auth format: {debugInfo.auth_format}</div>
                      <div>• Endpoints tried: {debugInfo.total_endpoints_tried}</div>
                      {debugInfo.last_error && (
                        <div>• Last error: {debugInfo.last_error}</div>
                      )}
                    </div>
                  )}
                </FormDescription>
              )}
              
              {source === 'api' && packages.length > 0 && (
                <FormDescription className="text-green-600">
                  <div className="flex items-center space-x-1">
                    <span>✅</span>
                    <span>Connected to your IPTV panel ({packages.length} packages loaded)</span>
                  </div>
                </FormDescription>
              )}
              
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800 mb-2">
            <strong>Account Type:</strong> M3U (Compatible with all device types)
          </p>
          <p className="text-sm text-amber-600 font-medium">
            This will consume {totalCreditsNeeded} credit{totalCreditsNeeded !== 1 ? 's' : ''} 
            ({parseInt(watchPlanDuration)} month{parseInt(watchPlanDuration) !== 1 ? 's' : ''} × {watchConnections} connection{watchConnections !== 1 ? 's' : ''})
          </p>
        </div>
        
        <Button type="submit" className="w-full">Add M3U Customer</Button>
      </form>
    </Form>
  );
}
