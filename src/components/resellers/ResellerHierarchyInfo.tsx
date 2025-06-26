
import React from 'react';
import { useResellerLevel } from '@/hooks/useResellerLevel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, ChevronRight } from 'lucide-react';

export const ResellerHierarchyInfo: React.FC = () => {
  const { resellerPath, resellerLevel, isLoading, error } = useResellerLevel();
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Reseller Hierarchy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Reseller Hierarchy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }
  
  if (!resellerPath || resellerPath.length === 0) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Reseller Hierarchy
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">Your Level:</span>
            <Badge variant={resellerLevel === 1 ? 'default' : 'secondary'}>
              Level {resellerLevel}
            </Badge>
            {resellerLevel === 1 && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                Can Purchase Credits
              </Badge>
            )}
          </div>
          
          {resellerPath.length > 1 && (
            <div>
              <span className="font-medium mb-2 block">Hierarchy Path:</span>
              <div className="flex items-center gap-2 flex-wrap">
                {resellerPath.map((reseller, index) => (
                  <React.Fragment key={reseller.id}>
                    <div className="flex items-center gap-1">
                      <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {reseller.name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        L{reseller.level}
                      </Badge>
                    </div>
                    {index < resellerPath.length - 1 && (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
