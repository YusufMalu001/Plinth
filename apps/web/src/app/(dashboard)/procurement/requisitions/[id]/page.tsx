import { redirect } from 'next/navigation';

export default function LegacyRequisitionDetailPage() {
  redirect('/procurement/purchase-orders');
}
