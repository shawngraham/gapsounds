
import * as Tone from 'tone';

const SAMPLE_BASE_URL = "https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples";

const VOICE_CONFIGS = {
  bass: { instrument: 'double-bass', note: 'A1', url: `${SAMPLE_BASE_URL}/double-bass/A1.mp3` },
  tenor: { instrument: 'cello', note: 'A2', url: `${SAMPLE_BASE_URL}/cello/A2.mp3` },
  alto: { instrument: 'viola', note: 'A3', url: `${SAMPLE_BASE_URL}/viola/A3.mp3` },
  soprano: { instrument: 'violin', note: 'A4', url: `${SAMPLE_BASE_URL}/violin/A4.mp3` }
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
    this.fallbacks.set('bass', new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3, modulationIndex: 10,
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 },
    }).toDestination());

    this.fallbacks.set('tenor', new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.2, decay: 0.1, sustain: 0.8, release: 1.5 }
    }).toDestination());

    this.fallbacks.set('alto', new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2,
      envelope: { attack: 0.3, decay: 0.1, sustain: 1, release: 2 }
    }).toDestination());

    this.fallbacks.set('soprano', new Tone.PolySynth(Tone.DuoSynth, {
      vibratoAmount: 0.5, vibratoRate: 5,
      voice0: { oscillator: { type: "sine" } },
      voice1: { oscillator: { type: "sine" } }
    }).toDestination());
  }

  async load() {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    
    this.isInitialized = true;
    console.log("MusicEngine: Loading orchestral buffers...");

    const promises = Object.entries(VOICE_CONFIGS).map(([key, config]) => {
      return new Promise<void>((resolve) => {
        const sampler = new Tone.Sampler({
          urls: { [config.note]: config.url },
          onload: () => {
            this.loadedStates[key] = true;
            resolve();
          },
          onerror: () => {
            this.loadedStates[key] = false;
            resolve();
          }
        }).toDestination();
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
      const amplified = Math.tanh(val * 15); // Non-linear mapping for character
      
      const pitchIndex = Math.abs(Math.floor(amplified * 14)) % scale.length;
      const octaveShift = Math.floor(amplified * 2); 

      melody.push({
        noteIndex: pitchIndex,
        octaveShift: octaveShift,
        gate: Math.abs(val * 25) > 0.4 + (voiceIdx * 0.1),
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

    // Split the 384-dimension vector into 4 quadrants
    this.currentMelodies = [
      this.getVoiceMelody(vector.slice(0, 96), 0),
      this.getVoiceMelody(vector.slice(96, 192), 1),
      this.getVoiceMelody(vector.slice(192, 288), 2),
      this.getVoiceMelody(vector.slice(288, 384), 3)
    ];

    // BPM tied to average energy of the vector
    let sumSqr = 0;
    for (const v of vector) sumSqr += v * v;
    const mag = Math.sqrt(sumSqr);
    const targetBpm = 60 + (mag * 250); 
    Tone.Transport.bpm.value = Math.min(160, Math.max(50, targetBpm));

    let step = 0;
    this.loop = new Tone.Loop((time) => {
      const voices = ['bass', 'tenor', 'alto', 'soprano'];
      const baseOctaves = [1, 2, 3, 4];
      const durations: Tone.Unit.Time[] = ["2n", "4n", "8n", "16n"];
      const scale = ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'];

      voices.forEach((v, i) => {
        const melody = this.currentMelodies[i];
        const noteData = melody[step % melody.length];
        
        if (noteData.gate || step % 4 === 0) {
          const sampler = this.samplers.get(v);
          const synth = this.fallbacks.get(v);
          
          const finalNote = scale[noteData.noteIndex % scale.length] + (baseOctaves[i] + noteData.octaveShift);

          if (sampler && sampler.loaded) {
            sampler.triggerAttackRelease(finalNote, durations[i], time, noteData.velocity);
          } else if (synth) {
            synth.triggerAttackRelease(finalNote, durations[i], time, noteData.velocity * 0.4);
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
    await Tone.start();
    this.samplers.forEach(s => s.dispose());
    this.samplers.clear();
    this.loadedStates = { bass: false, tenor: false, alto: false, soprano: false };
    await this.load();
  }
}

export const engine = new MusicEngine();
