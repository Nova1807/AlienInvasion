type SpeechModule = {
  speak: (
    text: string,
    options?: {
      onDone?: () => void;
      onStopped?: () => void;
      rate?: number;
      pitch?: number;
    }
  ) => void;
  stop: () => void;
};

let speech: SpeechModule | null = null;

try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const module = require('expo-speech');
  if (module && typeof module === 'object') {
    // Expo modules may export either as named or default
    speech = (module.default as SpeechModule | undefined) ?? (module as SpeechModule);
  }
} catch (error) {
  speech = null;
}

type SequenceState = {
  queue: { text: string }[];
  onComplete?: () => void;
  version: number;
};

let activeSequence: SequenceState | null = null;
let sequenceVersion = 0;

function cancelSequence() {
  activeSequence = null;
  sequenceVersion += 1;
}

export function speak(text: string, options?: { rate?: number; pitch?: number }) {
  if (speech?.speak) {
    speech.speak(text, options);
  } else {
    console.log('[Speech]', text);
  }
}

function playNextInSequence(version: number): void {
  if (!activeSequence || activeSequence.version !== version) {
    return;
  }
  const item = activeSequence.queue.shift();
  if (!item) {
    const callback = activeSequence.onComplete;
    cancelSequence();
    if (callback) {
      callback();
    }
    return;
  }
  if (speech?.speak) {
    speech.speak(item.text, {
      onDone: () => {
        playNextInSequence(version);
      },
      onStopped: () => {
        playNextInSequence(version);
      },
    });
  } else {
    console.log('[Speech]', item.text);
    setTimeout(() => {
      playNextInSequence(version);
    }, 600);
  }
}

export function speakSequence(
  texts: string[],
  options?: {
    onComplete?: () => void;
  }
) {
  if (texts.length === 0) {
    options?.onComplete?.();
    return;
  }
  stop();
  const version = sequenceVersion + 1;
  activeSequence = {
    queue: texts.map((text) => ({ text })),
    onComplete: options?.onComplete,
    version,
  };
  sequenceVersion = version;
  playNextInSequence(version);
}

export function stop() {
  cancelSequence();
  if (speech?.stop) {
    speech.stop();
  }
}
