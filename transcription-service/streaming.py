import uuid
import numpy as np


class StreamingWindow:
    """Growing, overlapping windows; pending audio supersedes stale previews."""
    def __init__(self, rate=16000):
        self.rate = rate
        self.audio = np.empty(0, dtype=np.float32)
        self.speech = 0
        self.silence = 0
        self.last_preview = 0
        self.context = 0
        self.id = str(uuid.uuid4())

    def append(self, data):
        voiced = float(np.sqrt(np.mean(data * data))) >= 0.012
        if voiced:
            self.speech += len(data)
            self.silence = 0
        elif self.speech:
            self.silence += len(data)
        if self.speech:
            self.audio = np.concatenate((self.audio, data))

    def snapshot(self, caught_up=True):
        final = self.silence >= self.rate * .55 or len(self.audio) >= self.rate * 8
        if self.speech < self.rate * .3:
            if final:
                self.__init__(self.rate)
            return None
        if not final and (not caught_up or len(self.audio) - self.last_preview < self.rate):
            return None
        result = (self.id, self.audio.copy(), self.context / self.rate, final)
        self.last_preview = len(self.audio)
        if final:
            overlap = self.audio[-int(self.rate * .8):].copy() if self.silence < self.rate * .55 else np.empty(0, dtype=np.float32)
            self.__init__(self.rate)
            self.audio = overlap
            self.context = len(overlap)
        return result
