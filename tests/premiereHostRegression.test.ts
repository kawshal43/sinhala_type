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
  const mogrtCalls: Array<{ path: string; ticks: string; track: number; item: any }> = [];
  const importMGT = vi.fn((path: string, ticks: string, track: number) => {
    const values: Record<string, unknown> = {};
    const properties: any = [
      { displayName: "Caption Text", setValue: (value: unknown) => { values.text = value; } },
      { displayName: "Font Size", setValue: (value: unknown) => { values.fontSize = value; } },
      { displayName: "Text Color", setColorValue: (_a: number, r: number, g: number, b: number) => { values.color = [r, g, b]; } }
    ];
    properties.numItems = properties.length;
    const item: any = {
      name: "Caption Graphic",
      start: { seconds: Number(ticks) / 254016000000 },
      end: null,
      getMGTComponent: () => ({ properties }),
      values
    };
    mogrtCalls.push({ path, ticks, track, item });
    return item;
  });
  const videoTracks: any = [
    { clips: Object.assign([], { numItems: 0 }) },
    { clips: Object.assign([], { numItems: 0 }) },
    { clips: Object.assign([], { numItems: 0 }) }
  ];
  videoTracks.numTracks = videoTracks.length;
  const sequence = { sequenceID: "actual", name: "Actual", end: { seconds: 20 },
    audioTracks: tracks, getInPoint: () => inPoint, getOutPoint: () => outPoint,
    setInPoint: (v: number) => { inPoint = v; }, setOutPoint: (v: number) => { outPoint = v; },
    exportAsMediaDirect: () => { exports++; return 0; }, createCaptionTrack, videoTracks, importMGT };
  const sequences: any = [sequence]; sequences.numSequences = 1;
  const children: any = [{ name: "captions.srt", getMediaPath: () => "captions.srt" }]; children.numItems = 1;
  function File(this: any, path: string) {
    this.exists = true; this.length = 1000; this.name = path;
    this.parent = { exists: true }; this.remove = () => true;
  }
  function Time(this: any) { this.seconds = 0; }
  const context: any = { $: {}, app: { project: { activeSequence: sequence, sequences,
    importFiles: vi.fn(), rootItem: { children } } }, File, Time, JSON, isFinite, Math, parseInt };
  vm.runInNewContext(source, context);
  return { api: context.$._AutoCap_Host, createCaptionTrack,
    state: () => ({ exports, inPoint, outPoint, mutes }), mogrtCalls, videoTracks };
}
const request = { kind: "range", sequenceId: "actual", startSec: 10, endSec: 15,
  trackIndex: 1, presetPath: "preset.epr", outputPath: "output.wav" };
describe("Premiere host regressions", () => {
  it("uses syntax supported by Adobe ExtendScript", () => {
    expect(source).not.toMatch(/\?\.|\?\?/);
    expect(source).not.toMatch(/=>/);
  });
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
  it("inserts caption graphics at exact cue times and applies exposed controls", () => {
    const h = host();
    const result = JSON.parse(h.api.insertCaptionGraphics({
      sequenceId: "actual",
      templatePath: "captions.mogrt",
      targetVideoTrackIndex: 2,
      timelineStartSec: 10,
      cues: [
        { id: 1, start: 1.25, end: 3.75, text: "Sinhala English" },
        { id: 2, start: 5, end: 6.5, text: "Second" }
      ],
      style: { fontSize: 72, fillColor: "#ff0080" }
    }));
    expect(result.data.success).toBe(true);
    expect(result.data.insertedCount).toBe(2);
    expect(Number(h.mogrtCalls[0].ticks) / 254016000000).toBe(11.25);
    expect(h.mogrtCalls[0].track).toBe(2);
    expect(h.mogrtCalls[0].item.end.seconds).toBe(13.75);
    expect(h.mogrtCalls[0].item.name).toBe("AutoCap Caption 001");
    expect(h.mogrtCalls[1].item.name).toBe("AutoCap Caption 002");
    expect(h.mogrtCalls[0].item.values).toEqual({ text: "Sinhala English", fontSize: 72, color: [255, 0, 128] });
  });

  it("inserts graphics in chunked batches with sequential clip naming", () => {
    const h = host();
    const result = JSON.parse(h.api.insertCaptionGraphicsBatch({
      sequenceId: "actual",
      templatePath: "captions.mogrt",
      targetVideoTrackIndex: 1,
      timelineStartSec: 0,
      batchStartIndex: 5,
      totalCues: 20,
      cues: [
        { id: 6, start: 10, end: 12, text: "Chunk 1" },
        { id: 7, start: 13, end: 15, text: "Chunk 2" }
      ]
    }));

    expect(result.data.success).toBe(true);
    expect(result.data.batchInserted).toBe(2);
    expect(result.data.batchStartIndex).toBe(5);
    expect(h.mogrtCalls[0].item.name).toBe("AutoCap Caption 006");
    expect(h.mogrtCalls[1].item.name).toBe("AutoCap Caption 007");
  });

  it("updates timing only without touching existing text or styles", () => {
    const h = host();
    const existingClip1: any = {
      name: "AutoCap Caption 001",
      start: { seconds: 1 },
      end: { seconds: 3 }
    };
    const existingClip2: any = {
      name: "AutoCap Caption 002",
      start: { seconds: 4 },
      end: { seconds: 6 }
    };
    h.videoTracks[1].clips.push(existingClip1, existingClip2);
    h.videoTracks[1].clips.numItems = 2;

    const result = JSON.parse(h.api.insertCaptionGraphicsBatch({
      sequenceId: "actual",
      targetVideoTrackIndex: 1,
      timelineStartSec: 10,
      mode: "timing-only",
      batchStartIndex: 0,
      totalCues: 2,
      cues: [
        { id: 1, start: 2.5, end: 5.5, text: "Unchanged Text" },
        { id: 2, start: 6.0, end: 9.0, text: "Another Text" }
      ]
    }));

    expect(result.data.success).toBe(true);
    expect(result.data.batchInserted).toBe(2);
    // start should be offset (10) + cue.start (2.5) = 12.5
    expect(existingClip1.start.seconds).toBe(12.5);
    expect(existingClip1.end.seconds).toBe(15.5);
    // No new MOGRT items imported
    expect(h.mogrtCalls.length).toBe(0);
  });
});
