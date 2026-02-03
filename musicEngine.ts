import * as Tone from 'tone';

// When files are in /public/samples/, the base URL is just /samples
const BASE = "/samples";

const VOICE_CONFIGS = {
  // Map the filename to the actual pitch of the recording so Tone.js can pitch-shift correctly
  bass: { note: 'A#1', url: `${BASE}/bass-electric-As1.mp3` }, 
  tenor: { note: 'A2', url: `${BASE}/cello-A2.mp3` },
  alto: { note: 'A3', url: `${BASE}/french-horn-A3.mp3` },
  soprano: { note: 'A4', url: `${BASE}/violin-A4.mp3` }
};

export type CompositionPhase = 'start' | 'traversal' | 'end' | 'idle';

class MusicEngine {
  private samplers: Map<string, Tone.Sampler> = new Map();
  private fallbacks: Map<string, Tone.PolySynth> = new Map();
  private loop: Tone.Loop | null = null;
  
  public loadedStates: Record<string, boolean> = { bass: false, tenor: false, alto: false, soprano: false };
  public isInitialized = false;
  
  private currentMelodies: any[] = [];
  public currentPhase: CompositionPhase = 'idle';
  private onPhaseChange?: (phase: CompositionPhase) => void;

  constructor() {
    this.initFallbacks();
  }

  private initFallbacks() {
    const synthConfig = {
      maxPolyphony: 4,
      volume: -14, // Keep fallbacks quiet
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.4, release: 0.6 }
    };
    
    this.fallbacks.set('bass', new Tone.PolySynth(Tone.FMSynth, synthConfig).toDestination());
    this.fallbacks.set('tenor', new Tone.PolySynth(Tone.Synth, synthConfig).toDestination());
    this.fallbacks.set('alto', new Tone.PolySynth(Tone.AMSynth, synthConfig).toDestination());
    this.fallbacks.set('soprano', new Tone.PolySynth(Tone.DuoSynth, synthConfig).toDestination());
  }

  async load() {
    if (Tone.context.state !== 'running') await Tone.start();
    this.isInitialized = true;

    const promises = Object.entries(VOICE_CONFIGS).map(([key, config]) => {
      return new Promise<void>((resolve) => {
        const sampler = new Tone.Sampler({
          urls: { [config.note]: config.url },
          onload: () => {
            console.log(`✅ Local sample loaded: ${key}`);
            this.loadedStates[key] = true;
            resolve();
          },
          onerror: () => {
            console.error(`❌ Local file missing: ${config.url}`);
            this.loadedStates[key] = false;
            resolve();
          }
        }).toDestination();
        
        sampler.volume.value = -4; 
        this.samplers.set(key, sampler);
      });
    });

    await Promise.all(promises);
  }

  private getVoiceMelody(vectorSlice: Float32Array, voiceIdx: number, stepCount: number = 16) {
    const melody = [];
    const scale = ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'];
    for (let i = 0; i < stepCount; i++) {
      const val = vectorSlice[i % vectorSlice.length];
      const amplified = Math.tanh(val * 15);
      melody.push({
        noteIndex: Math.abs(Math.floor(amplified * 14)) % scale.length,
        octaveShift: Math.floor(amplified * 2), 
        gate: Math.abs(val * 25) > 0.5 + (voiceIdx * 0.1),
        velocity: Math.min(1, Math.max(0.25, 0.5 + val * 5))
      });
    }
    return melody;
  }

  setPhaseCallback(cb: (phase: CompositionPhase) => void) {
    this.onPhaseChange = cb;
  }

  async play(vector: Float32Array, phase: CompositionPhase) {
    if (Tone.context.state !== 'running') await Tone.start();
    this.stop();

    this.currentPhase = phase;
    if (this.onPhaseChange) this.onPhaseChange(phase);

    this.currentMelodies = [
      this.getVoiceMelody(vector.slice(0, 96), 0),
      this.getVoiceMelody(vector.slice(96, 192), 1),
      this.getVoiceMelody(vector.slice(192, 288), 2),
      this.getVoiceMelody(vector.slice(288, 384), 3)
    ];

    let sumSqr = 0;
    for (const v of vector) sumSqr += v * v;
    Tone.Transport.bpm.value = Math.min(160, Math.max(50, 60 + (Math.sqrt(sumSqr) * 250)));

    let step = 0;
    this.loop = new Tone.Loop((time) => {
      const voices = ['bass', 'tenor', 'alto', 'soprano'];
      const baseOctaves = [1, 2, 3, 4];
      const durations: Tone.Unit.Time[] = ["4n", "4n", "8n", "16n"];
      const scale = ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'];

      voices.forEach((v, i) => {
        const melody = this.currentMelodies[i];
        const noteData = melody[step % melody.length];
        
        if (noteData.gate || step % 16 === 0) {
          const sampler = this.samplers.get(v);
          const synth = this.fallbacks.get(v);
          const finalNote = scale[noteData.noteIndex % scale.length] + (baseOctaves[i] + noteData.octaveShift);

          if (sampler && this.loadedStates[v]) {
            // FIX: Release previous notes to prevent "Max Polyphony" buildup
            sampler.releaseAll(time);
            sampler.triggerAttackRelease(finalNote, durations[i], time, noteData.velocity);
          } else if (synth) {
            synth.releaseAll(time);
            synth.triggerAttackRelease(finalNote, durations[i], time, noteData.velocity * 0.5);
          }
        }
      });
      step++;
    }, "16n").start(0);

    Tone.Transport.start();
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    this.samplers.forEach(s => s.releaseAll());
    this.fallbacks.forEach(f => f.releaseAll());
    
    if (this.loop) {
      this.loop.stop();
      this.loop.dispose();
      this.loop = null;
    }
    this.currentPhase = 'idle';
    if (this.onPhaseChange) this.onPhaseChange('idle');
  }

  async reset() {
    this.stop();
    this.samplers.forEach(s => s.dispose());
    this.samplers.clear();
    this.loadedStates = { bass: false, tenor: false, alto: false, soprano: false };
    await this.load();
  }
}

export const engine = new MusicEngine();