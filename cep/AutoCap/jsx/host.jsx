/**
 * AutoCap Host ExtendScript for Adobe Premiere Pro
 * Implements native Premiere operations:
 * - Sequence inspection & selected range detection
 * - Isolated timeline audio export with snapshot state restoration
 * - Native caption track creation & item matching
 * - MOGRT graphic insertion & property manipulation
 */

if (typeof $ === "undefined") {
  $ = {};
}

$._AutoCap_Host = (function () {
  "use strict";

  function makeSuccess(data) {
    return JSON.stringify({ success: true, data: data });
  }

  function makeError(code, message, details) {
    return JSON.stringify({
      success: false,
      error: {
        code: code || "UNKNOWN_ERROR",
        message: message || "An unexpected error occurred in Premiere Pro.",
        details: details || null
      }
    });
  }

  function resolveSequence(sequenceId) {
    if (!app.project) {
      throw new Error("No active Premiere Pro project opened.");
    }
    if (sequenceId && sequenceId !== "active_sequence") {
      var seqCount = app.project.sequences ? app.project.sequences.numSequences : 0;
      for (var i = 0; i < seqCount; i++) {
        var s = app.project.sequences[i];
        if (s && (s.sequenceID === sequenceId || s.id === sequenceId || s.name === sequenceId)) {
          return s;
        }
      }
    }
    if (sequenceId && sequenceId !== "active_sequence") {
      throw new Error("Requested sequence no longer exists: " + sequenceId);
    }
    var activeSeq = app.project.activeSequence;
    if (!activeSeq && app.project.sequences && app.project.sequences.numSequences > 0) {
      activeSeq = app.project.sequences[0];
    }
    if (!activeSeq) {
      throw new Error("No active sequence found in Premiere Pro.");
    }
    return activeSeq;
  }

  /**
   * Inspects active sequence, audio tracks, and selected timeline clips.
   */
  function inspectActiveSequence() {
    try {
      if (!app.project) {
        return makeError("NO_PROJECT", "No Premiere Pro project is open.");
      }
      var seq = resolveSequence();
      var seqId = seq.sequenceID || seq.id || seq.name || "active_seq";
      var durationSec = seq.end ? seq.end.seconds : (seq.duration ? seq.duration.seconds : 0);
      var zeroPointSec = seq.zeroPoint ? seq.zeroPoint.seconds : 0;
      var inPointSec = seq.getInPoint ? seq.getInPoint() : null;
      var outPointSec = seq.getOutPoint ? seq.getOutPoint() : null;

      // Audio tracks summary
      var audioTracks = [];
      var numAudio = seq.audioTracks ? seq.audioTracks.numTracks : 0;
      for (var a = 0; a < numAudio; a++) {
        var track = seq.audioTracks[a];
        audioTracks.push({
          index: a,
          name: track.name || ("Audio " + (a + 1)),
          isMuted: track.isMuted ? track.isMuted() : false,
          clipCount: track.clips ? track.clips.numItems : 0
        });
      }

      // Selected timeline range: earliest start to latest end
      var selectedRange = null;
      try {
        if (seq.getSelection) {
          var sel = seq.getSelection();
          if (sel && sel.length > 0) {
            var minStart = null;
            var maxEnd = null;
            for (var s = 0; s < sel.length; s++) {
              var clip = sel[s];
              var cStart = clip.start ? clip.start.seconds : null;
              var cEnd = clip.end ? clip.end.seconds : null;
              if (cStart !== null && (minStart === null || cStart < minStart)) {
                minStart = cStart;
              }
              if (cEnd !== null && (maxEnd === null || cEnd > maxEnd)) {
                maxEnd = cEnd;
              }
            }
            if (minStart !== null && maxEnd !== null && maxEnd > minStart) {
              selectedRange = {
                startSec: Math.round(minStart * 1000) / 1000,
                endSec: Math.round(maxEnd * 1000) / 1000
              };
            }
          }
        }
      } catch (selErr) {
        // Selection API fallback
      }

      return makeSuccess({
        sequenceId: seqId,
        sequenceName: seq.name || "Active Sequence",
        durationSec: durationSec,
        zeroPointSec: zeroPointSec,
        inPointSec: inPointSec,
        outPointSec: outPointSec,
        selectedRange: selectedRange,
        audioTracks: audioTracks
      });
    } catch (err) {
      return makeError("INSPECT_FAILED", err.message || err.toString());
    }
  }

  function captureSequenceState(sequence) {
    var audioTrackMutes = [];
    if (sequence.audioTracks) {
      for (var i = 0; i < sequence.audioTracks.numTracks; i++) {
        var track = sequence.audioTracks[i];
        audioTrackMutes.push(track.isMuted ? track.isMuted() : false);
      }
    }
    return {
      sequenceId: sequence.sequenceID || sequence.id || sequence.name,
      audioTrackMutes: audioTrackMutes,
      inPointSec: sequence.getInPoint ? sequence.getInPoint() : null,
      outPointSec: sequence.getOutPoint ? sequence.getOutPoint() : null
    };
  }

  function restoreSequenceState(sequence, snapshot) {
    if (!sequence || !snapshot) return;
    var failures = [];
    function attempt(fn) { try { fn(); } catch (err) { failures.push(String(err)); } }
    if (snapshot.audioTrackMutes && sequence.audioTracks) {
      for (var i = 0; i < snapshot.audioTrackMutes.length && i < sequence.audioTracks.numTracks; i++) {
        (function(index) { attempt(function() {
          sequence.audioTracks[index].setMute(snapshot.audioTrackMutes[index] ? 1 : 0);
        }); })(i);
      }
    }
    if (snapshot.inPointSec !== null && sequence.setInPoint) {
      attempt(function() { sequence.setInPoint(snapshot.inPointSec); });
    }
    if (snapshot.outPointSec !== null && sequence.setOutPoint) {
      attempt(function() { sequence.setOutPoint(snapshot.outPointSec); });
    }
    return failures;
  }

  /**
   * Exports timeline audio with strict state capture and restoration.
   */
  function exportTimelineAudio(requestJson) {
    var snapshot = null;
    var sequence = null;

    try {
      var request = typeof requestJson === "string" ? JSON.parse(requestJson) : requestJson;
      if (!request || !request.outputPath) {
        return makeError("INVALID_REQUEST", "Output file path is required for audio export.");
      }

      sequence = resolveSequence(request.sequenceId);

      // Verify preset file exists
      if (request.presetPath) {
        var presetFile = new File(request.presetPath);
        if (!presetFile.exists) {
          return makeError("PRESET_NOT_FOUND", "The specified export preset does not exist: " + request.presetPath);
        }
      } else {
        return makeError("NO_PRESET", "No .epr audio export preset specified.");
      }

      // 1. Capture snapshot before touching mute or In/Out states
      snapshot = captureSequenceState(sequence);

      // 2. Apply temporary isolation or range
      var workAreaType = 0; // 0 = Entire sequence, 1 = In to Out

      if (request.kind === "track" && typeof request.trackIndex === "number") {
        if (!sequence.audioTracks || request.trackIndex < 0 || request.trackIndex >= sequence.audioTracks.numTracks) {
          return makeError("INVALID_TRACK", "Audio track index out of range: " + request.trackIndex);
        }
        // Mute all other audio tracks, unmute target track
        for (var t = 0; t < sequence.audioTracks.numTracks; t++) {
          sequence.audioTracks[t].setMute(t === request.trackIndex ? 0 : 1);
        }
      } else if (request.kind === "range") {
        if (!isFinite(request.startSec) || !isFinite(request.endSec) || request.startSec < 0 || request.endSec <= request.startSec) {
          return makeError("INVALID_RANGE", "Invalid range bounds: start=" + request.startSec + ", end=" + request.endSec);
        }
        sequence.setInPoint(request.startSec);
        sequence.setOutPoint(request.endSec);
        workAreaType = 1;

        if (typeof request.trackIndex === "number" && sequence.audioTracks) {
          if (request.trackIndex < 0 || request.trackIndex >= sequence.audioTracks.numTracks || request.trackIndex % 1 !== 0) return makeError("INVALID_TRACK", "Audio track index out of range.");
          for (var rt = 0; rt < sequence.audioTracks.numTracks; rt++) {
            sequence.audioTracks[rt].setMute(rt === request.trackIndex ? 0 : 1);
          }
        }
      }

      // Ensure target directory exists
      var outF = new File(request.outputPath);
      if (outF.parent && !outF.parent.exists) {
        outF.parent.create();
      }
      if (outF.exists) {
        outF.remove();
      }

      // 3. Perform Premiere Direct Export
      var exportResult = sequence.exportAsMediaDirect(request.outputPath, request.presetPath, workAreaType);

      // Check export result (empty string or "0" indicates success in Premiere ExtendScript)
      var fileObj = new File(request.outputPath);
      if (!fileObj.exists || fileObj.length === 0) {
        return makeError(
          "EXPORT_FAILED",
          "Premiere audio export did not produce a valid file: " + (exportResult || "File empty or missing"),
          exportResult
        );
      }

      var calcDuration = (request.kind === "range")
        ? (request.endSec - request.startSec)
        : (sequence.end ? sequence.end.seconds : (sequence.duration ? sequence.duration.seconds : 0));
      var timelineStart = (request.kind === "range") ? request.startSec : 0;

      return makeSuccess({
        sequenceId: sequence.sequenceID || sequence.id || sequence.name,
        audioPath: request.outputPath,
        durationSec: calcDuration,
        timelineStartSec: timelineStart,
        temporary: true
      });
    } catch (err) {
      return makeError("AUDIO_EXPORT_FAILED", err.message || err.toString());
    } finally {
      // 4. Guaranteed restoration of sequence state
      if (sequence && snapshot) {
        var failures = restoreSequenceState(sequence, snapshot);
        if (failures.length) return makeError("STATE_RESTORE_FAILED", "Export finished but Premiere state could not be fully restored: " + failures.join("; "));
      }
    }
  }

  /**
   * Imports an SRT file into Premiere Pro and attempts to create a native caption track.
   */
  function importCaptionTrack(requestJson) {
    try {
      if (!app.project) {
        return makeError("NO_PROJECT", "No active Premiere Pro project opened.");
      }

      var request = typeof requestJson === "string" ? JSON.parse(requestJson) : requestJson;
      var srtPath = request.srtPath;
      if (!srtPath) {
        return makeError("INVALID_PATH", "Subtitle file path is required.");
      }

      var srtFile = new File(srtPath);
      if (!srtFile.exists) {
        return makeError("FILE_NOT_FOUND", "Subtitle file not found on disk: " + srtPath);
      }

      var sequence = resolveSequence(request.sequenceId);

      // 1. Import file into active project
      app.project.importFiles([srtPath], false, app.project.rootItem, false);

      // 2. Locate EXACT imported project item by media path, then by exact unique filename
      var targetItem = null;
      var rootChildren = app.project.rootItem.children;
      var numChildren = rootChildren ? rootChildren.numItems : 0;

      for (var i = 0; i < numChildren; i++) {
        var child = rootChildren[i];
        if (!child) continue;

        var childMediaPath = "";
        try {
          if (child.getMediaPath) childMediaPath = child.getMediaPath();
        } catch (e) {}

        if (childMediaPath && childMediaPath.replace(/\\/g, "/") === srtPath.replace(/\\/g, "/")) {
          targetItem = child;
          break;
        }
        if (child.name === srtFile.name) {
          targetItem = child;
          break;
        }
      }

      if (!targetItem) {
        return makeError("ITEM_NOT_LOCATED", "Imported file into project bin, but could not resolve projectItem reference.");
      }

      // 3. Attempt native caption track creation

      var timelineStartSec = typeof request.timelineStartSec === "number" ? request.timelineStartSec : 0;
      var trackCreated = false;

      // Premiere Pro 15.0+ (2021+) unified caption API: sequence.createCaptionTrack
      if (sequence && sequence.createCaptionTrack) {
        try {
          var timeObj = 0; // SRT cues already include the timeline offset.
          var res = sequence.createCaptionTrack(targetItem, timeObj);
          if (res === true) {
            trackCreated = true;
          }
        } catch (capErr) {
          trackCreated = false;
        }
      }

      if (trackCreated) {
        return makeSuccess({
          status: "track-created",
          filePath: srtPath,
          projectItemName: targetItem.name,
          message: "Subtitles added to native caption track at timeline position " + timelineStartSec + "s."
        });
      } else {
        return makeSuccess({
          status: "bin-only",
          filePath: srtPath,
          projectItemName: targetItem.name,
          message: 'Subtitles imported into Project Bin ("' + targetItem.name + '"). Drag onto timeline caption track.'
        });
      }
    } catch (err) {
      return makeError("CAPTION_IMPORT_FAILED", err.message || err.toString());
    }
  }

  /**
   * Inserts a verified MOGRT graphic template into the target video track and populates text.
   */
  function insertMOGRTGraphic(requestJson) {
    try {
      if (!app.project) {
        return makeError("NO_PROJECT", "No active Premiere Pro project opened.");
      }

      var request = typeof requestJson === "string" ? JSON.parse(requestJson) : requestJson;
      var templatePath = request.templatePath;
      var text = request.text;
      var trackIndex = typeof request.targetVideoTrackIndex === "number" ? request.targetVideoTrackIndex : 0;
      var durationSec = typeof request.durationSec === "number" ? request.durationSec : 3.0;

      var tFile = new File(templatePath);
      if (!tFile.exists) {
        return makeError("TEMPLATE_NOT_FOUND", "MOGRT template file not found: " + templatePath);
      }

      var sequence = resolveSequence(request.sequenceId);
      if (!sequence.videoTracks || trackIndex < 0 || trackIndex >= sequence.videoTracks.numTracks) {
        return makeError("INVALID_TRACK", "Target video track index out of range: " + trackIndex);
      }

      var insertTime = typeof request.playheadTimeSec === "number"
        ? request.playheadTimeSec
        : (sequence.getPlayerPosition ? sequence.getPlayerPosition().seconds : 0);

      // sequence.importMGT(path, time, videoTrackIndex, audioTrackIndex)
      var trackItem = null;
      if (sequence.importMGT) {
        trackItem = sequence.importMGT(templatePath, insertTime, trackIndex, 0);
      }

      if (!trackItem) {
        return makeError("MOGRT_IMPORT_FAILED", "Premiere importMGT did not create a track item.");
      }

      // Update text property
      var textApplied = false;
      try {
        if (trackItem.getMGTComponent) {
          var mgtComp = trackItem.getMGTComponent();
          if (mgtComp && mgtComp.properties) {
            for (var p = 0; p < mgtComp.properties.numItems; p++) {
              var prop = mgtComp.properties[p];
              if (prop && (prop.displayName.toLowerCase().indexOf("text") !== -1 ||
                           prop.displayName.toLowerCase().indexOf("title") !== -1 ||
                           prop.displayName.toLowerCase().indexOf("caption") !== -1)) {
                prop.setValue(text, true);
                textApplied = true;
                break;
              }
            }
          }
        }
      } catch (propErr) {
        // Continue
      }

      // Adjust duration
      try {
        if (trackItem.end && trackItem.start) {
          trackItem.end = trackItem.start.seconds + durationSec;
        }
      } catch (durErr) {}

      return makeSuccess({
        success: true,
        message: textApplied
          ? "Inserted MOGRT graphic with Sinhala text onto Video " + (trackIndex + 1)
          : "Inserted MOGRT graphic onto Video " + (trackIndex + 1) + " (Text configuration required in Essential Graphics)",
        trackItemName: trackItem.name,
        appliedText: textApplied ? text : ""
      });
    } catch (err) {
      return makeError("MOGRT_FAILED", err.message || err.toString());
    }
  }

  return {
    inspectActiveSequence: inspectActiveSequence,
    exportTimelineAudio: exportTimelineAudio,
    importCaptionTrack: importCaptionTrack,
    insertMOGRTGraphic: insertMOGRTGraphic
  };
})();

