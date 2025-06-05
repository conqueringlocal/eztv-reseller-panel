
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, X, Tag, FileText, Settings } from 'lucide-react';

interface CustomField {
  key: string;
  value: string;
}

interface ContactNote {
  body: string;
  type: string;
}

interface HighLevelContactManagerProps {
  contactId: string;
  resellerId: string;
  customerName?: string;
  onUpdate?: () => void;
}

export function HighLevelContactManager({ 
  contactId, 
  resellerId, 
  customerName = 'Contact',
  onUpdate 
}: HighLevelContactManagerProps) {
  const [customFields, setCustomFields] = useState<CustomField[]>([{ key: '', value: '' }]);
  const [notes, setNotes] = useState<ContactNote[]>([{ body: '', type: 'general' }]);
  const [tagsToAdd, setTagsToAdd] = useState<string[]>(['']);
  const [tagsToRemove, setTagsToRemove] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);

  const addCustomField = () => {
    setCustomFields([...customFields, { key: '', value: '' }]);
  };

  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const updateCustomField = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...customFields];
    updated[index][field] = value;
    setCustomFields(updated);
  };

  const addNote = () => {
    setNotes([...notes, { body: '', type: 'general' }]);
  };

  const removeNote = (index: number) => {
    setNotes(notes.filter((_, i) => i !== index));
  };

  const updateNote = (index: number, field: 'body' | 'type', value: string) => {
    const updated = [...notes];
    updated[index][field] = value;
    setNotes(updated);
  };

  const addTag = (type: 'add' | 'remove') => {
    if (type === 'add') {
      setTagsToAdd([...tagsToAdd, '']);
    } else {
      setTagsToRemove([...tagsToRemove, '']);
    }
  };

  const removeTag = (index: number, type: 'add' | 'remove') => {
    if (type === 'add') {
      setTagsToAdd(tagsToAdd.filter((_, i) => i !== index));
    } else {
      setTagsToRemove(tagsToRemove.filter((_, i) => i !== index));
    }
  };

  const updateTag = (index: number, value: string, type: 'add' | 'remove') => {
    if (type === 'add') {
      const updated = [...tagsToAdd];
      updated[index] = value;
      setTagsToAdd(updated);
    } else {
      const updated = [...tagsToRemove];
      updated[index] = value;
      setTagsToRemove(updated);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    
    try {
      // Filter out empty fields
      const validCustomFields = customFields.filter(field => field.key && field.value);
      const validNotes = notes.filter(note => note.body.trim());
      const validTagsToAdd = tagsToAdd.filter(tag => tag.trim());
      const validTagsToRemove = tagsToRemove.filter(tag => tag.trim());

      const { data, error } = await supabase.functions.invoke('update-highlevel-contact', {
        body: {
          contactId,
          resellerId,
          customFields: validCustomFields,
          notes: validNotes,
          tagsToAdd: validTagsToAdd,
          tagsToRemove: validTagsToRemove
        }
      });

      if (error || !data?.success) {
        console.error('Failed to update HighLevel contact:', error || data);
        toast.error('Failed to update contact in HighLevel');
        return;
      }

      toast.success('HighLevel contact updated successfully!');
      
      // Reset forms
      setCustomFields([{ key: '', value: '' }]);
      setNotes([{ body: '', type: 'general' }]);
      setTagsToAdd(['']);
      setTagsToRemove(['']);
      
      if (onUpdate) onUpdate();
      
    } catch (error) {
      console.error('Error updating HighLevel contact:', error);
      toast.error('An error occurred while updating the contact');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Settings className="h-5 w-5" />
          <span>HighLevel Contact Manager</span>
        </CardTitle>
        <CardDescription>
          Update custom fields, add notes, and manage tags for {customerName} in HighLevel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="custom-fields" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
          </TabsList>
          
          <TabsContent value="custom-fields" className="space-y-4">
            <div className="space-y-3">
              {customFields.map((field, index) => (
                <div key={index} className="flex space-x-2">
                  <Input
                    placeholder="Field key (e.g., iptv_username)"
                    value={field.key}
                    onChange={(e) => updateCustomField(index, 'key', e.target.value)}
                  />
                  <Input
                    placeholder="Field value"
                    value={field.value}
                    onChange={(e) => updateCustomField(index, 'value', e.target.value)}
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => removeCustomField(index)}
                    disabled={customFields.length === 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={addCustomField} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Field
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="notes" className="space-y-4">
            <div className="space-y-3">
              {notes.map((note, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex space-x-2">
                    <Select value={note.type} onValueChange={(value) => updateNote(index, 'type', value)}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="task">Task</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => removeNote(index)}
                      disabled={notes.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Note content..."
                    value={note.body}
                    onChange={(e) => updateNote(index, 'body', e.target.value)}
                    rows={3}
                  />
                </div>
              ))}
              <Button variant="outline" onClick={addNote} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Note
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="tags" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-green-700">Tags to Add</Label>
                <div className="space-y-2 mt-2">
                  {tagsToAdd.map((tag, index) => (
                    <div key={index} className="flex space-x-2">
                      <Input
                        placeholder="Tag name"
                        value={tag}
                        onChange={(e) => updateTag(index, e.target.value, 'add')}
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => removeTag(index, 'add')}
                        disabled={tagsToAdd.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => addTag('add')} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tag to Add
                  </Button>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-red-700">Tags to Remove</Label>
                <div className="space-y-2 mt-2">
                  {tagsToRemove.map((tag, index) => (
                    <div key={index} className="flex space-x-2">
                      <Input
                        placeholder="Tag name to remove"
                        value={tag}
                        onChange={(e) => updateTag(index, e.target.value, 'remove')}
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => removeTag(index, 'remove')}
                        disabled={tagsToRemove.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => addTag('remove')} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tag to Remove
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="mt-6">
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Updating Contact...' : 'Update HighLevel Contact'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
