import { redirect } from 'next/navigation';

export default function ExpectedReceiptsRedirectPage() {
  redirect('/receiving/goods-receipts?tab=expected-invoices');
}
