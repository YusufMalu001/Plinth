import { redirect } from 'next/navigation';

export default function LegacySalesPaymentsRedirect() {
  redirect('/accounts/payments');
}
