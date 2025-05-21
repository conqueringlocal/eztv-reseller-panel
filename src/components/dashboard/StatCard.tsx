
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon,
  description,
  trend,
  trendValue,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline mt-1">
              <p className="text-2xl font-semibold">{value}</p>
              {trend && trendValue && (
                <p
                  className={cn(
                    "ml-2 text-xs",
                    trend === 'up' && "text-green-500",
                    trend === 'down' && "text-red-500",
                    trend === 'neutral' && "text-gray-500"
                  )}
                >
                  {trendValue}
                </p>
              )}
            </div>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
