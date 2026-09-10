import unittest
import numpy as np
from streaming import StreamingWindow


class StreamingTests(unittest.TestCase):
    def test_preview_before_pause_and_revision_identity(self):
        window = StreamingWindow(100)
        window.append(np.ones(100, dtype=np.float32) * .1)
        first = window.snapshot()
        self.assertFalse(first[3])
        window.append(np.ones(100, dtype=np.float32) * .1)
        second = window.snapshot()
        self.assertEqual(first[0], second[0])
        self.assertEqual(len(second[1]), 200)
        window.append(np.zeros(60, dtype=np.float32))
        final = window.snapshot()
        self.assertTrue(final[3])
        self.assertEqual(first[0], final[0])

    def test_backlog_skips_previews_but_keeps_final_audio(self):
        window = StreamingWindow(100)
        window.append(np.ones(100, dtype=np.float32) * .1)
        self.assertIsNone(window.snapshot(caught_up=False))
        window.append(np.zeros(60, dtype=np.float32))
        self.assertTrue(window.snapshot(caught_up=False)[3])

    def test_window_limit_preserves_overlap(self):
        window = StreamingWindow(100)
        window.append(np.ones(800, dtype=np.float32) * .1)
        old = window.snapshot()
        self.assertTrue(old[3])
        window.append(np.ones(100, dtype=np.float32) * .1)
        new = window.snapshot()
        self.assertNotEqual(old[0], new[0])
        self.assertEqual(new[2], .8)
        self.assertEqual(len(new[1]), 180)

    def test_silence_does_not_trigger_decode(self):
        window = StreamingWindow(100)
        for _ in range(100):
            window.append(np.zeros(100, dtype=np.float32))
            self.assertIsNone(window.snapshot())


if __name__ == '__main__':
    unittest.main()
