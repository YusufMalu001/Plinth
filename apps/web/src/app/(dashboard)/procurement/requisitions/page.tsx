import { redirect } from 'next/navigation';

export default function LegacyRequisitionsPage() {
  redirect('/procurement/purchase-orders');
}
