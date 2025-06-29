
import React from 'react';

export function LoginBrandHeader() {
  return (
    <div className="text-center mb-8">
      <div className="mb-6 flex justify-center">
        <div className="relative">
          <img 
            src="/lovable-uploads/f71dcfeb-b101-4ccc-abc8-d4e8bb8811a4.png" 
            alt="EZTV Club Logo" 
            className="h-20 w-auto object-contain drop-shadow-lg"
          />
        </div>
      </div>
      <h1 className="text-3xl font-bold bg-gradient-to-r from-eztv-600 to-eztv-800 bg-clip-text text-transparent mb-2">
        EZTV Club
      </h1>
      <p className="text-gray-600 font-medium text-lg">Reseller Dashboard</p>
      <div className="mt-3 h-1 w-24 bg-gradient-to-r from-eztv-500 to-eztv-700 mx-auto rounded-full"></div>
    </div>
  );
}
