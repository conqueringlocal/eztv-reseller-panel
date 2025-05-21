
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
import { toast } from 'sonner';

// Form schema with validation
const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  macAddress: z
    .string()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, {
      message: 'Please enter a valid MAC address (XX:XX:XX:XX:XX:XX)',
    }),
  deviceType: z.string().min(1, { message: 'Please select a device type.' }),
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
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      macAddress: '',
      deviceType: 'Smart TV',
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
        macAddress: data.macAddress,
        deviceType: data.deviceType,
        planDuration: data.planDuration,
        connections: data.connections,
      });
      
      if (success) {
        toast.success('Customer added successfully!');
        form.reset();
        if (onSuccess) onSuccess();
      } else {
        toast.error('Failed to add customer. Please check your credits balance.');
      }
    } catch (error) {
      toast.error('An error occurred while adding the customer.');
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
          name="macAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>MAC Address</FormLabel>
              <FormControl>
                <Input placeholder="00:1A:2B:3C:4D:5E" {...field} />
              </FormControl>
              <FormDescription>
                Format: XX:XX:XX:XX:XX:XX (letters and numbers)
              </FormDescription>
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
        
        <FormDescription className="text-amber-600 font-medium">
          This will consume {totalCreditsNeeded} credit{totalCreditsNeeded !== 1 ? 's' : ''} 
          ({watchPlanDuration} month{watchPlanDuration !== 1 ? 's' : ''} × {watchConnections} connection{watchConnections !== 1 ? 's' : ''})
        </FormDescription>
        
        <Button type="submit" className="w-full">Add Customer</Button>
      </form>
    </Form>
  );
}
