"use client";
import React from 'react';
import { GenericList } from '../../../../features/master-data/GenericList';
import { qcRulesListDescriptor } from '../../../../features/master-data/descriptors';

export default function QcRulesListPage() {
  return <GenericList descriptor={qcRulesListDescriptor} />;
}
