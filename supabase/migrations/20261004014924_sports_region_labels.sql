BEGIN;
-- Strip every two-letter region label, including newly introduced provider regions.
CREATE OR REPLACE FUNCTION public.sports_us_today_content(p_content text,p_posted timestamptz,p_today date) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE line text; lines text[]:=string_to_array(replace(p_content,E'\r',''),E'\n'); labels text[]:='{}'; body text[]:='{}';
 footer boolean:=false; event_day date; publication_day date:=(p_posted AT TIME ZONE 'America/New_York')::date;
BEGIN
 -- Only explicit US channel categories establish eligibility. US team names/US event titles do not.
 FOREACH line IN ARRAY lines LOOP
  line:=btrim(line);
  IF line='' OR line ~* '^(Enjoy\.?|Team\s)' THEN CONTINUE; END IF;
  IF line ~* '^([A-Z]{2}|USA)\s*\|' THEN
   footer:=true;
   IF line ~* '^(US|USA)\s*\|' THEN labels:=array_append(labels,line); END IF;
   CONTINUE;
  END IF;
  -- The supported provider format has category labels at the bottom. Hide unknown section layouts.
  IF footer THEN RETURN NULL; END IF;
  IF line ~* '^(New Events For\M|Total Events\s*:)' OR line !~ '[0-9]' THEN CONTINUE; END IF;
  event_day:=public.sports_event_day(line,publication_day);
  IF coalesce(event_day,publication_day)=p_today THEN
   -- Retain the supplied ET time while removing the parallel UK-time segment.
   IF line ~* '//\s*ET\s' THEN line:=regexp_replace(line,'\s*//\s*UK\s+.*?\s*//\s*ET\s+',' // ET ','i'); END IF;
   body:=array_append(body,line);
  END IF;
 END LOOP;
 IF cardinality(labels)=0 OR cardinality(body)=0 THEN RETURN NULL; END IF;
 RETURN array_to_string(body,E'\n')||E'\n\n'||array_to_string(labels,E'\n');
END $$;
COMMIT;
