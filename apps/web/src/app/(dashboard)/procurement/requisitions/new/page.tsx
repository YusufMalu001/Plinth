import { redirect } from 'next/navigation';

export default function LegacyNewRequisitionPage() {
  redirect('/procurement/purchase-orders/generate');
}
