
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function DashboardCard({
  title,
  description,
  className,
  children,
  footer,
}: DashboardCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="bg-white">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-6">
        {children}
      </CardContent>
      {footer && (
        <div className="bg-gray-50 px-6 py-3 text-sm font-medium border-t">
          {footer}
        </div>
      )}
    </Card>
  );
}
