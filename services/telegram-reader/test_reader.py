import unittest
import tempfile
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock
from reader import Reader, private_write, errors
from pathlib import Path


class Backend:
    def __init__(self, fail=None):
        self.calls = []
        self.fail = fail

    async def call(self, action, **data):
        self.calls.append((action, data))
        if self.fail and self.fail(action, data):
            raise RuntimeError('backend_unavailable')
        return {'path': '-100123/1/' + 'a'*64 + '.jpg', 'mime': 'image/jpeg'}


def message(n=1, text='Fixture schedule', file=None):
    return SimpleNamespace(id=n, message=text, edit_date=None, date=datetime.now(timezone.utc), photo=None, document=None, file=file, media=None, grouped_id=None, action=None, download_media=AsyncMock(return_value=b'fixture'))


class Tests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.backend = Backend()
        self.reader = Reader(self.directory.name, self.backend)
        self.state = {'source_id':'-100123','generation':1,'cursor_id':0,'bootstrap_at':(datetime.now(timezone.utc)-timedelta(hours=48)).isoformat(),'phase':'waiting_config'}

    async def test_duplicates_and_edits(self):
        msg = message()
        await self.reader.import_message(msg, self.state)
        await self.reader.import_message(msg, self.state)
        self.assertEqual(len(self.backend.calls), 1)
        msg.message = 'Corrected'; msg.edit_date = datetime.now(timezone.utc)
        await self.reader.import_message(msg, self.state)
        self.assertEqual(len(self.backend.calls), 2)
        self.assertEqual(self.backend.calls[-1][1]['post']['content'], 'Corrected')

    async def test_failed_post_retries_without_caching(self):
        self.backend.fail = lambda action, _: action == 'post'
        with self.assertRaises(RuntimeError): await self.reader.import_message(message(), self.state)
        self.assertEqual(self.reader.cache, {})
        self.backend.fail = None
        await self.reader.import_message(message(), self.state)
        self.assertEqual(len(self.reader.cache), 1)

    async def test_media_error_retains_text_and_retries(self):
        msg = message(file=SimpleNamespace(mime_type='image/jpeg', size=50))
        msg.download_media.side_effect = RuntimeError('PRIVATE-DETAIL')
        await self.reader.import_message(msg, self.state)
        post = self.backend.calls[-1][1]['post']
        self.assertEqual(post['content'], 'Fixture schedule'); self.assertIn('pending', post['media_notice']); self.assertEqual(self.reader.cache,{})
        msg.download_media.side_effect = None
        await self.reader.import_message(msg, self.state)
        self.assertEqual(self.backend.calls[-1][1]['post']['media'][0]['mime'],'image/jpeg')

    async def test_oversized_media_is_never_downloaded(self):
        msg = message(file=SimpleNamespace(mime_type='application/pdf',size=9000000))
        await self.reader.import_message(msg,self.state)
        msg.download_media.assert_not_called()
        self.assertIn('8 MB',self.backend.calls[-1][1]['post']['media_notice'])

    async def test_checkpoint_stops_before_failed_post_and_scans_only_selected_channel(self):
        client = SimpleNamespace(is_user_authorized=AsyncMock(return_value=True),get_entity=AsyncMock(return_value=SimpleNamespace(broadcast=True)))
        requests=[]
        async def iterator(entity, **options):
            requests.append(options)
            for n in [1,2,3]: yield message(n)
        client.iter_messages = iterator
        self.reader.connect = AsyncMock(return_value=client)
        self.backend.fail = lambda action, data: action == 'post' and data['post']['message_id']==2
        await self.reader.sync(self.state)
        self.assertEqual(self.backend.calls[-1],('sync_result',{'generation':1,'cursor':1,'error':'sync_failed'}))
        client.get_entity.assert_awaited_once_with(-100123)
        self.assertTrue(requests[0]['reverse']);self.assertEqual(requests[0]['limit'],100);self.assertIn('offset_date',requests[0])

    async def test_revoked_session_does_not_advance_cursor(self):
        self.reader.connect = AsyncMock(return_value=SimpleNamespace(is_user_authorized=AsyncMock(return_value=False)))
        await self.reader.sync(self.state)
        self.assertEqual(self.backend.calls[-1][1]['error'],'session_revoked')
        self.assertEqual(self.backend.calls[-1][1]['cursor'],0)

    async def test_two_factor_does_not_persist_login_code(self):
        self.reader.config={'phone':'+10000000000','api_id':123,'api_hash':'fixture'}
        self.reader.connect=AsyncMock(return_value=SimpleNamespace(sign_in=AsyncMock(side_effect=errors.SessionPasswordNeededError(None))))
        await self.reader.job({'id':'fixture','kind':'code','payload':{'code':'987654'}},self.state)
        self.assertEqual(self.backend.calls[-1][1]['phase'],'waiting_password')
        self.assertNotIn('987654',self.reader.path.read_text())
        self.assertEqual(self.reader.path.stat().st_mode & 0o777,0o600)

    async def test_flood_wait_is_saved_and_no_more_telegram_calls_are_made(self):
        self.reader.connect=AsyncMock(side_effect=errors.FloodWaitError(None,120))
        await self.reader.sync(self.state)
        self.assertEqual(self.backend.calls[-1][1]['error'],'flood_wait')
        self.assertIn('flood_until',self.reader.config)
        self.reader.connect.reset_mock()
        await self.reader.sync(self.state)
        self.reader.connect.assert_not_called()

    async def test_restart_resends_only_sanitized_job_result(self):
        self.reader.config={'pending_result':{'id':'fixture','phase':'ready','channels':[],'error':None}}
        self.reader.save()
        restarted=Reader(self.directory.name,self.backend)
        await restarted.flush_result()
        self.assertEqual(self.backend.calls[-1][0],'job_result')
        self.assertNotIn('pending_result',restarted.config)


if __name__ == '__main__': unittest.main()
