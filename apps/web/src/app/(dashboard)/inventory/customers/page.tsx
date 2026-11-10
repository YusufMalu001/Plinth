"use client";
import React from 'react';
import { GenericList } from '../../../../features/master-data/GenericList';
import { customersListDescriptor } from '../../../../features/master-data/descriptors';

export default function CustomersListPage() {
  return <GenericList descriptor={customersListDescriptor} />;
}
