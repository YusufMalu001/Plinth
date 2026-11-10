"use client";
'use client';
import React from 'react';
import { GenericDetail } from '../../../../../features/master-data/GenericDetail';
import { customersDetailDescriptor } from '../../../../../features/master-data/descriptors';
import { useParams } from 'next/navigation';

export default function CustomersDetailPage() {
  const { id } = useParams();
  
  return (
    <div className="p-8">
      <GenericDetail id={id as string} descriptor={customersDetailDescriptor} hasApprovePermission={true} />
    </div>
  );
}
