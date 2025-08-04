import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const FunnelDisplay: React.FC = () => {
  const { subdomain } = useParams<{ subdomain: string }>();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchFunnelContent = async () => {
      if (!subdomain) {
        setError('No subdomain provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        // Fetch from the edge function
        const response = await fetch(
          `https://hddnqgggjjlildufirof.supabase.co/functions/v1/funnel-router/${subdomain}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'text/html',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Funnel not found: ${response.status}`);
        }

        const html = await response.text();
        setHtmlContent(html);
      } catch (err) {
        console.error('Error fetching funnel:', err);
        setError(err instanceof Error ? err.message : 'Failed to load funnel');
      } finally {
        setLoading(false);
      }
    };

    fetchFunnelContent();
  }, [subdomain]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading funnel...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Funnel Not Found</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <p className="text-sm text-muted-foreground">
            The funnel "{subdomain}" could not be found or is not published.
          </p>
        </div>
      </div>
    );
  }

  // Render the funnel content
  return (
    <div 
      className="min-h-screen w-full"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};

export default FunnelDisplay;