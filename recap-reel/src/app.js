(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const cv = $("#cv");
  let ctx = cv.getContext("2d");
  const S = { media: [], msg: null, music: null, logo: null, detectedBpm: null };
  let TL = null,
    MIX = null,
    mixKey = "",
    playing = null;

  /* ---------------- helpers ---------------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIO = (x) => {
    x = clamp(x, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };
  const back = (x) => {
    x = clamp(x, 0, 1);
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  };
  const fmt = (s) => {
    s = Math.max(0, s);
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  };
  const val = (id) => $("#" + id).value;
  const num = (id) => parseFloat($("#" + id).value) || 0;
  function setStatus(t) {
    $("#status").textContent = t || "";
  }
  let actx = null;
  function AC() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    return actx;
  }

  /* ---------------- media ingest ---------------- */
  async function addMediaFile(file) {
    const m = {
      id: Math.random().toString(36).slice(2),
      file,
      name: file.name,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("image") ? "image" : "video",
      thumb: document.createElement("canvas"),
      uses: 0,
    };
    m.thumb.width = 90;
    m.thumb.height = 160;
    S.media.push(m);
    renderThumbs();
    try {
      if (m.type === "image") {
        const img = new Image();
        img.src = m.url;
        await img.decode();
        m.el = img;
        m.w = img.naturalWidth;
        m.h = img.naturalHeight;
        m.dur = 99;
        drawCover(m.thumb.getContext("2d"), img, m.w, m.h, 0, 0, 90, 160, 1, 0, 0);
      } else {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.src = m.url;
        await new Promise((res, rej) => {
          v.onloadedmetadata = res;
          v.onerror = () => rej(new Error("decode"));
          setTimeout(() => rej(new Error("timeout")), 15000);
        });
        m.dur = v.duration;
        m.w = v.videoWidth;
        m.h = v.videoHeight;
        if (!m.w) throw new Error("decode");
        v.currentTime = Math.min(m.dur * 0.4, 1.5);
        await new Promise((r) => {
          v.onseeked = r;
          setTimeout(r, 3000);
        });
        drawCover(m.thumb.getContext("2d"), v, m.w, m.h, 0, 0, 90, 160, 1, 0, 0);
        v.removeAttribute("src");
        v.load();
      }
      m.ok = true;
    } catch (e) {
      m.ok = false;
      m.err =
        m.type === "video"
          ? "Can't play this video here. Try Safari or Chrome, or export it as H.264 MP4."
          : "Can't open this image. HEIC isn't supported, use JPG or PNG.";
    }
    renderThumbs();
    invalidate();
  }
  function renderThumbs() {
    const box = $("#thumbs");
    box.innerHTML = "";
    const n = S.media.length,
      nOut = outroCount(n);
    S.media.forEach((m, i) => {
      const d = document.createElement("div");
      d.className = "th";
      d.appendChild(m.thumb);
      const role = i === 0 ? "intro" : i >= n - nOut ? "outro" : "";
      d.insertAdjacentHTML(
        "beforeend",
        `<span class="tag ${role}">${role || (m.type === "image" ? "photo" : "clip")}</span>` +
          (m.type === "video" && m.dur ? `<span class="dur">${m.dur.toFixed(1)}s</span>` : "") +
          (m.ok === false ? `<div class="err">${m.err}</div>` : "") +
          `<div class="ctl"><button data-a="l" title="Move earlier">◀</button><button data-a="x" title="Remove">✕</button><button data-a="r" title="Move later">▶</button></div>`,
      );
      d.querySelectorAll("button").forEach(
        (b) =>
          (b.onclick = () => {
            const a = b.dataset.a;
            if (a === "x") {
              S.media.splice(i, 1);
            } else {
              const j = a === "l" ? i - 1 : i + 1;
              if (j < 0 || j >= n) return;
              [S.media[i], S.media[j]] = [S.media[j], S.media[i]];
            }
            renderThumbs();
            invalidate();
          }),
      );
      box.appendChild(d);
    });
  }
  function outroCount(n) {
    return n >= 6 ? 2 : n >= 4 ? 1 : 0;
  }
  function wireDrop(labelSel, input, handler) {
    const lab = document.querySelector(labelSel);
    if (lab) {
      ["dragenter", "dragover"].forEach((e) =>
        lab.addEventListener(e, (ev) => {
          ev.preventDefault();
          lab.classList.add("over");
        }),
      );
      ["dragleave", "drop"].forEach((e) =>
        lab.addEventListener(e, (ev) => {
          ev.preventDefault();
          lab.classList.remove("over");
        }),
      );
      lab.addEventListener("drop", (ev) => handler([...ev.dataTransfer.files]));
    }
    input.addEventListener("change", () => {
      handler([...input.files]);
      input.value = "";
    });
  }
  wireDrop("#dropMedia", $("#inMedia"), async (fs) => {
    for (const f of fs) {
      if (
        f.type.startsWith("video") ||
        f.type.startsWith("image") ||
        /\.(mov|mp4|heic|jpe?g|png|webm)$/i.test(f.name)
      )
        await addMediaFile(f);
    }
  });

  async function decodeAudio(file) {
    const buf = await file.arrayBuffer();
    return await AC().decodeAudioData(buf);
  }
  function fileRow(el, name, extra) {
    $(el).innerHTML =
      `<div class="file"><span>♪</span><span class="nm">${name}</span><span style="color:var(--mute)">${extra || ""}</span></div>`;
  }
  $("#inMsg").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await setMessage(f);
    e.target.value = "";
  });
  async function setMessage(f) {
    try {
      const b = await decodeAudio(f);
      S.msg = { buf: b, name: f.name };
      const st = firstSound(b);
      $("#msgStart").max = Math.max(1, b.duration - 3).toFixed(1);
      $("#msgStart").value = st.toFixed(1);
      $("#msgLen").max = Math.min(60, Math.ceil(b.duration - st));
      $("#msgLen").value = Math.min(20, Math.floor(b.duration - st));
      syncOut();
      fileRow("#msgFile", f.name, b.duration.toFixed(1) + "s");
    } catch (err) {
      fileRow("#msgFile", f.name, "can't decode");
    }
    invalidate();
  }
  $("#inMusic").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await setMusic(f);
    e.target.value = "";
  });
  async function setMusic(f) {
    try {
      const b = await decodeAudio(f);
      S.music = { buf: b, name: f.name };
      fileRow("#musicFile", f.name, "detecting tempo…");
      await new Promise((r) => setTimeout(r, 30));
      const d = detectBeat(b);
      S.detectedBpm = d.bpm;
      $("#bpm").value = d.bpm.toFixed(1);
      $("#musicStart").value = d.offset.toFixed(2);
      fileRow("#musicFile", f.name, `${b.duration.toFixed(0)}s · ${d.bpm.toFixed(0)} BPM`);
    } catch (err) {
      fileRow("#musicFile", f.name, "can't decode");
    }
    invalidate();
  }
  $("#inLogo").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await setLogo(f);
    e.target.value = "";
  });
  async function setLogo(f) {
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await img.decode();
    S.logo = img;
    $("#logoFile").innerHTML =
      `<div class="file"><img src="${img.src}" style="width:28px;height:28px;object-fit:contain"><span class="nm">${f.name}</span></div>`;
    invalidate();
  }

  function firstSound(b) {
    const d = b.getChannelData(0),
      sr = b.sampleRate,
      w = Math.floor(sr * 0.05);
    let pk = 0;
    for (let i = 0; i < d.length; i += 97) pk = Math.max(pk, Math.abs(d[i]));
    const th = pk * 0.08;
    for (let i = 0; i < d.length - w; i += w) {
      let s = 0;
      for (let j = 0; j < w; j += 4) s = Math.max(s, Math.abs(d[i + j]));
      if (s > th) return Math.max(0, i / sr - 0.05);
    }
    return 0;
  }

  /* beat detection: onset envelope autocorrelation */
  function detectBeat(b) {
    const sr = b.sampleRate,
      hop = Math.floor(sr / 100),
      L = b.getChannelData(0),
      R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
    const n = Math.min(Math.floor(L.length / hop), 100 * 90);
    const env = new Float32Array(n);
    let lp = 0,
      prev = 0;
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = 0; j < hop; j += 2) {
        const x = (L[i * hop + j] + R[i * hop + j]) * 0.5;
        lp += 0.08 * (x - lp);
        e += lp * lp;
      }
      e = Math.log(1e-6 + e);
      env[i] = Math.max(0, e - prev);
      prev = e;
    }
    let best = 0,
      bl = 60;
    for (let lag = Math.floor(6000 / 170); lag <= Math.floor(6000 / 70); lag++) {
      let s = 0;
      for (let i = 0; i < n - lag; i++) s += env[i] * env[i + lag];
      s /= n - lag;
      const bpm = 6000 / lag;
      const w = Math.exp(-Math.pow(Math.log2(bpm / 112), 2) * 1.2);
      if (s * w > best) {
        best = s * w;
        bl = lag;
      }
    }
    // refine with fractional lag
    let bpm = 6000 / bl;
    let bestS = -1,
      bestB = bpm;
    for (let c = bpm - 2; c <= bpm + 2; c += 0.05) {
      const per = 6000 / c;
      let sc = 0;
      for (let o = 0; o < per; o += 1) {
        let a = 0;
        for (let k = 0; o + k * per < n; k++) a += env[Math.round(o + k * per)] || 0;
        if (a > sc) sc = a;
      }
      if (sc > bestS) {
        bestS = sc;
        bestB = c;
      }
    }
    bpm = bestB;
    const per = 6000 / bpm;
    let bo = 0,
      bs = -1;
    for (let o = 0; o < per; o++) {
      let a = 0;
      for (let k = 0; o + k * per < n; k++) a += env[Math.round(o + k * per)] || 0;
      if (a > bs) {
        bs = a;
        bo = o;
      }
    }
    let off = bo / 100;
    const fs = firstSound(b);
    while (off < fs - 0.01) off += per / 100;
    return { bpm, offset: off };
  }

  /* ---------------- timeline ---------------- */
  function buildTimeline() {
    const items = S.media.filter((m) => m.ok);
    if (!items.length) return null;
    const B = 60 / clamp(num("bpm") || 105, 60, 180);
    const n = items.length,
      nOut = outroCount(n);
    const hero = items[0];
    const outro = nOut ? items.slice(n - nOut) : [items[n - 1]];
    let pool = items.slice(1, n - nOut);
    if (!pool.length) pool = items.slice();
    items.forEach((m) => (m.uses = 0));
    let pi = 0;
    const next = () => pool[pi++ % pool.length];
    const segs = [];
    let t = 0;
    const it = (m, dur, rate = 1) => {
      let inP = 0;
      if (m.type === "video") {
        const need = dur * rate + 0.2;
        const avail = Math.max(0, m.dur - need);
        inP = avail * ((0.18 + 0.41 * m.uses) % 1);
      }
      m.uses++;
      return { m, inP, rate, dur };
    };
    const add = (sec, kind, dur, ms, extra = {}) => {
      const s = { sec, kind, start: t, dur, items: ms.map((m) => it(m, dur, extra.rate || 1)), ...extra };
      segs.push(s);
      t += dur;
      return s;
    };
    // INTRO
    add("intro", "single", 4 * B, [hero], { zoom: "push" });
    add("intro", "single", 2 * B, [pool.length > 1 ? next() : hero], { zoom: "punch" });
    const montageStart = t;
    // MONTAGE
    // pace: beats per cut for clips / photos
    const pace = val("pace") || "standard";
    const vb = pace === "fast" ? 1 : pace === "calm" ? 4 : 2,
      pb = pace === "fast" ? 2 : pace === "calm" ? 4 : 3;
    let mb = clamp(Math.ceil((pool.length * vb + 6) / 4) * 4, 16, 36);
    for (let b = 0; b < mb;) {
      if (b >= 8 && b < 8 + vb && pool.length >= 3 && !segs.some((x) => x.kind === "split3")) {
        add("montage", "split3", Math.max(2, vb) * B, [next(), next(), next()]);
        b += Math.max(2, vb);
        continue;
      }
      const m = next();
      const nb = Math.min(m.type === "image" ? pb : vb, mb - b);
      add("montage", "single", nb * B, [m], {
        zoom: m.type === "image" ? "slow" : "punch",
        bar: b % 4 === 0,
      });
      b += nb;
    }
    // WORD
    let wordStart = t,
      wordEnd = t;
    const msgLen = S.msg ? Math.min(num("msgLen"), S.msg.buf.duration - num("msgStart")) : 0;
    if (S.msg && msgLen > 1) {
      const bars = Math.ceil((msgLen + 0.8) / (4 * B));
      for (let k = 0; k < bars; k++) {
        if (k === 1 && pool.length >= 6)
          add("word", "grid6", 4 * B, [next(), next(), next(), next(), next(), next()], { rate: 0.6 });
        else if (k === 1 && pool.length >= 3)
          add("word", "split3", 4 * B, [next(), next(), next()], { rate: 0.6 });
        else if (k === 3) add("word", "letterbox", 4 * B, [next()], { rate: 0.6, zoom: "slow" });
        else add("word", "single", 4 * B, [next()], { rate: 0.6, zoom: "slow" });
      }
      wordEnd = t;
    }
    // OUTRO
    const outroStart = t;
    outro.forEach((m, i) => {
      const last = i === outro.length - 1;
      add("outro", "single", (last ? 8 : 3) * B, [m], { zoom: last ? "slow" : "punch", text: last });
    });
    const textStart = segs[segs.length - 1].start + 0.5 * B;
    // END
    const endStart = t;
    add("end", "end", Math.max(8 * B, 4.2), []);
    return {
      B,
      segs,
      total: t,
      montageStart,
      wordStart,
      wordEnd,
      outroStart,
      endStart,
      textStart,
      msgLen,
      hasWord: wordEnd > wordStart,
    };
  }

  /* ---------------- audio: SFX pack (loaded from assets/sfx/manifest.json) ---------------- */
  const SFX_BASE = "assets/sfx/"; // folder holding manifest.json + the mp3 files
  let SFXL = null;
  async function sfxLib() {
    if (SFXL) return SFXL;
    const man = await (await fetch(SFX_BASE + "manifest.json")).json();
    const out = {};
    await Promise.all(
      Object.entries(man).map(async ([k, v]) => {
        const ab = await (await fetch(SFX_BASE + v.file)).arrayBuffer();
        out[k] = { hit: v.hit, buf: await AC().decodeAudioData(ab) };
      }),
    );
    SFXL = out;
    return out;
  }

  function mkBuf(ac, dur, fn) {
    const sr = ac.sampleRate,
      n = Math.ceil(dur * sr),
      b = ac.createBuffer(2, n, sr);
    fn(b.getChannelData(0), b.getChannelData(1), sr, n);
    return b;
  }
  function rnd(seed) {
    let s = seed || 1;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s / 2147483647) * 2 - 1;
    };
  }
  function svf() {
    let lo = 0,
      bd = 0;
    return (x, fc, sr, q = 0.7) => {
      const f = 2 * Math.sin((Math.PI * Math.min(fc, sr / 6)) / sr);
      const hi = x - lo - q * bd;
      bd += f * hi;
      lo += f * bd;
      return { lo, bd, hi };
    };
  }
  function reverbIR(ac, dur = 2.4) {
    return mkBuf(ac, dur, (L, R, sr, n) => {
      const a = rnd(41),
        b = rnd(43);
      for (let i = 0; i < n; i++) {
        const e = Math.pow(1 - i / n, 3);
        L[i] = a() * e;
        R[i] = b() * e;
      }
    });
  }

  /* generated music bed (fallback) */
  function genMusic(ac, out, T) {
    const B = T.B,
      bars = Math.ceil(T.total / (4 * B)) + 1;
    const prog = [
      [0, 4, 7],
      [7, 11, 14],
      [9, 12, 16],
      [5, 9, 12],
    ];
    const root = [0, 7, 9, 5];
    const base = 261.63 / 2;
    const pad = ac.createBiquadFilter();
    pad.type = "lowpass";
    pad.frequency.value = 1400;
    const padG = ac.createGain();
    padG.gain.value = 0.05;
    pad.connect(padG).connect(out);
    const drums = ac.createGain();
    drums.gain.value = 0.9;
    drums.connect(out);
    const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = nb.getChannelData(0);
    const r = rnd(77);
    for (let i = 0; i < nd.length; i++) nd[i] = r();
    const inSec = (t) => T.segs.find((s) => t >= s.start && t < s.start + s.dur) || { sec: "end" };
    for (let k = 0; k < bars; k++) {
      const t0 = k * 4 * B,
        ch = prog[k % 4];
      ch.forEach((st) =>
        [-6, 0, 6].forEach((dt) => {
          const o = ac.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = base * 2 * Math.pow(2, st / 12);
          o.detune.value = dt;
          const g = ac.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(1, t0 + 0.25);
          g.gain.setValueAtTime(1, t0 + 4 * B - 0.1);
          g.gain.linearRampToValueAtTime(0, t0 + 4 * B + 0.15);
          o.connect(g).connect(pad);
          o.start(t0);
          o.stop(t0 + 4 * B + 0.2);
        }),
      );
      for (let bt = 0; bt < 4; bt++) {
        const tb = t0 + bt * B,
          sec = inSec(tb + 0.01).sec;
        const full = sec === "montage" || sec === "outro" || (sec === "intro" && tb >= 2 * B);
        // bass
        const bo = ac.createOscillator();
        bo.type = "sine";
        bo.frequency.value = (base / 2) * Math.pow(2, root[k % 4] / 12);
        const bg = ac.createGain();
        bg.gain.setValueAtTime(0, tb);
        bg.gain.linearRampToValueAtTime(sec === "end" ? 0 : 0.32, tb + 0.08);
        bg.gain.linearRampToValueAtTime(0, tb + B * 0.95);
        bo.connect(bg).connect(out);
        bo.start(tb);
        bo.stop(tb + B);
        if (!full) continue;
        const ko = ac.createOscillator();
        ko.frequency.setValueAtTime(150, tb);
        ko.frequency.exponentialRampToValueAtTime(42, tb + 0.12);
        const kg = ac.createGain();
        kg.gain.setValueAtTime(0.95, tb);
        kg.gain.exponentialRampToValueAtTime(0.001, tb + 0.4);
        ko.connect(kg).connect(drums);
        ko.start(tb);
        ko.stop(tb + 0.45);
        if (bt % 2 === 1) {
          const s = ac.createBufferSource();
          s.buffer = nb;
          const f = ac.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = 1600;
          f.Q.value = 0.8;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.55, tb);
          g.gain.exponentialRampToValueAtTime(0.001, tb + 0.2);
          s.connect(f).connect(g).connect(drums);
          s.start(tb, Math.random() * 0.5, 0.25);
        }
        [0, 0.5].forEach((o8) => {
          const th = tb + o8 * B + (o8 ? 0 : B * 0.25);
          if (!o8) return;
          const s = ac.createBufferSource();
          s.buffer = nb;
          const f = ac.createBiquadFilter();
          f.type = "highpass";
          f.frequency.value = 7500;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.22, th);
          g.gain.exponentialRampToValueAtTime(0.001, th + 0.06);
          s.connect(f).connect(g).connect(drums);
          s.start(th, Math.random() * 0.5, 0.08);
        });
        // shaker 16ths
        for (let q = 0; q < 4; q++) {
          const th = tb + (q * B) / 4;
          const s = ac.createBufferSource();
          s.buffer = nb;
          const f = ac.createBiquadFilter();
          f.type = "highpass";
          f.frequency.value = 9000;
          const g = ac.createGain();
          g.gain.setValueAtTime(q % 2 ? 0.07 : 0.035, th);
          g.gain.exponentialRampToValueAtTime(0.001, th + 0.04);
          s.connect(f).connect(g).connect(drums);
          s.start(th, Math.random() * 0.5, 0.05);
        }
      }
    }
  }

  async function buildMix(T) {
    const sr = 44100,
      len = Math.ceil((T.total + 0.3) * sr);
    const ac = new OfflineAudioContext(2, len, sr);
    const master = ac.createDynamicsCompressor();
    master.threshold.value = -8;
    master.knee.value = 6;
    master.ratio.value = 10;
    master.attack.value = 0.003;
    master.release.value = 0.2;
    master.connect(ac.destination);
    const verb = ac.createConvolver();
    verb.buffer = reverbIR(ac);
    const verbG = ac.createGain();
    verbG.gain.value = 0.28;
    verb.connect(verbG).connect(master);
    const mv = num("musicVol"),
      sv = num("sfxVol"),
      vv = num("voiceVol");
    // music bus with ducking automation
    const mus = ac.createGain();
    mus.connect(master);
    const g = mus.gain,
      lv = mv * 0.9,
      duck = mv * 0.17;
    g.setValueAtTime(0, 0);
    g.linearRampToValueAtTime(lv, 0.08);
    if (T.hasWord) {
      g.setValueAtTime(lv, T.wordStart - 0.6);
      g.linearRampToValueAtTime(duck, T.wordStart + 0.3);
      const ve = T.wordStart + 0.25 + T.msgLen;
      g.setValueAtTime(duck, ve - 0.2);
      g.linearRampToValueAtTime(lv * 0.8, ve + 0.9);
      g.linearRampToValueAtTime(lv, T.outroStart + 0.05);
    }
    g.setValueAtTime(lv, T.endStart);
    g.linearRampToValueAtTime(lv * 0.45, T.endStart + 0.4);
    g.linearRampToValueAtTime(0, T.total);
    if (S.music) {
      const s = ac.createBufferSource();
      s.buffer = S.music.buf;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 30;
      s.connect(hp).connect(mus);
      s.start(0, num("musicStart"));
    } else genMusic(ac, mus, T);
    // voice chain
    if (T.hasWord) {
      const vb = S.msg.buf;
      let pk = 0;
      for (let c = 0; c < vb.numberOfChannels; c++) {
        const d = vb.getChannelData(c);
        for (let i = 0; i < d.length; i += 3) pk = Math.max(pk, Math.abs(d[i]));
      }
      const s = ac.createBufferSource();
      s.buffer = vb;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 85;
      const pres = ac.createBiquadFilter();
      pres.type = "peaking";
      pres.frequency.value = 3200;
      pres.Q.value = 0.9;
      pres.gain.value = 3.5;
      const mud = ac.createBiquadFilter();
      mud.type = "peaking";
      mud.frequency.value = 300;
      mud.Q.value = 1;
      mud.gain.value = -2.5;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      comp.knee.value = 8;
      const vg = ac.createGain();
      const vs = ac.createGain();
      vs.gain.value = 0.08;
      const on = T.wordStart + 0.25,
        dur = T.msgLen;
      const lvl = (0.85 / Math.max(pk, 0.05)) * vv * 1.25;
      vg.gain.setValueAtTime(0, on);
      vg.gain.linearRampToValueAtTime(lvl, on + 0.06);
      vg.gain.setValueAtTime(lvl, on + dur - 0.6);
      vg.gain.linearRampToValueAtTime(0, on + dur);
      s.connect(hp).connect(mud).connect(pres).connect(comp).connect(vg).connect(master);
      vg.connect(vs).connect(verb);
      s.start(on, num("msgStart"), dur + 0.05);
    }
    // SFX placement — custom pack, each sound aligned by its hit point
    const sfx = ac.createGain();
    sfx.gain.value = sv;
    sfx.connect(master);
    const L = await sfxLib();
    const play = (k, t, gain = 1, pan = 0, o = {}) => {
      const e = L[k];
      if (!e) return;
      let st = t - e.hit,
        off = o.offset || 0;
      if (st < 0) {
        off += -st;
        st = 0;
      }
      if (off >= e.buf.duration) return;
      const s = ac.createBufferSource();
      s.buffer = e.buf;
      const gg = ac.createGain();
      gg.gain.value = gain;
      let n = s.connect(gg);
      if (pan && ac.createStereoPanner) {
        const p = ac.createStereoPanner();
        p.pan.value = pan;
        n = gg.connect(p);
      }
      n.connect(sfx);
      if (o.dur) s.start(st, off, o.dur);
      else s.start(st, off);
    };
    const B = T.B;
    // opening
    play("sub3", 0, 1);
    play("impact4", 0, 0.45);
    play("low5", 0, 0.55);
    // intro light leak
    play("flame", 4 * B, 0.75);
    // drop into montage
    play("revriser", T.montageStart, 0.7);
    play("sub1", T.montageStart, 0.8);
    play("low4", T.montageStart, 0.45);
    let vc = 0;
    T.segs
      .filter((s) => s.sec === "montage")
      .forEach((s, i) => {
        if (i === 0) return;
        if (s.kind === "split3") {
          play("t1", s.start, 0.55);
          return;
        }
        if (s.items[0].m.type === "image") {
          play("shutter", s.start, 0.55, i % 2 ? 0.25 : -0.25);
          return;
        }
        if (vc++ % 2 === 0)
          play(vc % 4 === 1 ? "fastswish" : "sharp", s.start, 0.38, vc % 4 === 1 ? -0.3 : 0.3);
      });
    // the word
    if (T.hasWord) {
      play("verylong", T.wordStart, 0.7);
      play("sub5", T.wordStart, 0.65);
      T.segs
        .filter((s) => s.sec === "word")
        .slice(1)
        .forEach((s, i) => {
          if (s.kind === "grid6") play("bips", s.start, 0.22, 0, { dur: 0.7 });
          else if (s.kind === "split3") play("t2", s.start, 0.3);
          else if (s.kind === "letterbox") play("panoramic", s.start, 0.38);
        });
    }
    // outro
    play("long", T.outroStart, 0.6);
    play("golden", T.outroStart + 0.05, 0.45);
    play("sub2", T.outroStart, 0.5);
    T.segs
      .filter((s) => s.sec === "outro")
      .slice(1)
      .forEach((s) => {
        if (!s.text) play("sharp", s.start, 0.35);
      });
    if (outroWords().length) play("whip", T.textStart, 0.5);
    // end card
    play("impact1", T.endStart, 0.95);
    play("low4", T.endStart, 0.55);
    play("camera", T.endStart + 1.1, 0.45);
    const out = await ac.startRendering();
    // normalise
    let pk = 0;
    for (let c = 0; c < 2; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > pk) pk = a;
      }
    }
    const k = pk > 0 ? 0.94 / pk : 1;
    for (let c = 0; c < 2; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
    // voice envelope for the visualiser
    let venv = null;
    if (T.hasWord) {
      const vb = S.msg.buf,
        d = vb.getChannelData(0),
        fps = 30,
        st = Math.floor(num("msgStart") * vb.sampleRate),
        hop = Math.floor(vb.sampleRate / fps);
      const nfr = Math.ceil(T.msgLen * fps);
      venv = new Float32Array(nfr);
      let mx = 0;
      for (let f = 0; f < nfr; f++) {
        let s = 0;
        for (let j = 0; j < hop; j += 8) {
          const x = d[st + f * hop + j] || 0;
          s += x * x;
        }
        venv[f] = Math.sqrt(s / (hop / 8));
        mx = Math.max(mx, venv[f]);
      }
      for (let f = 0; f < nfr; f++) venv[f] /= mx || 1;
    }
    return { buf: out, venv };
  }

  /* ---------------- drawing ---------------- */
  function drawCover(c, src, sw, sh, x, y, w, h, zoom = 1, px = 0, py = 0) {
    if (!sw || !sh) return;
    const s = Math.max(w / sw, h / sh) * zoom;
    const dw = sw * s,
      dh = sh * s;
    const dx = x + (w - dw) / 2 + (px * (dw - w)) / 2,
      dy = y + (h - dh) / 2 + (py * (dh - h)) / 2;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    try {
      c.drawImage(src, dx, dy, dw, dh);
    } catch (e) {}
    c.restore();
  }
  function outroWords() {
    return (val("outroText") || "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  }

  /* video element pool keyed per segment item */
  const live = new Map();
  function manageVideos(t, running, exact) {
    if (!TL) return;
    for (const s of TL.segs) {
      for (const [k, it] of s.items.entries()) {
        if (it.m.type !== "video") continue;
        const key = s.start.toFixed(3) + "_" + k;
        const near = t > s.start - 1.6 && t < s.start + s.dur + 0.25;
        let v = live.get(key);
        if (near && !v) {
          v = document.createElement("video");
          v.muted = true;
          v.playsInline = true;
          v.preload = "auto";
          v.src = it.m.url;
          v.currentTime = it.inP;
          v._it = it;
          live.set(key, v);
        }
        if (v) {
          if (!near) {
            v.pause();
            v.removeAttribute("src");
            v.load();
            live.delete(key);
            continue;
          }
          const local = t - s.start;
          const exp = Math.min(it.inP + Math.max(0, local) * it.rate, (v.duration || 1e9) - 0.06);
          v._exp = exp;
          if (local >= 0 && running) {
            if (v.paused) {
              v.playbackRate = it.rate;
              v.play().catch(() => {});
            }
            if (Math.abs(v.currentTime - exp) > 0.25 && !v.seeking) v.currentTime = exp;
          } else if (!running && local >= 0) {
            if (Math.abs(v.currentTime - exp) > (exact ? 0.004 : 0.05) && !v.seeking) v.currentTime = exp;
          }
        }
      }
    }
  }
  function clearVideos() {
    for (const v of live.values()) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    live.clear();
  }
  function srcFor(s, k) {
    const it = s.items[k];
    if (it.m.type === "image") return { el: it.m.el, w: it.m.w, h: it.m.h };
    const v = live.get(s.start.toFixed(3) + "_" + k);
    if (v && v.readyState >= 2) return { el: v, w: v.videoWidth, h: v.videoHeight };
    return { el: it.m.thumb, w: 90, h: 160 };
  }

  function rects(kind, W, H) {
    const g = Math.round(W * 0.009);
    if (kind === "split3") {
      const h = (H - 2 * g) / 3;
      return [0, 1, 2].map((i) => [0, i * (h + g), W, h]);
    }
    if (kind === "grid6") {
      const w = (W - g) / 2,
        h = (H - 2 * g) / 3;
      const r = [];
      for (let i = 0; i < 6; i++) r.push([(i % 2) * (w + g), Math.floor(i / 2) * (h + g), w, h]);
      return r;
    }
    if (kind === "letterbox") return [[0, H * 0.19, W, H * 0.62]];
    return [[0, 0, W, H]];
  }

  function drawFrame(t) {
    const W = cv.width,
      H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (!TL || t < 0) return;
    const T = TL,
      B = T.B;
    const s = T.segs.find((x) => t >= x.start && t < x.start + x.dur) || T.segs[T.segs.length - 1];
    const local = t - s.start,
      p = local / s.dur;
    if (s.kind === "end") {
      drawEnd(local, s.dur, W, H);
      return;
    }
    // camera shake on montage bars
    let sx = 0,
      sy = 0;
    if (s.sec === "montage" && local < 0.18) {
      const a = (1 - local / 0.18) * W * 0.008;
      sx = Math.sin(t * 90) * a;
      sy = Math.cos(t * 70) * a;
    }
    if (s.sec === "intro" && t < 0.25) {
      const a = (1 - t / 0.25) * W * 0.012;
      sx = Math.sin(t * 80) * a;
      sy = Math.cos(t * 60) * a;
    }
    ctx.save();
    ctx.translate(sx, sy);
    const R = rects(s.kind, W, H);
    if (s.kind !== "single") {
      ctx.fillStyle = s.kind === "letterbox" ? "#000" : "#0b0d12";
      ctx.fillRect(0, 0, W, H);
    }
    R.forEach((r, k) => {
      const src = srcFor(s, k);
      let z = 1,
        px = 0,
        py = 0;
      const img = s.items[k].m.type === "image";
      if (s.zoom === "punch") z = 1 + 0.14 * (1 - ease(local / 0.32));
      else if (s.zoom === "push") z = 1.12 - 0.1 * easeIO(p);
      else if (s.zoom === "slow") z = 1.02 + 0.08 * p;
      if (img) {
        z *= 1.04 + 0.1 * p;
        px = (k % 2 ? 1 : -1) * 0.5 * (p - 0.5);
        py = 0.3 * (p - 0.5);
      }
      let [x, y, w, h] = r;
      if (s.kind === "split3" || s.kind === "grid6") {
        const d = clamp((local - k * (s.kind === "grid6" ? 0.04 : 0.07)) / 0.26, 0, 1);
        const e = ease(d);
        const off = (1 - e) * W * (k % 2 ? 1 : -1);
        x += off;
        ctx.globalAlpha = e;
      }
      drawCover(ctx, src.el, src.w, src.h, x, y, w, h, z, px, py);
      ctx.globalAlpha = 1;
    });
    if (s.kind === "split3" || s.kind === "grid6") {
      ctx.fillStyle = "rgba(225,232,245,.9)";
      const g = Math.max(2, Math.round(W * 0.004));
      R.forEach(([x, y, w, h]) => {
        if (y > 0) ctx.fillRect(0, y - g * 1.5, W, g);
        if (x > 0) ctx.fillRect(x - g * 1.5, y, g, h);
      });
    }
    ctx.restore();
    grade(W, H);
    // bar flash in montage
    if (s.sec === "montage" && s.bar && local < 0.12) {
      ctx.fillStyle = `rgba(255,255,255,${0.28 * (1 - local / 0.12)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // light leaks
    leak(t - 4 * B, W, H, 0);
    leak(t - T.outroStart, W, H, 1);
    if (T.hasWord) {
      const d = t - T.wordStart;
      if (d > -0.12 && d < 0.35) {
        const a = d < 0 ? (d + 0.12) / 0.12 : 1 - d / 0.35;
        ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    const d0 = t - T.montageStart;
    if (d0 > -0.05 && d0 < 0.2) {
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - Math.abs(d0 - 0.02) / 0.2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // word overlays
    if (T.hasWord && t >= T.wordStart && t < T.wordEnd)
      drawWord(t - T.wordStart, T.wordEnd - T.wordStart, W, H);
    if (s.text) drawOutroText(t - T.textStart, W, H, t);
    // fade to black before end card
    const fe = T.endStart - t;
    if (fe < 0.12) {
      ctx.fillStyle = `rgba(0,0,0,${1 - fe / 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }
    if ($("#showWm").checked) watermark(W, H, s.kind === "split3" ? "left" : "right");
    drawLogoSmall(W, H);
  }
  function grade(W, H) {
    const g = val("grade");
    ctx.save();
    if (g === "cool") {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(30,80,255,.42)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(0,20,60,.18)";
      ctx.fillRect(0, 0, W, H);
    } else if (g === "warm") {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(255,150,60,.38)";
      ctx.fillRect(0, 0, W, H);
    } else if (g === "film") {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(0,90,110,.32)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(255,170,90,.12)";
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "source-over";
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  function leak(d, W, H, warm) {
    if (d < -0.45 || d > 0.6) return;
    const a = d < 0 ? ease((d + 0.45) / 0.45) : 1 - ease(d / 0.6);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const cols = warm
      ? ["255,150,60", "255,90,140", "255,240,210"]
      : ["255,120,40", "255,60,120", "255,255,255"];
    const mv = (d + 0.45) / 1.05;
    [
      [0.2 + mv * 0.9, 0.25, 0.9],
      [0.95 - mv * 0.7, 0.65, 0.8],
      [0.6, 0.4 + mv * 0.2, 0.6],
    ].forEach(([x, y, r], i) => {
      const g = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * r * 1.3);
      g.addColorStop(0, `rgba(${cols[i]},${0.95 * a})`);
      g.addColorStop(1, `rgba(${cols[i]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    if (Math.abs(d) < 0.12) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - Math.abs(d) / 0.12)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  function igGlyph(c, x, y, s, stroke, lw) {
    c.save();
    c.lineWidth = lw || s * 0.09;
    c.strokeStyle = stroke;
    c.fillStyle = stroke;
    const r = s * 0.28;
    c.beginPath();
    c.roundRect ? c.roundRect(x - s / 2, y - s / 2, s, s, r) : c.rect(x - s / 2, y - s / 2, s, s);
    c.stroke();
    c.beginPath();
    c.arc(x, y, s * 0.23, 0, 7);
    c.stroke();
    c.beginPath();
    c.arc(x + s * 0.27, y - s * 0.27, s * 0.055, 0, 7);
    c.fill();
    c.restore();
  }
  function watermark(W, H, pos) {
    const s = W * 0.042;
    const x = pos === "left" ? W * 0.075 : W * 0.86,
      y = pos === "left" ? H * 0.415 : H * 0.1;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = W * 0.008;
    igGlyph(ctx, x, y, s, "#fff");
    ctx.font = `400 ${Math.round(W * 0.02)}px Anton`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = pos === "left" ? "left" : "center";
    ctx.textBaseline = "top";
    ctx.fillText(val("handle").toUpperCase(), pos === "left" ? x - s / 2 : x, y + s * 0.85);
    ctx.restore();
  }
  function drawLogoSmall(W, H) {
    if (!S.logo) return;
    const r = W * 0.026;
    const x = W / 2,
      y = H * 0.965;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fill();
    ctx.clip();
    const lw = S.logo.naturalWidth,
      lh = S.logo.naturalHeight,
      sc = Math.min((r * 1.6) / lw, (r * 1.6) / lh);
    ctx.drawImage(S.logo, x - (lw * sc) / 2, y - (lh * sc) / 2, lw * sc, lh * sc);
    ctx.restore();
  }
  function wrap(c, text, maxW) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (c.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function drawWord(lt, dur, W, H) {
    const title = val("msgTitle").trim(),
      min = val("minister").trim(),
      lab = val("wordLabel").trim();
    const show = 4.6,
      a = lt < show ? ease(lt / 0.5) * (lt > show - 0.5 ? 1 - ease((lt - (show - 0.5)) / 0.5) : 1) : 0;
    if (a > 0 && (title || lab || min)) {
      ctx.save();
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
      const off = (1 - ease(lt / 0.6)) * H * 0.03;
      let y = H * 0.73 + off;
      ctx.globalAlpha = a;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const x = W * 0.075;
      if (lab) {
        ctx.font = `800 ${Math.round(W * 0.03)}px Archivo`;
        ctx.fillStyle = "#7fb0ff";
        ctx.letterSpacing = W * 0.006 + "px";
        ctx.fillText(lab.toUpperCase(), x, y);
        ctx.letterSpacing = "0px";
        const lw = ctx.measureText(lab.toUpperCase()).width + lab.length * W * 0.006;
        ctx.fillRect(x, y + W * 0.014, Math.min(lw, W * 0.25) * ease(lt / 0.8), W * 0.004);
        y += W * 0.1;
      }
      if (title) {
        ctx.font = `400 ${Math.round(W * 0.085)}px Anton`;
        ctx.fillStyle = "#fff";
        wrap(ctx, title.toUpperCase(), W * 0.85)
          .slice(0, 3)
          .forEach((l) => {
            ctx.fillText(l, x, y);
            y += W * 0.095;
          });
      }
      if (min) {
        ctx.font = `600 ${Math.round(W * 0.036)}px Archivo`;
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.fillText("— " + min, x, y + W * 0.01);
      }
      ctx.restore();
    }
    if ($("#showWave").checked && MIX && MIX.venv) {
      const vt = lt - 0.25;
      if (vt < 0 || vt > TL.msgLen) return;
      const fr = Math.floor(vt * 30);
      const nb = 32,
        bw = W * 0.012,
        gap = W * 0.008,
        tot = nb * (bw + gap);
      let x = (W - tot) / 2;
      const yb = H * 0.915;
      const fa = Math.min(1, vt / 0.4, (TL.msgLen - vt) / 0.4);
      ctx.save();
      ctx.globalAlpha = 0.85 * fa;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < nb; i++) {
        const idx = (fr - Math.abs(i - nb / 2)) | 0;
        const v = MIX.venv[Math.max(0, idx)] || 0;
        const h = W * 0.006 + v * W * 0.07 * (1 - Math.abs(i - nb / 2) / (nb * 0.7));
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, yb - h / 2, bw, h, bw / 2) : ctx.rect(x, yb - h / 2, bw, h);
        ctx.fill();
        x += bw + gap;
      }
      ctx.restore();
    }
  }
  const textCache = new Map();
  function wordSprite(word, size) {
    const key = word + size;
    if (textCache.has(key)) return textCache.get(key);
    const c = document.createElement("canvas");
    const x = c.getContext("2d");
    x.font = `400 ${size}px "Bowlby One"`;
    const w = Math.ceil(x.measureText(word).width + size * 0.5);
    c.width = w;
    c.height = Math.ceil(size * 1.35);
    x.font = `400 ${size}px "Bowlby One"`;
    x.textBaseline = "middle";
    x.lineJoin = "round";
    x.lineWidth = size * 0.16;
    x.strokeStyle = "#0a0a0a";
    x.strokeText(word, size * 0.25, c.height / 2);
    x.fillStyle = "#fff";
    x.fillText(word, size * 0.25, c.height / 2);
    textCache.set(key, c);
    return c;
  }
  function drawOutroText(lt, W, H, t) {
    const words = outroWords();
    if (!words.length || lt < 0) return;
    const B = TL.B;
    ctx.save();
    const base = W * 0.19;
    let y = H * 0.035;
    words.forEach((w, i) => {
      const st = i * B * 0.5,
        d = lt - st;
      if (d < 0) return;
      ctx.font = `400 ${base}px "Bowlby One"`;
      const mw = ctx.measureText(w).width;
      const size = Math.min(base, (base * (W * 0.78)) / mw);
      const spr = wordSprite(w, Math.round(size));
      const sc = back(d / 0.3);
      const rot = (i % 2 ? 1 : -1) * 0.05 * (1 - ease(d / 0.4));
      const cx = W * 0.07 + spr.width / 2,
        cy = y + spr.height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      const sl = Math.max(2, Math.round(W / 270));
      for (let x = 0; x < spr.width; x += sl) {
        const off = Math.sin(x * 0.018 + t * 3.2 + i) * size * 0.07;
        ctx.drawImage(spr, x, 0, sl, spr.height, x - spr.width / 2, -spr.height / 2 + off, sl, spr.height);
      }
      ctx.restore();
      y += spr.height * 0.68;
    });
    ctx.restore();
  }
  function drawEnd(lt, dur, W, H) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const s = W * 0.13 * back(lt / 0.35);
    const cy = S.logo ? H * 0.43 : H * 0.4;
    const gr = ctx.createLinearGradient(W / 2 - s / 2, cy + s / 2, W / 2 + s / 2, cy - s / 2);
    ["#feda75", "#fa7e1e", "#d62976", "#962fbf", "#4f5bd5"].forEach((c, i) => gr.addColorStop(i / 4, c));
    const sw = clamp((lt - 1.1) / 0.35, 0, 1);
    if (S.logo) {
      const a = ease((lt - 0.2) / 0.5);
      const lw = S.logo.naturalWidth,
        lh = S.logo.naturalHeight,
        sc = Math.min((W * 0.22) / lw, (W * 0.22) / lh);
      ctx.globalAlpha = a;
      ctx.drawImage(S.logo, W / 2 - (lw * sc) / 2, H * 0.25 - (lh * sc) / 2 + (1 - a) * 20, lw * sc, lh * sc);
      ctx.globalAlpha = 1;
    }
    if (s > 0) {
      ctx.globalAlpha = 1 - sw;
      igGlyph(ctx, W / 2, cy, s, gr, s * 0.1);
      ctx.globalAlpha = sw;
      igGlyph(ctx, W / 2, cy, s, "#fff", s * 0.1);
      ctx.globalAlpha = 1;
    }
    const ha = ease((lt - 0.15) / 0.4);
    ctx.globalAlpha = ha;
    ctx.fillStyle = "#fff";
    ctx.font = `400 ${Math.round(W * 0.05)}px Anton`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(val("handle").toUpperCase(), W / 2, cy + s * 0.75 + (1 - ha) * 12);
    const lines = val("details")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 6);
    let y = cy + s * 0.75 + W * 0.1;
    lines.forEach((l, i) => {
      const a = ease((lt - 0.7 - i * 0.15) / 0.4);
      ctx.globalAlpha = a;
      ctx.font = `${i === 0 ? 800 : 400} ${Math.round(W * (i === 0 ? 0.036 : 0.032))}px Archivo`;
      ctx.fillStyle = i === 0 ? "#fff" : "rgba(255,255,255,.72)";
      ctx.fillText(l, W / 2, y + (1 - a) * 14);
      y += W * 0.055;
    });
    ctx.globalAlpha = 1;
    const fo = dur - lt;
    if (fo < 0.35) {
      ctx.fillStyle = `rgba(0,0,0,${1 - fo / 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------- timeline UI ---------------- */
  const secCol = { intro: "#2a4fd6", montage: "#3d7bff", word: "#7a4dff", outro: "#ff7a3d", end: "#333a4d" };
  function drawTL() {
    const tl = $("#tl");
    tl.querySelectorAll("div").forEach((d) => d.remove());
    if (!TL) {
      $("#tTot").textContent = "0:00";
      return;
    }
    const secs = [];
    TL.segs.forEach((s) => {
      const l = secs[secs.length - 1];
      if (l && l.sec === s.sec) l.dur += s.dur;
      else secs.push({ sec: s.sec, dur: s.dur });
    });
    secs.forEach((x) => {
      const d = document.createElement("div");
      d.style.flex = x.dur;
      d.style.background = secCol[x.sec];
      d.textContent = x.dur > 2.5 ? x.sec : "";
      tl.insertBefore(d, $("#ph"));
    });
    $("#tTot").textContent = fmt(TL.total);
  }
  let invT = 0;
  function invalidate() {
    clearTimeout(invT);
    invT = setTimeout(() => {
      if (playing) return;
      TL = buildTimeline();
      MIX = null;
      drawTL();
      const ok = !!TL;
      $("#bPlay").disabled = !ok;
      $("#bRender").disabled = !ok;
      $("#ov").style.display = ok ? "none" : "grid";
      if (ok) {
        setCanvas(720);
        manageVideos(1, false);
        setTimeout(() => drawFrame(1), 400);
      }
    }, 150);
  }
  function setCanvas(r) {
    const w = r === 1080 ? 1080 : 720,
      h = (w * 16) / 9;
    if (cv.width !== w) {
      cv.width = w;
      cv.height = h;
      ctx = cv.getContext("2d");
      textCache.clear();
    }
  }
  ["input", "change"].forEach((e) =>
    document.querySelectorAll("#controls input,#controls select,#controls textarea").forEach((el) =>
      el.addEventListener(e, () => {
        syncOut();
        if (el.type !== "file") invalidate();
      }),
    ),
  );
  function syncOut() {
    $("#oMsgStart").textContent = num("msgStart").toFixed(1);
    $("#oMsgLen").textContent = num("msgLen");
    ["musicVol", "sfxVol", "voiceVol"].forEach(
      (k) => ($("#o" + k[0].toUpperCase() + k.slice(1)).textContent = Math.round(num(k) * 100) + "%"),
    );
  }
  syncOut();

  /* ---------------- playback / render ---------------- */
  async function ensureMix() {
    TL = buildTimeline();
    drawTL();
    setStatus("Building the soundtrack…");
    await document.fonts.load('40px "Bowlby One"');
    await document.fonts.load("40px Anton");
    await document.fonts.load("800 20px Archivo");
    MIX = await buildMix(TL);
    setStatus("");
  }
  async function waitReady(t) {
    manageVideos(t, false);
    const deadline = performance.now() + 6000;
    while (performance.now() < deadline) {
      let ok = true;
      for (const v of live.values()) if (v.readyState < 2) ok = false;
      if (ok) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  async function run(record) {
    if (playing) {
      stop();
      return;
    }
    const ac = AC();
    await ac.resume();
    setCanvas(record ? parseInt(val("res")) : 720);
    $("#bPlay").disabled = record;
    $("#bRender").disabled = !record;
    try {
      await ensureMix();
    } catch (e) {
      console.error(e);
      setStatus("Soundtrack failed: " + e.message);
      $("#bPlay").disabled = $("#bRender").disabled = false;
      return;
    }
    clearVideos();
    await waitReady(-0.5);
    const src = ac.createBufferSource();
    src.buffer = MIX.buf;
    const dest = ac.createMediaStreamDestination();
    if (!window.__headless) src.connect(ac.destination);
    src.connect(dest);
    let rec = null,
      chunks = [],
      mime = "";
    if (record) {
      const stream = new MediaStream([
        ...cv.captureStream(30).getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
      const types = [
        "video/mp4;codecs=avc1.640028,mp4a.40.2",
        "video/mp4;codecs=avc1,mp4a",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      mime = types.find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || "";
      rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: parseInt(val("res")) === 1080 ? 12e6 : 7e6,
        audioBitsPerSecond: 192000,
      });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      $("#bar").style.display = "block";
      $("#result").style.display = "none";
    }
    const t0 = ac.currentTime + 0.25;
    src.start(t0);
    playing = { src, rec, record };
    let started = false;
    $(record ? "#bRender" : "#bPlay").textContent = "■ Stop";
    const loop = () => {
      if (!playing) return;
      const t = ac.currentTime - t0;
      if (rec && !started && t >= -0.02) {
        rec.start(500);
        started = true;
      }
      manageVideos(t, true);
      drawFrame(t);
      $("#ph").style.left = clamp(t / TL.total, 0, 1) * 100 + "%";
      $("#tNow").textContent = fmt(t);
      if (record) {
        $("#bar i").style.width = clamp(t / TL.total, 0, 1) * 100 + "%";
        setStatus("Rendering… " + Math.round(clamp(t / TL.total, 0, 1) * 100) + "% (keep this tab visible)");
      }
      if (t >= TL.total + 0.15) {
        finish();
        return;
      }
      requestAnimationFrame(loop);
    };
    const finish = () => {
      const p = playing;
      playing = null;
      try {
        p.src.stop();
      } catch (e) {}
      clearVideos();
      resetBtns();
      if (p.rec) {
        p.rec.onstop = () => {
          const blob = new Blob(chunks, { type: mime.split(";")[0] || "video/webm" });
          done(blob, mime);
        };
        p.rec.stop();
      } else setStatus("");
    };
    playing.finish = finish;
    requestAnimationFrame(loop);
  }
  function stop() {
    if (playing && playing.finish) {
      const r = playing.rec;
      if (r) {
        playing.rec = null;
      }
      playing.finish();
      if (r) {
        try {
          r.stop();
        } catch (e) {}
        setStatus("Render cancelled.");
        $("#bar").style.display = "none";
      }
    }
  }
  function resetBtns() {
    $("#bPlay").textContent = "▶ Preview";
    $("#bRender").textContent = "● Render video";
    $("#bPlay").disabled = $("#bRender").disabled = !TL;
  }
  let OUT = null;
  function done(blob, mime) {
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    OUT = { blob, name: `recap-reel-${new Date().toISOString().slice(0, 10)}.${ext}` };
    window.__lastRender = OUT;
    $("#outVid").src = URL.createObjectURL(blob);
    $("#result").style.display = "block";
    $("#bar").style.display = "none";
    setStatus(
      `Done: ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}.` +
        (ext === "webm"
          ? " This browser saves WebM. Instagram and TikTok accept it, or use Safari/Chrome 126+ to get MP4."
          : ""),
    );
    if (window.__onRendered) window.__onRendered(OUT);
  }
  $("#bPlay").onclick = () => run(false);
  $("#bRender").onclick = () => run(true);
  let dl = null;
  try {
    if (window.claude && window.claude.use)
      window.claude
        .use("downloads")
        .then((d) => (dl = d))
        .catch(() => {});
  } catch (e) {}
  $("#bDl").onclick = async () => {
    if (!OUT) return;
    if (dl) {
      try {
        await dl.save({ filename: OUT.name, data: OUT.blob });
        return;
      } catch (e) {
        if (e && e.code === "declined") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(OUT.blob);
    a.download = OUT.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* automation hook (used by the Claude skill to render headlessly) */
  function wavBlob(b) {
    const n = b.length,
      ch = 2,
      buf = new ArrayBuffer(44 + n * ch * 2),
      v = new DataView(buf);
    const w = (o, s) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, "RIFF");
    v.setUint32(4, 36 + n * ch * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, ch, true);
    v.setUint32(24, b.sampleRate, true);
    v.setUint32(28, b.sampleRate * ch * 2, true);
    v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true);
    w(36, "data");
    v.setUint32(40, n * ch * 2, true);
    const L = b.getChannelData(0),
      R = b.getChannelData(1);
    let o = 44;
    for (let i = 0; i < n; i++) {
      v.setInt16(o, clamp(L[i], -1, 1) * 32767, true);
      v.setInt16(o + 2, clamp(R[i], -1, 1) * 32767, true);
      o += 4;
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  async function prepFrame(t) {
    manageVideos(t, false, true);
    const end = performance.now() + 4000;
    while (performance.now() < end) {
      let ok = true;
      for (const v of live.values()) {
        if (v._exp === undefined) continue;
        if (v.seeking || v.readyState < 2) {
          ok = false;
          break;
        }
        if (Math.abs(v.currentTime - v._exp) > 0.01) {
          if (!v.seeking) v.currentTime = v._exp;
          ok = false;
          break;
        }
      }
      if (ok) return;
      await new Promise((r) => setTimeout(r, 4));
    }
  }
  window.ReelAPI = {
    async load(cfg) {
      for (const [k, v] of Object.entries(cfg.fields || {})) {
        const el = $("#" + k);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = !!v;
        else el.value = v;
      }
      const toFile = async (u, n) => {
        const r = await fetch(u);
        const b = await r.blob();
        return new File([b], n || u.split("/").pop(), { type: b.type });
      };
      for (const m of cfg.media || []) await addMediaFile(await toFile(m));
      if (cfg.message) await setMessage(await toFile(cfg.message));
      if (cfg.music) await setMusic(await toFile(cfg.music));
      if (cfg.logo) await setLogo(await toFile(cfg.logo));
      for (const [k, v] of Object.entries(cfg.after || {})) {
        const el = $("#" + k);
        if (el) el.value = v;
      }
      syncOut();
      TL = buildTimeline();
      drawTL();
      return { total: TL && TL.total, bpm: num("bpm"), bad: S.media.filter((m) => !m.ok).map((m) => m.name) };
    },
    async renderFrames(fps = 30, post = "/upload/") {
      setCanvas(parseInt(val("res")));
      await ensureMix();
      await fetch(post + "audio.wav", { method: "POST", body: wavBlob(MIX.buf) });
      clearVideos();
      const N = Math.ceil(TL.total * fps);
      for (let f = 0; f < N; f++) {
        const t = f / fps;
        await prepFrame(t);
        drawFrame(t);
        const b = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.93));
        await fetch(post + "f" + String(f).padStart(6, "0") + ".jpg", { method: "POST", body: b });
        if (f % 30 === 0) console.log("frame " + f + "/" + N);
      }
      clearVideos();
      return { frames: N, fps, total: TL.total, bpm: num("bpm") };
    },
    render() {
      return new Promise((res) => {
        window.__onRendered = async (o) => {
          const b = new Uint8Array(await o.blob.arrayBuffer());
          let s = "";
          for (let i = 0; i < b.length; i += 0x8000)
            s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
          res({ name: o.name, b64: btoa(s) });
        };
        run(true);
      });
    },
  };
})();
