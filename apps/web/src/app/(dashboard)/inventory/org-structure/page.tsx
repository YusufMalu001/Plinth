"use client";
import React from 'react';
import { GenericList } from '../../../../features/master-data/GenericList';
import { factoriesListDescriptor } from '../../../../features/master-data/descriptors';

export default function OrgStructureListPage() {
  return <GenericList descriptor={factoriesListDescriptor} />;
}
