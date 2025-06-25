
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProviderSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ProviderSelect({ value, onChange, disabled = false }: ProviderSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Select IPTV provider" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="8k">8K Provider</SelectItem>
        <SelectItem value="trex">Trex Provider</SelectItem>
      </SelectContent>
    </Select>
  );
}
