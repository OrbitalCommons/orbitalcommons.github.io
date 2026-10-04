// Shared star-map core: Hipparcos catalogue unpacking, stereographic projection, planets for a
// date, and the drawing passes used by the hero (sky.js) and the static sky art (sky-art.js).
// Requires assets/stars.js. Vanilla JS, no dependencies.
(function () {
  "use strict";
  var D2R = Math.PI / 180;
  var COLORS = ["#a8bfff", "#d0dcff", "#f6f6ff", "#fff1df", "#ffd9a8", "#ffbf80"];
  var PCOL = { Mercury: "#c9c3b8", Venus: "#fff3d6", Mars: "#ff9a6b", Jupiter: "#f3d9b0", Saturn: "#e8d18f", Uranus: "#a9e7ef", Neptune: "#8fa8ff" };

  function radec(ra, dec) {
    ra *= D2R; dec *= D2R;
    return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  }
  function toRaDec(v) {
    var ra = Math.atan2(v[1], v[0]) / D2R;
    if (ra < 0) ra += 360;
    return [ra, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D2R];
  }
  function pad(v) { return v < 10 ? "0" + v : "" + v; }
  // Round to whole seconds of time and whole arcminutes, carrying into the larger units.
  function fmtRa(ra) {
    var t = Math.round(((ra % 360) + 360) % 360 / 15 * 3600) % 86400;
    return pad(Math.floor(t / 3600)) + "h " + pad(Math.floor(t / 60) % 60) + "m " + pad(t % 60) + "s";
  }
  function fmtDec(dec) {
    var t = Math.round(Math.abs(dec) * 60), s = dec < 0 && t > 0 ? "−" : "+";
    return s + pad(Math.floor(t / 60)) + "° " + pad(t % 60) + "′";
  }
  function hexA(h, a) {
    var v = parseInt(h.slice(1), 16);
    return "rgba(" + (v >> 16) + "," + (v >> 8 & 255) + "," + (v & 255) + "," + a + ")";
  }

  // Catalogue, unpacked once into unit vectors. Stars arrive sorted by brightness.
  var cat = null;
  function catalog() {
    if (cat) return cat;
    var data = window.OC_SKY, raw = data.stars, n = raw.length / 4;
    cat = {
      n: n, raw: raw, names: data.names,
      X: new Float32Array(n), Y: new Float32Array(n), Z: new Float32Array(n),
      MAG: new Float32Array(n), COL: new Uint8Array(n), PH: new Float32Array(n),
      lineSets: Object.keys(data.lines).map(function (k) { return data.lines[k]; })
    };
    for (var i = 0; i < n; i++) {
      var v = radec(raw[4 * i] / 20, raw[4 * i + 1] / 20), bv = raw[4 * i + 3] / 100;
      cat.X[i] = v[0]; cat.Y[i] = v[1]; cat.Z[i] = v[2];
      cat.MAG[i] = raw[4 * i + 2] / 10;
      cat.COL[i] = bv < -0.1 ? 0 : bv < 0.15 ? 1 : bv < 0.45 ? 2 : bv < 0.75 ? 3 : bv < 1.1 ? 4 : 5;
      cat.PH[i] = Math.random() * 6.283;
    }
    // Everything from FAINT on never twinkles and is batch drawn in colour and magnitude bins.
    var FAINT = 0, groups = [], gkey = {};
    while (FAINT < n && cat.MAG[FAINT] < 3.9) FAINT++;
    for (var fi = FAINT; fi < n; fi++) {
      var bin = Math.floor((cat.MAG[fi] - 3.9) / 0.4), key = cat.COL[fi] * 64 + bin;
      if (!gkey[key]) { gkey[key] = { col: cat.COL[fi], mag: 3.9 + (bin + 0.5) * 0.4, idx: [] }; groups.push(gkey[key]); }
      gkey[key].idx.push(fi);
    }
    cat.FAINT = FAINT;
    cat.groups = groups;
    return cat;
  }

  // Glow sprites, one per colour class, and the Milky Way blob.
  var sprites = null, blob = null;
  function makeSprites() {
    if (sprites) return;
    var SPR = 64;
    sprites = COLORS.map(function (c) {
      var s = document.createElement("canvas");
      s.width = s.height = SPR;
      var g = s.getContext("2d"), grd = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(0.12, c);
      grd.addColorStop(0.3, hexA(c, 0.35));
      grd.addColorStop(1, hexA(c, 0));
      g.fillStyle = grd;
      g.fillRect(0, 0, SPR, SPR);
      return s;
    });
    blob = document.createElement("canvas");
    blob.width = blob.height = 128;
    var g = blob.getContext("2d"), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(150,170,255,0.5)");
    grd.addColorStop(0.5, "rgba(120,130,230,0.18)");
    grd.addColorStop(1, "rgba(100,110,220,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }

  // Milky Way: points along the galactic equator, brightest toward the galactic centre.
  var band = (function () {
    var GC = radec(266.405, -28.936), GN = radec(192.859, 27.128);
    var GB = [GN[1] * GC[2] - GN[2] * GC[1], GN[2] * GC[0] - GN[0] * GC[2], GN[0] * GC[1] - GN[1] * GC[0]], out = [];
    for (var l = 0; l < 360; l += 5) {
      var cl = Math.cos(l * D2R), sl = Math.sin(l * D2R), wob = 0.06 * Math.sin(l * D2R * 3);
      out.push([cl * GC[0] + sl * GB[0] + wob * GN[0], cl * GC[1] + sl * GB[1] + wob * GN[1], cl * GC[2] + sl * GB[2] + wob * GN[2],
        0.35 + 0.65 * Math.pow((1 + cl) / 2, 2.2)]);
    }
    return out;
  })();

  // Planets for a date, J2000 frame to match the catalogue.
  // JPL "Approximate Positions of the Planets" (Standish), valid 1800-2050.
  var EL = {
    Mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
    Venus: [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
    Earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
    Mars: [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
    Jupiter: [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
    Saturn: [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
    Uranus: [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589],
    Neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664]
  };
  function helio(e, T) {
    var a = e[0] + e[1] * T, ec = e[2] + e[3] * T, I = (e[4] + e[5] * T) * D2R,
      L = e[6] + e[7] * T, w = e[8] + e[9] * T, O = e[10] + e[11] * T;
    var M = ((L - w) % 360 + 540) % 360 - 180, E = M * D2R;
    for (var k = 0; k < 8; k++) E -= (E - ec * Math.sin(E) - M * D2R) / (1 - ec * Math.cos(E));
    var xp = a * (Math.cos(E) - ec), yp = a * Math.sqrt(1 - ec * ec) * Math.sin(E);
    var om = (w - O) * D2R, Or = O * D2R, co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Or), sO = Math.sin(Or), cI = Math.cos(I), sI = Math.sin(I);
    return [(co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
      (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
      so * sI * xp + co * sI * yp];
  }
  function planets(ms) {
    var T = (ms / 86400000 + 2440587.5 - 2451545) / 36525, eps = 23.43928 * D2R;
    var earth = helio(EL.Earth, T);
    return Object.keys(EL).filter(function (k) { return k !== "Earth"; }).map(function (k) {
      var p = helio(EL[k], T), x = p[0] - earth[0], y = p[1] - earth[1], z = p[2] - earth[2];
      var ye = y * Math.cos(eps) - z * Math.sin(eps), ze = y * Math.sin(eps) + z * Math.cos(eps), r = Math.sqrt(x * x + ye * ye + ze * ze);
      return { name: k, x: x / r, y: ye / r, z: ze / r, color: PCOL[k] };
    });
  }

  // A camera onto the celestial sphere with screen-space buffers for every star.
  function View() {
    var c = catalog();
    makeSprites();
    this.cat = c;
    this.SX = new Float32Array(c.n);
    this.SY = new Float32Array(c.n);
    this.VIS = new Uint8Array(c.n);
    this.W = this.H = 0; this.dpr = 1; this.scale = 1; this.cx = this.cy = 0; this.nDraw = c.n;
    this.boost = 0; // magnitudes added to every star's apparent brightness, for zoomed-in views
    this.bandRes = 8; // Milky Way buffer is 1/bandRes of the screen in each direction
    this.f = [1, 0, 0]; this.e = [0, 1, 0]; this.nn = [0, 0, 1];
    this.bandC = document.createElement("canvas");
    this.bctx = this.bandC.getContext("2d");
  }
  View.prototype.size = function (W, H, fovDeg, magLimit) {
    this.W = W; this.H = H;
    this.scale = (W / 2) / (2 * Math.tan(fovDeg * D2R / 4));
    this.cx = W / 2; this.cy = H / 2;
    this.bandC.width = Math.max(1, Math.round(W / this.bandRes));
    this.bandC.height = Math.max(1, Math.round(H / this.bandRes));
    var m = this.cat.MAG, n = this.cat.n, lim = magLimit || 99, k = 0;
    while (k < n && m[k] <= lim) k++;
    this.nDraw = k;
  };
  View.prototype.point = function (ra, dec) {
    var a = ra * D2R, d = dec * D2R, ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d);
    this.f = [cd * ca, cd * sa, sd];
    this.e = [-sa, ca, 0];
    this.nn = [-sd * ca, -sd * sa, cd];
  };
  // Sky unit vector -> screen. East is to the left when looking up at the sky.
  View.prototype.project = function (x, y, z, out) {
    var f = this.f, e = this.e, nn = this.nn, zc = x * f[0] + y * f[1] + z * f[2];
    if (zc < -0.15) return false;
    var k = 2 / (1 + zc) * this.scale;
    out[0] = this.cx - k * (x * e[0] + y * e[1]);
    out[1] = this.cy - k * (x * nn[0] + y * nn[1] + z * nn[2]);
    return true;
  };
  View.prototype.unproject = function (sx, sy) {
    var px = (this.cx - sx) / this.scale, py = (this.cy - sy) / this.scale, r2 = px * px + py * py;
    var zc = (4 - r2) / (4 + r2), k = (1 + zc) / 2, xe = px * k, yn = py * k, f = this.f, e = this.e, nn = this.nn;
    return [xe * e[0] + yn * nn[0] + zc * f[0], xe * e[1] + yn * nn[1] + zc * f[1], yn * nn[2] + zc * f[2]];
  };
  View.prototype.layout = function () {
    var c = this.cat, pt = [0, 0], W = this.W, H = this.H;
    for (var i = 0; i < c.n; i++) {
      if (i < this.nDraw && this.project(c.X[i], c.Y[i], c.Z[i], pt) && pt[0] > -40 && pt[0] < W + 40 && pt[1] > -40 && pt[1] < H + 40) {
        this.SX[i] = pt[0]; this.SY[i] = pt[1]; this.VIS[i] = 1;
      } else this.VIS[i] = 0;
    }
  };
  // The Milky Way is soft, so it renders into a low-resolution buffer; pass reuse to skip a refresh.
  View.prototype.drawBand = function (ctx, reuse) {
    if (!reuse) {
      var bw = this.bandC.width, q = bw / this.W, bs = this.scale * 0.62 * q, pt = [0, 0], b = this.bctx;
      b.clearRect(0, 0, bw, this.bandC.height);
      for (var i = 0; i < band.length; i++) {
        var B = band[i];
        if (!this.project(B[0], B[1], B[2], pt)) continue;
        b.globalAlpha = 0.16 * B[3];
        b.drawImage(blob, pt[0] * q - bs, pt[1] * q - bs * 0.7, bs * 2, bs * 1.4);
      }
    }
    ctx.drawImage(this.bandC, 0, 0, this.W, this.H);
  };
  View.prototype.drawLines = function (ctx, alpha) {
    var L, SX = this.SX, SY = this.SY, VIS = this.VIS, sets = this.cat.lineSets;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(124,196,255," + (alpha || 0.2) + ")";
    ctx.beginPath();
    for (var s = 0; s < sets.length; s++) {
      L = sets[s];
      for (var j = 0; j < L.length; j += 2) {
        var a = L[j], b = L[j + 1];
        if (!VIS[a] || !VIS[b]) continue;
        var dx = SX[b] - SX[a], dy = SY[b] - SY[a], len = Math.sqrt(dx * dx + dy * dy);
        if (len < 9 || len > this.W * 0.6) continue;
        var g = 5 / len;
        ctx.moveTo(SX[a] + dx * g, SY[a] + dy * g);
        ctx.lineTo(SX[b] - dx * g, SY[b] - dy * g);
      }
    }
    ctx.stroke();
  };
  View.prototype.drawStars = function (ctx, t, twinkle) {
    var c = this.cat, SX = this.SX, SY = this.SY, VIS = this.VIS, nDraw = this.nDraw;
    for (var g = 0; g < c.groups.length; g++) {
      var G = c.groups[g], gm = G.mag - this.boost, gr = Math.max(0.65, 3.3 - gm * 0.48) * 0.62;
      ctx.globalAlpha = Math.max(0.24, Math.min(1, 1.4 - gm * 0.16));
      ctx.fillStyle = COLORS[G.col];
      ctx.beginPath();
      for (var gi = 0; gi < G.idx.length; gi++) {
        var q = G.idx[gi];
        if (q < nDraw && VIS[q]) ctx.rect(SX[q] - gr, SY[q] - gr, gr * 2, gr * 2);
      }
      ctx.fill();
    }
    // Bright stars individually, faintest first so glows sit on top.
    for (var k = c.FAINT - 1; k >= 0; k--) {
      if (!VIS[k]) continue;
      var m = c.MAG[k] - this.boost;
      var tw = twinkle && m < 3.5 ? 0.82 + 0.18 * Math.sin(t * (1.3 + (k % 7) * 0.31) + c.PH[k]) : 1;
      var alpha = Math.max(0.24, Math.min(1, 1.4 - m * 0.16)) * tw, r = Math.max(0.65, 3.3 - m * 0.48);
      ctx.globalAlpha = alpha;
      if (m < 3.2) {
        var gs = r * (m < 1 ? 9 : 7);
        ctx.drawImage(sprites[c.COL[k]], SX[k] - gs / 2, SY[k] - gs / 2, gs, gs);
      }
      ctx.fillStyle = COLORS[c.COL[k]];
      ctx.beginPath();
      ctx.arc(SX[k], SY[k], r * 0.62, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  // Index of the brightest-sorted visible star nearest (x, y) within radius, or -1.
  View.prototype.nearest = function (x, y, radius, maxMag) {
    var c = this.cat, best = -1, bd = radius * radius;
    for (var i = 0; i < c.n && c.MAG[i] < maxMag; i++) {
      if (!this.VIS[i]) continue;
      var dx = this.SX[i] - x, dy = this.SY[i] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  // Planets with a ring and a label; labelAlpha(x, y) returns the label opacity and an optional
  // Labels instance keeps planet names from overlapping other labels.
  View.prototype.drawPlanets = function (ctx, list, font, labelAlpha, labels) {
    var pt = [0, 0];
    ctx.font = font;
    ctx.lineWidth = 1;
    for (var i = 0; i < list.length; i++) {
      var P = list[i];
      if (!this.project(P.x, P.y, P.z, pt) || pt[0] < -20 || pt[0] > this.W + 20 || pt[1] < -20 || pt[1] > this.H + 20) continue;
      var pr = P.name === "Uranus" || P.name === "Neptune" ? 2 : 3.2;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sprites[3], pt[0] - pr * 4, pt[1] - pr * 4, pr * 8, pr * 8);
      ctx.fillStyle = P.color;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], pr, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,196,119,0.55)";
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], pr + 4, 0, 6.283);
      ctx.stroke();
      var la = labelAlpha ? labelAlpha(pt[0], pt[1]) : 0.9;
      if (la <= 0) continue;
      ctx.globalAlpha = la;
      ctx.fillStyle = "#ffc477";
      if (labels) labels.text(ctx, P.name, pt[0] + pr + 8, pt[1] - pr - 4, 11);
      else ctx.fillText(P.name, pt[0] + pr + 8, pt[1] - pr - 4);
    }
    ctx.globalAlpha = 1;
  };

  // Constellation label anchors: the normalised mean of each figure's stars. Serpens is split in
  // two on the sky, so its mean lands inside Ophiuchus and it is left unlabelled.
  var CNAMES = {
    And: "Andromeda", Ant: "Antlia", Aps: "Apus", Aql: "Aquila", Aqr: "Aquarius", Ara: "Ara", Ari: "Aries", Aur: "Auriga",
    Boo: "Boötes", CMa: "Canis Major", CMi: "Canis Minor", CVn: "Canes Venatici", Cae: "Caelum", Cam: "Camelopardalis",
    Cap: "Capricornus", Car: "Carina", Cas: "Cassiopeia", Cen: "Centaurus", Cep: "Cepheus", Cet: "Cetus", Cha: "Chamaeleon",
    Cir: "Circinus", Cnc: "Cancer", Col: "Columba", Com: "Coma Berenices", CrA: "Corona Australis", CrB: "Corona Borealis",
    Crt: "Crater", Cru: "Crux", Crv: "Corvus", Cyg: "Cygnus", Del: "Delphinus", Dor: "Dorado", Dra: "Draco", Equ: "Equuleus",
    Eri: "Eridanus", For: "Fornax", Gem: "Gemini", Gru: "Grus", Her: "Hercules", Hor: "Horologium", Hya: "Hydra", Hyi: "Hydrus",
    Ind: "Indus", LMi: "Leo Minor", Lac: "Lacerta", Leo: "Leo", Lep: "Lepus", Lib: "Libra", Lup: "Lupus", Lyn: "Lynx",
    Lyr: "Lyra", Men: "Mensa", Mic: "Microscopium", Mon: "Monoceros", Mus: "Musca", Nor: "Norma", Oct: "Octans",
    Oph: "Ophiuchus", Ori: "Orion", Pav: "Pavo", Peg: "Pegasus", Per: "Perseus", Phe: "Phoenix", Pic: "Pictor",
    PsA: "Piscis Austrinus", Psc: "Pisces", Pup: "Puppis", Pyx: "Pyxis", Ret: "Reticulum", Scl: "Sculptor", Sco: "Scorpius",
    Sct: "Scutum", Sex: "Sextans", Sge: "Sagitta", Sgr: "Sagittarius", Tau: "Taurus", Tel: "Telescopium",
    TrA: "Triangulum Australe", Tri: "Triangulum", Tuc: "Tucana", UMa: "Ursa Major", UMi: "Ursa Minor", Vel: "Vela",
    Vir: "Virgo", Vol: "Volans", Vul: "Vulpecula"
  };
  var anchors = null;
  function constellations() {
    if (anchors) return anchors;
    var c = catalog(), lines = window.OC_SKY.lines;
    anchors = Object.keys(lines).filter(function (k) { return CNAMES[k]; }).map(function (k) {
      var L = lines[k], x = 0, y = 0, z = 0;
      for (var i = 0; i < L.length; i++) { x += c.X[L[i]]; y += c.Y[L[i]]; z += c.Z[L[i]]; }
      var m = Math.sqrt(x * x + y * y + z * z) || 1;
      return { abbr: k, name: CNAMES[k], x: x / m, y: y / m, z: z / m };
    });
    return anchors;
  }

  // Quad roles and colours from the zodiacal Manim animation (CosmicFrontierLabs/cfl-manimations,
  // zodiacal_solver.py), so the same star plays the same role in the same colour everywhere.
  var QUAD = {
    A: "#FC6255", B: "#83C167", C: "#58C4DD", D: "#FF862F",
    AB: "#FFFF00", AX: "#58C4DD", circle: "#888888", label: "#BBBBBB", match: "#83C167"
  };

  // Geometric hash of four points (Lang et al. 2010, as in zodiacal): A and B are the most
  // distant pair; the similarity taking A to (0, 0) and B to (1, 1) carries C and D to the code
  // (cx, cy, dx, dy). As in zodiacal's enforce_invariants, A and B swap if cx + dx > 1 (mapping
  // each value v to 1 - v), then C and D are ordered so cx <= dx. `valid` requires C and D inside
  // the circle on AB as diameter. Points are [x, y]; returns the A, B, C, D order as indices.
  function quadCode(pts) {
    var a = 0, b = 1, best = -1;
    for (var i = 0; i < 4; i++) {
      for (var j = i + 1; j < 4; j++) {
        var d = Math.pow(pts[i][0] - pts[j][0], 2) + Math.pow(pts[i][1] - pts[j][1], 2);
        if (d > best) { best = d; a = i; b = j; }
      }
    }
    var rest = [0, 1, 2, 3].filter(function (k) { return k !== a && k !== b; });
    // z -> (z - A) / (B - A) * (1 + i), in complex arithmetic.
    var bx = pts[b][0] - pts[a][0], by = pts[b][1] - pts[a][1], den = bx * bx + by * by;
    if (!(den > 0) || !isFinite(den)) return { order: [0, 1, 2, 3], code: [0, 0, 0, 0], valid: false };
    function map(p) {
      var zx = p[0] - pts[a][0], zy = p[1] - pts[a][1];
      var qx = (zx * bx + zy * by) / den, qy = (zy * bx - zx * by) / den;
      return [qx - qy, qx + qy];
    }
    var c = map(pts[rest[0]]), d2 = map(pts[rest[1]]);
    if (c[0] + d2[0] > 1) {
      var t = a; a = b; b = t;
      c = c.map(function (v) { return 1 - v; });
      d2 = d2.map(function (v) { return 1 - v; });
    }
    if (c[0] > d2[0]) { var tmp = c; c = d2; d2 = tmp; rest.reverse(); }
    var inside = function (p) { return Math.pow(p[0] - 0.5, 2) + Math.pow(p[1] - 0.5, 2) < 0.5; };
    var code = [c[0], c[1], d2[0], d2[1]];
    return { order: [a, b, rest[0], rest[1]], code: code, valid: code.every(isFinite) && inside(c) && inside(d2) };
  }

  // Draw a quad given screen points in A, B, C, D order, as the Manim animation does: the dashed
  // grey circle on AB, the yellow AB line, cyan AC and AD lines, then the four role-coloured stars.
  // `progress` runs 0 to 1 through those steps; `font` labels the stars A to D.
  function drawQuad(ctx, pts, progress, alpha, font) {
    if (pts.some(function (p) { return !isFinite(p[0]) || !isFinite(p[1]); })) return;
    var q = progress, a = pts[0], b = pts[1];
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
    ctx.save();
    ctx.globalAlpha = 0.8 * alpha * Math.min(1, q * 3);
    ctx.strokeStyle = QUAD.circle;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, 6.283);
    ctx.stroke();
    ctx.setLineDash([]);
    var ab = Math.min(1, Math.max(0, (q - 0.2) / 0.3));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = QUAD.AB;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[0] + (b[0] - a[0]) * ab, a[1] + (b[1] - a[1]) * ab);
    ctx.stroke();
    var ax = Math.min(1, Math.max(0, (q - 0.5) / 0.3));
    ctx.strokeStyle = QUAD.AX;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var k = 2; k < 4; k++) {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(a[0] + (pts[k][0] - a[0]) * ax, a[1] + (pts[k][1] - a[1]) * ax);
    }
    ctx.stroke();
    var roles = ["A", "B", "C", "D"];
    ctx.font = font;
    for (var s = 0; s < 4; s++) {
      var show = Math.min(1, Math.max(0, (q - 0.15 * s) / 0.2));
      if (show <= 0) continue;
      ctx.globalAlpha = alpha * show;
      ctx.fillStyle = QUAD[roles[s]];
      ctx.beginPath();
      ctx.arc(pts[s][0], pts[s][1], 3.6, 0, 6.283);
      ctx.fill();
      ctx.fillText(roles[s], pts[s][0] + 6, pts[s][1] - 6);
    }
    ctx.restore();
  }

  // Draw "(cx, cy, dx, dy)" in the current font, cx and cy in C's colour and dx and dy in D's, as in
  // the Manim index table. Returns the drawn width.
  function drawCode(ctx, code, x, y, alpha) {
    var parts = code.map(function (v) { return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(2); });
    var bits = ["(", parts[0], ", ", parts[1], ", ", parts[2], ", ", parts[3], ")"];
    var colors = [QUAD.label, QUAD.C, QUAD.label, QUAD.C, QUAD.label, QUAD.D, QUAD.label, QUAD.D, QUAD.label];
    var cursor = x;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (var k = 0; k < bits.length; k++) {
      ctx.fillStyle = colors[k];
      ctx.fillText(bits[k], cursor, y);
      cursor += ctx.measureText(bits[k]).width;
    }
    ctx.restore();
    return cursor - x;
  }

  // Greedy label placement: returns false when the box overlaps one already placed. Callers place
  // labels brightest first, so crowded groups such as Orion's Belt keep their brightest name.
  function Labels() { this.boxes = []; }
  Labels.prototype.place = function (x, y, w, h) {
    for (var i = 0; i < this.boxes.length; i++) {
      var b = this.boxes[i];
      if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false;
    }
    this.boxes.push([x, y, w, h]);
    return true;
  };
  // Draw text at (x, y) baseline if its box is free; size from the current ctx.font.
  Labels.prototype.text = function (ctx, str, x, y, h) {
    var w = ctx.measureText(str).width;
    if (!this.place(x - 2, y - h, w + 4, h + 4)) return false;
    ctx.fillText(str, x, y);
    return true;
  };

  // A synthetic detector frame: catalogue stars under a gnomonic (TAN) projection centred on
  // (ra, dec), north up and east left, x right and y down in pixels, flux from V magnitude.
  // Brightest first; index is the star's position in the catalogue.
  function tanField(ra, dec, fovDeg, width, height, magLimit) {
    var c = catalog(), a = ra * D2R, d = dec * D2R, ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d);
    var f = [cd * ca, cd * sa, sd], e = [-sa, ca, 0], nn = [-sd * ca, -sd * sa, cd];
    var px = (width / 2) / Math.tan(fovDeg * D2R / 2), out = [];
    for (var i = 0; i < c.n && c.MAG[i] <= (magLimit || 99); i++) {
      var x = c.X[i], y = c.Y[i], z = c.Z[i], zc = x * f[0] + y * f[1] + z * f[2];
      if (zc <= 0) continue;
      var u = width / 2 - px * (x * e[0] + y * e[1]) / zc, v = height / 2 - px * (x * nn[0] + y * nn[1] + z * nn[2]) / zc;
      if (u >= 0 && u < width && v >= 0 && v < height) out.push({ x: u, y: v, flux: Math.pow(10, -0.4 * c.MAG[i]), index: i });
    }
    return out;
  }

  window.OCSky = {
    D2R: D2R, catalog: catalog, View: View, planets: planets, tanField: tanField, constellations: constellations, Labels: Labels,
    QUAD: QUAD, quadCode: quadCode, drawQuad: drawQuad, drawCode: drawCode,
    radec: radec, toRaDec: toRaDec, fmtRa: fmtRa, fmtDec: fmtDec
  };
})();
