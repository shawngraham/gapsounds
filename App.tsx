
import React, { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { WikiArticle, Location } from './types';
import { getNearbyLandmarks } from './services/wikipediaService';
import { initModel, getEmbedding, calculateDifference } from './services/embeddingService';
import { engine, CompositionPhase } from './services/musicEngine';

const App: React.FC = () => {
  const [autoLocation, setAutoLocation] = useState<Location | null>(null);
  const [manualLocation, setManualLocation] = useState<Location>({ latitude: 51.5074, longitude: -0.1278 }); // London default
  const [isManual, setIsManual] = useState(false);
  const [landmarks, setLandmarks] = useState<WikiArticle[]>([]);
  const [selection, setSelection] = useState<{ start: WikiArticle | null; end: WikiArticle | null }>({
    start: null,
    end: null,
  });
  
  const [modelStatus, setModelStatus] = useState<{ loading: boolean; progress: number }>({ loading: true, progress: 0 });
  const [engineInitialized, setEngineInitialized] = useState(false);
  const [sampleStatus, setSampleStatus] = useState(engine.loadedStates);
  const [isGenerating, setIsGenerating] = useState(false);
  const [playingPhase, setPlayingPhase] = useState<CompositionPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const [embeddings, setEmbeddings] = useState<{
    start: Float32Array | null;
    end: Float32Array | null;
    diff: Float32Array | null;
  }>({ start: null, end: null, diff: null });

  useEffect(() => {
    initModel((p) => setModelStatus({ loading: true, progress: Math.floor(p) }))
      .then(() => setModelStatus({ loading: false, progress: 100 }))
      .catch(() => setError("NLP Model failed to load."));
    
    engine.setPhaseCallback(setPlayingPhase);
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setAutoLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {
        setError("Location access denied. Switched to manual mode.");
        setIsManual(true);
      }
    );
  }, []);

  const activeLocation = isManual ? manualLocation : autoLocation;

  useEffect(() => {
    if (activeLocation) {
      getNearbyLandmarks(activeLocation).then(setLandmarks).catch(() => setError("Wikipedia is unreachable."));
    }
  }, [activeLocation]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSampleStatus({ ...engine.loadedStates });
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const handleInitAudio = async () => {
    try {
      await Tone.start();
      await engine.load();
      setEngineInitialized(true);
    } catch (err) {
      console.error("Audio error:", err);
      setEngineInitialized(true); 
    }
  };

  const handleCompose = async () => {
    if (!selection.start || !selection.end) return;
    
    await Tone.start();
    setIsGenerating(true);
    setError(null);
    
    try {
      if (!engineInitialized) await handleInitAudio();
      
      const textA = (selection.start.extract && selection.start.extract.length > 30) 
        ? selection.start.extract 
        : selection.start.title;
      const textB = (selection.end.extract && selection.end.extract.length > 30) 
        ? selection.end.extract 
        : selection.end.title;

      const [embA, embB] = await Promise.all([
        getEmbedding(textA),
        getEmbedding(textB)
      ]);

      const diff = calculateDifference(embA, embB);
      setEmbeddings({ start: embA, end: embB, diff: diff });
      
      if (playingPhase !== 'idle') engine.stop();
    } catch (err) {
      console.error("Composition error:", err);
      setError("Semantic analysis failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayback = async (phase: CompositionPhase) => {
    await Tone.start();
    
    if (playingPhase === phase) {
      engine.stop();
    } else {
      const vec = phase === 'start' ? embeddings.start : 
                  phase === 'end' ? embeddings.end : 
                  embeddings.diff;
      
      if (vec) {
        if (!engineInitialized) await handleInitAudio();
        engine.play(vec, phase);
      }
    }
  };

  const handleSelect = (l: WikiArticle) => {
    if (!selection.start) setSelection({ ...selection, start: l });
    else if (selection.start.pageid === l.pageid) setSelection({ ...selection, start: null });
    else if (!selection.end) setSelection({ ...selection, end: l });
    else if (selection.end.pageid === l.pageid) setSelection({ ...selection, end: null });
    else setSelection({ start: l, end: null });
    
    setEmbeddings({ start: null, end: null, diff: null });
    if (playingPhase !== 'idle') engine.stop();
  };

  const handleManualCoordUpdate = (field: 'latitude' | 'longitude', val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setManualLocation(prev => ({ ...prev, [field]: num }));
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-light tracking-tighter text-stone-200">
              GEOSPATIAL <span className="font-bold text-amber-500">SONIFIER</span>
            </h1>
            <p className="text-stone-400 max-w-xl text-sm mt-1 font-light">
              Listen to landmarks and the journey between them in the latent space.
            </p>
          </div>
          <div className="text-right flex flex-col gap-2 shrink-0">
            <div className={`text-[9px] mono p-2 rounded-lg border transition-colors ${modelStatus.loading ? 'border-amber-900/50 text-amber-600' : 'border-emerald-900/50 text-emerald-500'}`}>
              MODEL: {modelStatus.loading ? `LOAD ${modelStatus.progress}%` : 'READY'}
            </div>
            <div className={`text-[9px] mono p-2 rounded-lg border transition-colors ${!engineInitialized ? 'border-amber-900/50 text-amber-600' : 'border-emerald-900/50 text-emerald-500'}`}>
              AUDIO: {!engineInitialized ? 'WAITING' : 'READY'}
            </div>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">Local Landmarks</h2>
            <button 
              onClick={() => setIsManual(!isManual)}
              className={`text-[9px] mono px-2 py-1 rounded border transition-all ${isManual ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-stone-800 text-stone-500'}`}
            >
              {isManual ? 'MANUAL ON' : 'AUTO GPS'}
            </button>
          </div>

          {isManual && (
            <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] mono text-stone-500 uppercase">Latitude</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    className="bg-stone-950 border border-stone-800 rounded px-2 py-1 text-xs mono text-stone-200 focus:border-amber-500 outline-none"
                    value={manualLocation.latitude}
                    onChange={(e) => handleManualCoordUpdate('latitude', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] mono text-stone-500 uppercase">Longitude</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    className="bg-stone-950 border border-stone-800 rounded px-2 py-1 text-xs mono text-stone-200 focus:border-amber-500 outline-none"
                    value={manualLocation.longitude}
                    onChange={(e) => handleManualCoordUpdate('longitude', e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[9px] text-stone-600 italic">Enter coordinates to explore other regions.</p>
            </div>
          )}

          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {landmarks.map((l) => (
              <button key={l.pageid} onClick={() => handleSelect(l)} className={`text-left p-4 rounded-xl transition-all duration-300 border ${selection.start?.pageid === l.pageid ? 'bg-amber-500/10 border-amber-500 text-amber-500' : selection.end?.pageid === l.pageid ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-stone-900/50 border-stone-800 hover:border-stone-600 text-stone-300'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm line-clamp-1">{l.title}</span>
                  <span className="text-[10px] opacity-60 mono shrink-0 ml-2">{(l.dist / 1000).toFixed(2)}km</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-stone-900/40 border border-stone-800 rounded-3xl p-8 min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
            
            {!embeddings.diff && !isGenerating && (
              <div className="text-center z-10 px-4">
                <div className="flex gap-4 mb-8 justify-center">
                  <div className={`w-3 h-3 rounded-full transition-all duration-500 ${selection.start ? 'bg-amber-500 scale-125 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-stone-800'}`}></div>
                  <div className={`w-3 h-3 rounded-full transition-all duration-500 ${selection.end ? 'bg-emerald-500 scale-125 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-stone-800'}`}></div>
                </div>
                {selection.start && selection.end && (
                  <button onClick={handleCompose} className="px-12 py-5 bg-stone-100 text-stone-950 rounded-full font-bold hover:bg-amber-500 hover:text-white transition-all transform hover:scale-105 active:scale-95 shadow-2xl">
                    ANALYZE SEMANTICS
                  </button>
                )}
                <p className="text-stone-600 text-[11px] mt-6 italic">
                  {!selection.start ? "Select start landmark" : !selection.end ? "Select destination" : "Compare semantic profiles"}
                </p>
              </div>
            )}

            {isGenerating && (
              <div className="flex flex-col items-center gap-6 z-10">
                <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                <p className="text-amber-500 mono text-xs uppercase tracking-widest">Generating Latent Profiles...</p>
              </div>
            )}

            {embeddings.diff && (
              <div className="w-full flex flex-col items-center gap-10 z-10">
                
                <div className="grid grid-cols-3 gap-6 w-full max-w-2xl">
                   {/* Origin Card */}
                   <button 
                    onClick={() => togglePlayback('start')}
                    className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 group ${playingPhase === 'start' ? 'border-amber-500 bg-amber-500/10 scale-105 shadow-lg' : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'}`}
                   >
                      <span className="text-[10px] mono uppercase text-amber-500 mb-3 font-bold tracking-widest">Listen: Origin</span>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${playingPhase === 'start' ? 'bg-amber-500 text-white' : 'bg-stone-800 text-stone-400 group-hover:bg-stone-700'}`}>
                        {playingPhase === 'start' ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                      </div>
                      <span className="mt-4 text-[11px] text-stone-300 font-medium line-clamp-1">{selection.start?.title}</span>
                   </button>

                   {/* Journey Card */}
                   <button 
                    onClick={() => togglePlayback('traversal')}
                    className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 group ${playingPhase === 'traversal' ? 'border-white bg-white/10 scale-105 shadow-lg' : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'}`}
                   >
                      <span className="text-[10px] mono uppercase text-stone-100 mb-3 font-bold tracking-widest">Listen: Journey</span>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${playingPhase === 'traversal' ? 'bg-white text-stone-950' : 'bg-stone-800 text-stone-400 group-hover:bg-stone-700'}`}>
                        {playingPhase === 'traversal' ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                      </div>
                      <span className="mt-4 text-[11px] text-stone-300 font-medium italic">Difference Vector</span>
                   </button>

                   {/* Target Card */}
                   <button 
                    onClick={() => togglePlayback('end')}
                    className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 group ${playingPhase === 'end' ? 'border-emerald-500 bg-emerald-500/10 scale-105 shadow-lg' : 'border-stone-800 bg-stone-900/50 hover:border-stone-700'}`}
                   >
                      <span className="text-[10px] mono uppercase text-emerald-500 mb-3 font-bold tracking-widest">Listen: Target</span>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${playingPhase === 'end' ? 'bg-emerald-500 text-white' : 'bg-stone-800 text-stone-400 group-hover:bg-stone-700'}`}>
                        {playingPhase === 'end' ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                      </div>
                      <span className="mt-4 text-[11px] text-stone-300 font-medium line-clamp-1">{selection.end?.title}</span>
                   </button>
                </div>

                <div className="flex gap-3">
                  {playingPhase !== 'idle' && (
                    <button onClick={() => engine.stop()} className="px-8 py-3 bg-red-600/20 text-red-500 border border-red-900/50 rounded-full text-xs font-bold hover:bg-red-600 hover:text-white transition-all">
                      STOP ENGINE
                    </button>
                  )}
                  <button onClick={() => setEmbeddings({ start: null, end: null, diff: null })} className="px-8 py-3 bg-stone-800 text-stone-400 rounded-full text-xs font-bold hover:bg-stone-700 transition-all">
                    NEW ANALYSIS
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-stone-900/30 border border-stone-800/50 p-6 rounded-3xl flex flex-col gap-4">
              <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider">Engine Nodes</span>
              <div className="flex justify-between items-center px-2">
                {Object.entries(sampleStatus).map(([key, ok]) => (
                  <div key={key} className="flex flex-col items-center gap-2">
                    <div className={`w-3 h-3 rounded-full transition-all duration-1000 ${ok ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-stone-800'}`}></div>
                    <span className="text-[9px] mono text-stone-500 uppercase">{key}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-stone-900/30 border border-stone-800/50 p-6 rounded-3xl flex flex-col justify-between gap-4">
              <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider">Status Dashboard</span>
              <div className="flex justify-between items-center">
                <span className="text-[10px] mono text-stone-500 uppercase">Phase: {playingPhase.toUpperCase()}</span>
                <button onClick={() => engine.reset()} className="text-[9px] mono bg-stone-800 hover:bg-stone-700 px-3 py-1 rounded transition-colors uppercase">Re-Sync Audio</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {error && (
        <div className="fixed bottom-8 right-8 p-4 bg-red-600 text-white rounded-2xl shadow-2xl text-xs mono flex items-center gap-4 animate-in fade-in slide-in-from-right-4 z-50">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold border border-white/40 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
