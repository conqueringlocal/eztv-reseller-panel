
import React from 'react';
import { cn } from '@/lib/utils';

interface CreditsBadgeProps {
  credits: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CreditsBadge({
  credits,
  size = 'md',
  className,
}: CreditsBadgeProps) {
  // Determine size-based classes
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full bg-eztv-100 text-eztv-800 font-medium',
        sizeClasses[size],
        className
      )}
    >
      {credits} {credits === 1 ? 'Credit' : 'Credits'}
    </div>
  );
}
