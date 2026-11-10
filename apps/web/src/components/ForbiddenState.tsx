import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@synergy/ui';

export function ForbiddenState({ message = "You don't have permission to view this content." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center space-y-4">
      <div className="p-4 bg-red-100 text-red-600 rounded-full">
        <ShieldAlert size={48} />
      </div>
      <h2 className="text-2xl font-semibold text-gray-900">Access Denied</h2>
      <p className="text-gray-500 max-w-md">{message}</p>
      <div className="pt-4">
        <Button onClick={() => window.history.back()} variant="outline">
          Go Back
        </Button>
      </div>
    </div>
  );
}
