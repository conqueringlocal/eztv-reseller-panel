BEGIN;
CREATE TABLE public.sports_reader_state (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 phase text NOT NULL DEFAULT 'waiting_config' CHECK(phase IN('waiting_config','waiting_code','waiting_password','ready','error')),
 source_id text, source_title text, source_timezone text NOT NULL DEFAULT 'UTC', generation integer NOT NULL DEFAULT 0,
 channels jsonb NOT NULL DEFAULT '[]', cursor_id bigint NOT NULL DEFAULT 0, bootstrap_at timestamptz,
 last_seen_at timestamptz, last_sync_at timestamptz, last_post_at timestamptz, last_error_code text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sports_reader_state(id) VALUES(true);
CREATE TABLE public.sports_reader_jobs (
 id uuid PRIMARY KEY, admin_id uuid NOT NULL REFERENCES public.profiles(id),
 kind text NOT NULL CHECK(kind IN('configure','code','password','channels','disconnect')),
 secret_name text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','working','done','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, finished_at timestamptz
);
CREATE INDEX sports_reader_jobs_actor ON public.sports_reader_jobs(admin_id,created_at DESC);
CREATE UNIQUE INDEX sports_reader_one_job ON public.sports_reader_jobs((true)) WHERE status IN('queued','working');
CREATE TABLE public.telegram_sports_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL, message_id bigint NOT NULL CHECK(message_id>0),
 content text NOT NULL CHECK(length(content)<=32000), posted_at timestamptz NOT NULL CHECK(isfinite(posted_at)),
 edited_at timestamptz CHECK(isfinite(edited_at)), media jsonb NOT NULL DEFAULT '[]', media_notice text NOT NULL DEFAULT '' CHECK(length(media_notice)<=200),
 album_id text, fingerprint text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,message_id)
);
CREATE INDEX telegram_sports_posts_recent ON public.telegram_sports_posts(posted_at DESC,id DESC);
ALTER TABLE public.sports_reader_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_reader_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_sports_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sports_reader_state,public.sports_reader_jobs,public.telegram_sports_posts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sports_reader_state,public.sports_reader_jobs,public.telegram_sports_posts TO service_role;
GRANT SELECT ON public.telegram_sports_posts TO authenticated;
CREATE POLICY "Members read provider sports feed" ON public.telegram_sports_posts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid())));

CREATE FUNCTION public.authorize_sports_reader(p_token text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT p_token IS NOT NULL AND length(p_token)=64 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='sports_reader_worker_token' AND decrypted_secret=p_token)
$$;
CREATE FUNCTION public.queue_sports_reader_job(p_admin uuid,p_id uuid,p_kind text,p_payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret_name text:='sports-reader-job-'||p_id::text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_admin AND role='admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
 PERFORM 1 FROM public.sports_reader_state WHERE id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.sports_reader_jobs WHERE id=p_id AND admin_id=p_admin AND kind=p_kind) THEN RETURN p_id; END IF;
 IF p_kind NOT IN('configure','code','password','channels','disconnect') OR p_payload IS NULL OR length(p_payload::text)>4000 THEN RAISE EXCEPTION 'Invalid request'; END IF;
 IF (SELECT count(*) FROM public.sports_reader_jobs WHERE admin_id=p_admin AND created_at>now()-interval '15 minutes')>=15 THEN RAISE EXCEPTION 'Too many connection attempts. Try later'; END IF;
 IF EXISTS(SELECT 1 FROM public.sports_reader_jobs WHERE status IN('queued','working')) THEN RAISE EXCEPTION 'A connection step is already running'; END IF;
 PERFORM vault.create_secret(p_payload::text,secret_name,'One-time Telegram setup input');
 INSERT INTO public.sports_reader_jobs(id,admin_id,kind,secret_name) VALUES(p_id,p_admin,p_kind,secret_name);
 IF p_kind IN('configure','disconnect') THEN UPDATE public.sports_reader_state SET enabled=false,source_id=NULL,source_title=NULL,channels='[]',cursor_id=0,generation=generation+1 WHERE id; END IF;
 RETURN p_id;
END $$;
CREATE FUNCTION public.poll_sports_reader() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.sports_reader_jobs; payload text; result jsonb;
BEGIN
 PERFORM 1 FROM public.sports_reader_state WHERE id FOR UPDATE;
 DELETE FROM vault.secrets WHERE name IN(SELECT secret_name FROM public.sports_reader_jobs WHERE status='queued' AND created_at<now()-interval '10 minutes');
 UPDATE public.sports_reader_jobs SET status='failed',finished_at=now() WHERE (status='queued' AND created_at<now()-interval '10 minutes') OR (status='working' AND claimed_at<now()-interval '3 minutes');
 IF FOUND THEN UPDATE public.sports_reader_state SET last_error_code='setup_expired' WHERE id; END IF;
 UPDATE public.sports_reader_state SET last_seen_at=now() WHERE id;
 SELECT * INTO job FROM public.sports_reader_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF job.id IS NOT NULL THEN
  SELECT decrypted_secret INTO payload FROM vault.decrypted_secrets WHERE name=job.secret_name;
  DELETE FROM vault.secrets WHERE name=job.secret_name;
  UPDATE public.sports_reader_jobs SET status='working',claimed_at=now() WHERE id=job.id;
  result:=jsonb_build_object('id',job.id,'kind',job.kind,'payload',payload::jsonb);
 END IF;
 RETURN jsonb_build_object('state',(SELECT to_jsonb(s)-'channels' FROM public.sports_reader_state s WHERE id),'job',result);
END $$;
CREATE FUNCTION public.finish_sports_reader_job(p_id uuid,p_phase text,p_channels jsonb,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.sports_reader_state WHERE id FOR UPDATE;
 UPDATE public.sports_reader_jobs SET status=CASE WHEN p_error IS NULL THEN 'done' ELSE 'failed' END,finished_at=now() WHERE id=p_id AND status='working';
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.sports_reader_state SET phase=p_phase,channels=coalesce(p_channels,channels),last_error_code=p_error,updated_at=now() WHERE id;
END $$;
CREATE FUNCTION public.configure_sports_source(p_admin uuid,p_source text,p_timezone text,p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sports_reader_state; title text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_admin AND role='admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
 SELECT * INTO s FROM public.sports_reader_state WHERE id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'Choose a valid timezone'; END IF;
 SELECT c->>'title' INTO title FROM jsonb_array_elements(s.channels)c WHERE c->>'id'=p_source;
 IF p_enabled AND (s.phase<>'ready' OR title IS NULL) THEN RAISE EXCEPTION 'Connect Telegram and choose a channel first'; END IF;
 IF p_enabled AND EXISTS(SELECT 1 FROM public.sports_reader_jobs WHERE status IN('queued','working')) THEN RAISE EXCEPTION 'Wait for the connection step to finish'; END IF;
 UPDATE public.sports_reader_state SET source_id=p_source,source_title=coalesce(title,s.source_title),source_timezone=p_timezone,enabled=p_enabled,generation=generation+1,
 cursor_id=CASE WHEN source_id IS DISTINCT FROM p_source THEN 0 ELSE cursor_id END,
 bootstrap_at=CASE WHEN source_id IS DISTINCT FROM p_source THEN now()-interval '48 hours' ELSE bootstrap_at END,
 last_sync_at=CASE WHEN source_id IS DISTINCT FROM p_source THEN NULL ELSE last_sync_at END,last_error_code=NULL,updated_at=now() WHERE id;
END $$;
CREATE FUNCTION public.ingest_telegram_sports_post(p_generation integer,p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sports_reader_state; old public.telegram_sports_posts;
BEGIN
 SELECT * INTO s FROM public.sports_reader_state WHERE id FOR UPDATE;
 IF NOT s.enabled OR s.source_id IS DISTINCT FROM p_data->>'source_id' OR s.generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'Source changed or paused'; END IF;
 SELECT * INTO old FROM public.telegram_sports_posts WHERE source_id=s.source_id AND message_id=(p_data->>'message_id')::bigint;
 IF old.id IS NOT NULL AND coalesce(old.edited_at,old.posted_at)>coalesce(nullif(p_data->>'edited_at','')::timestamptz,(p_data->>'posted_at')::timestamptz) THEN RETURN; END IF;
 INSERT INTO public.telegram_sports_posts(source_id,message_id,content,posted_at,edited_at,media,media_notice,album_id,fingerprint)
 VALUES(s.source_id,(p_data->>'message_id')::bigint,p_data->>'content',(p_data->>'posted_at')::timestamptz,nullif(p_data->>'edited_at','')::timestamptz,coalesce(p_data->'media','[]'),coalesce(p_data->>'media_notice',''),p_data->>'album_id',p_data->>'fingerprint')
 ON CONFLICT(source_id,message_id) DO UPDATE SET content=excluded.content,edited_at=excluded.edited_at,media=excluded.media,media_notice=excluded.media_notice,album_id=excluded.album_id,fingerprint=excluded.fingerprint,updated_at=now();
 UPDATE public.sports_reader_state SET last_post_at=greatest(last_post_at,(p_data->>'posted_at')::timestamptz) WHERE id;
END $$;
CREATE FUNCTION public.finish_sports_reader_sync(p_generation integer,p_cursor bigint,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.sports_reader_state SET cursor_id=greatest(cursor_id,p_cursor),last_seen_at=now(),last_sync_at=CASE WHEN p_error IS NULL THEN now() ELSE last_sync_at END,last_error_code=p_error WHERE id AND generation=p_generation AND enabled;
END $$;
CREATE FUNCTION public.get_sports_feed(p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 RETURN jsonb_build_object('status',(SELECT jsonb_build_object('enabled',enabled,'connected',phase='ready','last_seen_at',last_seen_at,'last_sync_at',last_sync_at,'last_post_at',last_post_at,'last_error_code',last_error_code,'timezone',source_timezone) FROM public.sports_reader_state WHERE id),
 'posts',coalesce((SELECT jsonb_agg(x ORDER BY posted_at DESC,id DESC) FROM(SELECT id,content,posted_at,edited_at,media,media_notice,album_id,updated_at,message_id FROM public.telegram_sports_posts WHERE p_before IS NULL OR (posted_at,id)<(p_before,p_before_id) ORDER BY posted_at DESC,id DESC LIMIT 100)x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.authorize_sports_reader(text),public.queue_sports_reader_job(uuid,uuid,text,jsonb),public.poll_sports_reader(),public.finish_sports_reader_job(uuid,text,jsonb,text),public.configure_sports_source(uuid,text,text,boolean),public.ingest_telegram_sports_post(integer,jsonb),public.finish_sports_reader_sync(integer,bigint,text),public.get_sports_feed(timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_sports_reader(text),public.queue_sports_reader_job(uuid,uuid,text,jsonb),public.poll_sports_reader(),public.finish_sports_reader_job(uuid,text,jsonb,text),public.configure_sports_source(uuid,text,text,boolean),public.ingest_telegram_sports_post(integer,jsonb),public.finish_sports_reader_sync(integer,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sports_feed(timestamptz,uuid) TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('sports-reader-media','sports-reader-media',false,8388608,ARRAY['image/jpeg','image/png','image/webp','application/pdf']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY "Members read sports attachments" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='sports-reader-media' AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid())));
COMMIT;
