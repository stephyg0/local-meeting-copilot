import asyncio
import json
import unittest
from unittest.mock import patch
import server


class FakeSocket:
    def __init__(self, source):
        self.messages = iter([json.dumps({"type": "start", "audio_source": source})])
        self.sent = []

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.messages)
        except StopIteration:
            raise StopAsyncIteration

    async def send(self, message):
        self.sent.append(json.loads(message))


class Session:
    instances = []

    def __init__(self, ws, config, loop, model):
        self.config = config
        self.stopped = False
        self.instances.append(self)

    async def start(self):
        pass

    async def stop(self):
        self.stopped = True


class ServiceTests(unittest.TestCase):
    def test_disconnect_stops_capture_and_selects_source(self):
        config = server.TranscriptionConfig("base.en", "cpu", "int8", 3, None, "microphone")
        with patch.object(server, "MicrophoneWhisperSession", Session):
            asyncio.run(server.handle_client(FakeSocket("system"), config, None))
        self.assertTrue(Session.instances[-1].stopped)
        self.assertEqual(Session.instances[-1].config.audio_source, "system")
        self.assertEqual(config.audio_source, "microphone")

    def test_invalid_source_does_not_open_audio(self):
        config = server.TranscriptionConfig("base.en", "cpu", "int8", 3, None, "microphone")
        socket = FakeSocket("unknown")
        asyncio.run(server.handle_client(socket, config, None))
        self.assertEqual(socket.sent[0]["type"], "error")

    def test_decoder_loop_removed(self):
        self.assertEqual(server.clean_repeated_text("No. No. No."), "No.")


if __name__ == "__main__":
    unittest.main()
