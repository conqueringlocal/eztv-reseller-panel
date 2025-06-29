
// Helper function to safely get field values from both formats
export const getFieldValue = (customer: any, snakeCaseField: string, camelCaseField: string): any => {
  return customer[snakeCaseField] || customer[camelCaseField];
};
