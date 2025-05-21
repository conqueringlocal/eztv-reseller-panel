
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useApp } from '@/contexts/AppContext';
import { toast } from 'sonner';

// Form schema with validation
const formSchema = z.object({
  credits: z.coerce
    .number()
    .int()
    .min(1, { message: 'Credits must be at least 1.' }),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CreditManageFormProps {
  resellerId: string;
  type: 'add' | 'remove';
  onSuccess?: () => void;
}

export function CreditManageForm({ resellerId, type, onSuccess }: CreditManageFormProps) {
  const { addCredits, removeCredits, getReseller } = useApp();
  const reseller = getReseller(resellerId);
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      credits: 1,
      notes: '',
    },
  });

  // Handle form submission
  const onSubmit = async (data: FormData) => {
    let success = false;
    
    try {
      if (type === 'add') {
        success = await addCredits(resellerId, data.credits, data.notes);
        if (success) {
          toast.success(`Added ${data.credits} credit(s) to ${reseller?.name}.`);
        }
      } else {
        success = await removeCredits(resellerId, data.credits, data.notes);
        if (success) {
          toast.success(`Removed ${data.credits} credit(s) from ${reseller?.name}.`);
        } else {
          toast.error('Not enough credits available to remove.');
          return;
        }
      }
      
      if (success) {
        form.reset();
        if (onSuccess) onSuccess();
      }
    } catch (error) {
      toast.error(`Failed to ${type} credits.`);
      console.error(error);
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="credits"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{type === 'add' ? 'Add Credits' : 'Remove Credits'}</FormLabel>
              <FormControl>
                <Input type="number" min="1" {...field} />
              </FormControl>
              <FormDescription>
                {type === 'add' 
                  ? 'Enter the number of credits to add to this reseller.'
                  : `Enter the number of credits to remove. Current balance: ${reseller?.credits || 0}`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Add notes about this transaction..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button 
          type="submit" 
          className={type === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
        >
          {type === 'add' ? 'Add Credits' : 'Remove Credits'}
        </Button>
      </form>
    </Form>
  );
}
