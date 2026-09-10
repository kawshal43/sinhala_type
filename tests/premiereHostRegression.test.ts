import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it, expect, vi } from "vitest";

const source = readFileSync("cep/AutoCap/jsx/host.jsx", "utf8");
function host(failRestore = false) {
  let exports = 0;
  let inPoint = 2, outPoint = 8;
  const mutes = [false, true];
  const tracks: any = mutes.map((_, i) => ({
    isMuted: () => mutes[i],
    setMute: (value: number) => {
      if (failRestore && exports && i === 0) throw new Error("mute restore failed");
      mutes[i] = !!value;
    }
  }));
  tracks.numTracks = tracks.length;
  const createCaptionTrack = vi.fn((_item: unknown, _time: number) => true);
  const sequence = { sequenceID: "actual", name: "Actual", end: { seconds: 20 },
    audioTracks: tracks, getInPoint: () => inPoint, getOutPoint: () => outPoint,
    setInPoint: (v: number) => { inPoint = v; }, setOutPoint: (v: number) => { outPoint = v; },
    exportAsMediaDirect: () => { exports++; return 0; }, createCaptionTrack };
  const sequences: any = [sequence]; sequences.numSequences = 1;
  const children: any = [{ name: "captions.srt", getMediaPath: () => "captions.srt" }]; children.numItems = 1;
  function File(this: any, path: string) {
    this.exists = true; this.length = 1000; this.name = path;
    this.parent = { exists: true }; this.remove = () => true;
  }
  const context: any = { $: {}, app: { project: { activeSequence: sequence, sequences,
    importFiles: vi.fn(), rootItem: { children } } }, File, JSON };
  vm.runInNewContext(source, context);
  return { api: context.$._AutoCap_Host, createCaptionTrack,
    state: () => ({ exports, inPoint, outPoint, mutes }) };
}
const request = { kind: "range", sequenceId: "actual", startSec: 10, endSec: 15,
  trackIndex: 1, presetPath: "preset.epr", outputPath: "output.wav" };
describe("Premiere host regressions", () => {
  it("does not export a different sequence when the requested ID is missing", () => {
    const h = host();
    const result = JSON.parse(h.api.exportTimelineAudio({ ...request, sequenceId: "missing" }));
    expect(result.success).toBe(false);
    expect(h.state().exports).toBe(0);
  });
  it("restores state after a successful range export", () => {
    const h = host();
    expect(JSON.parse(h.api.exportTimelineAudio(request)).success).toBe(true);
    expect(h.state()).toEqual({ exports: 1, inPoint: 2, outPoint: 8, mutes: [false, true] });
  });
  it("continues restoration after a mute failure and reports it", () => {
    const h = host(true);
    const result = JSON.parse(h.api.exportTimelineAudio(request));
    expect(result.success).toBe(false);
    expect(result.error.code).toBe("STATE_RESTORE_FAILED");
    expect(h.state()).toEqual({ exports: 1, inPoint: 2, outPoint: 8, mutes: [true, true] });
  });
  it("does not apply the timeline offset twice when creating captions", () => {
    const h = host();
    const result = JSON.parse(h.api.importCaptionTrack({ sequenceId: "actual", srtPath: "captions.srt", timelineStartSec: 10 }));
    expect(result.data.status).toBe("track-created");
    expect(h.createCaptionTrack.mock.calls[0][1]).toBe(0);
  });
});
