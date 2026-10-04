"""Independent event schedule checks. Public schedule requests never include Telegram data."""
import asyncio
from datetime import date, datetime, timedelta, timezone
import json
import re
import unicodedata
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from reader import Backend

EASTERN = ZoneInfo('America/New_York')
LEAGUES = ('NHL', 'MLB', 'NBA', 'NFL')


def norm(text):
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()).split())


def aliases(*names):
    return sorted({norm(n) for n in names if n and len(norm(n)) >= 3})


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def event(league, key, start, teams, state, url, time_known=True):
    if not str(key).isdigit() or len(teams) != 2 or any(not t['aliases'] for t in teams):
        raise ValueError('invalid_schedule')
    when = instant(start)
    if when.tzinfo is None:
        raise ValueError('invalid_schedule_time')
    return {'league':league, 'id':str(key), 'start_at':when.isoformat(), 'day':when.astimezone(EASTERN).date().isoformat(), 'teams':teams, 'event_state':state, 'source_name':league if league in ('NHL','MLB') else 'ESPN', 'source_url':url, 'time_known':time_known}


def parse_nhl(data):
    output = []
    for day in data['gameWeek']:
        for g in day['games']:
            teams = []
            for key in ('awayTeam','homeTeam'):
                t = g[key]; common = t['commonName']['default']; place = t['placeName']['default']
                teams.append({'id':str(t['id']), 'aliases':aliases(common, place+' '+common, t['abbrev'])})
            code, schedule = g['gameState'], g.get('gameScheduleState')
            state = 'cancelled' if schedule == 'CNCL' else 'postponed' if schedule == 'PPD' else 'finished' if code in ('FINAL','OFF') else 'live' if code in ('LIVE','CRIT') else 'upcoming' if code in ('FUT','PRE') else 'unknown'
            link = g.get('gameCenterLink', '/gamecenter/'+str(g['id']))
            if not re.fullmatch(r'/gamecenter/[a-z0-9/-]+', link):
                raise ValueError('invalid_schedule_link')
            output.append(event('NHL',g['id'],g['startTimeUTC'],teams,state,'https://www.nhl.com'+link,schedule not in ('TBD',)))
    return output


def parse_mlb(data):
    output = []
    for day in data['dates']:
        for g in day['games']:
            teams = []
            for key in ('away','home'):
                t = g['teams'][key]['team']
                teams.append({'id':str(t['id']), 'aliases':aliases(t['name'], t.get('teamName'), t.get('clubName'), t.get('abbreviation'))})
            detail = g['status']['detailedState'].lower(); abstract = g['status']['abstractGameState'].lower()
            state = 'cancelled' if 'cancel' in detail else 'postponed' if 'postpon' in detail else 'delayed' if any(x in detail for x in ('delay','suspend')) else 'finished' if abstract == 'final' else 'live' if abstract == 'live' else 'upcoming' if abstract == 'preview' else 'unknown'
            output.append(event('MLB',g['gamePk'],g['gameDate'],teams,state,'https://www.mlb.com/gameday/'+str(g['gamePk']),not g['status'].get('startTimeTBD',False)))
    return output


def parse_espn(data, league):
    output = []
    for g in data['events']:
        competitions = g['competitions']
        if len(competitions) != 1:
            raise ValueError('invalid_schedule_competitions')
        c = competitions[0]
        teams = [{'id':str(x['team']['id']), 'aliases':aliases(x['team']['displayName'],x['team']['name'],x['team']['abbreviation'])} for x in c['competitors']]
        status = g.get('status',c.get('status',{}))['type']; code = status['name']
        state = 'cancelled' if code == 'STATUS_CANCELED' else 'postponed' if code == 'STATUS_POSTPONED' else 'delayed' if code in ('STATUS_DELAYED','STATUS_SUSPENDED') else 'finished' if status.get('completed') else 'live' if status.get('state')=='in' else 'upcoming' if status.get('state')=='pre' else 'unknown'
        output.append(event(league,g['id'],g['date'],teams,state,f'https://www.espn.com/{league.lower()}/game/_/gameId/{g["id"]}',c.get('timeValid',False) and code!='STATUS_TIME_TBD'))
    return output


def fetch_schedule(league, day):
    target=date.fromisoformat(day); first=target-timedelta(days=1); last=target+timedelta(days=1)
    def read(url):
        with urlopen(Request(url,headers={'User-Agent':'EZTV-Schedule-Verification/1.0','Accept':'application/json'}),timeout=25) as response:
            raw=response.read(6000001)
            if len(raw)>6000000: raise ValueError('schedule_too_large')
            return json.loads(raw)
    if league=='NHL':
        parsed=parse_nhl(read(f'https://api-web.nhle.com/v1/schedule/{first}'))
    elif league=='MLB':
        parsed=parse_mlb(read(f'https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate={first}&endDate={last}&hydrate=team'))
    else:
        sport='basketball' if league=='NBA' else 'football'
        parsed=[]
        for offset in (-1,0,1):
            requested=target+timedelta(days=offset)
            parsed.extend(parse_espn(read(f'https://site.api.espn.com/apis/site/v2/sports/{sport}/{league.lower()}/scoreboard?dates={requested:%Y%m%d}&limit=100'),league))
    return list({e['id']:e for e in parsed if str(first)<=e['day']<=str(last)}.values())


def explicit_eastern_minutes(line):
    # No timezone inference from a bare "7pm". Show date-only verification in that case.
    if not re.search(r'\b(?:ET|EST|EDT)\b',line,re.I): return None
    segment=re.split(r'//\s*ET\s+',line,flags=re.I)[-1]
    matches=list(re.finditer(r'\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b',segment,re.I))
    if len(matches)!=1: return None
    m=matches[0]; hour=int(m[1]); minute=int(m[2] or 0)
    if not 1<=hour<=12: return None
    return (hour%12+(12 if m[3].lower()=='pm' else 0))*60+minute


def verify_line(line, content, day, schedules, health):
    result={'text':line,'status':'unverified','reason':'unsupported'}
    hints=[league for league in LEAGUES if re.search(r'\b'+league+r'\b',line+'\n'+content.split('\n\n')[-1],re.I)]
    if len(hints)!=1: return result
    league=hints[0]
    if not health.get(league): return {**result,'reason':'source_unavailable'}
    normalized=' '+norm(line)+' '
    team_ids={t['id'] for e in schedules.get(league,[]) for t in e['teams'] if any(' '+a+' ' in normalized for a in t['aliases'])}
    if len(team_ids)>2: return {**result,'reason':'ambiguous'}
    matched=[]
    for e in schedules.get(league,[]):
        if all(any(' '+a+' ' in normalized for a in t['aliases']) for t in e['teams']): matched.append(e)
    # De-duplicate a repeated source entry; a real doubleheader remains ambiguous.
    matched=list({e['id']:e for e in matched}.values())
    today=[e for e in matched if e['day']==day]
    if len(today)>1: return {**result,'reason':'ambiguous'}
    if not today:
        if len(matched)!=1: return {**result,'reason':'ambiguous' if matched else 'not_found'}
        e=matched[0]; status,reason='review','different_date'
    else:
        e=today[0]; minutes=explicit_eastern_minutes(line)
        if e['event_state'] in ('cancelled','postponed','delayed'):
            status,reason='review',e['event_state']
        elif minutes is None or not e['time_known']:
            status,reason='date_verified','time_unknown'
        else:
            actual=instant(e['start_at']).astimezone(EASTERN); delta=abs(minutes-(actual.hour*60+actual.minute))
            status,reason=('verified','matched') if delta<=15 else ('review','time_mismatch')
    return {**result,'status':status,'reason':reason,'league':league,'event_id':e['id'],'event_state':e['event_state'],'source_name':e['source_name'],'source_url':e['source_url'],'start_at':e['start_at'] if e['time_known'] else None}


async def verify_once(backend, fetcher=fetch_schedule):
    work=await backend.call('verification_work')
    async def fetch(league):
        try: return league,await asyncio.to_thread(fetcher,league,work['date']),True
        except Exception: return league,[],False
    responses=await asyncio.gather(*(fetch(league) for league in LEAGUES))
    schedules={league:events for league,events,ok in responses}; health={league:ok for league,events,ok in responses}
    saved=0
    for post in work['posts']:
        items=[verify_line(line,post['content'],work['date'],schedules,health) for line in post['content'].split('\n\n')[0].splitlines()]
        await backend.call('verification_save',generation=work['generation'],date=work['date'],post_id=post['id'],content_hash=post['content_hash'],items=items)
        saved+=1
    await backend.call('verification_health',sources=[{'league':league,'ok':ok,'events':len(events)} for league,events,ok in responses])
    print(f'Sports verification complete: {saved} posts; {sum(health.values())}/4 schedule feeds available.',flush=True)


if __name__=='__main__':
    try: asyncio.run(verify_once(Backend()))
    except Exception:
        print('Sports verification did not complete; next scheduled run will retry.',flush=True)
        raise SystemExit(1)
