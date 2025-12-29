type SpeechOptions = {
  onDone?: () => void;
  onStopped?: () => void;
  rate?: number;
  pitch?: number;
  language?: string;
  voice?: string;
};

type SpeechVoice = {
  identifier: string;
  language: string;
  name?: string;
  quality?: 'Enhanced' | 'Default';
};

type SpeechModule = {
  speak: (text: string, options?: SpeechOptions) => void;
  stop: () => void;
  getAvailableVoicesAsync?: () => Promise<SpeechVoice[]>;
};

const DEFAULT_LANGUAGE = 'de-DE';

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

let preferredVoice: string | null = null;
let voiceInitStarted = false;

async function initializePreferredVoice(): Promise<void> {
  if (!speech?.getAvailableVoicesAsync) {
    preferredVoice = null;
    return;
  }
  try {
    const voices = await speech.getAvailableVoicesAsync();
    if (!voices || voices.length === 0) {
      preferredVoice = null;
      return;
    }
    const germanVoices = voices.filter((voice) => voice.language?.toLowerCase().startsWith('de'));
    if (germanVoices.length === 0) {
      preferredVoice = null;
      return;
    }
    const enhanced = germanVoices.find((voice) => voice.quality === 'Enhanced');
    preferredVoice = (enhanced ?? germanVoices[0])?.identifier ?? null;
  } catch (error) {
    preferredVoice = null;
  }
}

function ensureVoiceInit() {
  if (voiceInitStarted || !speech) {
    return;
  }
  voiceInitStarted = true;
  initializePreferredVoice().catch(() => {
    // Ignore errors; we'll continue using the default language fallback.
  });
}

function applySpeechDefaults(options?: SpeechOptions): SpeechOptions {
  const merged: SpeechOptions = { ...options };
  if (!merged.language) {
    merged.language = DEFAULT_LANGUAGE;
  }
  if (!merged.voice && preferredVoice) {
    merged.voice = preferredVoice;
  }
  return merged;
}

type SequenceState = {
  queue: { text: string }[];
  onComplete?: () => void;
  version: number;
  speechOptions?: SpeechOptions;
};

let activeSequence: SequenceState | null = null;
let sequenceVersion = 0;

function cancelSequence() {
  activeSequence = null;
  sequenceVersion += 1;
}

export function speak(text: string, options?: SpeechOptions) {
  if (speech?.speak) {
    ensureVoiceInit();
    speech.speak(text, applySpeechDefaults(options));
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
    const baseOptions = applySpeechDefaults(activeSequence.speechOptions);
    const chainedOnDone = baseOptions.onDone;
    const chainedOnStopped = baseOptions.onStopped;
    speech.speak(item.text, {
      ...baseOptions,
      onDone: () => {
        if (chainedOnDone) {
          chainedOnDone();
        }
        playNextInSequence(version);
      },
      onStopped: () => {
        if (chainedOnStopped) {
          chainedOnStopped();
        }
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

export function speakSequence(texts: string[], options?: SpeechOptions & { onComplete?: () => void }) {
  if (texts.length === 0) {
    options?.onComplete?.();
    return;
  }
  stop();
  const version = sequenceVersion + 1;
  const { onComplete, ...speechOptions } = options ?? {};
  activeSequence = {
    queue: texts.map((text) => ({ text })),
    onComplete,
    version,
    speechOptions,
  };
  sequenceVersion = version;
  ensureVoiceInit();
  playNextInSequence(version);
}

export function stop() {
  cancelSequence();
  if (speech?.stop) {
    speech.stop();
  }
}
