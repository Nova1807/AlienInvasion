export const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:8080';

export type TTSProvider = 'native' | 'remote';

export interface RemoteTTSConfig {
  endpoint: string;
  apiKey?: string;
  apiKeyHeader?: string;
  voiceId?: string;
  voiceParameter?: string;
  textParameter?: string;
}

export interface TTSConfiguration {
  provider: TTSProvider;
  nativeVoiceIdentifier?: string;
  rate?: number;
  pitch?: number;
  remote?: RemoteTTSConfig;
}

export const TTS_CONFIG: TTSConfiguration = {
  provider: 'native',
  rate: 1,
  pitch: 1,
  nativeVoiceIdentifier: undefined,
  remote: {
    endpoint: '',
    apiKey: undefined,
    apiKeyHeader: 'Authorization',
    voiceId: undefined,
    voiceParameter: 'voice_id',
    textParameter: 'text',
  },
};
