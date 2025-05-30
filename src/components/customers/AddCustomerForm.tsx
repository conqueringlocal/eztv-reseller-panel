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

// Form schema with validation - added package selection
const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  deviceType: z.string().min(1, { message: 'Please select a device type.' }),
  packageId: z.string().min(1, { message: 'Please select a package.' }),
  planDuration: z.coerce
    .number()
    .int()
    .min(1, { message: 'Plan duration must be at least 1 month.' })
    .max(12, { message: 'Plan duration cannot exceed 12 months.' }),
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
  const { packages, isLoading: packagesLoading, error: packagesError, source } = useIptvPackages();
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      deviceType: 'Smart TV',
      packageId: '',
      planDuration: 1,
      connections: 1,
    },
  });

  // Calculate total credits needed
  const watchPlanDuration = form.watch('planDuration');
  const watchConnections = form.watch('connections');
  const totalCreditsNeeded = watchPlanDuration * watchConnections;

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    if (!user) {
      toast.error('You need to be logged in to add a customer.');
      return;
    }
    
    // For admin, we'd need to select a reseller
    // For simplicity in this demo, we'll use the first reseller ID for admin
    const resellerId = user.role === 'admin' ? '2' : user.id;
    
    try {
      const success = await addCustomer({
        resellerId,
        name: data.name,
        email: data.email,
        macAddress: '', // Not required for M3U accounts
        deviceType: data.deviceType,
        packageId: data.packageId, // Include the selected package
        planDuration: data.planDuration,
        connections: data.connections,
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
              <FormLabel>IPTV Package</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={packagesLoading ? "Loading packages..." : "Select a package"} />
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
              {packagesError && (
                <FormDescription className="text-red-500">
                  {packagesError}
                </FormDescription>
              )}
              {source === 'default' && (
                <FormDescription className="text-amber-600">
                  Using default packages - IPTV API configuration may need adjustment
                </FormDescription>
              )}
              {source === 'api' && packages.length > 0 && (
                <FormDescription className="text-green-600">
                  Packages loaded from your IPTV panel
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
                <FormLabel>Plan Duration (Months)</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="12" {...field} />
                </FormControl>
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
            ({watchPlanDuration} month{watchPlanDuration !== 1 ? 's' : ''} × {watchConnections} connection{watchConnections !== 1 ? 's' : ''})
          </p>
        </div>
        
        <Button type="submit" className="w-full">Add M3U Customer</Button>
      </form>
    </Form>
  );
}
