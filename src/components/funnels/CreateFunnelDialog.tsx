import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FunnelTemplate } from '@/hooks/useFunnels';
import { useToast } from '@/hooks/use-toast';

interface CreateFunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: FunnelTemplate[];
  onCreateFunnel: (data: {
    template_id: string;
    name: string;
    subdomain: string;
    custom_domain?: string;
  }) => Promise<any>;
}

export const CreateFunnelDialog: React.FC<CreateFunnelDialogProps> = ({
  open,
  onOpenChange,
  templates,
  onCreateFunnel,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const resetForm = () => {
    setSelectedTemplate('');
    setName('');
    setSubdomain('');
    setCustomDomain('');
  };

  const generateSubdomain = (funnelName: string) => {
    return funnelName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value && !subdomain) {
      setSubdomain(generateSubdomain(value));
    }
  };

  const handleCreate = async () => {
    if (!selectedTemplate || !name || !subdomain) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    
    try {
      const result = await onCreateFunnel({
        template_id: selectedTemplate,
        name,
        subdomain,
        custom_domain: customDomain || undefined,
      });

      if (result) {
        onOpenChange(false);
        resetForm();
      }
    } finally {
      setIsCreating(false);
    }
  };

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Funnel</DialogTitle>
          <DialogDescription>
            Choose a template and customize your funnel settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Choose Template</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-all ${
                    selectedTemplate === template.id
                      ? 'ring-2 ring-primary bg-primary/5'
                      : 'hover:shadow-md'
                  }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {template.template_type}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>

          {selectedTemplate && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Funnel Settings</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="funnel-name">Funnel Name *</Label>
                  <Input
                    id="funnel-name"
                    placeholder="e.g., IPTV Free Trial"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subdomain">Subdomain *</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="subdomain"
                      placeholder="my-iptv-offer"
                      value={subdomain}
                      onChange={(e) => setSubdomain(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      .eztvclub.com
                    </span>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="custom-domain">Custom Domain (Optional)</Label>
                  <Input
                    id="custom-domain"
                    placeholder="www.myiptvdomain.com"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    You can add a custom domain later if you don't have one now
                  </p>
                </div>
              </div>

              {selectedTemplateData && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Template Preview</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    {selectedTemplateData.description}
                  </p>
                  <Badge variant="outline">{selectedTemplateData.template_type}</Badge>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={!selectedTemplate || !name || !subdomain || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Funnel'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};