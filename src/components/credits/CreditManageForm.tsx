
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
import { supabase } from '@/integrations/supabase/client';

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
  const [calculatedAmount, setCalculatedAmount] = React.useState<number | null>(null);
  
  // Initialize form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      credits: 1,
      notes: '',
    },
  });

  // Watch credits value for calculations
  const watchCredits = form.watch('credits');

  // Calculate example scenarios for the credit amount
  React.useEffect(() => {
    const calculateExamples = async () => {
      if (!watchCredits || watchCredits <= 0) {
        setCalculatedAmount(null);
        return;
      }

      try {
        // Calculate what this amount of credits could provide
        // Example: 12 credits = 12 months × 1 connection OR 6 months × 2 connections OR 4 months × 3 connections
        setCalculatedAmount(watchCredits);
      } catch (error) {
        console.error('Error calculating credit examples:', error);
        setCalculatedAmount(null);
      }
    };

    calculateExamples();
  }, [watchCredits]);

  // Generate credit usage examples
  const generateCreditExamples = (credits: number) => {
    const examples = [];
    
    // Single connection examples
    if (credits >= 1) examples.push(`${credits} month${credits > 1 ? 's' : ''} × 1 connection`);
    if (credits >= 2) examples.push(`${Math.floor(credits/2)} month${Math.floor(credits/2) > 1 ? 's' : ''} × 2 connections`);
    if (credits >= 3) examples.push(`${Math.floor(credits/3)} month${Math.floor(credits/3) > 1 ? 's' : ''} × 3 connections`);
    if (credits >= 6) examples.push(`${Math.floor(credits/6)} month${Math.floor(credits/6) > 1 ? 's' : ''} × 6 connections`);
    if (credits >= 12) examples.push(`1 year × 1 connection`);
    
    return examples.slice(0, 3); // Show max 3 examples
  };

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
              
              {/* Show credit usage examples for adding credits */}
              {type === 'add' && calculatedAmount && calculatedAmount > 0 && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800 mb-2">
                    💡 What {calculatedAmount} credit{calculatedAmount > 1 ? 's' : ''} can provide:
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    {generateCreditExamples(calculatedAmount).map((example, index) => (
                      <li key={index} className="flex items-center">
                        <span className="w-2 h-2 bg-blue-400 rounded-full mr-2 flex-shrink-0"></span>
                        {example}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
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
