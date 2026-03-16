

## Plan: Move Credit Log Below Customers + Add Pagination

### Changes

**1. `src/pages/admin/AdminResellerDetail.tsx`**
Swap the order of the Credit Log card (lines 427-440) and Customers card (lines 442-455) so customers appear first and the credit log is at the bottom of the page.

**2. `src/components/credits/CreditLogTable.tsx`**
Add pagination (20 rows per page) using the existing `Pagination` UI components. This keeps the credit log compact and avoids endless scrolling. Users can page through older entries as needed.

- Add `currentPage` state, slice `filteredLogs` to show 20 per page
- Render pagination controls below the table showing page numbers and prev/next buttons
- Reset to page 1 when search changes

