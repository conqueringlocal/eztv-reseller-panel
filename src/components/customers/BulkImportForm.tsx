
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Download, Upload, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface ImportResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  results: Array<{
    customerName: string;
    status: 'success' | 'error';
    message: string;
  }>;
}

interface CustomerImportData {
  name: string;
  email: string;
  username: string;
  password: string;
  macAddress?: string;
  deviceType: string;
  expirationDate: string;
  planDuration: number;
  highlevelContactId?: string;
}

export function BulkImportForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate CSV template
  const generateTemplate = () => {
    const headers = [
      'name',
      'email', 
      'username',
      'password',
      'macAddress',
      'deviceType',
      'expirationDate',
      'planDuration',
      'highlevelContactId'
    ];
    
    const sampleData = [
      'John Doe',
      'john@example.com',
      'johndoe123',
      'password123',
      '00:1A:2B:3C:4D:5E',
      'Smart TV',
      '2025-12-31',
      '12',
      'contact_abc123'
    ];

    const csvContent = [
      headers.join(','),
      sampleData.join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('CSV template downloaded successfully');
  };

  // Parse CSV file
  const parseCSV = (csvText: string): CustomerImportData[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV file must contain headers and at least one data row');
    
    const headers = lines[0].split(',').map(h => h.trim());
    const customers: CustomerImportData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        throw new Error(`Row ${i + 1} has incorrect number of columns`);
      }
      
      const customer: CustomerImportData = {
        name: values[0] || '',
        email: values[1] || '',
        username: values[2] || '',
        password: values[3] || '',
        macAddress: values[4] || undefined,
        deviceType: values[5] || 'Smart TV',
        expirationDate: values[6] || '',
        planDuration: parseInt(values[7]) || 1,
        highlevelContactId: values[8] || undefined
      };
      
      customers.push(customer);
    }
    
    return customers;
  };

  // Validate customer data
  const validateCustomer = (customer: CustomerImportData): string[] => {
    const errors: string[] = [];
    
    if (!customer.name) errors.push('Name is required');
    if (!customer.email) errors.push('Email is required');
    if (!customer.username) errors.push('Username is required');
    if (!customer.password) errors.push('Password is required');
    if (!customer.expirationDate) errors.push('Expiration date is required');
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (customer.email && !emailRegex.test(customer.email)) {
      errors.push('Invalid email format');
    }
    
    // Validate expiration date
    if (customer.expirationDate) {
      const expDate = new Date(customer.expirationDate);
      if (isNaN(expDate.getTime())) {
        errors.push('Invalid expiration date format (use YYYY-MM-DD)');
      } else if (expDate <= new Date()) {
        errors.push('Expiration date must be in the future');
      }
    }
    
    return errors;
  };

  // Process bulk import
  const processBulkImport = async (customers: CustomerImportData[]) => {
    const results: ImportResult['results'] = [];
    let processed = 0;
    let failed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      setProgress(((i + 1) / customers.length) * 100);
      
      try {
        // Validate customer data
        const validationErrors = validateCustomer(customer);
        if (validationErrors.length > 0) {
          throw new Error(validationErrors.join(', '));
        }

        // Check if username exists in IPTV panel
        const { data: existsData, error: existsError } = await supabase.functions.invoke('check-iptv-user-exists', {
          body: {
            username: customer.username,
            resellerId: user?.id
          }
        });

        if (existsError) {
          throw new Error(`Failed to verify username: ${existsError.message}`);
        }

        if (!existsData?.exists) {
          throw new Error(`Username ${customer.username} does not exist in IPTV panel`);
        }

        // Create customer record in database
        const { data: newCustomer, error: createError } = await supabase
          .from('customers')
          .insert({
            reseller_id: user?.id,
            name: customer.name,
            email: customer.email,
            username: customer.username,
            password: customer.password,
            mac_address: customer.macAddress,
            device_type: customer.deviceType,
            expiration_date: customer.expirationDate,
            start_date: new Date().toISOString().split('T')[0],
            plan_duration: customer.planDuration,
            status: 'active',
            is_trial: false,
            highlevel_contact_id: customer.highlevelContactId,
            provider: user?.provider || '8k'
          })
          .select()
          .single();

        if (createError) {
          throw new Error(`Failed to create customer record: ${createError.message}`);
        }

        // If HighLevel contact ID provided, sync to CRM
        if (customer.highlevelContactId) {
          try {
            await supabase.functions.invoke('update-highlevel-contact-credentials', {
              body: {
                contactId: customer.highlevelContactId,
                resellerId: user?.id,
                credentials: {
                  username: customer.username,
                  password: customer.password,
                  macAddress: customer.macAddress
                }
              }
            });
          } catch (crmError) {
            console.warn(`CRM sync failed for ${customer.name}:`, crmError);
            // Don't fail the import if CRM sync fails
          }
        }

        results.push({
          customerName: customer.name,
          status: 'success',
          message: 'Successfully imported and linked to existing IPTV account'
        });
        processed++;

      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        results.push({
          customerName: customer.name,
          status: 'error',
          message: errorMessage
        });
        allErrors.push(`${customer.name}: ${errorMessage}`);
        failed++;
      }

      // Small delay to prevent overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
      success: failed === 0,
      processed,
      failed,
      errors: allErrors,
      results
    };
  };

  // Handle file upload and processing
  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a CSV file');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setImportResult(null);

    try {
      const csvText = await file.text();
      const customers = parseCSV(csvText);
      
      if (customers.length === 0) {
        throw new Error('No customer data found in CSV file');
      }

      console.log(`Processing ${customers.length} customers for bulk import`);
      
      const result = await processBulkImport(customers);
      setImportResult(result);
      
      if (result.success) {
        toast.success(`Successfully imported ${result.processed} customers`);
        onSuccess();
      } else {
        toast.error(`Import completed with ${result.failed} errors out of ${customers.length} customers`);
      }
      
    } catch (error: any) {
      console.error('Bulk import error:', error);
      toast.error(error.message || 'Failed to process CSV file');
      setImportResult({
        success: false,
        processed: 0,
        failed: 1,
        errors: [error.message || 'Failed to process CSV file'],
        results: []
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Customer Import</CardTitle>
          <CardDescription>
            Import existing customers from CSV and link them to their IPTV accounts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={generateTemplate}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download CSV Template
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csvFile">Upload CSV File</Label>
            <Input
              id="csvFile"
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={isProcessing}
            />
          </div>

          {file && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Selected file: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </AlertDescription>
            </Alert>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing customers...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={!file || isProcessing}
            className="w-full flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {isProcessing ? 'Processing...' : 'Import Customers'}
          </Button>
        </CardContent>
      </Card>

      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">
                  {importResult.processed}
                </div>
                <div className="text-sm text-green-600">Successful</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-700">
                  {importResult.failed}
                </div>
                <div className="text-sm text-red-600">Failed</div>
              </div>
            </div>

            {importResult.results.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Detailed Results:</h4>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {importResult.results.map((result, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded text-sm ${
                        result.status === 'success'
                          ? 'bg-green-50 text-green-800'
                          : 'bg-red-50 text-red-800'
                      }`}
                    >
                      <div className="font-medium">{result.customerName}</div>
                      <div className="text-xs">{result.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
