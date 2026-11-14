import React from 'react';
import * as Icons from 'lucide-react';

interface DynamicIconProps {
  name: string;
  className?: string;
  size?: number;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, className = 'w-4 h-4', size = 16 }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (Icons as unknown as Record<string, React.FC<any>>)[name] || Icons.Box;
  return <IconComponent className={className} size={size} strokeWidth={1.75} aria-hidden="true" />;
};
