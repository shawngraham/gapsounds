
export interface WikiArticle {
  pageid: number;
  title: string;
  dist: number;
  lat: number;
  lon: number;
  extract?: string;
}

export interface VoiceConfig {
  pitchRegister: number; // 0 to 1
  rhythmicDensity: number; // 0 to 1
  consonance: number; // 0 to 1
  instrument: 'double-bass' | 'cello' | 'viola' | 'violin';
}

export interface MusicDNA {
  bass: VoiceConfig;
  tenor: VoiceConfig;
  alto: VoiceConfig;
  soprano: VoiceConfig;
  tempo: number;
  scaleType: 'major' | 'minor' | 'chromatic';
}

export interface Location {
  latitude: number;
  longitude: number;
}
