import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Download, Upload, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
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
    status: 'success' | 'error' | 'warning';
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
  planDuration: number;
  maxConnections?: number; // New field for multi-connection support
  highlevelContactId?: string;
}

export function BulkImportForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate CSV template (updated with maxConnections column)
  const generateTemplate = () => {
    const headers = [
      'name',
      'email', 
      'username',
      'password',
      'macAddress',
      'deviceType',
      'planDuration',
      'maxConnections', // New column
      'highlevelContactId'
    ];
    
    const sampleData = [
      'John Doe',
      'john@example.com',
      'johndoe123',
      'password123',
      '00:1A:2B:3C:4D:5E',
      'Smart TV',
      '12',
      '2', // Sample max connections
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

  // Parse CSV file (updated to include maxConnections)
  const parseCSV = (csvText: string): CustomerImportData[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV file must contain headers and at least one data row');
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const customers: CustomerImportData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      // Better CSV parsing to handle quoted values
      const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const cleanValues = values.map(v => v.replace(/^"|"$/g, '').trim());
      
      if (cleanValues.length < 4) {
        console.warn(`Row ${i + 1} has insufficient columns, skipping`);
        continue;
      }
      
      const customer: CustomerImportData = {
        name: cleanValues[0] || '',
        email: cleanValues[1] || '',
        username: cleanValues[2] || '',
        password: cleanValues[3] || '',
        macAddress: cleanValues[4] || undefined,
        deviceType: cleanValues[5] || 'Smart TV',
        planDuration: parseInt(cleanValues[6]) || 1,
        maxConnections: parseInt(cleanValues[7]) || 1, // New field
        highlevelContactId: cleanValues[8] || undefined
      };
      
      customers.push(customer);
    }
    
    return customers;
  };

  // Enhanced validation (updated to include maxConnections validation)
  const validateCustomer = (customer: CustomerImportData): string[] => {
    const errors: string[] = [];
    
    if (!customer.name?.trim()) errors.push('Name is required');
    if (!customer.email?.trim()) errors.push('Email is required');
    if (!customer.username?.trim()) errors.push('Username is required');
    if (!customer.password?.trim()) errors.push('Password is required');
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (customer.email && !emailRegex.test(customer.email.trim())) {
      errors.push('Invalid email format');
    }
    
    // Validate plan duration
    if (customer.planDuration && (customer.planDuration < 1 || customer.planDuration > 60)) {
      errors.push('Plan duration must be between 1 and 60 months');
    }

    // Validate max connections
    if (customer.maxConnections && (customer.maxConnections < 1 || customer.maxConnections > 5)) {
      errors.push('Max connections must be between 1 and 5');
    }
    
    return errors;
  };

  // Enhanced bulk import processing (updated to handle multi-connection accounts)
  const processBulkImport = async (customers: CustomerImportData[]) => {
    const results: ImportResult['results'] = [];
    let processed = 0;
    let failed = 0;
    const allErrors: string[] = [];

    console.log(`🚀 Starting bulk import for ${customers.length} customers`);

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      setProgress(((i + 1) / customers.length) * 100);
      
      try {
        console.log(`📋 Processing customer ${i + 1}/${customers.length}: ${customer.name}`);
        
        // Validate customer data
        const validationErrors = validateCustomer(customer);
        if (validationErrors.length > 0) {
          throw new Error(validationErrors.join(', '));
        }

        // Check if username exists in IPTV panel and get expiration date
        console.log(`🔍 Checking if username ${customer.username} exists in IPTV panel`);
        const { data: existsData, error: existsError } = await supabase.functions.invoke('check-iptv-user-exists', {
          body: {
            username: customer.username,
            password: customer.password, // Now passing password as well
            resellerId: user?.id
          }
        });

        if (existsError) {
          console.error(`❌ Error checking username ${customer.username}:`, existsError);
          throw new Error(`Failed to verify username: ${existsError.message}`);
        }

        console.log(`📊 Username check result for ${customer.username}:`, existsData);

        if (!existsData?.exists) {
          throw new Error(`Username ${customer.username} does not exist in ${existsData?.provider || 'IPTV'} panel`);
        }

        // Use expiration date from IPTV API response
        const iptvExpirationDate = existsData.expirationDate;
        if (!iptvExpirationDate) {
          console.warn(`⚠️ No expiration date found in IPTV panel for ${customer.username}, using default`);
        }

        // Check if customer already exists in our database
        const { data: existingCustomer, error: checkError } = await supabase
          .from('customers')
          .select('id, name')
          .eq('reseller_id', user?.id)
          .eq('username', customer.username)
          .maybeSingle();

        if (checkError) {
          console.error(`❌ Error checking existing customer:`, checkError);
          throw new Error(`Database error: ${checkError.message}`);
        }

        if (existingCustomer) {
          results.push({
            customerName: customer.name,
            status: 'warning',
            message: `Customer with username ${customer.username} already exists in your database`
          });
          continue;
        }

        // Create customer record in database with multi-connection support
        console.log(`💾 Creating customer record for ${customer.name} with ${customer.maxConnections} max connections`);
        const { data: newCustomer, error: createError } = await supabase
          .from('customers')
          .insert({
            reseller_id: user?.id,
            name: customer.name.trim(),
            email: customer.email.trim(),
            username: customer.username.trim(),
            password: customer.password.trim(),
            mac_address: customer.macAddress?.trim() || null,
            device_type: customer.deviceType?.trim() || 'Smart TV',
            expiration_date: iptvExpirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            start_date: new Date().toISOString().split('T')[0],
            plan_duration: customer.planDuration,
            max_connections: customer.maxConnections || 1, // New field
            current_connections: 0, // New field
            connection_details: [], // New field
            status: 'active',
            is_trial: false,
            highlevel_contact_id: customer.highlevelContactId?.trim() || null,
            provider: user?.provider || '8k'
          })
          .select()
          .single();

        if (createError) {
          console.error(`❌ Error creating customer ${customer.name}:`, createError);
          throw new Error(`Failed to create customer record: ${createError.message}`);
        }

        console.log(`✅ Successfully created customer: ${customer.name}`);

        // If HighLevel contact ID provided, sync to CRM
        if (customer.highlevelContactId?.trim()) {
          console.log(`🔄 Syncing ${customer.name} to CRM with contact ID: ${customer.highlevelContactId}`);
          try {
            const { data: crmData, error: crmError } = await supabase.functions.invoke('update-highlevel-contact-credentials', {
              body: {
                contactId: customer.highlevelContactId.trim(),
                resellerId: user?.id,
                credentials: {
                  username: customer.username.trim(),
                  password: customer.password.trim(),
                  macAddress: customer.macAddress?.trim()
                }
              }
            });

            if (crmError) {
              console.warn(`⚠️ CRM sync failed for ${customer.name}:`, crmError);
            } else {
              console.log(`✅ CRM sync successful for ${customer.name}`);
            }
          } catch (crmError) {
            console.warn(`⚠️ CRM sync failed for ${customer.name}:`, crmError);
            // Don't fail the import if CRM sync fails
          }
        }

        const maxConnectionsText = customer.maxConnections && customer.maxConnections > 1 
          ? ` (${customer.maxConnections} max connections)` 
          : '';

        const expirationMessage = iptvExpirationDate ? 
          `Successfully imported with expiration date ${iptvExpirationDate} from ${existsData?.provider || 'IPTV'} panel${maxConnectionsText}` :
          `Successfully imported with default expiration date${maxConnectionsText}`;

        results.push({
          customerName: customer.name,
          status: 'success',
          message: expirationMessage
        });
        processed++;

      } catch (error: any) {
        console.error(`❌ Error processing customer ${customer.name}:`, error);
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
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`📊 Bulk import completed: ${processed} successful, ${failed} failed`);

    return {
      success: failed === 0,
      processed,
      failed,
      errors: allErrors,
      results
    };
  };

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
        throw new Error('No valid customer data found in CSV file');
      }

      console.log(`🚀 Processing ${customers.length} customers for bulk import`);
      
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
            Import existing customers from CSV and link them to their IPTV accounts. Expiration dates and connection limits will be automatically retrieved from your IPTV panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Multi-Connection Support:</strong> You can now specify the maximum number of connections (1-5) for each customer. This allows customers to stream on multiple devices simultaneously.
            </AlertDescription>
          </Alert>

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
                          : result.status === 'warning'
                          ? 'bg-yellow-50 text-yellow-800'
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
