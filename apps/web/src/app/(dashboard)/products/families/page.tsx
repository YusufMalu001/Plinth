import { redirect } from 'next/navigation';

export default function SubCategoriesPage() {
  redirect('/products/categories?tab=subcategories');
}
