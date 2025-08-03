import { Customer } from '@/contexts/AppContext';
import { isConsolidatedCustomer, getTotalConnections } from './customerInfo';

export interface CustomerGroupAnalysis {
  totalCustomers: number;
  consolidatedCustomers: number;
  unconsolidatedGroups: number;
  singleCustomers: number;
  duplicateGroups: Array<{
    groupKey: string;
    name: string;
    email: string;
    count: number;
    customers: Customer[];
  }>;
}

export function analyzeCustomerConsolidation(customers: Customer[]): CustomerGroupAnalysis {
  const groupedCustomers = new Map<string, Customer[]>();
  let consolidatedCount = 0;
  let singleCount = 0;

  customers.forEach(customer => {
    if (isConsolidatedCustomer(customer)) {
      consolidatedCount++;
    } else if (customer.customer_group) {
      const groupKey = `${customer.customer_group}_${customer.resellerId}`;
      if (!groupedCustomers.has(groupKey)) {
        groupedCustomers.set(groupKey, []);
      }
      groupedCustomers.get(groupKey)!.push(customer);
    } else {
      singleCount++;
    }
  });

  const duplicateGroups = Array.from(groupedCustomers.entries())
    .filter(([_, customers]) => customers.length > 1)
    .map(([groupKey, customers]) => ({
      groupKey,
      name: customers[0].name,
      email: customers[0].email,
      count: customers.length,
      customers
    }));

  const singleGroups = Array.from(groupedCustomers.entries())
    .filter(([_, customers]) => customers.length === 1);

  return {
    totalCustomers: customers.length,
    consolidatedCustomers: consolidatedCount,
    unconsolidatedGroups: duplicateGroups.length,
    singleCustomers: singleCount + singleGroups.length,
    duplicateGroups
  };
}

export function logCustomerConsolidationStatus(customers: Customer[], resellerId: string): void {
  const analysis = analyzeCustomerConsolidation(customers);
  
  console.group(`🔍 Customer Consolidation Analysis - Reseller: ${resellerId}`);
  console.log(`📊 Total Customers: ${analysis.totalCustomers}`);
  console.log(`✅ Consolidated: ${analysis.consolidatedCustomers}`);
  console.log(`👤 Single Accounts: ${analysis.singleCustomers}`);
  console.log(`⚠️ Groups Needing Consolidation: ${analysis.unconsolidatedGroups}`);
  
  if (analysis.duplicateGroups.length > 0) {
    console.group(`📋 Duplicate Groups:`);
    analysis.duplicateGroups.forEach(group => {
      console.log(`• ${group.name} (${group.email}): ${group.count} duplicates`);
      console.log(`  Customer IDs: ${group.customers.map(c => c.id).join(', ')}`);
    });
    console.groupEnd();
  }
  
  console.groupEnd();
}