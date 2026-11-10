"use client";
'use client';
import React from 'react';
import { GenericDetail } from '../../../../../features/master-data/GenericDetail';
import { qcRulesDetailDescriptor } from '../../../../../features/master-data/descriptors';
import { useParams } from 'next/navigation';

export default function QcRulesDetailPage() {
  const { id } = useParams();
  
  return (
    <div className="p-8">
      <GenericDetail id={id as string} descriptor={qcRulesDetailDescriptor} hasApprovePermission={true} />
    </div>
  );
}
