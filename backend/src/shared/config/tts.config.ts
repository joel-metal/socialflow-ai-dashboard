import { TTSVoice } from '../types/tts';

export const ttsConfig = {
  outputDir: 'uploads/tts',

  elevenlabs: {
    apiUrl: 'https://api.elevenlabs.io/v1',
    model: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
    defaultVoiceId: 'EXAVITQu4vr4xnSDxMaL', // "Sarah" — natural, multilingual
  },

  google: {
    apiUrl: 'https://texttospeech.googleapis.com/v1/text:synthesize',
    audioEncoding: 'MP3' as const,
    defaultLanguage: 'en-US',
  },

  defaults: {
    outputFormat: 'mp3' as const,
    speed: 1.0,
    stability: 0.5,
    similarityBoost: 0.75,
    maxSegmentLength: 5000, // chars — ElevenLabs limit per request
  },

  /** Built-in voice catalogue (subset). Extend as needed. */
  voices: [
    // ElevenLabs
    {
      id: 'EXAVITQu4vr4xnSDxMaL',
      name: 'Sarah',
      language: 'en',
      gender: 'female',
      provider: 'elevenlabs',
    },
    {
      id: 'TX3LPaxmHKxFdv7VOQHJ',
      name: 'Liam',
      language: 'en',
      gender: 'male',
      provider: 'elevenlabs',
    },
    {
      id: 'XB0fDUnXU5powFXDhCwa',
      name: 'Charlotte',
      language: 'en',
      gender: 'female',
      provider: 'elevenlabs',
    },
    {
      id: 'pFZP5JQG7iQjIQuC4Bku',
      name: 'Lily',
      language: 'en',
      gender: 'female',
      provider: 'elevenlabs',
    },
    {
      id: 'onwK4e9ZLuTAKqWW03F9',
      name: 'Daniel',
      language: 'en',
      gender: 'male',
      provider: 'elevenlabs',
    },
    // Google TTS (language codes as IDs)
    {
      id: 'en-US-Neural2-F',
      name: 'US English (F)',
      language: 'en-US',
      gender: 'female',
      provider: 'google',
    },
    {
      id: 'en-US-Neural2-D',
      name: 'US English (M)',
      language: 'en-US',
      gender: 'male',
      provider: 'google',
    },
    {
      id: 'es-ES-Neural2-A',
      name: 'Spanish (F)',
      language: 'es-ES',
      gender: 'female',
      provider: 'google',
    },
    {
      id: 'fr-FR-Neural2-A',
      name: 'French (F)',
      language: 'fr-FR',
      gender: 'female',
      provider: 'google',
    },
    {
      id: 'de-DE-Neural2-F',
      name: 'German (F)',
      language: 'de-DE',
      gender: 'female',
      provider: 'google',
    },
    {
      id: 'ja-JP-Neural2-B',
      name: 'Japanese (F)',
      language: 'ja-JP',
      gender: 'female',
      provider: 'google',
    },
    {
      id: 'pt-BR-Neural2-A',
      name: 'Portuguese (F)',
      language: 'pt-BR',
      gender: 'female',
      provider: 'google',
    },
  ] as TTSVoice[],
};
