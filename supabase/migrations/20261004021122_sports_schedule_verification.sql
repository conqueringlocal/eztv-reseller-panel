BEGIN;
CREATE TABLE public.sports_event_checks (
 post_id uuid NOT NULL REFERENCES public.telegram_sports_posts(id) ON DELETE CASCADE,
 feed_date date NOT NULL, content_hash text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items)<=1000),
 PRIMARY KEY(post_id,feed_date)
);
ALTER TABLE public.sports_event_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sports_event_checks FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sports_event_checks TO service_role;
CREATE TABLE public.sports_verification_state (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), last_run_at timestamptz, sources jsonb NOT NULL DEFAULT '[]'
);
INSERT INTO public.sports_verification_state(id) VALUES(true);
ALTER TABLE public.sports_verification_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sports_verification_state FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sports_verification_state TO service_role;

CREATE FUNCTION public.sports_verification_work() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE today date:=(now() AT TIME ZONE 'America/New_York')::date; s public.sports_reader_state;
BEGIN
 SELECT * INTO s FROM public.sports_reader_state WHERE id;
 RETURN jsonb_build_object('date',today,'generation',s.generation,'posts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'content',content,'content_hash',md5(content))) FROM
 (SELECT id,public.sports_us_today_content(content,posted_at,today) AS content FROM public.telegram_sports_posts WHERE source_id=s.source_id AND posted_at>=((today-7)::timestamp AT TIME ZONE 'America/New_York') AND posted_at<=now() AND public.sports_us_today_content(content,posted_at,today) IS NOT NULL ORDER BY posted_at DESC,id DESC LIMIT 200)x),'[]'::jsonb));
END $$;
CREATE FUNCTION public.save_sports_verification(p_generation integer,p_day date,p_post uuid,p_hash text,p_items jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE content text; expected text[]; supplied text[];
BEGIN
 PERFORM 1 FROM public.sports_reader_state WHERE id AND generation=p_generation FOR SHARE;
 IF NOT FOUND OR p_day<>(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Source or date changed'; END IF;
 SELECT public.sports_us_today_content(p.content,p.posted_at,p_day) INTO content FROM public.telegram_sports_posts p WHERE p.id=p_post AND p.source_id=(SELECT source_id FROM public.sports_reader_state WHERE id);
 IF content IS NULL OR md5(content) IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Post changed'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>1000 THEN RAISE EXCEPTION 'Invalid results'; END IF;
 expected:=string_to_array(split_part(content,E'\n\n',1),E'\n');
 SELECT array_agg(x->>'text' ORDER BY n) INTO supplied FROM jsonb_array_elements(p_items) WITH ORDINALITY a(x,n);
 IF supplied IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Results must match the current listing lines'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE
  coalesce(x->>'status','') NOT IN('verified','date_verified','review','unverified') OR
  coalesce(x->>'reason','') NOT IN('matched','time_unknown','time_mismatch','different_date','cancelled','postponed','delayed','not_found','ambiguous','unsupported','source_unavailable') OR
  (x->>'source_url' IS NOT NULL AND x->>'source_url' !~ '^https://www\.(nhl\.com/gamecenter/[a-z0-9/-]+|mlb\.com/gameday/[0-9]+|espn\.com/(nba|nfl)/game/_/gameId/[0-9]+)$') OR
  (x->>'status' IN('verified','date_verified','review') AND (x->>'source_url' IS NULL OR coalesce(x->>'source_name','') NOT IN('NHL','MLB','ESPN'))) OR
  (x->>'event_state' IS NOT NULL AND x->>'event_state' NOT IN('upcoming','live','finished','postponed','cancelled','delayed','unknown'))
 ) THEN RAISE EXCEPTION 'Invalid verification evidence'; END IF;
 INSERT INTO public.sports_event_checks(post_id,feed_date,content_hash,items) VALUES(p_post,p_day,p_hash,p_items)
 ON CONFLICT(post_id,feed_date) DO UPDATE SET content_hash=excluded.content_hash,items=excluded.items,checked_at=now();
END $$;
CREATE FUNCTION public.sports_verification_health(p_sources jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources)<>4 THEN RAISE EXCEPTION 'Invalid sources'; END IF;
 UPDATE public.sports_verification_state SET last_run_at=now(),sources=p_sources WHERE id;
 DELETE FROM public.sports_event_checks WHERE feed_date<(now() AT TIME ZONE 'America/New_York')::date-7;
END $$;
REVOKE ALL ON FUNCTION public.sports_verification_work(),public.save_sports_verification(integer,date,uuid,text,jsonb),public.sports_verification_health(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sports_verification_work(),public.save_sports_verification(integer,date,uuid,text,jsonb),public.sports_verification_health(jsonb) TO service_role;

ALTER FUNCTION public.get_sports_feed(timestamptz,uuid) RENAME TO get_sports_feed_base;
REVOKE ALL ON FUNCTION public.get_sports_feed_base(timestamptz,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_sports_feed(p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; post jsonb; output jsonb:='[]'; items jsonb; visible jsonb; item jsonb; checkrow public.sports_event_checks; original boolean;
 projected text; body text; today date:=(now() AT TIME ZONE 'America/New_York')::date; hidden integer:=0; fresh boolean; next_cursor jsonb;
BEGIN
 result:=public.get_sports_feed_base(p_before,p_before_id); -- includes authoritative member/role checks
 original:=result->'status'->>'scope'='original';
 IF jsonb_array_length(result->'posts')=100 THEN
  post:=(result->'posts')->99; next_cursor:=jsonb_build_object('date',post->>'posted_at','id',post->>'id');
 END IF;
 FOR post IN SELECT value FROM jsonb_array_elements(result->'posts') LOOP
  projected:=CASE WHEN original THEN public.sports_us_today_content(post->>'content',(post->>'posted_at')::timestamptz,today) ELSE post->>'content' END;
  IF projected IS NULL THEN output:=output||jsonb_build_array(post); CONTINUE; END IF;
  SELECT * INTO checkrow FROM public.sports_event_checks WHERE post_id=(post->>'id')::uuid AND feed_date=today AND content_hash=md5(projected);
  fresh:=checkrow.post_id IS NOT NULL AND checkrow.checked_at>now()-interval '30 minutes';
  IF fresh THEN items:=checkrow.items;
  ELSE SELECT jsonb_agg(jsonb_build_object('text',line,'status','unverified','reason',CASE WHEN checkrow.post_id IS NULL THEN 'pending' ELSE 'stale' END) ORDER BY n) INTO items FROM unnest(string_to_array(split_part(projected,E'\n\n',1),E'\n')) WITH ORDINALITY a(line,n); END IF;
  visible:='[]';
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   IF NOT original AND fresh AND item->>'status'='review' AND item->>'reason' IN('cancelled','postponed') THEN hidden:=hidden+1;
   ELSE visible:=visible||jsonb_build_array(item); END IF;
  END LOOP;
  IF NOT original AND jsonb_array_length(visible)=0 THEN CONTINUE; END IF;
  IF NOT original THEN
   SELECT string_agg(x->>'text',E'\n' ORDER BY n) INTO body FROM jsonb_array_elements(visible) WITH ORDINALITY a(x,n);
   post:=jsonb_set(post,'{content}',to_jsonb(body||E'\n\n'||split_part(projected,E'\n\n',2)));
  END IF;
  output:=output||jsonb_build_array(post||jsonb_build_object('verification',jsonb_build_object('items',visible,'checked_at',checkrow.checked_at,'fresh',fresh)));
 END LOOP;
 RETURN result||jsonb_build_object('posts',output,'next_cursor',next_cursor,'verification',jsonb_build_object('last_run_at',(SELECT last_run_at FROM public.sports_verification_state WHERE id),'sources',(SELECT sources FROM public.sports_verification_state WHERE id),'withheld',hidden));
END $$;
REVOKE ALL ON FUNCTION public.get_sports_feed(timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_sports_feed(timestamptz,uuid) TO authenticated;
COMMIT;
