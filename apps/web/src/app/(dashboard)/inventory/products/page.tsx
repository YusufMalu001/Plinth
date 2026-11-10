"use client";
import React from 'react';
import { GenericList } from '../../../../features/master-data/GenericList';
import { productsListDescriptor } from '../../../../features/master-data/descriptors';

export default function ProductsListPage() {
  return <GenericList descriptor={productsListDescriptor} />;
}
