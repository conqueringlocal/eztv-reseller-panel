
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
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
import { Customer } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useIptvPackages } from '@/hooks/useIptvPackages';
import { toast } from 'sonner';

// Form schema with validation
const formSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  deviceType: z.string().min(1, { message: 'Please select a device type.' }),
  packageId: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface EditCustomerFormProps {
  customer: Customer;
  onSuccess?: () => void;
}

export function EditCustomerForm({ customer, onSuccess }: EditCustomerFormProps) {
  const { updateCustomer } = useApp();
  const { user } = useAuth();
  const { packages } = useIptvPackages(customer.provider);
  
  const isAdmin = user?.role === 'admin';
  
  // Initialize form with customer values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: customer.name,
      email: customer.email,
      deviceType: customer.deviceType,
      packageId: customer.package_id || customer.packageId || 'none',
    },
  });

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    try {
      // Map camelCase form fields to snake_case database columns
      const updateData: any = {
        name: data.name,
        email: data.email,
        device_type: data.deviceType, // Map deviceType to device_type
        mac_address: customer.macAddress || '', // Keep existing mac_address
      };
      
      // Only include package_id if user is admin and packageId is provided
      if (isAdmin && data.packageId && data.packageId !== 'none') {
        updateData.package_id = data.packageId;
      } else if (isAdmin && data.packageId === 'none') {
        updateData.package_id = null;
      }
      
      const success = await updateCustomer(customer.id, updateData);
      
      if (success) {
        toast.success('Customer updated successfully!');
        if (onSuccess) onSuccess();
      } else {
        toast.error('Failed to update customer.');
      }
    } catch (error) {
      toast.error('An error occurred while updating the customer.');
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
        
        {isAdmin && (
          <FormField
            control={form.control}
            name="packageId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Package (Admin Only)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a package (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No Package</SelectItem>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        <div className="flex justify-end space-x-2">
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </Form>
  );
}
