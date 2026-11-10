import React from 'react';
import { SearchX } from 'lucide-react';
import { cn } from '@synergy/ui';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ 
  title = 'No results found', 
  description = "We couldn't find anything matching your criteria.",
  icon: Icon = SearchX,
  action,
  className
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full min-h-[300px] p-8 text-center space-y-4", className)}>
      <div className="p-4 bg-muted text-muted-foreground rounded-full">
        <Icon size={48} />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
      </div>
      {action && (
        <div className="pt-2">
          {action}
        </div>
      )}
    </div>
  );
}
