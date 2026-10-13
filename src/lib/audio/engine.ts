/**
 * Web Audio playback for the adaptive soundtrack.
 *
 * The engine never switches songs. It starts all eight stems of a set at one
 * `start(when)` with `loopStart`/`loopEnd` taken from the pack metadata, and
 * from then on only moves gains — so the stems stay sample-locked to each
 * other for as long as the run lasts. A BPM tier change crossfades a second
 * set in over one bar at a loop boundary and releases the first.
 *
 * Nothing here runs during server rendering: the AudioContext is created
 * inside `unlock()`, which a user gesture must call.
 */

import {
  MIX_MATRIX,
  STEM_NAMES,
  audibleInCalm,
  type AudioState,
  type StemName,
} from './stateMachine';

// --- the shape of public/music/<pack>/meta.json ----------------------------

export interface PackFormat {
  id: string;
  ext: string;
  mime: string;
  codec: string;
  bitrate_kbps?: number;
  /** Samples of codec priming a decoder prepends; added to the loop points. */
  decode_offset_samples?: number;
  decoded_length_samples?: Record<string, number>;
}

export interface PackLoop {
  bpm: number;
  bar_seconds: number;
  loop_seconds: number;
  loop_samples: number;
  url_dir: string;
}

export interface PackStem {
  id: string;
  name: StemName;
  index: number;
  role: string;
  always_active: boolean;
  audible_in_calm?: boolean;
  url_template: string;
  scales?: string[];
  follows_harmony?: boolean;
}

export interface PackMeta {
  schema_version: number;
  pack: string;
  display_name: string;
  codename?: string;
  key: string;
  bpm_tiers: number[];
  bars_per_loop: number;
  time_signature: [number, number] | number[];
  sample_rate: number;
  harmony?: string[];
  loops: Record<string, PackLoop>;
  formats: PackFormat[];
  stems: PackStem[];
  states: string[];
  mix_matrix: Record<string, Record<string, number>>;
}

export interface ShootrisAudioEngineOptions {
  /** Headroom for eight stems summing at once. */
  masterVolume?: number;
  /** Master gain while the game is paused. */
  pauseDuckGain?: number;
  /** How long the pause duck takes. */
  pauseRampSeconds?: number;
  /** Bars a mix change or a tier crossfade is spread over. */
  crossfadeBars?: number;
  /** Scheduling lead, so every `start(when)` is comfortably in the future. */
  startLeadSeconds?: number;
  onError?: (error: unknown, context: string) => void;
}

const DEFAULTS = {
  masterVolume: 0.55,
  pauseDuckGain: 0.3,
  pauseRampSeconds: 0.5,
  crossfadeBars: 1,
  startLeadSeconds: 0.15,
};

export const PACK_META_URL = (pack: string) => `/music/${pack}/meta.json`;

/** Fetch a pack's metadata. Safe to call before any user gesture. */
export async function loadPackMeta(pack: string, signal?: AbortSignal): Promise<PackMeta> {
  const response = await fetch(PACK_META_URL(pack), { signal, cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`${PACK_META_URL(pack)} responded ${response.status}`);
  }
  return (await response.json()) as PackMeta;
}

function stemUrl(stem: PackStem, bpm: number, ext: string): string {
  return stem.url_template.replace('{bpm}', String(bpm)).replace('{ext}', ext);
}

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** True where the browser can play adaptive audio at all. */
export function isAudioSupported(): boolean {
  return audioContextConstructor() !== null;
}

interface StemNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** The value the gain holds once its last scheduled ramp has finished. */
  scheduledValue: number;
  /** Context time that ramp ends. */
  scheduledUntil: number;
}

interface StemSet {
  key: string;
  pack: string;
  bpm: number;
  meta: PackMeta;
  format: PackFormat;
  loopStart: number;
  loopEnd: number;
  loopDuration: number;
  barDuration: number;
  /** Context time at which this set's loopStart is heard — its phase origin. */
  phaseOrigin: number;
  setGain: GainNode;
  stems: Map<StemName, StemNodes>;
  state: AudioState;
  releasing: boolean;
}

export class ShootrisAudioEngine {
  private readonly options: Required<Omit<ShootrisAudioEngineOptions, 'onError'>> &
    Pick<ShootrisAudioEngineOptions, 'onError'>;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: StemSet | null = null;
  private incoming: StemSet | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly inflight = new Map<string, Promise<AudioBuffer>>();
  private desiredState: AudioState = 'calm';
  private paused = false;
  private volume: number;
  private disposed = false;
  /**
   * Switches run one at a time. A stage change and the state tick can both ask
   * for a new tier in the same frame; without a queue both would build a set,
   * crossfade from the same predecessor, and leave one of them playing for the
   * rest of the run.
   */
  private queue: Promise<void> = Promise.resolve();
  /** The pack and tier most recently asked for, so repeat requests are free. */
  private requestedKey: string | null = null;

  constructor(options: ShootrisAudioEngineOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.volume = this.options.masterVolume;
  }

  get isUnlocked(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  get isPlaying(): boolean {
    return this.active !== null;
  }

  get currentPack(): string | null {
    return this.active?.pack ?? null;
  }

  get currentTier(): number | null {
    return this.active?.bpm ?? null;
  }

  get currentState(): AudioState {
    return this.desiredState;
  }

  /**
   * Create or resume the AudioContext. Must be called from a user gesture;
   * before that there is no context and nothing reports an error.
   */
  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    const Ctor = audioContextConstructor();
    if (!Ctor) return false;
    if (!this.context) {
      try {
        // Asking for the master rate avoids a resample on decode. Browsers
        // that refuse the option still give a usable context.
        this.context = new Ctor({ latencyHint: 'playback', sampleRate: 48_000 });
      } catch {
        try {
          this.context = new Ctor({ latencyHint: 'playback' });
        } catch (error) {
          this.options.onError?.(error, 'create-context');
          return false;
        }
      }
      this.master = this.context.createGain();
      this.master.gain.value = this.paused
        ? this.volume * this.options.pauseDuckGain
        : this.volume;
      this.master.connect(this.context.destination);
    }
    if (this.context.state !== 'running') {
      try {
        await this.context.resume();
      } catch (error) {
        this.options.onError?.(error, 'resume-context');
        return false;
      }
    }
    return this.context.state === 'running';
  }

  /**
   * Load a pack at a BPM tier and start playing. Calm-audible stems are
   * awaited so music starts as soon as possible; the rest join at a later loop
   * boundary, in phase.
   */
  async play(meta: PackMeta, bpm: number, state: AudioState = this.desiredState): Promise<void> {
    if (this.disposed) return;
    this.desiredState = state;
    const tier = this.resolveTier(meta, bpm);
    const key = `${meta.pack}:${tier}`;
    // Already playing this, or already on its way: nothing to do.
    if (this.requestedKey === key) return;
    this.requestedKey = key;
    if (!(await this.unlock())) {
      this.requestedKey = null;
      return;
    }

    const task = this.queue.then(() => this.startSet(meta, tier, key));
    // The queue must keep moving even when a switch fails, or every later
    // switch would be stuck behind the rejection.
    this.queue = task.then(
      () => undefined,
      () => undefined
    );
    await task.catch((error) => {
      this.options.onError?.(error, 'play');
      if (this.requestedKey === key) this.requestedKey = null;
    });
  }

  /** Build a set, start it in phase, and crossfade out whatever was playing. */
  private async startSet(meta: PackMeta, tier: number, key: string): Promise<void> {
    if (this.disposed || this.requestedKey !== key) return;
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const current = this.active;
    if (current && !current.releasing && current.key === key) return;

    const format = await this.resolveFormat(meta, tier);
    if (this.disposed || this.requestedKey !== key) return;
    const set = this.createSet(meta, tier, format, master);

    const upfront = meta.stems.filter((stem) => stem.audible_in_calm ?? audibleInCalm(stem.name));
    const later = meta.stems.filter((stem) => !upfront.includes(stem));

    const loaded = await Promise.all(
      upfront.map(async (stem) => ({
        stem,
        buffer: await this.buffer(stemUrl(stem, tier, format.ext)),
      }))
    );
    if (this.disposed || this.requestedKey !== key) {
      set.setGain.disconnect();
      return;
    }

    // Worked out after loading, so a slow fetch cannot leave the start time in
    // the past and break the phase alignment.
    const previous = this.active;
    const begin =
      previous && !previous.releasing
        ? this.boundary(previous, previous.loopDuration)
        : context.currentTime + this.options.startLeadSeconds;
    set.phaseOrigin = begin;

    for (const { stem, buffer } of loaded) {
      this.startStem(set, stem.name, buffer, begin);
    }
    // The initial mix is set at the start time itself, not ramped: there is
    // nothing yet to fade from.
    this.applyGains(set, this.desiredState, begin, 0);

    if (previous && !previous.releasing) {
      this.crossfade(previous, set, begin);
    } else {
      set.setGain.gain.setValueAtTime(1, begin);
      this.active = set;
    }

    // Everything else arrives in the background and joins in phase.
    void this.attachLater(set, later, format, tier);
  }

  /** Change the mix. Quantised to the next bar; gains only, never restarts. */
  setState(state: AudioState): void {
    this.desiredState = state;
    const set = this.active;
    if (!set || !this.context) return;
    if (set.state === state) return;
    const when = this.boundary(set, set.barDuration);
    this.applyGains(set, state, when, set.barDuration * this.options.crossfadeBars);
  }

  /** Move to another BPM tier of the same pack, crossfaded at a loop boundary. */
  setTier(bpm: number): void {
    const set = this.active;
    if (!set) return;
    // play() dedupes and queues, so a repeated or overlapping request is safe.
    void this.play(set.meta, this.resolveTier(set.meta, bpm), this.desiredState);
  }

  /** Switch packs. Also a crossfade, so the music never cuts. */
  async switchPack(meta: PackMeta, bpm: number): Promise<void> {
    await this.play(meta, bpm, this.desiredState);
  }

  /** Duck the master while the game is held; playback position is kept. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.rampMaster(paused ? this.volume * this.options.pauseDuckGain : this.volume);
  }

  setMasterVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.rampMaster(this.paused ? this.volume * this.options.pauseDuckGain : this.volume);
  }

  /** Stop playback and release the sources; the context stays warm. */
  stop(): void {
    this.requestedKey = null;
    for (const set of [this.active, this.incoming]) {
      if (set) this.release(set, this.context ? this.context.currentTime : 0);
    }
    this.active = null;
    this.incoming = null;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
    this.inflight.clear();
    const context = this.context;
    this.context = null;
    this.master = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
  }

  // --- internals -----------------------------------------------------------

  private resolveTier(meta: PackMeta, bpm: number): number {
    if (meta.loops[String(bpm)]) return bpm;
    // Nearest available tier, so a caller asking for a BPM this pack does not
    // ship still gets music rather than silence.
    return meta.bpm_tiers.reduce(
      (best, tier) => (Math.abs(tier - bpm) < Math.abs(best - bpm) ? tier : best),
      meta.bpm_tiers[0]
    );
  }

  private createSet(
    meta: PackMeta,
    bpm: number,
    format: PackFormat,
    master: GainNode
  ): StemSet {
    const context = this.context!;
    const loop = meta.loops[String(bpm)];
    const offset = (format.decode_offset_samples ?? 0) / meta.sample_rate;
    const setGain = context.createGain();
    setGain.gain.value = 0;
    setGain.connect(master);
    return {
      key: `${meta.pack}:${bpm}`,
      pack: meta.pack,
      bpm,
      meta,
      format,
      // Loop points are kept in seconds: decodeAudioData may resample to the
      // context's rate, which preserves durations but not sample counts.
      loopStart: offset,
      loopEnd: offset + loop.loop_samples / meta.sample_rate,
      loopDuration: loop.loop_samples / meta.sample_rate,
      barDuration: loop.bar_seconds,
      phaseOrigin: context.currentTime,
      setGain,
      stems: new Map(),
      state: 'calm',
      releasing: false,
    };
  }

  private startStem(set: StemSet, name: StemName, buffer: AudioBuffer, when: number): void {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = set.loopStart;
    // A buffer shorter than the metadata says would silently loop the wrong
    // window; clamp so the seam at least lands inside real audio.
    source.loopEnd = Math.min(set.loopEnd, buffer.duration);
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(set.setGain);
    source.start(when, set.loopStart);
    set.stems.set(name, { source, gain, scheduledValue: 0, scheduledUntil: when });
  }

  private async attachLater(
    set: StemSet,
    stems: PackStem[],
    format: PackFormat,
    bpm: number
  ): Promise<void> {
    for (const stem of stems) {
      if (this.disposed || set.releasing) return;
      try {
        const buffer = await this.buffer(stemUrl(stem, bpm, format.ext));
        if (this.disposed || set.releasing || set.stems.has(stem.name)) continue;
        // Join at a whole number of loops after the phase origin, so the new
        // stem is in sync with the ones already playing.
        const when = this.boundary(set, set.loopDuration);
        this.startStem(set, stem.name, buffer, when);
        const target = MIX_MATRIX[set.state][stem.name];
        const nodes = set.stems.get(stem.name)!;
        nodes.gain.gain.setValueAtTime(target, when);
        nodes.scheduledValue = target;
        nodes.scheduledUntil = when;
      } catch (error) {
        this.options.onError?.(error, `load:${stem.name}`);
      }
    }
  }

  /**
   * Next whole multiple of `period` after the set's phase origin, at least a
   * scheduling lead into the future.
   */
  private boundary(set: StemSet, period: number): number {
    const context = this.context!;
    const earliest = context.currentTime + this.options.startLeadSeconds;
    const elapsed = earliest - set.phaseOrigin;
    if (elapsed <= 0) return set.phaseOrigin;
    return set.phaseOrigin + Math.ceil(elapsed / period) * period;
  }

  private applyGains(set: StemSet, state: AudioState, when: number, ramp: number): void {
    const row = MIX_MATRIX[state];
    for (const name of STEM_NAMES) {
      const nodes = set.stems.get(name);
      if (!nodes) continue;
      const target = row[name];
      const param = nodes.gain.gain;
      if (when < nodes.scheduledUntil) {
        // A ramp is still running at `when`: hold wherever it has got to.
        const holdable = param as AudioParam & {
          cancelAndHoldAtTime?: (time: number) => AudioParam;
        };
        if (typeof holdable.cancelAndHoldAtTime === 'function') {
          holdable.cancelAndHoldAtTime(when);
        } else {
          param.cancelScheduledValues(when);
          param.setValueAtTime(param.value, when);
        }
      } else {
        param.cancelScheduledValues(when);
        param.setValueAtTime(nodes.scheduledValue, when);
      }
      if (ramp > 0) {
        param.linearRampToValueAtTime(target, when + ramp);
      } else {
        param.setValueAtTime(target, when);
      }
      nodes.scheduledValue = target;
      nodes.scheduledUntil = when + ramp;
    }
    set.state = state;
  }

  private crossfade(previous: StemSet, next: StemSet, at: number): void {
    const ramp = next.barDuration * this.options.crossfadeBars;
    next.setGain.gain.setValueAtTime(0, at);
    next.setGain.gain.linearRampToValueAtTime(1, at + ramp);
    previous.setGain.gain.cancelScheduledValues(at);
    previous.setGain.gain.setValueAtTime(1, at);
    previous.setGain.gain.linearRampToValueAtTime(0, at + ramp);
    this.active = next;
    this.incoming = null;
    this.release(previous, at + ramp + 0.05);
  }

  private release(set: StemSet, at: number): void {
    if (set.releasing) return;
    set.releasing = true;
    for (const nodes of set.stems.values()) {
      try {
        nodes.source.stop(at);
      } catch {
        // already stopped
      }
      nodes.source.onended = () => {
        nodes.source.disconnect();
        nodes.gain.disconnect();
      };
    }
    // A set with no sources has nothing to fire onended, so disconnect its bus
    // on a timer instead of leaking it.
    const delay = Math.max(0, at - (this.context?.currentTime ?? at)) * 1000 + 250;
    setTimeout(() => {
      try {
        set.setGain.disconnect();
      } catch {
        // already gone
      }
    }, delay);
    set.stems.clear();
  }

  private rampMaster(target: number): void {
    const context = this.context;
    if (!context || !this.master) return;
    const now = context.currentTime;
    const param = this.master.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + this.options.pauseRampSeconds);
  }

  /**
   * Which encoded format this browser can actually decode.
   *
   * canPlayType is only a hint — notably for Opus in Safari — so the first
   * candidate is confirmed by decoding a real stem before the set is built.
   */
  private async resolveFormat(meta: PackMeta, bpm: number): Promise<PackFormat> {
    const probe = typeof document !== 'undefined' ? document.createElement('audio') : null;
    const ordered = [...meta.formats].sort((a, b) => {
      const score = (format: PackFormat) => (probe?.canPlayType(format.mime) ? 0 : 1);
      return score(a) - score(b);
    });
    const reference = meta.stems[0];
    let lastError: unknown = null;
    for (const format of ordered) {
      try {
        await this.buffer(stemUrl(reference, bpm, format.ext));
        return format;
      } catch (error) {
        lastError = error;
        this.options.onError?.(error, `decode:${format.id}`);
      }
    }
    throw lastError ?? new Error('no decodable audio format for this browser');
  }

  private buffer(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = this.inflight.get(url);
    if (pending) return pending;

    const request = (async () => {
      const context = this.context;
      if (!context) throw new Error('no AudioContext — call unlock() first');
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`${url} responded ${response.status}`);
      const encoded = await response.arrayBuffer();
      // Safari only supports the callback form of decodeAudioData reliably.
      const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
        const promise = context.decodeAudioData(encoded, resolve, reject);
        if (promise && typeof promise.then === 'function') promise.then(resolve, reject);
      });
      this.buffers.set(url, decoded);
      return decoded;
    })();

    this.inflight.set(url, request);
    request.catch(() => undefined).finally(() => this.inflight.delete(url));
    return request;
  }
}
