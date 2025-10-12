import { Customer } from '@/contexts/AppContext';

/**
 * Normalize a name for comparison (lowercase, trim, remove special chars)
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normalize an email for comparison
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function getEditDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

export interface DuplicateCustomerMatch {
  customer: Customer;
  matchingCustomers: Customer[];
  similarityScore: number;
  matchReason: string[];
}

/**
 * Find potential duplicate customers
 */
export function findPotentialDuplicates(
  customer: Customer,
  allCustomers: Customer[],
  threshold: number = 0.85
): DuplicateCustomerMatch | null {
  const normalizedName = normalizeName(customer.name);
  const normalizedEmail = normalizeEmail(customer.email);
  
  const matches: { customer: Customer; score: number; reasons: string[] }[] = [];
  
  for (const otherCustomer of allCustomers) {
    // Skip self and customers in the same consolidated group
    if (otherCustomer.id === customer.id) continue;
    if (customer.customer_group && otherCustomer.customer_group === customer.customer_group) continue;
    
    const reasons: string[] = [];
    let score = 0;
    
    // Exact email match
    if (normalizeEmail(otherCustomer.email) === normalizedEmail) {
      score = 1.0;
      reasons.push('Exact email match');
    } else {
      // Check name similarity
      const otherNormalizedName = normalizeName(otherCustomer.name);
      const nameSimilarity = calculateSimilarity(normalizedName, otherNormalizedName);
      
      if (nameSimilarity >= threshold) {
        score = nameSimilarity;
        reasons.push(`Similar name (${Math.round(nameSimilarity * 100)}% match)`);
      }
    }
    
    if (score >= threshold) {
      matches.push({ customer: otherCustomer, score, reasons });
    }
  }
  
  if (matches.length > 0) {
    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);
    
    return {
      customer,
      matchingCustomers: matches.map(m => m.customer),
      similarityScore: matches[0].score,
      matchReason: matches[0].reasons
    };
  }
  
  return null;
}

/**
 * Check if a customer exists with the same name and email
 */
export function checkForExistingCustomer(
  name: string,
  email: string,
  customers: Customer[],
  excludeId?: string
): Customer | null {
  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);
  
  for (const customer of customers) {
    if (excludeId && customer.id === excludeId) continue;
    
    const customerNormalizedName = normalizeName(customer.name);
    const customerNormalizedEmail = normalizeEmail(customer.email);
    
    // Exact email match or very close name + email match
    if (customerNormalizedEmail === normalizedEmail) {
      const nameSimilarity = calculateSimilarity(normalizedName, customerNormalizedName);
      if (nameSimilarity > 0.8) {
        return customer;
      }
    }
  }
  
  return null;
}

/**
 * Find all potential duplicate groups in the customer list
 */
export function findAllDuplicateGroups(customers: Customer[]): DuplicateCustomerMatch[] {
  const processedCustomers = new Set<string>();
  const duplicateGroups: DuplicateCustomerMatch[] = [];
  
  for (const customer of customers) {
    if (processedCustomers.has(customer.id)) continue;
    
    const match = findPotentialDuplicates(customer, customers);
    if (match) {
      duplicateGroups.push(match);
      processedCustomers.add(customer.id);
      match.matchingCustomers.forEach(c => processedCustomers.add(c.id));
    }
  }
  
  return duplicateGroups;
}
