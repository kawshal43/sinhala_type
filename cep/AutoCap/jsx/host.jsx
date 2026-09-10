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

  function normalizeControlName(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/^\s+|\s+$/g, "");
  }

  function nameMatches(name, aliases) {
    var normalized = normalizeControlName(name);
    for (var i = 0; i < aliases.length; i++) {
      if (normalized === aliases[i]) return true;
    }
    return false;
  }

  function parseHexColor(value) {
    var hex = String(value || "").replace("#", "");
    if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return {
      a: 255,
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
  }

  function setTrackItemDuration(trackItem, durationSec) {
    try {
      if (!trackItem || !trackItem.start || !isFinite(durationSec) || durationSec <= 0) return false;
      if (typeof Time !== "undefined") {
        var endTime = new Time();
        endTime.seconds = trackItem.start.seconds + durationSec;
        trackItem.end = endTime;
      } else {
        trackItem.end = trackItem.start.seconds + durationSec;
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function padZero(num, size) {
    var s = String(num);
    while (s.length < (size || 3)) s = "0" + s;
    return s;
  }

  function resolveBundledTemplatePath(requestedPath) {
    if (requestedPath) {
      var custom = new File(requestedPath);
      if (custom.exists) return custom.fsName;
    }
    // Attempt automatic discovery of bundled AutoCapCaption.mogrt
    try {
      if (typeof $ !== "undefined" && $.fileName) {
        var thisFile = new File($.fileName);
        var jsxDir = thisFile.parent;
        var extDir = jsxDir.parent;
        var candidates = [
          extDir.fsName + "/assets/AutoCapCaption.mogrt",
          extDir.fsName + "/dist/assets/AutoCapCaption.mogrt",
          jsxDir.fsName + "/assets/AutoCapCaption.mogrt",
          jsxDir.fsName + "/../assets/AutoCapCaption.mogrt"
        ];
        for (var i = 0; i < candidates.length; i++) {
          var cand = new File(candidates[i]);
          if (cand.exists) return cand.fsName;
        }
      }
    } catch (e) {}
    return requestedPath || "";
  }

  function clearExistingAutoCapGraphics(sequence, trackIndex) {
    try {
      var track = sequence.videoTracks[trackIndex];
      if (!track || !track.clips) return 0;
      var count = 0;
      for (var i = track.clips.numItems - 1; i >= 0; i--) {
        var clip = track.clips[i];
        if (clip && clip.name && clip.name.indexOf("AutoCap Caption") === 0) {
          if (typeof clip.remove === "function") {
            try { clip.remove(true, true); count++; continue; } catch (re) {}
          }
          try {
            clip.disabled = true;
            clip.name = "[Replaced] " + clip.name;
            count++;
          } catch (de) {}
        }
      }
      return count;
    } catch (err) {
      return 0;
    }
  }

  function updateExistingGraphicTiming(sequence, trackIndex, cues, offset, batchStartIndex) {
    var track = sequence.videoTracks[trackIndex];
    if (!track || !track.clips) return { updatedCount: 0 };
    var clipsByName = {};
    for (var i = 0; i < track.clips.numItems; i++) {
      var clip = track.clips[i];
      if (clip && clip.name) clipsByName[clip.name] = clip;
    }
    var updated = 0;
    for (var c = 0; c < cues.length; c++) {
      var cue = cues[c];
      var globalIdx = (batchStartIndex || 0) + c;
      var expectedName = "AutoCap Caption " + padZero(globalIdx + 1, 3);
      var targetClip = clipsByName[expectedName];
      if (targetClip) {
        var startSec = offset + cue.start;
        var durationSec = cue.end - cue.start;
        if (typeof Time !== "undefined") {
          var startTime = new Time();
          startTime.seconds = startSec;
          targetClip.start = startTime;
          var endTime = new Time();
          endTime.seconds = startSec + durationSec;
          targetClip.end = endTime;
        } else {
          targetClip.start = { seconds: startSec };
          targetClip.end = { seconds: startSec + durationSec };
        }
        updated++;
      }
    }
    return { updatedCount: updated };
  }

  function setTextPropertyValue(prop, text) {
    if (!prop) return false;

    // 1. In Premiere Pro MOGRTs, text properties often store a JSON object with textEditValue
    var currentVal = null;
    try {
      if (prop.getValue) {
        currentVal = prop.getValue();
      }
    } catch (gvErr) {}

    if (typeof currentVal === "string" && currentVal.length > 0) {
      if (currentVal.charAt(0) === "{" || currentVal.indexOf("textEditValue") !== -1) {
        try {
          var parsed = JSON.parse(currentVal);
          if (parsed && typeof parsed === "object") {
            parsed.textEditValue = String(text);
            var updatedJson = JSON.stringify(parsed);
            try {
              prop.setValue(updatedJson, 1);
              return true;
            } catch (sj1Err) {
              try {
                prop.setValue(updatedJson);
                return true;
              } catch (sj2Err) {}
            }
          }
        } catch (jsonErr) {}
      }
    }

    // 2. Direct setValue with updateUI = 1
    try {
      prop.setValue(String(text), 1);
      return true;
    } catch (sv1Err) {}

    // 3. Direct setValue with no second argument
    try {
      prop.setValue(String(text));
      return true;
    } catch (sv2Err) {}

    // 4. Try wrapped JSON object
    try {
      var wrapper = JSON.stringify({ textEditValue: String(text) });
      prop.setValue(wrapper, 1);
      return true;
    } catch (sv3Err) {}

    return false;
  }

  function getCandidatePropertyCollections(trackItem) {
    var collections = [];
    if (!trackItem) return collections;

    // 1. Try getMGTComponent() (After Effects MOGRTs)
    try {
      if (trackItem.getMGTComponent) {
        var mgt = trackItem.getMGTComponent();
        if (mgt && mgt.properties) {
          collections.push(mgt.properties);
        }
      }
    } catch (mgtErr) {}

    // 2. Try trackItem.components (Premiere Pro Essential Graphics & native clips)
    try {
      if (trackItem.components) {
        for (var i = 0; i < trackItem.components.numItems; i++) {
          var comp = trackItem.components[i];
          if (comp && comp.properties) {
            collections.push(comp.properties);
          }
        }
      }
    } catch (compErr) {}

    return collections;
  }

  function applyMogrtControls(trackItem, text, style) {
    var applied = [];
    var missing = [];
    var debugProperties = [];
    var propCollections = getCandidatePropertyCollections(trackItem);

    var textAliases = [
      "text", "source text", "caption", "caption text", "title", "textlayer",
      "textebene", "capa de texto", "calque de texte"
    ];

    // Find and apply text
    var textApplied = false;

    // Pass 1: Try getParamForDisplayName on each collection with aliases
    for (var i = 0; i < propCollections.length && !textApplied; i++) {
      var col = propCollections[i];
      if (col.getParamForDisplayName) {
        for (var a = 0; a < textAliases.length; a++) {
          try {
            var directProp = col.getParamForDisplayName(textAliases[a]);
            if (directProp && setTextPropertyValue(directProp, text)) {
              textApplied = true;
              break;
            }
          } catch (dpErr) {}
        }
      }
    }

    // Pass 2: Iterate through all properties in all collections
    var allProps = [];
    for (var j = 0; j < propCollections.length; j++) {
      var collection = propCollections[j];
      var count = collection.numItems || 0;
      for (var p = 0; p < count; p++) {
        var prop = collection[p];
        if (!prop) continue;
        allProps.push(prop);
        var propName = prop.displayName || prop.name || "";
        if (propName) debugProperties.push(propName);
        if (!textApplied && nameMatches(propName, textAliases)) {
          if (setTextPropertyValue(prop, text)) {
            textApplied = true;
          }
        }
      }
    }

    // Pass 3: Check if any property's getValue() contains textEditValue
    if (!textApplied) {
      for (var k = 0; k < allProps.length; k++) {
        var candidate = allProps[k];
        try {
          if (candidate.getValue) {
            var val = candidate.getValue();
            if (typeof val === "string" && (val.indexOf("textEditValue") !== -1 || val.indexOf("Captions and Subtitles") !== -1)) {
              if (setTextPropertyValue(candidate, text)) {
                textApplied = true;
                break;
              }
            }
          }
        } catch (cgvErr) {}
      }
    }

    // Pass 4: Fallback for single/minimal-control MOGRTs (the non-shape, non-motion property)
    if (!textApplied) {
      for (var m = 0; m < allProps.length; m++) {
        var fallbackProp = allProps[m];
        var pName = normalizeControlName(fallbackProp.displayName || fallbackProp.name || "");
        if (pName !== "layername" && pName !== "shape" && pName !== "opacity" && pName !== "position" && pName !== "scale" && pName !== "rotation") {
          if (setTextPropertyValue(fallbackProp, text)) {
            textApplied = true;
            break;
          }
        }
      }
    }

    if (textApplied) {
      applied.push("text");
    } else {
      missing.push("text");
    }

    // Apply optional style properties (font, color, etc.) if exposed
    var styleControls = [
      { key: "fontFamily", aliases: ["font", "font family", "font name"], value: style.fontFamily },
      { key: "fontSize", aliases: ["font size", "text size", "size"], value: style.fontSize },
      { key: "fillColor", aliases: ["fill color", "text color", "font color", "color"], value: style.fillColor, color: true },
      { key: "positionX", aliases: ["position x", "x position", "text x"], value: style.positionX },
      { key: "positionY", aliases: ["position y", "y position", "text y"], value: style.positionY },
      { key: "alignment", aliases: ["alignment", "text alignment", "align"], value: style.alignment, choices: { left: 1, center: 2, right: 3 } },
      { key: "strokeWidth", aliases: ["stroke width", "outline width", "stroke"], value: style.strokeWidth },
      { key: "shadowEnabled", aliases: ["shadow", "drop shadow", "shadow enabled"], value: style.shadowEnabled },
      { key: "backgroundEnabled", aliases: ["background", "background enabled", "box"], value: style.backgroundEnabled },
      { key: "animation", aliases: ["animation", "animation style", "effect", "effect style"], value: style.animation, choices: { none: 1, fade: 2, pop: 3, "slide-up": 4 } },
      { key: "animationDuration", aliases: ["animation duration", "effect duration"], value: style.animationDuration }
    ];

    for (var s = 0; s < styleControls.length; s++) {
      var sc = styleControls[s];
      if (typeof sc.value === "undefined" || sc.value === "") continue;
      var styleApplied = false;
      for (var ap = 0; ap < allProps.length; ap++) {
        var sp = allProps[ap];
        var sName = sp.displayName || sp.name || "";
        if (!nameMatches(sName, sc.aliases)) continue;
        try {
          if (sc.color && sp.setColorValue) {
            var color = parseHexColor(sc.value);
            if (color) {
              sp.setColorValue(color.a, color.r, color.g, color.b, 1);
              styleApplied = true;
              break;
            }
          } else {
            var sVal = sc.choices ? sc.choices[sc.value] : sc.value;
            sp.setValue(sVal, 1);
            styleApplied = true;
            break;
          }
        } catch (sErr) {}
      }
      (styleApplied ? applied : missing).push(sc.key);
    }

    return { applied: applied, missing: missing, debugProperties: debugProperties };
  }

  function insertMogrtItem(sequence, templatePath, trackIndex, startSec, durationSec, text, style) {
    // Premiere's importMGT time parameter is a string containing ticks.
    var ticksPerSecond = 254016000000;
    var insertTicks = String(Math.round(Math.max(0, startSec) * ticksPerSecond));
    var trackItem = sequence.importMGT ? sequence.importMGT(templatePath, insertTicks, trackIndex, 0) : null;
    if (!trackItem) throw new Error("Premiere importMGT did not create a track item.");
    var properties = applyMogrtControls(trackItem, text, style || {});
    setTrackItemDuration(trackItem, durationSec);
    return { trackItem: trackItem, properties: properties };
  }

  /** Inserts one verified MOGRT at the playhead. */
  function insertMOGRTGraphic(requestJson) {
    try {
      if (!app.project) return makeError("NO_PROJECT", "No active Premiere Pro project opened.");
      var request = typeof requestJson === "string" ? JSON.parse(requestJson) : requestJson;
      var templatePath = resolveBundledTemplatePath(request.templatePath);
      var trackIndex = typeof request.targetVideoTrackIndex === "number" ? request.targetVideoTrackIndex : 0;
      var tFile = new File(templatePath);
      if (!tFile.exists) return makeError("TEMPLATE_NOT_FOUND", "MOGRT template file not found: " + templatePath);
      var sequence = resolveSequence(request.sequenceId);
      if (!sequence.videoTracks || trackIndex < 0 || trackIndex >= sequence.videoTracks.numTracks) {
        return makeError("INVALID_TRACK", "Target video track index out of range: " + trackIndex);
      }
      var insertTime = typeof request.playheadTimeSec === "number" ? request.playheadTimeSec : (sequence.getPlayerPosition ? sequence.getPlayerPosition().seconds : 0);
      var inserted = insertMogrtItem(sequence, templatePath, trackIndex, insertTime, request.durationSec || 3, request.text, request.style || {});
      var hasText = false;
      for (var i = 0; i < inserted.properties.applied.length; i++) if (inserted.properties.applied[i] === "text") hasText = true;
      return makeSuccess({
        success: hasText,
        code: hasText ? null : "TEXT_CONTROL_NOT_FOUND",
        message: hasText ? "Inserted editable graphic onto Video " + (trackIndex + 1) : "The MOGRT was inserted, but it does not expose a Text or Caption control.",
        trackItemName: inserted.trackItem.name,
        appliedText: hasText ? request.text : "",
        appliedProperties: inserted.properties.applied,
        missingProperties: inserted.properties.missing
      });
    } catch (err) {
      return makeError("MOGRT_FAILED", err.message || err.toString());
    }
  }

  /** Inserts a chunk / batch of caption cues as editable MOGRT graphics. */
  function insertCaptionGraphicsBatch(requestJson) {
    try {
      if (!app.project) return makeError("NO_PROJECT", "No active Premiere Pro project opened.");
      var request = typeof requestJson === "string" ? JSON.parse(requestJson) : requestJson;
      var cues = request.cues || [];
      if (!cues.length) return makeError("NO_CUES", "No captions were supplied for this batch.");
      var sequence = resolveSequence(request.sequenceId);
      var trackIndex = typeof request.targetVideoTrackIndex === "number" ? request.targetVideoTrackIndex : 0;
      if (!sequence.videoTracks || trackIndex < 0 || trackIndex >= sequence.videoTracks.numTracks) {
        return makeError("INVALID_TRACK", "Target video track index out of range: " + trackIndex);
      }

      var mode = request.mode || "add"; // "add" | "replace" | "timing-only"
      var offset = typeof request.timelineStartSec === "number" ? request.timelineStartSec : 0;
      var batchStartIndex = typeof request.batchStartIndex === "number" ? request.batchStartIndex : 0;

      // In timing-only mode, update existing graphic timings without touching user styling/text
      if (mode === "timing-only") {
        var timingResult = updateExistingGraphicTiming(sequence, trackIndex, cues, offset, batchStartIndex);
        return makeSuccess({
          success: true,
          mode: "timing-only",
          batchInserted: timingResult.updatedCount,
          batchStartIndex: batchStartIndex,
          message: "Updated timing for " + timingResult.updatedCount + " graphics."
        });
      }

      // If replace mode and this is the first batch, clear old AutoCap graphics on track
      if (mode === "replace" && batchStartIndex === 0) {
        clearExistingAutoCapGraphics(sequence, trackIndex);
      }

      var templatePath = resolveBundledTemplatePath(request.templatePath);
      var tFile = new File(templatePath);
      if (!tFile.exists) return makeError("TEMPLATE_NOT_FOUND", "MOGRT template file not found: " + templatePath);

      var insertedCount = 0;
      var appliedMap = {};
      var missingMap = {};

      for (var c = 0; c < cues.length; c++) {
        var cue = cues[c];
        var cueGlobalIdx = batchStartIndex + c;
        var clipName = "AutoCap Caption " + padZero(cueGlobalIdx + 1, 3);
        var result = insertMogrtItem(sequence, templatePath, trackIndex, offset + cue.start, cue.end - cue.start, cue.text, request.style || {});
        if (result && result.trackItem) {
          result.trackItem.name = clipName;
        }
        insertedCount++;

        var textApplied = false;
        for (var a = 0; a < result.properties.applied.length; a++) {
          appliedMap[result.properties.applied[a]] = true;
          if (result.properties.applied[a] === "text") textApplied = true;
        }
        for (var m = 0; m < result.properties.missing.length; m++) missingMap[result.properties.missing[m]] = true;

        if (!textApplied) {
          return makeSuccess({
            success: false,
            code: "TEXT_CONTROL_NOT_FOUND",
            batchInserted: insertedCount,
            batchStartIndex: batchStartIndex,
            message: ("Stopped because the MOGRT does not expose a Text or Caption control." + (result.properties && result.properties.debugProperties && result.properties.debugProperties.length > 0 ? " (Found: " + result.properties.debugProperties.join(", ") + ")" : "")),
            appliedProperties: mapKeys(appliedMap),
            missingProperties: mapKeys(missingMap)
          });
        }
      }

      return makeSuccess({
        success: true,
        mode: mode,
        batchInserted: insertedCount,
        batchStartIndex: batchStartIndex,
        appliedProperties: mapKeys(appliedMap),
        missingProperties: mapKeys(missingMap),
        message: "Inserted batch of " + insertedCount + " graphics."
      });
    } catch (err) {
      return makeError("MOGRT_BATCH_FAILED", err.message || err.toString());
    }
  }

  /** Inserts all caption cues (delegates to batch insertion or single-run). */
  function insertCaptionGraphics(requestJson) {
    try {
      var request = typeof requestJson === "string" ? JSON.parse(requestJson) : requestJson;
      var cues = request.cues || [];
      if (!cues.length) return makeError("NO_CUES", "No captions were supplied.");
      var batchReq = {
        sequenceId: request.sequenceId,
        timelineStartSec: request.timelineStartSec,
        templatePath: request.templatePath,
        targetVideoTrackIndex: request.targetVideoTrackIndex,
        batchStartIndex: 0,
        totalCues: cues.length,
        cues: cues,
        style: request.style,
        mode: request.mode || "add"
      };
      var batchRes = insertCaptionGraphicsBatch(batchReq);
      if (typeof batchRes === "string") batchRes = JSON.parse(batchRes);
      if (!batchRes.success) {
        var batchError = batchRes.error || {};
        return makeError(batchError.code || "MOGRT_FAILED", batchError.message || "Failed inserting graphics");
      }

      var batchData = batchRes.data || {};
      var insertedCount = typeof batchData.batchInserted === "number" ? batchData.batchInserted : 0;

      return makeSuccess({
        success: batchData.success !== false,
        code: batchData.code,
        insertedCount: insertedCount,
        requestedCount: cues.length,
        message: "Inserted " + insertedCount + " styled caption graphics.",
        appliedProperties: batchData.appliedProperties,
        missingProperties: batchData.missingProperties
      });
    } catch (err) {
      return makeError("MOGRT_BATCH_FAILED", err.message || err.toString());
    }
  }

  function mapKeys(map) {
    var keys = [];
    for (var key in map) if (map.hasOwnProperty(key)) keys.push(key);
    return keys;
  }

  return {
    inspectActiveSequence: inspectActiveSequence,
    exportTimelineAudio: exportTimelineAudio,
    importCaptionTrack: importCaptionTrack,
    insertMOGRTGraphic: insertMOGRTGraphic,
    insertCaptionGraphics: insertCaptionGraphics,
    insertCaptionGraphicsBatch: insertCaptionGraphicsBatch
  };
})();


