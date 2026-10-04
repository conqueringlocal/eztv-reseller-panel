import unittest
from unittest.mock import AsyncMock
from verifier import verify_line, explicit_eastern_minutes, verify_once, parse_nhl, parse_mlb, parse_espn


def game(key='1', day='2026-10-03', state='upcoming', known=True):
    return {'league':'NHL','id':key,'day':day,'start_at':day+'T23:00:00+00:00','teams':[{'id':'16','aliases':['chicago blackhawks','blackhawks','chi']},{'id':'7','aliases':['buffalo sabres','sabres','buf']}],'event_state':state,'source_name':'NHL','source_url':'https://www.nhl.com/gamecenter/'+key,'time_known':known}


def check(line='NHL 01 - Blackhawks at Sabres 7pm ET', events=None, health=True):
    return verify_line(line, line+'\n\nUS| NHL PPV','2026-10-03',{'NHL':events if events is not None else [game()]},{'NHL':health})


class Tests(unittest.TestCase):
    def test_exact_pair_date_time_and_link(self):
        r=check();self.assertEqual(r['status'],'verified');self.assertEqual(r['source_url'],'https://www.nhl.com/gamecenter/1')
    def test_bare_time_never_claims_time_verification(self):
        self.assertEqual(check('NHL 01 - 7pm Blackhawks at Sabres')['status'],'date_verified')
        self.assertEqual(check(events=[game(known=False)])['status'],'date_verified')
    def test_conflicting_time_and_adjacent_date_need_review(self):
        self.assertEqual(check('NHL Blackhawks at Sabres 8pm ET')['reason'],'time_mismatch')
        self.assertEqual(check(events=[game(day='2026-10-04')])['reason'],'different_date')
    def test_similar_names_and_partial_pair_are_not_verified(self):
        self.assertEqual(check('NHL Blackhawks vs Sabresville 7pm ET')['status'],'unverified')
        self.assertEqual(check('NHL Blackhawks game 7pm ET')['status'],'unverified')
    def test_doubleheader_is_ambiguous_and_same_day_beats_adjacent_day(self):
        self.assertEqual(check(events=[game('1'),game('2')])['reason'],'ambiguous')
        self.assertEqual(check(events=[game('1'),game('2','2026-10-04')])['status'],'verified')
    def test_three_teams_in_one_line_is_not_a_unique_event(self):
        other=game('2');other['teams']=[{'id':'3','aliases':['bruins']},other['teams'][1]]
        self.assertEqual(check('NHL Blackhawks at Sabres or Bruins 7pm ET',[game(),other])['reason'],'ambiguous')
    def test_missing_source_and_unsupported_sports_do_not_become_wrong_events(self):
        self.assertEqual(check(health=False)['reason'],'source_unavailable')
        r=verify_line('UFC 332 Silva vs Wang','UFC 332\n\nUS| PPV','2026-10-03',{},{});self.assertEqual(r['reason'],'unsupported')
    def test_cancellations_postponements_delays_are_reviewed(self):
        for state in ('cancelled','postponed','delayed'):
            r=check(events=[game(state=state)]);self.assertEqual(r['status'],'review');self.assertEqual(r['reason'],state)
    def test_eastern_time_parser_respects_dual_timezone_and_invalid_times(self):
        self.assertEqual(explicit_eastern_minutes('Game // UK 4 Oct 1am // ET 3 Oct 8pm'),1200)
        self.assertIsNone(explicit_eastern_minutes('Game 20pm ET'))
        self.assertIsNone(explicit_eastern_minutes('Game 7pm'))
        self.assertIsNone(explicit_eastern_minutes('Game 7pm ET and 8pm ET'))
    def test_nhl_schema_changes_fail_closed(self):
        with self.assertRaises(KeyError): parse_nhl({'newFormat':[]})
        self.assertEqual(parse_nhl({'gameWeek':[]}),[])
    def test_other_source_schema_changes_fail_closed(self):
        with self.assertRaises(KeyError): parse_mlb({})
        with self.assertRaises(KeyError): parse_espn({},'NBA')
        self.assertEqual(parse_mlb({'dates':[]}),[])
        self.assertEqual(parse_espn({'events':[]},'NFL'),[])

    def test_nhl_source_status_and_eastern_date(self):
        g={'id':1,'startTimeUTC':'2026-10-04T01:00:00Z','gameState':'OFF','gameScheduleState':'OK','awayTeam':{'id':1,'commonName':{'default':'Blackhawks'},'placeName':{'default':'Chicago'},'abbrev':'CHI'},'homeTeam':{'id':2,'commonName':{'default':'Sabres'},'placeName':{'default':'Buffalo'},'abbrev':'BUF'}}
        r=parse_nhl({'gameWeek':[{'games':[g]}]})[0];self.assertEqual(r['day'],'2026-10-03');self.assertEqual(r['event_state'],'finished');self.assertNotIn('chicago',r['teams'][0]['aliases'])
    def test_mlb_postponement_and_tbd_time(self):
        g={'gamePk':1,'gameDate':'2026-10-03T23:00:00Z','status':{'detailedState':'Postponed','abstractGameState':'Preview','startTimeTBD':True},'teams':{'away':{'team':{'id':1,'name':'New York Yankees','teamName':'Yankees'}},'home':{'team':{'id':2,'name':'Tampa Bay Rays','teamName':'Rays'}}}}
        r=parse_mlb({'dates':[{'games':[g]}]})[0];self.assertEqual(r['event_state'],'postponed');self.assertFalse(r['time_known'])
    def test_espn_source_status_and_safe_link(self):
        g={'id':'123','date':'2026-10-03T23:00:00Z','status':{'type':{'name':'STATUS_IN_PROGRESS','state':'in','completed':False}},'competitions':[{'timeValid':True,'competitors':[{'team':{'id':1,'displayName':'Miami Heat','name':'Heat','abbreviation':'MIA'}},{'team':{'id':2,'displayName':'Toronto Raptors','name':'Raptors','abbreviation':'TOR'}}]}]}
        r=parse_espn({'events':[g]},'NBA')[0];self.assertEqual(r['event_state'],'live');self.assertEqual(r['source_name'],'ESPN');self.assertEqual(r['source_url'],'https://www.espn.com/nba/game/_/gameId/123')


class CycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_partial_source_outage_still_saves_explicit_statuses_and_health(self):
        backend=type('Backend',(),{})()
        backend.call=AsyncMock(side_effect=[{'date':'2026-10-03','generation':1,'posts':[{'id':'post','content_hash':'hash','content':'NHL Blackhawks at Sabres 7pm ET\n\nUS| NHL PPV'}]}, {}, {}])
        def fetcher(league,day):
            if league=='NBA': raise RuntimeError('outage')
            return [game()] if league=='NHL' else []
        await verify_once(backend,fetcher)
        saved=backend.call.call_args_list[1];self.assertEqual(saved.kwargs['items'][0]['status'],'verified')
        sources=backend.call.call_args_list[2].kwargs['sources'];self.assertFalse(next(s for s in sources if s['league']=='NBA')['ok'])


if __name__=='__main__': unittest.main()
