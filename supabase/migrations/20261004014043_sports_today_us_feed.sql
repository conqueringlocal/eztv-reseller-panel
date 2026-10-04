BEGIN;
-- Parse a schedule date, prioritizing explicitly labelled Eastern dates over UK dates.
-- NULL means undated; -infinity means a date was present but was not safe to parse.
CREATE FUNCTION public.sports_event_day(p_line text,p_reference date) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE s text:=p_line; m text[]; month_no integer; day_no integer; year_no integer:=extract(year FROM p_reference); result date;
BEGIN
 IF s ~* '//\s*ET\s' THEN s:=regexp_replace(s,'^.*//\s*ET\s+','','i');
 ELSIF s ~* '\mstart\s*:' THEN s:=regexp_replace(s,'^.*?\mstart\s*:\s*','','i');
 ELSIF s ~ '@' THEN s:=split_part(s,'@',2); END IF;
 m:=regexp_match(s,'(20[0-9]{2})-([0-9]{2})-([0-9]{2})');
 IF m IS NOT NULL THEN RETURN make_date(m[1]::integer,m[2]::integer,m[3]::integer); END IF;
 m:=regexp_match(s,'\m(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-9]{1,2})(?:,?\s+(20[0-9]{2}))?\M','i');
 IF m IS NOT NULL THEN
  month_no:=array_position(ARRAY['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],lower(left(m[1],3)));day_no:=m[2]::integer;
 ELSE
  m:=regexp_match(s,'\m([0-9]{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(20[0-9]{2}))?\M','i');
  IF m IS NOT NULL THEN month_no:=array_position(ARRAY['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],lower(left(m[2],3)));day_no:=m[1]::integer; END IF;
 END IF;
 IF m IS NULL THEN
  IF s ~ '[0-9]{1,4}[-/][0-9]{1,2}[-/][0-9]{1,4}' OR p_line ~* '\mstart\s*:|@|//\s*ET\s' THEN RETURN '-infinity'::date; END IF;
  RETURN NULL;
 END IF;
 IF m[3] IS NOT NULL THEN year_no:=m[3]::integer; END IF;
 result:=make_date(year_no,month_no,day_no);
 -- Nearest year to original publication, so Dec/Jan scheduling survives year boundaries.
 IF m[3] IS NULL THEN
  IF result-p_reference>183 THEN result:=make_date(year_no-1,month_no,day_no);
  ELSIF p_reference-result>183 THEN result:=make_date(year_no+1,month_no,day_no); END IF;
 END IF;
 RETURN result;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN '-infinity'::date;
END $$;

CREATE FUNCTION public.sports_us_today_content(p_content text,p_posted timestamptz,p_today date) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE line text; lines text[]:=string_to_array(replace(p_content,E'\r',''),E'\n'); labels text[]:='{}'; body text[]:='{}';
 footer boolean:=false; event_day date; publication_day date:=(p_posted AT TIME ZONE 'America/New_York')::date;
BEGIN
 -- Only explicit US channel categories establish eligibility. US team names/US event titles do not.
 FOREACH line IN ARRAY lines LOOP
  line:=btrim(line);
  IF line='' OR line ~* '^(Enjoy\.?|Team\s)' THEN CONTINUE; END IF;
  IF line ~* '^(US|USA|UK|GB|CA|IE|AU|NZ|KR|DE|FR|ES|IT|PT|NL|PL|IN|BR|ZA|AE|SA|TR)\s*\|' THEN
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
REVOKE ALL ON FUNCTION public.sports_event_day(text,date),public.sports_us_today_content(text,timestamptz,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sports_event_day(text,date),public.sports_us_today_content(text,timestamptz,date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_sports_feed(p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE is_admin boolean; today date:=(now() AT TIME ZONE 'America/New_York')::date; state public.sports_reader_state; posts jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') INTO is_admin;
 SELECT * INTO state FROM public.sports_reader_state WHERE id;
 IF is_admin THEN
  SELECT coalesce(jsonb_agg(x ORDER BY posted_at DESC,id DESC),'[]'::jsonb) INTO posts FROM
  (SELECT id,content,posted_at,edited_at,media,media_notice,album_id,updated_at,message_id FROM public.telegram_sports_posts WHERE p_before IS NULL OR (posted_at,id)<(p_before,p_before_id) ORDER BY posted_at DESC,id DESC LIMIT 100)x;
 ELSE
  SELECT coalesce(jsonb_agg(x ORDER BY posted_at DESC,id DESC),'[]'::jsonb) INTO posts FROM
  (SELECT id,public.sports_us_today_content(content,posted_at,today) AS content,posted_at,edited_at,'[]'::jsonb AS media,''::text AS media_notice,album_id,updated_at,message_id
   FROM public.telegram_sports_posts WHERE source_id=state.source_id
    AND posted_at >= ((today-7)::timestamp AT TIME ZONE 'America/New_York') AND posted_at<=now()
    AND (p_before IS NULL OR (posted_at,id)<(p_before,p_before_id))
    AND public.sports_us_today_content(content,posted_at,today) IS NOT NULL
   ORDER BY posted_at DESC,id DESC LIMIT 100)x;
 END IF;
 RETURN jsonb_build_object('status',jsonb_build_object('enabled',state.enabled,'connected',state.phase='ready','last_seen_at',state.last_seen_at,'last_sync_at',state.last_sync_at,'last_post_at',state.last_post_at,'last_error_code',state.last_error_code,'timezone','America/New_York','feed_date',today,'scope',CASE WHEN is_admin THEN 'original' ELSE 'us_today' END),'posts',posts);
END $$;
-- Originals, including unfiltered images/PDFs, are available to administrators only.
DROP POLICY "Members read provider sports feed" ON public.telegram_sports_posts;
CREATE POLICY "Administrators read original sports posts" ON public.telegram_sports_posts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=(SELECT auth.uid()) AND role='admin'));
DROP POLICY "Members read sports attachments" ON storage.objects;
CREATE POLICY "Administrators read original sports attachments" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='sports-reader-media' AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=(SELECT auth.uid()) AND role='admin'));
COMMIT;
