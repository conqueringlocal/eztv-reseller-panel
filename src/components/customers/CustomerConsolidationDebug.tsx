import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Customer } from '@/contexts/AppContext';
import { isConsolidatedCustomer, getTotalConnections } from '@/utils/customerConsolidation/customerInfo';

interface CustomerConsolidationDebugProps {
  customers: Customer[];
}

export function CustomerConsolidationDebug({ customers }: CustomerConsolidationDebugProps) {
  if (process.env.NODE_ENV !== 'development') {
    return null; // Only show in development
  }

  const groupedCustomers = new Map<string, Customer[]>();
  const consolidatedCustomers: Customer[] = [];
  const unconsolidatedCustomers: Customer[] = [];

  // Group customers by customer_group
  customers.forEach(customer => {
    if (isConsolidatedCustomer(customer)) {
      consolidatedCustomers.push(customer);
    } else {
      unconsolidatedCustomers.push(customer);
      
      if (customer.customer_group) {
        const groupKey = customer.customer_group;
        if (!groupedCustomers.has(groupKey)) {
          groupedCustomers.set(groupKey, []);
        }
        groupedCustomers.get(groupKey)!.push(customer);
      }
    }
  });

  const duplicateGroups = Array.from(groupedCustomers.entries()).filter(([_, customers]) => customers.length > 1);

  return (
    <Card className="mb-4 border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-sm text-yellow-800">
          🔧 Customer Consolidation Debug (Dev Only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Badge variant="outline" className="mb-2">Consolidated</Badge>
            <p className="text-gray-600">{consolidatedCustomers.length} customers</p>
            {consolidatedCustomers.map(customer => (
              <div key={customer.id} className="text-xs text-gray-500">
                • {customer.name} ({getTotalConnections(customer)} connections)
              </div>
            ))}
          </div>
          
          <div>
            <Badge variant="outline" className="mb-2">Single Accounts</Badge>
            <p className="text-gray-600">{unconsolidatedCustomers.filter(c => !c.customer_group || !duplicateGroups.find(([group]) => group === c.customer_group)).length} customers</p>
          </div>
          
          <div>
            <Badge variant="destructive" className="mb-2">Needs Consolidation</Badge>
            <p className="text-gray-600">{duplicateGroups.length} groups</p>
            {duplicateGroups.map(([group, customers]) => (
              <div key={group} className="text-xs text-gray-500">
                • {customers[0].name} ({customers.length} duplicates)
              </div>
            ))}
          </div>
        </div>
        
        {duplicateGroups.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-100 rounded border border-yellow-300">
            <p className="text-xs text-yellow-800">
              ⚠️ Found {duplicateGroups.length} customer groups with duplicate records. 
              Use the Consolidation Manager above to merge them.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}