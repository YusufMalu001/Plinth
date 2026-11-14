import React from 'react';
import { ProductStatus } from '../content/products';

interface StatusPillProps {
  status: ProductStatus;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, className = '' }) => {
  if (status === 'available') {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-bg text-green-text ${className}`}
      >
        Available
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-grey-bg text-grey-text ${className}`}
    >
      Coming soon
    </span>
  );
};
