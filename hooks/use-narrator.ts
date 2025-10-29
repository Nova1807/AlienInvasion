import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

import { TTS_CONFIG } from '@/constants/config';

export interface VoiceOption {
  identifier: string;
  name: string;
  language: string;
}

export interface NarratorControls {
  voices: VoiceOption[];
  selectedVoice?: string;
  setSelectedVoice(identifier?: string): void;
  speak(text: string, overrides?: { voiceId?: string; rate?: number; pitch?: number }): Promise<void>;
  stop(): Promise<void>;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
}

const toVoiceOption = (voice: Speech.Voice): VoiceOption => ({
  identifier: voice.identifier,
  name: voice.name,
  language: voice.language,
});

export function useNarrator(): NarratorControls {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | undefined>(TTS_CONFIG.nativeVoiceIdentifier);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (TTS_CONFIG.provider === 'native') {
      Speech.getAvailableVoicesAsync()
        .then((availableVoices) => {
          if (!isMounted) {
            return;
          }
          setVoices(availableVoices.map(toVoiceOption));
          if (!TTS_CONFIG.nativeVoiceIdentifier && availableVoices.length > 0) {
            setSelectedVoice(availableVoices[0].identifier);
          }
        })
        .catch((voiceError) => {
          console.warn('Konnte Stimmen nicht laden', voiceError);
        });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => undefined);
    };
  }, []);

  const stop = useCallback(async () => {
    setIsSpeaking(false);
    Speech.stop();
    if (soundRef.current) {
      const sound = soundRef.current;
      soundRef.current = null;
      await sound.stopAsync().catch(() => undefined);
      await sound.unloadAsync().catch(() => undefined);
    }
  }, []);

  const speak = useCallback<NarratorControls['speak']>(
    async (text, overrides) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      setError(null);

      if (TTS_CONFIG.provider !== 'remote' || !TTS_CONFIG.remote?.endpoint) {
        await stop();
        const voice = overrides?.voiceId ?? selectedVoice ?? TTS_CONFIG.nativeVoiceIdentifier;
        setIsSpeaking(true);
        Speech.speak(trimmed, {
          voice,
          rate: overrides?.rate ?? TTS_CONFIG.rate ?? 1,
          pitch: overrides?.pitch ?? TTS_CONFIG.pitch ?? 1,
          onDone: () => setIsSpeaking(false),
          onStopped: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
        return;
      }

      try {
        setIsLoading(true);
        await stop();
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

        const response = await fetch(TTS_CONFIG.remote.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(TTS_CONFIG.remote.apiKey
              ? { [TTS_CONFIG.remote.apiKeyHeader ?? 'Authorization']: TTS_CONFIG.remote.apiKey }
              : {}),
          },
          body: JSON.stringify({
            [TTS_CONFIG.remote.textParameter ?? 'text']: trimmed,
            [TTS_CONFIG.remote.voiceParameter ?? 'voice_id']:
              overrides?.voiceId ?? TTS_CONFIG.remote.voiceId,
          }),
        });

        if (!response.ok) {
          throw new Error(`TTS-Service antwortete mit Status ${response.status}`);
        }

        const result = await response.json();
        const audioBase64: string | undefined = result.audioBase64 ?? result.audio_base64;
        const audioUrl: string | undefined = result.audioUrl ?? result.audio_url ?? result.url;

        const source = audioBase64
          ? { uri: `data:audio/mp3;base64,${audioBase64}` }
          : audioUrl
            ? { uri: audioUrl }
            : null;

        if (!source) {
          throw new Error('Antwort enthielt keine Audiodaten.');
        }

        const { sound } = await Audio.Sound.createAsync(source);
        soundRef.current = sound;
        setIsSpeaking(true);
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) {
            return;
          }
          if (status.didJustFinish || !status.isPlaying) {
            setIsSpeaking(false);
          }
        });
        await sound.playAsync();
      } catch (ttsError) {
        console.error('Fehler bei der Sprachausgabe', ttsError);
        setError(ttsError instanceof Error ? ttsError.message : 'Unbekannter Fehler bei der Sprachausgabe.');
      } finally {
        setIsLoading(false);
      }
    },
    [selectedVoice, stop],
  );

  return {
    voices,
    selectedVoice,
    setSelectedVoice,
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
  };
}
