/* ======================================================================
   floorplan/engine.js — Direction E's freehand room-capture editor, as a
   framework-free ES module. Extracted verbatim from
   prototypes/e-freehand/index.html: every rule, constant and comment in
   the body below is the prototype's own. Three things changed and
   nothing else — (1) the whole script is a FACTORY, so what used to be
   module-level state is per-instance closure state and two editors can
   share a page; (2) every DOM lookup is scoped to the mount root
   instead of `document`; (3) FIXME-11 (see realBoxMisses below and
   `.fp .bar` in engine.css).
   ====================================================================== */

/* ----------------------------------------------------------------------
   RO — every word this editor shows on screen. The app speaks Romanian
   (sentence case, addressing the user as "tu"), so the engine does too;
   geometry, ids, classes, data-testids and the model's own vocabulary
   ('wall' / 'open' / 'window' / 'door') are untouched.
   ---------------------------------------------------------------------- */
const RO = {
  undo: 'Anulează',
  redo: 'Refă',
  ceiling: 'Înălțimea tavanului',
  gotIt: 'Am înțeles',
  emptyHint: 'Trage oriunde ca să desenezi primul perete.',
  letMeFix: 'Mai schimb eu',
  kind: { wall: 'Perete', open: 'Latură deschisă', window: 'Fereastră', door: 'Ușă' },
  addDoor: '+ Ușă',
  addWindow: '+ Fereastră',
  del: 'Șterge',
  startsAt: 'Începe la',
  cmFromStart: 'cm de la început',
  sillHeight: 'Înălțimea parapetului',
  /* the field names that appear inside the metres question, mid-sentence */
  fieldLength: 'lungime',
  fieldOffset: 'distanța de la început',
  fieldSill: 'înălțimea parapetului',
  fieldCeiling: 'înălțimea tavanului',
  hinge: function(side, swing){
    return 'Balama ' + side + ' · se deschide ' + (swing === 'in' ? 'înăuntru' : 'în afară');
  },
  missingCount: function(n){ return n + (n === 1 ? ' lucru lipsește' : ' lucruri lipsesc'); },
  firstWall: 'Desenează primul perete ca să începi.',
  freeEnds: function(n){
    return n === 1
      ? 'Un capăt de perete nu e legat de nimic încă.'
      : n + ' capete de perete nu sunt legate de nimic încă.';
  },
  notClosed: 'Pereții nu formează încă un contur închis.',
  ceilingMissing: 'Înălțimea tavanului nu e completată.',
  sillsMissing: function(n){
    return n === 1
      ? 'O fereastră mai are nevoie de înălțimea parapetului.'
      : n + ' ferestre mai au nevoie de înălțimea parapetului.';
  },
  squarePart: function(heading, before, after){
    return 'peretele ' + heading + ' măsura ' + before + ', așa că acum are ' + after + ' cm';
  },
  squareToast: function(parts){ return 'Ca să închid camera în unghi drept, ' + parts + '.'; },
  reshapedFar: function(total){
    return 'Peretele are acum ' + total + ' cm. Nu mai era nimic în apropiere de unde să iau ' +
      'diferența, așa că forma camerei s-a schimbat aici — colțul următor s-a mutat ca să se potrivească.';
  },
  reshaped: function(total){
    return 'Peretele are acum ' + total + ' cm. Forma camerei s-a schimbat aici — colțul ' +
      'următor s-a mutat ca să se potrivească.';
  },
  metresQuestion: function(raw, label, cm){
    return 'Ai scris „' + raw + '” la ' + label + '. Aici se lucrează doar în centimetri ' +
      'întregi, iar asta arată a ' + raw + ' m — ai vrut să spui ' + cm + ' cm?';
  },
  metresYes: function(cm){ return cm + ' cm — da'; },
  clamp: function(max){ return 'Nu e destul perete acolo — încape cel mult ' + max + ' cm.'; },
  clampYes: function(max){ return 'Folosește ' + max + ' cm'; },
  openingStayed: 'Nu e destul perete liber acolo pentru golul ăsta — a rămas pe peretele lui.'
};

/* The prototype's own <body> markup, ids intact — mount injects it into
   the root, and every lookup below goes through root.querySelector, so
   the ids are per-instance rather than per-document. */
export const TEMPLATE = `
<div id="app">
  <main id="stage" data-testid="stage">
    <svg id="roomSvg" data-testid="room-svg" preserveAspectRatio="xMidYMid meet" viewBox="-260 -260 520 520"></svg>
    <div id="ctrlLayer" data-testid="ctrl-layer"></div>
    <div class="empty-hint" id="emptyHint" data-testid="empty-hint">${RO.emptyHint}</div>
    <div class="toast hidden" id="toastEl" data-testid="toast">
      <span id="toastText"></span>
      <button data-testid="toast-dismiss" id="toastDismiss">${RO.gotIt}</button>
    </div>

    <!-- One quiet line, above the bar: nothing at all once the room is
         complete, a tappable count otherwise (see renderBar). -->
    <div class="missing-line" id="missingList" data-testid="missing-list"></div>

    <!-- The old #rail is gone, and so is #cluster's own docked
         positioning: the stage is the entire window, and this floating
         bottom-centre bar (src/draw's own Toolbar) is the only chrome
         left. Plate one is always here; plate two (#cluster) only
         renders content while something is selected. -->
    <div class="bar" id="bar" data-testid="bar">
      <div class="plate group">
        <button class="txtbtn" data-testid="undo" id="undoBtn" disabled>${RO.undo}</button>
        <button class="txtbtn" data-testid="redo" id="redoBtn" disabled>${RO.redo}</button>
        <span class="divider"></span>
        <label class="field">${RO.ceiling}
          <input data-testid="ceiling-input" id="ceilingInput" type="text" inputmode="decimal" class="num-input v-empty" value="" placeholder="—">
          <span class="unit">cm</span>
        </label>
        <span class="divider" id="missingDivider" hidden></span>
        <button class="txtbtn" id="missingBtn" data-testid="missing-summary" hidden></button>
      </div>
      <div id="cluster" class="plate hidden" data-testid="cluster"></div>
    </div>
  </main>
</div>

<div id="confirmDialog" class="hidden" data-testid="confirm-dialog">
  <div class="confirm-card">
    <p id="confirmDialogText"></p>
    <div class="row">
      <button class="primary" id="confirmYesBtn" data-testid="confirm-yes"></button>
      <button id="confirmNoBtn" data-testid="confirm-no">${RO.letMeFix}</button>
    </div>
  </div>
</div>
`;

/**
 * Mount the floorplan editor into `root`.
 *
 * @param {HTMLElement} root
 * @param {{ onChange?: (room:any)=>void, exposeGlobals?: boolean }} [opts]
 * @returns {{ room():any, getModel():any, setModel(m:any):void, reset():void, destroy():void }}
 */
export function mountFloorplan(root, opts){
"use strict";
opts = opts || {};
if(!root || !root.nodeType) throw new Error('mountFloorplan: a root element is required');

var doc = root.ownerDocument || document;
var win = doc.defaultView || window;
var onChangeCb = typeof opts.onChange === 'function' ? opts.onChange : null;
var exposeGlobals = !!opts.exposeGlobals;
var destroyed = false;

root.classList.add('fp');
root.innerHTML = TEMPLATE;

/* Every `document.getElementById('x')` in the prototype became `$id('x')`,
   and its two `document.querySelector*` calls became root-scoped: ids stay
   exactly as the prototype wrote them, but they resolve inside this
   instance's own subtree. */
function $id(id){ return root.querySelector('#' + id); }

/* Listener bookkeeping, so destroy() leaves nothing behind. The three
   capture-phase touch-retarget guards used to sit on `document`; on
   `root` they still run before the mistargeted element's own listener,
   because root is an ancestor of every element they guard. */
var winListeners = [], rootListeners = [];
function onWin(type, fn, o){ win.addEventListener(type, fn, o); winListeners.push([type, fn, o]); }
function onRoot(type, fn, o){ root.addEventListener(type, fn, o); rootListeners.push([type, fn, o]); }

/* onChange fires after a render that actually changed the model — never
   on a bare resize re-render, and never re-entrantly. */
var lastChangeSig = null, inNotify = false;
function notifyChange(){
  if(!onChangeCb || inNotify) return;
  var sig;
  try{ sig = JSON.stringify(model); }catch(e){ sig = null; }
  if(sig !== null && sig === lastChangeSig) return;
  lastChangeSig = sig;
  inNotify = true;
  try{ onChangeCb(buildRoomSnapshot()); }
  finally{ inNotify = false; }
}

/* ============================================================
   Direction E — "nothing on the canvas is waiting for you, and
   nothing constrains where you draw next." A stroke can start
   anywhere, at any time. Walls are a SET of independently-drawn
   pieces, not an ordered chain — connectivity (who touches whom)
   is decided by SNAPPING at draw time (press and release), never
   by array order. Closure is derived by walking the connectivity
   graph: when it forms a single ring covering every wall, the
   room is closed.
   ============================================================ */

/* ======================================================================
   CONSTANTS
   ====================================================================== */
var MIN_WALL = 1;
var MIN_OPEN = 10;
var DEFAULT_DOOR_W = 90;
var DEFAULT_WINDOW_W = 100;
var DEFAULT_SILL = 90;
var WALL_THICKNESS_CM = 20;     // plan-view wall thickness (a poché band, not a stroke) — real
                                 // enough to read as masonry, well clear of the old 5cm hairline
var WALL_HATCH_SPACING_CM = 8;  // hatch tile pitch, in the SAME cm space as the room itself
                                 // (patternUnits=userSpaceOnUse below), so it scales with the
                                 // drawing instead of shimmering at a fixed screen pitch on zoom
var SNAP_PX = 20;               // screen px — identical feel at every zoom, on every device
var DRAW_MOVE_THRESHOLD = 4;    // cm, movement beyond this counts as a real drag, not a tap
var TAP_PX = 6;                 // screen px, movement beyond this counts as a real drag, not a tap
var FREE_END_DECIDE_PX = 16;    // screen px - how far a drag off a free end must travel before it is read as pull-to-resize rather than start-a-new-wall
var WELD_EPS = 0.5;             // cm — two points this close are "the same point"
var MIN_STROKE_PX = 12;         // screen px — a drawn stroke shorter than this on-screen was a
                                 // mis-click, not a deliberate wall; TAP_PX only gates tap-vs-drag
                                 // at press, this is the second gate at commit (screen px, not cm,
                                 // so it behaves identically at every zoom level).
var MIN_GAP_SHOWN = 2;          // cm — a flanking segment shorter than this, shown as an
                                 // opening's left/right gap, is a sliver nobody asked for, not a
                                 // measurement (MIN_WALL's own floor is 1cm, so this still lets an
                                 // ordinary short wall segment through and only hides a genuine one)

function r(n){ return Math.round(n); }
function clamp(v,lo,hi){ return Math.min(hi, Math.max(lo, v)); }
function dist(a,b){ return Math.hypot(b.x-a.x, b.y-a.y); }
function pointsEqual(a,b){ return Math.abs(a.x-b.x) < WELD_EPS && Math.abs(a.y-b.y) < WELD_EPS; }
function pointKey(p){ return r(p.x)+','+r(p.y); }

/* ======================================================================
   ID GENERATION
   ====================================================================== */
var _idCounter = 1;
function uid(prefix){ return prefix + (_idCounter++); }

/* ======================================================================
   MODEL — model.walls is an unordered SET of independently-drawn wall
   pieces. Each carries its own from/to points; two pieces are
   "connected" purely by having numerically-coincident endpoints (welded
   there by snapping — see findSnapTarget/commitDrawStroke). There is no
   array-order adjacency anywhere in this file: every neighbour lookup
   below is by shared POINT, via neighborAt().
   ====================================================================== */
var model = { ceilingHeightCm: null, walls: [] };
var undoStack = [], redoStack = [];
var selection = null;     // null | { segId }
// Tracks which segId render() last saw selected, so it can notice the
// ONE moment that matters for merging (SPEC-lessons, round seven): the
// piece that was selected a moment ago no longer is. Deliberately not
// keyed to any specific gesture or button — deselecting, selecting a
// different piece, and drawing something new all change `selection`
// through different code paths, and every one of them has to settle
// the piece it left behind the same way.
var lastSettledSegId = null;
var dragState = null;     // active pointer gesture, see GESTURES
var toastState = null;
var confirmState = null;
// Whether the "N still missing" summary line is expanded to the actual
// sentences. A UI state, not model state — not snapshotted, not undoable.
var missingExpanded = false;

function snapshotModel(){
  return { ceilingHeightCm: model.ceilingHeightCm, walls: JSON.parse(JSON.stringify(model.walls)) };
}
function pushHistory(){
  undoStack.push(snapshotModel());
  if(undoStack.length > 300) undoStack.shift();
  redoStack.length = 0;
}
function restoreSnapshot(snap){
  model.ceilingHeightCm = snap.ceilingHeightCm;
  model.walls = JSON.parse(JSON.stringify(snap.walls));
}
function undo(){
  if(!undoStack.length) return;
  redoStack.push(snapshotModel());
  restoreSnapshot(undoStack.pop());
  selection = null; dragState = null;
  render();
}
function redo(){
  if(!redoStack.length) return;
  undoStack.push(snapshotModel());
  restoreSnapshot(redoStack.pop());
  selection = null; dragState = null;
  render();
}
function resetAll(){
  model = { ceilingHeightCm: null, walls: [] };
  undoStack = []; redoStack = [];
  selection = null; dragState = null;
  toastState = null; confirmState = null;
  render();
}

function makeSegment(kind, lengthCm, source){
  return {
    id: uid('seg'), kind: kind || 'wall',
    length: { value: r(lengthCm), source: source || 'computed' },
    offsetFromStart: 0,
    sill: null, hinge: null, hingeSource: null, swing: null, swingSource: null
  };
}
function makeWall(from, to, source){
  // A wall's two ends must share exactly one coordinate — the room is
  // drawn and squared on axis-aligned strokes only (SPEC-lessons, round
  // five: a wall whose from/to differed on both axes silently reported
  // its Euclidean distance as if it were the drawn number, with no
  // signal anywhere that the room wasn't square). Every caller upstream
  // is responsible for landing on-axis before it gets here — refuse
  // outright rather than trust that and silently store a diagonal.
  if(r(from.x) !== r(to.x) && r(from.y) !== r(to.y)){
    throw new Error('makeWall: refusing a diagonal wall from ('+from.x+','+from.y+') to ('+to.x+','+to.y+')');
  }
  var w = {
    id: uid('wall'), from: { x:from.x, y:from.y }, to: { x:to.x, y:to.y },
    lengthSource: source || 'computed', isOpen: false,
    segments: []
  };
  w.segments = [ makeSegment('wall', dist(w.from, w.to), source || 'computed') ];
  return w;
}
function minFor(kind){ return (kind === 'window' || kind === 'door') ? MIN_OPEN : MIN_WALL; }

/* ======================================================================
   CONNECTIVITY — everything below reads adjacency from shared points,
   never from where a wall sits in the array. Findable in O(walls).
   ====================================================================== */
function findWall(id){ for(var i=0;i<model.walls.length;i++) if(model.walls[i].id===id) return model.walls[i]; return null; }
function wallLen(w){ return dist(w.from, w.to); }
function wallDir(w){ var dx=w.to.x-w.from.x, dy=w.to.y-w.from.y; var len=Math.hypot(dx,dy)||1; return {x:dx/len,y:dy/len}; }
function wallNormal(w){ var d=wallDir(w); return {x:-d.y, y:d.x}; }
function headingOf(w){
  var dx=w.to.x-w.from.x, dy=w.to.y-w.from.y;
  if(Math.abs(dx) >= Math.abs(dy)) return dx>=0 ? 'E' : 'W';
  return dy>=0 ? 'S' : 'N';
}
function headingVec(h){ return h==='N'?{x:0,y:-1}: h==='S'?{x:0,y:1}: h==='E'?{x:1,y:0}: {x:-1,y:0}; }
function snapHeading(dx, dy){
  if(Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
  return dy >= 0 ? 'S' : 'N';
}
function segLen(s){ return s.length.value; }
function segTotal(w){ var t=0; w.segments.forEach(function(s){ t+=segLen(s); }); return t; }

// All OTHER walls with an endpoint exactly at pt (excluding wall id).
function wallsAtPoint(pt, excludeId){
  var out = [];
  model.walls.forEach(function(w){
    if(w.id === excludeId) return;
    if(pointsEqual(w.from, pt)) out.push({ wall:w, end:'from' });
    if(pointsEqual(w.to, pt)) out.push({ wall:w, end:'to' });
  });
  return out;
}
// The single neighbour touching wall w's given end ('from'|'to'), if
// there is exactly one (the ordinary case — two walls meeting at a
// corner, or a wall and its extension at a free end that got welded).
// A point where 3+ walls meet (a T-junction) has no single answer here
// on purpose — push/corner-drag only ever move an unambiguous joint.
function neighborAt(w, end){
  var others = wallsAtPoint(w[end], w.id);
  return others.length === 1 ? others[0] : null;
}
function isFreeEnd(w, end){ return wallsAtPoint(w[end], w.id).length === 0; }

// Walks a connected chain of walls starting at startWall, treating
// startEnd as that wall's own "entry" point (so the chain is read in
// the direction away from startEnd). Fully orientation-agnostic: each
// wall may have been drawn in either direction, so this always exits
// from "whichever end isn't where we entered," never assuming `to`
// means "forward." Returns { walls:[{wall,entry}], points:[[x,y]...],
// closed:Boolean } — closed is true only if the walk returns to
// startWall at exactly startEnd, i.e. a clean ring, not a fold-back.
function traceChain(startWall, startEnd){
  var visited = {};
  var walls = [];
  var points = [ [r(startWall[startEnd].x), r(startWall[startEnd].y)] ];
  var cur = startWall, entryEnd = startEnd, closedBack = false;
  var guard = 0;
  while(cur && guard++ < model.walls.length + 2){
    visited[cur.id] = true;
    walls.push({ wall:cur, entry:entryEnd });
    var exitEnd = (entryEnd==='from') ? 'to' : 'from';
    var exitPt = cur[exitEnd];
    points.push([r(exitPt.x), r(exitPt.y)]);
    var others = wallsAtPoint(exitPt, cur.id);
    if(others.length !== 1) break;              // dangling free end, or a T-junction/branch
    var nxt = others[0];
    if(nxt.wall.id === startWall.id){
      if(nxt.end === startEnd) closedBack = true; // returns head-to-tail, a clean ring
      break;
    }
    if(visited[nxt.wall.id]) break;             // revisits without covering a simple ring
    cur = nxt.wall; entryEnd = nxt.end;
  }
  return { walls: walls, points: points, closed: closedBack, visited: visited };
}
// Closed iff SOME chain forms a clean ring that covers every wall in
// the model — derived live, every time it's asked, never a flag set by
// one particular gesture (SPEC-lessons #9).
function findClosedRing(){
  if(model.walls.length < 4) return null;
  var chain = traceChain(model.walls[0], 'from');
  return (chain.closed && chain.walls.length === model.walls.length) ? chain : null;
}
function isClosedLoop(){ return !!findClosedRing(); }

// Pure geometry: translate wall w along its own normal by delta (cm).
// delta > 0 = toward the interior; delta < 0 = away from it. Only the
// immediate neighbour(s) sharing a corner with w can change length as a
// result — nothing further away is ever touched (D's "one hop and stop"
// rule). A wall with a free (unwelded) end simply extends there instead.
function pushWallByRef(w, delta){
  if(Math.abs(delta) < 1e-9) return;
  var n = wallNormal(w);
  var prevInfo = neighborAt(w, 'from'), nextInfo = neighborAt(w, 'to');
  var mx = n.x*delta, my = n.y*delta;
  w.from.x += mx; w.from.y += my;
  w.to.x   += mx; w.to.y   += my;
  if(prevInfo){ prevInfo.wall[prevInfo.end].x = w.from.x; prevInfo.wall[prevInfo.end].y = w.from.y; }
  if(nextInfo){ nextInfo.wall[nextInfo.end].x = w.to.x; nextInfo.wall[nextInfo.end].y = w.to.y; }
}
function dragPushWall(wallId, deltaCm){
  var w = findWall(wallId); if(!w) return;
  var prevInfo = neighborAt(w,'from'), nextInfo = neighborAt(w,'to');
  var beforePrev = prevInfo ? wallLen(prevInfo.wall) : null, beforeNext = nextInfo ? wallLen(nextInfo.wall) : null;
  pushWallByRef(w, deltaCm);
  if(prevInfo && wallLen(prevInfo.wall) !== beforePrev) prevInfo.wall.lengthSource = 'drawn';
  if(nextInfo && wallLen(nextInfo.wall) !== beforeNext) nextInfo.wall.lengthSource = 'drawn';
  cleanupOutline();
  syncSegmentsForAllWalls();
}
// Corner drag: move the point shared by two walls freely in 2D.
// Decomposed into each wall's own normal component (perpendicular axes,
// since the two walls meeting at a right angle are themselves
// perpendicular) — two uses of the one push primitive.
function dragCornerAtPoint(vertexPt, dx, dy){
  var touches = wallsAtPoint(vertexPt, null);
  var lenBefore = {};
  model.walls.forEach(function(w){ lenBefore[w.id] = wallLen(w); });
  touches.forEach(function(t){
    var w = t.wall;
    var n = wallNormal(w);
    var d = dx*n.x + dy*n.y;
    pushWallByRef(w, d);
    w.lengthSource = 'drawn'; // the directly-dragged wall, even though a rigid translation keeps its OWN length unchanged
  });
  // pushWallByRef's own neighbour-sync can change a one-hop wall's
  // length too (D's "one hop and stop" rule) — mark those 'drawn' as
  // well, the same way dragPushWall already does for a plain push.
  model.walls.forEach(function(w){
    if(lenBefore[w.id] !== undefined && wallLen(w) !== lenBefore[w.id]) w.lengthSource = 'drawn';
  });
  cleanupOutline();
  syncSegmentsForAllWalls();
}

/* ======================================================================
   CLEANUP — drop degenerate (zero-length) walls and merge two walls
   that meet end-to-end with the SAME heading into one (a push/corner-
   drag straightening a jog leaves them collinear with nothing marking
   a seam). Point-based, like everything
   else here — no array floor is needed since "how many walls" is never
   itself the invariant; the ring-walk (findClosedRing) is.
   ====================================================================== */
function cleanupOutline(){
  var changed = true, guard = 0;
  while(changed && guard++ < 60){
    changed = false;
    // drop zero-length walls, healing the gap left behind
    for(var i=0;i<model.walls.length;i++){
      var w = model.walls[i];
      if(r(wallLen(w)) === 0){
        var prevInfo = neighborAt(w,'from'), nextInfo = neighborAt(w,'to');
        if(prevInfo) { prevInfo.wall[prevInfo.end].x = w.to.x; prevInfo.wall[prevInfo.end].y = w.to.y; }
        else if(nextInfo) { nextInfo.wall[nextInfo.end].x = w.from.x; nextInfo.wall[nextInfo.end].y = w.from.y; }
        model.walls.splice(i,1);
        changed = true; break;
      }
    }
    if(changed) continue;
    // merge collinear walls that meet end-to-end (exactly one neighbour
    // on each side of the seam, same heading)
    for(var j=0;j<model.walls.length;j++){
      var a = model.walls[j];
      var nInfo = neighborAt(a, 'to');
      if(!nInfo || nInfo.end !== 'from') continue;
      var b = nInfo.wall;
      if(headingOf(a) !== headingOf(b)) continue;
      var mergedSegs = a.segments.concat(b.segments.map(function(s){
        var c = JSON.parse(JSON.stringify(s)); c.offsetFromStart += segTotal(a); return c;
      }));
      a.to.x = b.to.x; a.to.y = b.to.y;
      a.segments = mergedSegs;
      a.lengthSource = 'computed';
      // The wall-level merge above only concatenates each side's own
      // segment list — it says nothing about the SEAM between them.
      // Two same-kind pieces meeting there with nothing between them
      // (a `wall` ending right where another `wall` begins) are exactly
      // what mergeAdjacentPlain fuses into one segment, provenance
      // `typed` only if both sides were (SPEC-lessons, round six, rule
      // 4) — without this call they'd sit here as two segments, two
      // labels, for what is now one straight run.
      mergeAdjacentPlain(a);
      var bIdx = model.walls.indexOf(b);
      model.walls.splice(bIdx,1);
      changed = true; break;
    }
  }
}
/* ======================================================================
   SEGMENT SYNC — segments always exactly partition their wall's current
   geometric length. Geometry (the wall's from/to) is the single source
   of truth; segments reconcile to it, never the other way around
   (avoids the "stale derived value" bug class, SPEC-lessons #12).
   ====================================================================== */
function reflow(w){ var off=0; w.segments.forEach(function(s){ s.offsetFromStart=off; off+=s.length.value; }); }
// A piece is still "being worked on" — and so never merges, no matter
// how eligible its neighbour is — while it is the active selection or
// still carries its rough as-drawn length (SPEC-lessons, round seven:
// merging a same-kind neighbour the instant two strokes connect
// destroyed a typed measurement and made the piece just drawn
// unselectable, breaking "draw a bit, then say what it is" — the core
// loop). A `drawn` piece is always also the current selection right
// after commitDrawStroke creates it, but this checks both separately
// on purpose: it is also what keeps a `typed` piece merge-eligible
// again the moment selection moves off it, without needing it to somehow
// still be `drawn` too.
function segIsFresh(s){ return s.length.source==='drawn' || !!(selection && selection.segId===s.id); }
function mergeAdjacentPlain(w){
  var changed = true;
  while(changed){
    changed = false;
    for(var i=0;i<w.segments.length-1;i++){
      var a=w.segments[i], b=w.segments[i+1];
      if(segIsFresh(a) || segIsFresh(b)) continue;
      if((a.kind==='wall' && b.kind==='wall') || (a.kind==='open' && b.kind==='open')){
        a.length.value += b.length.value;
        a.length.source = (a.length.source===b.length.source) ? a.length.source : 'computed';
        w.segments.splice(i+1,1);
        changed = true;
        break;
      }
    }
  }
  reflow(w);
}
function dropZero(w){
  w.segments = w.segments.filter(function(s){ return s.length.value > 0; });
  if(w.segments.length===0) w.segments.push(makeSegment(w.isOpen?'open':'wall', r(wallLen(w)), 'computed'));
  mergeAdjacentPlain(w);
}
function resizeWallKeepingSegments(w, newTotal){
  newTotal = Math.max(0, r(newTotal));
  var cur = segTotal(w);
  var delta = newTotal - cur;
  if(delta === 0) return;
  if(delta > 0){
    var last = w.segments[w.segments.length-1];
    if(last && (last.kind==='wall' || last.kind==='open')){
      last.length.value += delta;
      if(last.length.source==='typed') last.length.source='computed';
    } else {
      w.segments.push(makeSegment('wall', delta, 'computed'));
    }
  } else {
    var need = -delta;
    for(var k=w.segments.length-1; k>=0 && need>0; k--){
      var s = w.segments[k];
      if(s.kind!=='wall' && s.kind!=='open') continue;
      var take = Math.min(need, s.length.value);
      s.length.value -= take; need -= take;
      // Shrinking has to downgrade a 'typed' piece exactly the same way
      // growing already does above — a piece whose number the tool just
      // changed can never keep reading as the user's own (lessons 1-4),
      // whichever direction the change ran.
      if(take > 0 && s.length.source==='typed') s.length.source='computed';
    }
    w.segments = w.segments.filter(function(s){ return s.length.value>0; });
    if(w.segments.length===0) w.segments.push(makeSegment('wall',0,'computed'));
  }
  mergeAdjacentPlain(w);
}
function syncSegmentsForAllWalls(){
  model.walls.forEach(function(w){
    var geomLen = r(wallLen(w));
    if(segTotal(w) !== geomLen) resizeWallKeepingSegments(w, geomLen);
  });
}

/* ======================================================================
   OPENINGS — windows, doors and "open edge" all live as segments inside
   a wall's own segments[] list. Placing, resizing and sliding them are
   LOCAL, conservation-based edits, entirely within one wall — none of
   this depends on how that wall connects to its neighbours, so nothing
   here changed when the outline stopped being a chain.
   ====================================================================== */
function findSeg(wallId, segId){
  var w = findWall(wallId); if(!w) return null;
  for(var i=0;i<w.segments.length;i++) if(w.segments[i].id===segId) return {wall:w, seg:w.segments[i], idx:i};
  return null;
}
function findSegAnywhere(segId){
  for(var i=0;i<model.walls.length;i++){
    var w = model.walls[i];
    for(var j=0;j<w.segments.length;j++) if(w.segments[j].id===segId) return {wall:w, seg:w.segments[j], idx:j};
  }
  return null;
}
function flexRun(w, startIdx, dir){
  var out = [], i = startIdx;
  while(i>=0 && i<w.segments.length && (w.segments[i].kind==='wall'||w.segments[i].kind==='open')){
    out.push(w.segments[i]); i += dir;
  }
  return out;
}
function drain(run, amount){
  var remain = amount;
  run.forEach(function(s){
    if(remain<=0) return;
    var take = Math.min(remain, s.length.value);
    s.length.value -= take; remain -= take;
    if(s.length.source==='typed') s.length.source = 'computed';
  });
}
function resizeSegment(wallId, segId, newLength, source){
  var f = findSeg(wallId, segId); if(!f) return {ok:false};
  var w=f.wall, seg=f.seg, idx=f.idx;
  newLength = Math.max(MIN_OPEN, r(newLength));
  var delta = newLength - seg.length.value;
  if(delta === 0){ seg.length.source = source; return {ok:true, applied:newLength}; }
  if(delta > 0){
    var nextRun = flexRun(w, idx+1, 1), prevRun = flexRun(w, idx-1, -1);
    var nextRoom = nextRun.reduce(function(a,s){return a+s.length.value;},0);
    var prevRoom = prevRun.reduce(function(a,s){return a+s.length.value;},0);
    var need = Math.min(delta, nextRoom+prevRoom);
    var fromNext = Math.min(need, nextRoom);
    drain(nextRun, fromNext);
    drain(prevRun, need-fromNext);
    seg.length.value += need;
    seg.length.source = source;
    dropZero(w);
    if(need < delta) return {ok:false, max: seg.length.value};
    return {ok:true, applied: seg.length.value};
  }
  var free = -delta;
  seg.length.value -= free;
  seg.length.source = source;
  var target = w.segments[idx+1];
  if(!(target && (target.kind==='wall'||target.kind==='open'))) target = w.segments[idx-1];
  if(target && (target.kind==='wall'||target.kind==='open')) target.length.value += free;
  else w.segments.splice(idx+1, 0, makeSegment('wall', free, 'computed'));
  dropZero(w);
  return {ok:true, applied: seg.length.value};
}
function slideSegment(wallId, segId, newOffset, source){
  var f = findSeg(wallId, segId); if(!f) return {ok:false};
  var w=f.wall, seg=f.seg, idx=f.idx;
  var total = segTotal(w);
  var wantOffset = clamp(r(newOffset), 0, Math.max(0, total-seg.length.value));
  var delta = wantOffset - seg.offsetFromStart;
  if(delta === 0) return {ok:true};
  if(delta > 0){
    var nextRun = flexRun(w, idx+1, 1);
    var room = nextRun.reduce(function(a,s){return a+s.length.value;},0);
    var move = Math.min(delta, room);
    if(move<=0) return {ok:true};
    drain(nextRun, move);
    var prevS = w.segments[idx-1];
    if(prevS && (prevS.kind==='wall'||prevS.kind==='open')) prevS.length.value += move;
    else w.segments.splice(idx, 0, makeSegment('wall', move, 'computed'));
  } else {
    var prevRun = flexRun(w, idx-1, -1);
    var room2 = prevRun.reduce(function(a,s){return a+s.length.value;},0);
    var move2 = Math.min(-delta, room2);
    if(move2<=0) return {ok:true};
    drain(prevRun, move2);
    var nextS = w.segments[idx+1];
    if(nextS && (nextS.kind==='wall'||nextS.kind==='open')) nextS.length.value += move2;
    else w.segments.splice(idx+1, 0, makeSegment('wall', move2, 'computed'));
  }
  dropZero(w);
  return {ok:true};
}
function addOpening(wallId, kind, wantCenterOffset){
  var w = findWall(wallId); if(!w) return null;
  var defaults = { door:DEFAULT_DOOR_W, window:DEFAULT_WINDOW_W };
  var width = defaults[kind] || DEFAULT_DOOR_W;
  var total = segTotal(w);
  wantCenterOffset = clamp(wantCenterOffset==null ? total/2 : wantCenterOffset, 0, total);
  var best=null, bestD=Infinity;
  w.segments.forEach(function(s){
    if(s.kind!=='wall' && s.kind!=='open') return;
    var mid = s.offsetFromStart + s.length.value/2;
    var d = Math.abs(mid-wantCenterOffset);
    if(d<bestD){ bestD=d; best=s; }
  });
  if(!best) return null;
  width = Math.min(width, best.length.value);
  if(width < MIN_OPEN) return null;
  var localWant = clamp(wantCenterOffset - best.offsetFromStart, width/2, best.length.value-width/2);
  var startInBest = r(localWant - width/2);
  var idx = -1;
  for(var i=0;i<w.segments.length;i++) if(w.segments[i].id===best.id) idx=i;
  var before = startInBest, after = best.length.value - startInBest - width;
  var newSegs = [];
  if(before>0) newSegs.push(makeSegment('wall', before, 'computed'));
  var opening = makeSegment(kind, width, 'computed');
  if(kind==='window') opening.sill = { value:DEFAULT_SILL, source:'computed' };
  if(kind==='door') defaultDoorSwing(opening);
  newSegs.push(opening);
  if(after>0) newSegs.push(makeSegment('wall', after, 'computed'));
  w.segments.splice.apply(w.segments, [idx,1].concat(newSegs));
  reflow(w);
  return opening.id;
}
function removeSegmentToWall(wallId, segId){
  var f = findSeg(wallId, segId); if(!f) return false;
  var w=f.wall, seg=f.seg, idx=f.idx;
  seg.kind = w.isOpen ? 'open' : 'wall';
  seg.length.source = 'computed'; seg.sill=null; seg.hinge=null; seg.hingeSource=null; seg.swing=null; seg.swingSource=null;
  var nextS=w.segments[idx+1], prevS=w.segments[idx-1];
  if(nextS && (nextS.kind==='wall'||nextS.kind==='open')){ seg.length.value+=nextS.length.value; w.segments.splice(idx+1,1); }
  if(prevS && (prevS.kind==='wall'||prevS.kind==='open')){ seg.length.value+=prevS.length.value; w.segments.splice(idx-1,1); }
  mergeAdjacentPlain(w);
  return true;
}
// Deletes whatever piece is currently selected. A window/door already
// had a way out via removeSegmentToWall; a plain `wall`/`open` piece
// never did — worst for an accidental stray stroke (e.g. a 2cm wall
// from a mis-click), which was otherwise permanent short of undo.
// Three cases:
//   window/door          -> the existing remove-opening path, unchanged.
//   wall/open, NOT alone  -> drop just this segment and shrink the WALL
//                            itself by exactly its length (not just
//                            resize the remaining segments to fill the
//                            gap — that would silently stretch a
//                            neighbour that was never touched). reflow
//                            recomputes every remaining segment's
//                            offsetFromStart so nothing goes stale;
//                            no other segment maths is hand-rolled.
//                            The wall's own `to` end absorbs the shrink
//                            — the same end growing a wall already
//                            favours by default (resizeWallKeepingSegments
//                            extends/eats the LAST segment first) — so
//                            anything before the deleted piece keeps
//                            its exact real-world position; only a
//                            piece removed from the very front (idx 0,
//                            touching `from`) eats from `from` instead,
//                            since nothing before it to keep is even
//                            possible.
//   wall's ONLY segment   -> nothing left to shrink toward: remove the
//                            whole wall from model.walls. Doing this
//                            mid-chain legitimately leaves two free
//                            ends where it used to connect its
//                            neighbours — that's fine, not a bug to
//                            route around: computeUnanswered already
//                            reports an open perimeter the same way any
//                            other unfinished edge does.
function deleteSelection(){
  if(!selection) return;
  var f = findSegAnywhere(selection.segId); if(!f) return;
  var w = f.wall, seg = f.seg;
  pushHistory();
  if(seg.kind==='window' || seg.kind==='door'){
    removeSegmentToWall(w.id, seg.id);
  } else if(w.segments.length > 1){
    var removedLen = seg.length.value;
    var idx = w.segments.indexOf(seg);
    var d = wallDir(w);
    w.segments.splice(idx, 1);
    reflow(w);
    if(idx === 0){
      w.from = { x: w.from.x + d.x*removedLen, y: w.from.y + d.y*removedLen };
    } else {
      w.to = { x: w.to.x - d.x*removedLen, y: w.to.y - d.y*removedLen };
    }
    w.lengthSource = 'computed';
  } else {
    var wi = model.walls.indexOf(w);
    if(wi !== -1) model.walls.splice(wi, 1);
  }
  selection = null;
  cleanupOutline();
  syncSegmentsForAllWalls();
  render();
}
function bestFlexSegmentFor(w, widthCm, wantOffset){
  var total = segTotal(w);
  wantOffset = wantOffset==null ? total/2 : clamp(wantOffset, 0, total);
  var best=null, bestD=Infinity;
  w.segments.forEach(function(s){
    if(s.kind!=='wall' && s.kind!=='open') return;
    if(s.length.value < widthCm) return;
    var mid = s.offsetFromStart + s.length.value/2;
    var d = Math.abs(mid-wantOffset);
    if(d<bestD){ bestD=d; best=s; }
  });
  return best;
}
function moveOpeningToWall(fromWallId, segId, toWallId, dropOffsetCm){
  if(fromWallId === toWallId) return { ok:false };
  var f = findSeg(fromWallId, segId);
  if(!f || (f.seg.kind!=='window' && f.seg.kind!=='door')) return { ok:false };
  var toWall = findWall(toWallId);
  if(!toWall) return { ok:false };
  var widthCm = f.seg.length.value;
  var target = bestFlexSegmentFor(toWall, widthCm, dropOffsetCm);
  if(!target) return { ok:false };
  var saved = {
    kind: f.seg.kind, length: { value:f.seg.length.value, source:f.seg.length.source },
    sill: f.seg.sill ? { value:f.seg.sill.value, source:f.seg.sill.source } : null,
    hinge: f.seg.hinge, hingeSource: f.seg.hingeSource, swing: f.seg.swing, swingSource: f.seg.swingSource
  };
  removeSegmentToWall(fromWallId, segId);
  var want = dropOffsetCm==null ? (target.offsetFromStart + target.length.value/2)
    : clamp(dropOffsetCm, target.offsetFromStart, target.offsetFromStart + target.length.value);
  var localWant = clamp(want - target.offsetFromStart, widthCm/2, target.length.value - widthCm/2);
  var startInTarget = r(localWant - widthCm/2);
  var idx = -1;
  for(var i=0;i<toWall.segments.length;i++) if(toWall.segments[i].id===target.id) idx=i;
  var before = startInTarget, after = target.length.value - startInTarget - widthCm;
  var newSegs = [];
  if(before>0) newSegs.push(makeSegment('wall', before, 'computed'));
  var opening = makeSegment(saved.kind, widthCm, saved.length.source);
  opening.sill = saved.sill; opening.hinge = saved.hinge; opening.hingeSource = saved.hingeSource;
  opening.swing = saved.swing; opening.swingSource = saved.swingSource;
  newSegs.push(opening);
  if(after>0) newSegs.push(makeSegment('wall', after, 'computed'));
  toWall.segments.splice.apply(toWall.segments, [idx,1].concat(newSegs));
  reflow(toWall);
  return { ok:true, newId: opening.id };
}
function setSegSill(wallId, segId, value, source){ var f=findSeg(wallId,segId); if(f) f.seg.sill={value:r(value), source:source}; }
// source defaults to 'typed' — Rotate (cycleDoorSwing, below) calls
// these with just a side/dir and gets that default unchanged; the
// door-creation path is the one caller that passes 'computed' instead,
// via defaultDoorSwing further down.
function setSegHinge(wallId, segId, side, source){ var f=findSeg(wallId,segId); if(f){ f.seg.hinge=side; f.seg.hingeSource=source||'typed'; } }
function setSegSwing(wallId, segId, dir, source){ var f=findSeg(wallId,segId); if(f){ f.seg.swing=dir; f.seg.swingSource=source||'typed'; } }
// The four hinge/swing combinations as one cycle (SPEC-lessons, round
// six, rule 3) — a single button replaces the four separate ones.
// Used to never be pre-set (a door started hinge:null/swing:null and
// stayed that way until this was pressed once — the "never assumed"
// rule, lessons 1-4). Reversed by request: a door now starts on combo
// 0 (see defaultDoorSwing) so it arrives already hung a sensible way,
// and Rotate is a correction for when the guess is wrong, not the only
// way to get a first answer.
var DOOR_SWING_COMBOS = [
  { hinge:'start', swing:'in'  },
  { hinge:'end',   swing:'in'  },
  { hinge:'end',   swing:'out' },
  { hinge:'start', swing:'out' }
];
// Every door-creation path (addOpening, changeKind) calls this once,
// straight on the segment object — same idiom as the window-sill
// default beside each call, and needed pre-splice in addOpening where
// the new segment isn't in any wall's array yet for setSegHinge/
// setSegSwing's findSeg lookup to reach. Combo 0 = hinge at the wall's
// own start, swinging 'in'. 'in' already means "into the room" for ANY
// wall with no per-door geometry to work out: wallNormal's positive
// side is the exact same "interior" pushWallByRef pushes a wall toward
// on delta>0, and the same normal doorSvg draws swing:'in' against.
// hingeSource/swingSource land 'computed' (a guess, not a stated
// answer) — never 'typed', which stays reserved for an actual Rotate
// press via setSegHinge/setSegSwing.
function defaultDoorSwing(seg){
  var combo = DOOR_SWING_COMBOS[0];
  seg.hinge = combo.hinge; seg.hingeSource = 'computed';
  seg.swing = combo.swing; seg.swingSource = 'computed';
}
function cycleDoorSwing(wallId, segId){
  var f = findSeg(wallId, segId); if(!f) return;
  var seg = f.seg;
  var idx = -1;
  if(seg.hinge != null && seg.swing != null){
    for(var i=0;i<DOOR_SWING_COMBOS.length;i++){
      if(DOOR_SWING_COMBOS[i].hinge===seg.hinge && DOOR_SWING_COMBOS[i].swing===seg.swing){ idx = i; break; }
    }
  }
  var next = DOOR_SWING_COMBOS[(idx+1) % DOOR_SWING_COMBOS.length];
  setSegHinge(wallId, segId, next.hinge);
  setSegSwing(wallId, segId, next.swing);
}
// Plain-words description of the door's current state for the button's
// own label — the arc drawn on the plan is the real answer; this just
// needs to say enough that the button isn't a mystery before it's
// pressed. Hinge side is named the same compass-relative way the old
// two-button labels already were (the wall's own heading, or its
// opposite), so this reads as a continuation of that convention, not a
// new one.
function doorSwingLabel(w, seg){
  // No null case to cover — every door has a hinge/swing from the
  // moment it exists (defaultDoorSwing), so this always has something
  // real to report; it's never the button's first-ever answer.
  var opp = {N:'S',S:'N',E:'W',W:'E'}[headingOf(w)], hd = headingOf(w);
  var side = seg.hinge==='start' ? opp : hd;
  return RO.hinge(side, seg.swing);
}

/* ======================================================================
   TYPE SWITCHER — Wall / Open edge / Window / Door, on the selected
   piece. Converting to an opening bumps it up to the opening minimum,
   absorbing from same-wall neighbours first (never silently clamped).
   ====================================================================== */
function changeKind(segId, newKind){
  var f = findSegAnywhere(segId); if(!f) return;
  var w = f.wall, idx = f.idx, seg = f.seg;
  if(seg.kind === newKind) return;
  var minL = minFor(newKind);
  if(seg.length.value < minL){
    var need = minL - seg.length.value;
    var nextRun = flexRun(w, idx+1, 1), prevRun = flexRun(w, idx-1, -1);
    var nextRoom = nextRun.reduce(function(a,s){return a+s.length.value;},0);
    var prevRoom = prevRun.reduce(function(a,s){return a+s.length.value;},0);
    var take = Math.min(need, nextRoom+prevRoom);
    var fromNext = Math.min(take, nextRoom);
    drain(nextRun, fromNext);
    drain(prevRun, take-fromNext);
    seg.length.value += take;
    if(seg.length.value < minL) seg.length.value = minL;
    seg.length.source = 'computed';
  }
  seg.kind = newKind;
  seg.sill = null; seg.hinge = null; seg.hingeSource = null; seg.swing = null; seg.swingSource = null;
  if(newKind === 'window') seg.sill = { value: DEFAULT_SILL, source: 'computed' };
  if(newKind === 'door') defaultDoorSwing(seg);
  if(w.segments.length === 1 && (newKind==='wall'||newKind==='open')) w.isOpen = (newKind==='open');
  var midOffset = seg.offsetFromStart + seg.length.value/2;
  dropZero(w);
  var survivor = null;
  for(var i=0;i<w.segments.length;i++){
    var s = w.segments[i];
    if(midOffset >= s.offsetFromStart - 0.5 && midOffset <= s.offsetFromStart + s.length.value + 0.5){ survivor = s; break; }
  }
  selection = { segId: (survivor || seg).id };
}

/* ======================================================================
   sliceSegments — cut the [from,to) window of a wall's segment run into
   its own segment list, re-basing offsets to start at 0. Shared by
   splitWallAtPoint (T-junctions) below.
   ====================================================================== */
function sliceSegments(segs, from, to){
  var out = [];
  segs.forEach(function(s){
    var sStart = s.offsetFromStart, sEnd = sStart + segLen(s);
    var a = Math.max(sStart, from), b = Math.min(sEnd, to);
    if(b - a > 0){
      var clone = JSON.parse(JSON.stringify(s));
      var trimmed = b - a;
      if(Math.abs(trimmed - segLen(s)) > 1e-9){
        clone.length.value = r(trimmed);
        clone.length.source = 'computed';
        clone.id = uid('seg');
      }
      clone.offsetFromStart = r(a - from);
      out.push(clone);
    }
  });
  if(out.length===0) out.push(makeSegment('wall', r(to-from), 'computed'));
  return out;
}
/* ======================================================================
   "STILL MISSING" — a still-open outline says what is dangling, rather
   than just "not closed" (SPEC: draw-anywhere means a free-floating
   piece is a normal, valid, mid-capture state, not an error).
   ====================================================================== */
function computeUnanswered(){
  var list = [];
  if(model.walls.length === 0){ list.push(RO.firstWall); return list; }
  if(!isClosedLoop()){
    var freeEnds = 0;
    model.walls.forEach(function(w){
      if(isFreeEnd(w,'from')) freeEnds++;
      if(isFreeEnd(w,'to')) freeEnds++;
    });
    if(freeEnds > 0) list.push(RO.freeEnds(freeEnds));
    else list.push(RO.notClosed);
  }
  if(model.ceilingHeightCm == null) list.push(RO.ceilingMissing);
  // A door has no missing-hinge/swing case any more — defaultDoorSwing
  // sets both the moment a door exists, so unlike a window's sill
  // (still opt-in, still worth flagging) there's nothing here for a
  // door to ever be caught missing.
  var winMissing = 0;
  model.walls.forEach(function(w){
    w.segments.forEach(function(s){
      if(s.kind === 'window' && s.sill == null) winMissing++;
    });
  });
  if(winMissing) list.push(RO.sillsMissing(winMissing));
  return list;
}
/* ======================================================================
   DRAW ANYWHERE + SNAP — a stroke can start on empty canvas at any
   time, with no current point. Snapping (checked at press, and again
   at release) does the joining: a free end or corner welds exactly; a
   point along an existing wall's line splits it (T-junction, so both
   halves stay addressable); alignment with some other point nudges the
   length so an edge lines up, without welding. The snap radius is in
   SCREEN PIXELS so it feels the same at every zoom and on both devices.
   If nothing is near enough, the stroke stands as a free-floating piece
   — allowed, not an error; SPEC: "the missing list should say what is
   dangling rather than refusing the stroke."
   ====================================================================== */
function distPx(a, b, t){ return Math.hypot(a.x-b.x, a.y-b.y) * t.scale; }
function projectOnSegment(pt, a, b){
  var dx=b.x-a.x, dy=b.y-a.y;
  var len2 = dx*dx+dy*dy;
  if(len2 < 1e-9) return { t:0, point:{x:a.x,y:a.y} };
  var tt = ((pt.x-a.x)*dx + (pt.y-a.y)*dy) / len2;
  var tc = clamp(tt,0,1);
  return { t: tc, point: { x:a.x+dx*tc, y:a.y+dy*tc } };
}
// Every existing wall endpoint, deduped by exact point (a corner has
// two references at the same spot; a free end has one).
function collectVertices(){
  var seen = {};
  model.walls.forEach(function(w){
    [['from',w.from],['to',w.to]].forEach(function(pair){
      var key = pointKey(pair[1]);
      if(!seen[key]) seen[key] = { point: pair[1], refs: [] };
      seen[key].refs.push({ wall:w, end: pair[0] });
    });
  });
  var out = []; for(var k in seen) out.push(seen[k]);
  return out;
}
// Snap check for a stroke's START point (pressed on empty canvas, no
// heading known yet — alignment doesn't apply here, only welding).
// Vertex-only (free ends and corners), NOT T-junctions: the snap radius
// is always smaller than half the hit-rect width a wall's own body
// already claims, so a press near enough to a wall's LINE to T-junction
// there is always already inside that wall's own seg-hit — which must
// mean "push this wall" (SPEC's own table), never "branch off it."
// T-junction only ever happens at the far end of an active drag (see
// findEndpointSnap) — never at where the gesture itself started.
function findStartSnap(pt, t){
  var vertices = collectVertices();
  var bestV = null, bestVPx = SNAP_PX;
  vertices.forEach(function(v){
    var d = distPx(pt, v.point, t);
    if(d <= bestVPx){ bestVPx = d; bestV = v; }
  });
  if(bestV) return { kind: bestV.refs.length===1?'end':'corner', point: {x:bestV.point.x,y:bestV.point.y}, weld:true };
  return { kind:'none', point: { x:r(pt.x), y:r(pt.y) }, weld:false };
}
// Snap check for a stroke's live/END point, given a fixed start and the
// orthogonally-snapped heading. A vertex weld ('end'/'corner') here
// still returns the target vertex's own exact point — identifying WHICH
// vertex to weld onto — even when that point is off the stroke's own
// axis; commitDrawStroke is what squares the geometry at commit time
// (SPEC-lessons, round five), moving the target vertex onto this axis
// and absorbing the difference into the walls attached to it, rather
// than storing a diagonal. A T-junction is different: since every wall
// in the model is already axis-aligned by construction (makeWall
// refuses anything else), a stroke crossing a PERPENDICULAR wall has an
// exact intersection with the stroke's own axis and needs no squaring
// at all — see below, this snaps to that true intersection, not the
// nearest point on the wall. Alignment (tier 4) never welds: only the
// length changes, so the wall the human is actively drawing stays
// exactly orthogonal from its own start.
function findEndpointSnap(startPt, heading, rawLen, t){
  var dvec = headingVec(heading);
  var rawEnd = { x: startPt.x + dvec.x*rawLen, y: startPt.y + dvec.y*rawLen };
  var vertices = collectVertices();
  var bestV = null, bestVPx = SNAP_PX;
  vertices.forEach(function(v){
    var d = distPx(rawEnd, v.point, t);
    if(d <= bestVPx){ bestVPx = d; bestV = v; }
  });
  if(bestV) return { kind: bestV.refs.length===1?'end':'corner', point: {x:bestV.point.x,y:bestV.point.y}, weld:true };
  var strokeHorizontal = (heading==='E' || heading==='W');
  var bestSeg = null, bestSegPx = SNAP_PX;
  model.walls.forEach(function(w){
    var wVertical = (headingOf(w)==='N' || headingOf(w)==='S');
    if(wVertical !== strokeHorizontal) return; // parallel to the stroke: no perpendicular crossing
    // The true intersection of the stroke's own axis (through startPt)
    // with this wall's line — exact by construction, not a nearest-
    // point projection, so it needs no length change on either side.
    var ipoint = strokeHorizontal ? { x: w.from.x, y: startPt.y } : { x: startPt.x, y: w.from.y };
    var along = strokeHorizontal
      ? (ipoint.x - w.from.x) / (w.to.x - w.from.x)
      : (ipoint.y - w.from.y) / (w.to.y - w.from.y);
    if(along <= 0.02 || along >= 0.98) return; // off the wall's own ends
    var d = distPx(rawEnd, ipoint, t);
    if(d <= bestSegPx){ bestSegPx = d; bestSeg = { wall:w, point: ipoint }; }
  });
  if(bestSeg) return { kind:'tjunction', point: {x:bestSeg.point.x,y:bestSeg.point.y}, wallId: bestSeg.wall.id, weld:true };
  var bestAlign = null, bestAlignPx = SNAP_PX;
  vertices.forEach(function(v){
    var free = (heading==='E'||heading==='W') ? v.point.x : v.point.y;
    var rawFree = (heading==='E'||heading==='W') ? rawEnd.x : rawEnd.y;
    var dPx = Math.abs(free-rawFree)*t.scale;
    if(dPx <= bestAlignPx){ bestAlignPx = dPx; bestAlign = { free:free, guideAt:v.point }; }
  });
  if(bestAlign){
    var alignedEnd = (heading==='E'||heading==='W')
      ? { x: bestAlign.free, y: startPt.y }
      : { x: startPt.x, y: bestAlign.free };
    return { kind:'align', point: alignedEnd, guideAt: bestAlign.guideAt, weld:false };
  }
  return { kind:'none', point: { x: r(rawEnd.x), y: r(rawEnd.y) }, weld:false };
}
// Snap check for a free-end RESIZE drag (see the 'resize' drag kind,
// GESTURE ROUTER below): 1 DOF, exactly like a push, but measured from
// the wall's own FIXED end along its own heading rather than along its
// normal -- pulling a free end lengthens/shortens the wall on its own
// axis, so this is really the same 2-DOF-collapsed-to-1 shape as a draw
// stroke whose start point and heading are both already pinned. Reusing
// findEndpointSnap wholesale (rather than a bespoke 1-DOF search) is
// what gets vertex welds, T-junctions and the alignment guide for free.
// `pt` is the raw pointer position in cm; the floor keeps the wall from
// being pulled shorter than MIN_WALL or its own openings can allow.
function resizeEndpointSnap(w, ds, pt, t){
  var fixedPt = w[ds.fixedEnd];
  var dvec = headingVec(ds.heading);
  var rawLen = (pt.x-fixedPt.x)*dvec.x + (pt.y-fixedPt.y)*dvec.y;
  var openingsTotal = 0;
  w.segments.forEach(function(s){ if(s.kind==='window'||s.kind==='door') openingsTotal += s.length.value; });
  rawLen = Math.max(Math.max(MIN_WALL, openingsTotal), rawLen);
  var snap = findEndpointSnap(fixedPt, ds.heading, rawLen, t);
  // A vertex weld ('end'/'corner') hands back the TARGET's own exact
  // point even when it sits off this wall's axis -- fine for a fresh
  // draw stroke, where commitDrawStroke squares the geometry afterwards
  // by moving the target and absorbing the difference into ITS OWN
  // walls (SPEC-lessons, round five). A resize has no such squaring
  // step: callers write this point straight into w[ds.movingEnd], so an
  // off-axis weld here would silently build the diagonal wall makeWall
  // refuses to ever construct. Refuse it when the target isn't on-axis
  // within WELD_EPS and fall back to the plain on-axis projection --
  // a length change only, no weld, exactly like the 'align' case above.
  if(snap.weld && (snap.kind==='end' || snap.kind==='corner')){
    var offAxis = (ds.heading==='E'||ds.heading==='W') ? Math.abs(snap.point.y-fixedPt.y) : Math.abs(snap.point.x-fixedPt.x);
    if(offAxis >= WELD_EPS){
      var onAxisLen = (snap.point.x-fixedPt.x)*dvec.x + (snap.point.y-fixedPt.y)*dvec.y;
      return { kind:'none', point: { x:r(fixedPt.x+dvec.x*onAxisLen), y:r(fixedPt.y+dvec.y*onAxisLen) }, weld:false };
    }
  }
  return snap;
}
// Snap check for a PUSH drag. Unlike drawing (2 DOF at the far end) a
// push has exactly ONE degree of freedom — translation along the
// dragged wall's own normal — so there is no "nearest vertex in 2D" to
// test, only how far along that single axis a FREE end would have to
// travel to land exactly on some other vertex already in the model. A
// welded end has no freedom of its own to chase a snap independently of
// its neighbour, so only isFreeEnd ends are ever checked here.
function findPushSnap(w, rawDelta, t){
  var n = wallNormal(w), d = wallDir(w);
  var vertices = collectVertices();
  var best = null, bestPx = SNAP_PX;
  ['from','to'].forEach(function(end){
    if(!isFreeEnd(w, end)) return;
    var E = w[end];
    vertices.forEach(function(v){
      // "a vertex not belonging to the dragged wall" — chasing the
      // wall's own other end (or itself) isn't a snap.
      var onSelf = v.refs.some(function(ref){ return ref.wall.id === w.id; });
      if(onSelf) return;
      var vd = (v.point.x-E.x)*n.x + (v.point.y-E.y)*n.y;
      var offAxis = (v.point.x-E.x)*d.x + (v.point.y-E.y)*d.y;
      // Off-axis has to be (near) zero: a push only ever moves along
      // the wall's own normal. A candidate that matches on that axis
      // but sits off to the side along the wall's own length would
      // need the wall slid sideways too to truly reach it — which
      // stretches whatever is welded at the wall's OTHER end. Refuse
      // rather than do that silently; the user asked to push, not to
      // resize a neighbour they never touched.
      if(Math.abs(offAxis) > 1) return;
      var px = Math.abs(vd - rawDelta) * t.scale;
      if(px <= bestPx){ bestPx = px; best = { delta: vd, point: {x:v.point.x,y:v.point.y}, end: end }; }
    });
  });
  return best;
}
// Snap check for a CORNER drag: 2 DOF, so — like findStartSnap — this
// is a plain nearest-vertex search on the raw target point, just
// excluding every vertex that shares a wall with the one being
// dragged (those walls, and both their ends, move together with the
// corner itself, so they can never be a meaningful snap target).
function findCornerSnap(vertexPt, dx, dy, t){
  var touchIds = {};
  wallsAtPoint(vertexPt, null).forEach(function(tc){ touchIds[tc.wall.id] = true; });
  var target = { x: vertexPt.x+dx, y: vertexPt.y+dy };
  var vertices = collectVertices();
  var best = null, bestPx = SNAP_PX;
  vertices.forEach(function(v){
    var participates = v.refs.some(function(ref){ return touchIds[ref.wall.id]; });
    if(participates) return;
    var d = distPx(target, v.point, t);
    if(d <= bestPx){ bestPx = d; best = { x:v.point.x, y:v.point.y }; }
  });
  return best;
}
// T-junction: split an existing wall at `point` (which must lie
// strictly between its own ends) into two, so both halves stay
// addressable — id, hit target and chip of their own.
function splitWallAtPoint(wallId, point){
  var w = findWall(wallId); if(!w) return null;
  var d = wallDir(w);
  var total = r(wallLen(w));
  var offset = clamp(r((point.x-w.from.x)*d.x + (point.y-w.from.y)*d.y), 1, total-1);
  var leadSegs = sliceSegments(w.segments, 0, offset);
  var tailSegs = sliceSegments(w.segments, offset, total);
  var mid = { x: w.from.x + d.x*offset, y: w.from.y + d.y*offset };
  var wLead = { id:uid('wall'), from:{x:w.from.x,y:w.from.y}, to:{x:mid.x,y:mid.y}, lengthSource:'computed', isOpen:w.isOpen, segments:leadSegs };
  var wTail = { id:uid('wall'), from:{x:mid.x,y:mid.y}, to:{x:w.to.x,y:w.to.y}, lengthSource:'computed', isOpen:w.isOpen, segments:tailSegs };
  var idx = model.walls.indexOf(w);
  model.walls.splice(idx, 1, wLead, wTail);
  return { point: mid, leadId: wLead.id, tailId: wTail.id };
}
// Squares a weld onto an existing vertex that sits off the drawn
// stroke's own axis (SPEC-lessons, round five). Called only at COMMIT
// time, never during a live preview, since it mutates existing
// geometry. `vertexPoint` is the target being welded onto; `startPt`/
// `heading` describe the new stroke's own axis. Already on-axis is a
// no-op. Otherwise every wall currently touching vertexPoint must run
// PERPENDICULAR to the stroke's heading — only then does moving just
// that one shared endpoint change that wall's length, rather than
// making it diagonal too (a wall parallel to the correction axis would
// go crooked the same way the original bug did, just moved one wall
// over). If any attached wall isn't perpendicular, or if the move would
// leave a wall shorter than the openings on it need, refuse — the
// caller leaves the ends unjoined rather than force a diagonal or an
// impossible wall (rule 4).
function squareWeldToVertex(vertexPoint, startPt, heading){
  var axisIsY = (heading==='E' || heading==='W'); // stroke runs horizontally: correct the vertex's Y
  var corrected = axisIsY
    ? { x: r(vertexPoint.x), y: r(startPt.y) }
    : { x: r(startPt.x), y: r(vertexPoint.y) };
  if(pointsEqual(vertexPoint, corrected)){
    return { ok:true, point: { x:r(vertexPoint.x), y:r(vertexPoint.y) }, changed: [] };
  }
  var touches = wallsAtPoint(vertexPoint, null);
  var safe = touches.every(function(t){
    var h = headingOf(t.wall);
    return axisIsY ? (h==='N'||h==='S') : (h==='E'||h==='W');
  });
  if(!safe) return { ok:false, reason:'structural' };
  for(var i=0;i<touches.length;i++){
    var tw = touches[i].wall;
    var otherEnd = touches[i].end==='from' ? tw.to : tw.from;
    var newLen = dist(otherEnd, corrected);
    var openingsTotal = 0;
    tw.segments.forEach(function(s){ if(s.kind==='window'||s.kind==='door') openingsTotal += s.length.value; });
    var floor = Math.max(MIN_WALL, openingsTotal);
    if(newLen < floor) return { ok:false, reason:'openings', wall:tw, needed:floor, got:r(newLen) };
  }
  var changed = [];
  touches.forEach(function(t){
    var tw = t.wall;
    var before = r(wallLen(tw));
    tw[t.end].x = corrected.x; tw[t.end].y = corrected.y;
    var after = r(wallLen(tw));
    if(after !== before) changed.push({ wall: tw, before: before, after: after });
  });
  return { ok:true, point: corrected, changed: changed };
}
var pendingFocusSegId = null;
// Commits a drawn stroke. Resolves any T-junction splits first (so the
// new wall's own endpoints land exactly on the freshly-made joints),
// then squares any vertex weld that's off the stroke's own axis before
// the new wall is ever created — makeWall refuses a diagonal outright,
// so this has to happen first, not as a later cleanup pass — then adds
// the new wall and lets cleanupOutline merge it into a collinear
// neighbour it welded onto, same as any other edit.
function commitDrawStroke(startPt, startSnap, endPt, endSnap, heading, t){
  // Below the absolute structural floor, OR — new — too small on
  // SCREEN to have been a deliberate stroke rather than a mis-click
  // (screen px, not cm, so it behaves identically at every zoom level;
  // TAP_PX only ever decided tap-vs-drag back at press time). Refusing
  // here means exactly what a tap on empty canvas already means
  // (handleTap's 'draw' case): deselect, nothing committed — and no
  // history entry pushed below for a stroke nothing came of.
  if(dist(startPt, endPt) < MIN_WALL || (t && dist(startPt, endPt)*t.scale < MIN_STROKE_PX)){
    selection = null;
    return;
  }
  pushHistory();
  if(startSnap && startSnap.kind === 'tjunction') splitWallAtPoint(startSnap.wallId, startPt);
  if(endSnap && endSnap.kind === 'tjunction') splitWallAtPoint(endSnap.wallId, endPt);

  var finalStartPt = startPt, finalEndPt = endPt, squareChanges = null;
  if(endSnap && (endSnap.kind === 'end' || endSnap.kind === 'corner') && heading){
    var dvec = headingVec(heading);
    var target = { x: r(endPt.x), y: r(endPt.y) };
    var onAxisAlready = (heading==='E'||heading==='W') ? (r(startPt.y)===target.y) : (r(startPt.x)===target.x);
    var startIsFree = !startSnap || startSnap.kind === 'none';
    if(onAxisAlready){
      finalEndPt = target;
    } else if(startIsFree){
      // Priority (a) — SPEC-lessons, round six, rule 1: the fresh
      // stroke is the rough one, so IT moves, never the wall someone
      // already measured. Its other (start) end is free — nothing is
      // welded there — so the whole stroke translates perpendicular to
      // its own heading until its far end lands exactly on the target;
      // length and heading stay exactly as drawn/typed. Nothing already
      // on the canvas changes, so nothing needs disclosing.
      var rawLen = Math.max(Math.abs(endPt.x-startPt.x), Math.abs(endPt.y-startPt.y));
      finalEndPt = target;
      finalStartPt = { x: r(target.x - dvec.x*rawLen), y: r(target.y - dvec.y*rawLen) };
    } else {
      // Priority (b): the new stroke's OTHER end is welded too, so it
      // can't be translated without breaking that weld — fall back to
      // round five's behaviour instead (move the target vertex, absorb
      // the difference into the attached wall, disclose, downgrade).
      var sq = squareWeldToVertex(endPt, startPt, heading);
      if(sq.ok){
        finalEndPt = sq.point;
        if(sq.changed.length) squareChanges = sq.changed;
      } else {
        // Priority (c): cannot square either way — leave the ends
        // unjoined rather than force a diagonal wall or shrink one past
        // its own openings. The stroke still commits, on its own axis,
        // at approximately the length actually drawn; it just doesn't
        // touch the target vertex, so computeUnanswered already
        // reports the resulting free end — no separate disclosure
        // plumbing needed.
        var fallbackLen = Math.max(Math.abs(endPt.x-startPt.x), Math.abs(endPt.y-startPt.y));
        finalEndPt = { x: r(startPt.x + dvec.x*fallbackLen), y: r(startPt.y + dvec.y*fallbackLen) };
      }
    }
  }

  var w = makeWall(finalStartPt, finalEndPt, 'drawn');
  var newSegId = w.segments[0].id;
  model.walls.push(w);
  // Downgrade provenance on whatever squaring actually changed BEFORE
  // cleanupOutline runs — an untouched wall keeps 'typed'/'drawn';
  // only a wall whose length changed to make the loop square becomes
  // 'computed' (rule 3). If cleanupOutline goes on to merge it into a
  // collinear neighbour, that merge already marks the result 'computed'
  // on its own, so this is never lost, only possibly redundant.
  if(squareChanges) squareChanges.forEach(function(c){ c.wall.lengthSource = 'computed'; });
  cleanupOutline();
  syncSegmentsForAllWalls();
  selection = { segId: newSegId };
  pendingFocusSegId = newSegId;
  if(squareChanges){
    // Disclosed in plain cm, in C's voice — silence was the whole
    // problem (rule 2).
    var msg = squareChanges.map(function(c){
      return RO.squarePart(headingOf(c.wall), c.before, c.after);
    }).join('; ');
    showToast(RO.squareToast(msg));
  }
  render();
}

/* ======================================================================
   WALL-TOTAL RESHAPE — "correcting a wall" (SPEC-lessons #6). Typing a
   plain wall/open PIECE's length, or the wall's own aggregate chip,
   both hold every OTHER piece on this wall exactly where it is and let
   the wall's own far corner absorb the difference — one hop past the
   wall actually touched, same as a push. If that end is still free
   (nothing welded there yet), the wall just extends/shortens on its own.
   ====================================================================== */
function setWallLengthExact(wallId, newLength, source){
  var w = findWall(wallId); if(!w) return false;
  var oldLen = wallLen(w);
  var delta = newLength - oldLen;
  w.lengthSource = source || 'typed';
  if(Math.abs(delta) < 1e-9){ syncSegmentsForAllWalls(); return false; }
  var d = wallDir(w);
  var nextInfo = neighborAt(w, 'to');
  if(!nextInfo){
    w.to.x = w.from.x + d.x*newLength; w.to.y = w.from.y + d.y*newLength;
    cleanupOutline(); syncSegmentsForAllWalls(); return false;
  }
  var next = nextInfo.wall;
  var nn = wallNormal(next);
  var sign = (d.x*nn.x + d.y*nn.y) >= 0 ? 1 : -1;
  var afterEnd = nextInfo.end === 'from' ? 'to' : 'from';
  var afterInfo = neighborAt(next, afterEnd);
  var afterBefore = afterInfo ? wallLen(afterInfo.wall) : null;
  pushWallByRef(next, sign*delta);
  if(afterInfo && wallLen(afterInfo.wall) !== afterBefore) afterInfo.wall.lengthSource = 'computed';
  cleanupOutline();
  syncSegmentsForAllWalls();
  return true;
}
function commitWallPieceLength(segId, newLenRaw, source){
  var f = findSegAnywhere(segId); if(!f) return { ok:true };
  var w = f.wall, seg = f.seg;
  var newLen = Math.max(minFor(seg.kind), r(newLenRaw));
  if(newLen === seg.length.value){ seg.length.source = source; render(); return { ok:true }; }
  pushHistory();
  var otherTotal = segTotal(w) - seg.length.value;
  var newWallTotal = otherTotal + newLen;
  seg.length.value = newLen;
  seg.length.source = source;
  reflow(w);
  var reshaped = setWallLengthExact(w.id, newWallTotal, otherTotal === 0 ? source : 'computed');
  if(reshaped) showToast(RO.reshapedFar(newWallTotal));
  render();
  return { ok:true };
}
function commitWallTotal(anySegIdOnWall, newTotalRaw, source){
  var f = findSegAnywhere(anySegIdOnWall); if(!f) return { ok:false };
  var w = f.wall;
  var openingsTotal = 0;
  w.segments.forEach(function(s){ if(s.kind==='window'||s.kind==='door') openingsTotal += s.length.value; });
  var floor = Math.max(MIN_WALL, openingsTotal);
  var newTotal = r(newTotalRaw);
  if(newTotal < floor) return { ok:false, max: floor };
  pushHistory();
  var reshaped = setWallLengthExact(w.id, newTotal, source);
  if(reshaped) showToast(RO.reshaped(newTotal));
  render();
  return { ok:true };
}
function setCeilingHeight(v){
  pushHistory();
  model.ceilingHeightCm = r(v);
  render();
}

/* ======================================================================
   LENGTH PARSING — metres-shorthand trap (SPEC-shared-contract bug class 5).
   ====================================================================== */
function parseLengthInput(raw){
  var s = String(raw).trim().replace(',', '.');
  if(s === '') return { ok:false };
  if(/^\d{1,2}\.\d{1,2}$/.test(s)){
    var metres = parseFloat(s);
    return { ok:true, needsConfirm:true, cmIfMetres: r(metres*100), raw:s };
  }
  var n = parseFloat(s);
  if(!isFinite(n) || n < 0) return { ok:false };
  return { ok:true, needsConfirm:false, cm: r(n) };
}

/* ======================================================================
   TOAST + CONFIRM — state only; DOM reflection lives in RENDER.
   ====================================================================== */
function showToast(text){ toastState = { text: text }; }
function hideToast(){ toastState = null; }
function showConfirm(message, yesLabel, onYes, onNo){
  confirmState = { message:message, yesLabel:yesLabel, onYes:onYes, onNo:onNo };
  render();
}
function hideConfirm(){ confirmState = null; }

/* ======================================================================
   PUBLIC TEST API — outline/index reflect the DERIVED ring order when
   closed (via traceChain), never array-creation order; each wall's own
   from/to/segments are reported exactly as stored (no re-orientation),
   so hinge/swing keep meaning what they already say relative to that
   wall's own from->to.
   ====================================================================== */
function buildRoomSnapshot(){
  var ring = findClosedRing();
  var closed = !!ring;
  var visited = {};
  var chains = [];
  model.walls.forEach(function(w){
    if(visited[w.id]) return;
    var startEnd = isFreeEnd(w,'from') ? 'from' : (isFreeEnd(w,'to') ? 'to' : 'from');
    var chain = traceChain(w, startEnd);
    for(var id in chain.visited) visited[id] = true;
    chains.push(chain);
  });
  var orderedWalls = closed
    ? ring.walls.map(function(e){ return e.wall; })
    : chains.reduce(function(acc,c){ return acc.concat(c.walls.map(function(e){ return e.wall; })); }, []);
  var outline = closed ? ring.points : (chains.length ? chains[0].points : []);

  var walls = orderedWalls.map(function(w, wi){
    var segments = w.segments.map(function(s){
      return {
        id: s.id, kind: s.kind,
        lengthCm: { value: s.length.value, source: s.length.source },
        offsetFromStartCm: s.offsetFromStart,
        sillCm: s.kind==='window' ? (s.sill ? s.sill.value : null) : null,
        hinge: s.kind==='door' ? (s.hinge || null) : null,
        hingeSource: s.kind==='door' ? (s.hingeSource || null) : null,
        swing: s.kind==='door' ? (s.swing || null) : null,
        swingSource: s.kind==='door' ? (s.swingSource || null) : null
      };
    });
    return {
      id: w.id, index: wi,
      from: [r(w.from.x), r(w.from.y)], to: [r(w.to.x), r(w.to.y)],
      heading: headingOf(w),
      lengthCm: { value: r(wallLen(w)), source: w.lengthSource },
      segments: segments
    };
  });
  var openings = [];
  walls.forEach(function(w){
    w.segments.forEach(function(s){
      if(s.kind === 'window' || s.kind === 'door'){
        var o = { wallId:w.id }; for(var k in s) o[k]=s[k]; openings.push(o);
      }
    });
  });
  var unanswered = computeUnanswered();
  return {
    unit: 'cm',
    ceilingHeightCm: model.ceilingHeightCm,
    closed: closed,
    outline: outline,
    walls: walls,
    openings: openings,
    unanswered: unanswered,
    finished: unanswered.length === 0
  };
}
/* ======================================================================
   DOM REFS
   ====================================================================== */
var svgEl, ctrlLayerEl, emptyHintEl, toastEl, toastTextEl, toastDismissEl,
    clusterEl, ceilingInputEl, undoBtn, redoBtn, missingListEl, missingBtn, missingDividerEl,
    confirmDialogEl, confirmDialogTextEl, confirmYesBtn, confirmNoBtn;

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

/* ======================================================================
   VIEW TRANSFORM — cm (model space) <-> screen px, derived from the
   SVG's own viewBox and its current bounding rect. Chips/cluster/labels
   live as ordinary positioned HTML elements in #ctrlLayer, never inside
   the SVG, so nothing that carries text or a real input can inherit its
   zoom (SPEC-lessons #17).
   ====================================================================== */
function currentViewBox(){
  var parts = (svgEl.getAttribute('viewBox')||'-200 -200 400 400').split(/\s+/).map(Number);
  return { x:parts[0], y:parts[1], w:parts[2], h:parts[3] };
}
function viewTransform(){
  var rect = svgEl.getBoundingClientRect();
  var vb = currentViewBox();
  var scale = (rect.width>0 && rect.height>0) ? Math.min(rect.width/vb.w, rect.height/vb.h) : 1;
  var offX = rect.left + (rect.width - vb.w*scale)/2;
  var offY = rect.top + (rect.height - vb.h*scale)/2;
  return { scale:scale, offX:offX, offY:offY, vb:vb, rect:rect };
}
function cmToClient(pt, t){ return { x: t.offX + (pt.x - t.vb.x)*t.scale, y: t.offY + (pt.y - t.vb.y)*t.scale }; }
function clientToCm(clientX, clientY, t){ return { x: t.vb.x + (clientX-t.offX)/t.scale, y: t.vb.y + (clientY-t.offY)/t.scale }; }
function cmToStage(pt, t){
  var c = cmToClient(pt,t);
  var sr = $id('stage').getBoundingClientRect();
  return { x:c.x-sr.left, y:c.y-sr.top };
}
// Bounds the viewBox to roughly 1.3x the room's own extent, whatever the
// stage's pixel size — the margin is a fixed fraction of the room's OWN
// extent, never a function of stage pixel size (SPEC-lessons #14).
// A generous, fixed pixel estimate of the bottom bar's own worst-case
// height — deliberately not measured from the live DOM here, so
// reserving room for it can never become a circular solve against its
// own last answer (that circularity is exactly lesson 14's bug), and
// deliberately never a function of what is currently selected either
// (that was round three's bug — see fitViewBox, and see below: this is
// still unconditional). The bar used to be a docked panel whose content
// varied a lot by selection (up to 320x200 for a door with a "Move to"
// row) — now it is fixed screen chrome: plate two (#cluster) is a
// single row for a plain wall/open edge, a second row for an opening's
// own "Starts at", and a THIRD for a window's own "Sill height" on top
// of that (plate one bottom-aligns against whichever is taller, it
// never forces plate two to grow to match it) — and the whole bar only
// wraps to two STACKED rows on a narrow phone. Add-opening, rotate and
// delete used to share plate two's first row too (still true when this
// constant was last set to 130); they now render on the piece action
// bar instead (see PIECE ACTION BAR), which only made that first row
// NARROWER, not shorter — the ordinary worst case is still a window's
// three stacked rows, measured at 162px at a 1100px stage. 190 keeps a
// real but no longer inflated margin over that (the narrow-phone
// stacked case doesn't need its own budget here: a narrower stage
// already leaves less room UNDER the room for the ordinary 1.3x fit to
// begin with, which is what widens the deficit this reserves against,
// below).
var PANEL_RESERVE_PX = 190;
// A touch tap aimed at a wall near the bar's edge can still land on the
// bar even when their rectangles don't literally intersect: Chrome's
// real touch-target adjustment (confirmed empirically — a 6px gap was
// not enough) snaps an imprecise touch to the nearest interactive
// element within a small radius. A plain non-intersection rule is
// necessary but not sufficient; this is the real clearance kept between
// the bar and the room's own bounding box, well past that radius.
var PANEL_GAP_PX = 28;

function fitViewBox(){
  var pts = [];
  model.walls.forEach(function(w){ pts.push(w.from); pts.push(w.to); });
  if(dragState){
    if(dragState.kind==='draw' && dragState.committed){
      if(dragState.startPt) pts.push(dragState.startPt);
      if(dragState.endPoint) pts.push(dragState.endPoint);
    }
  }
  if(pts.length === 0){ svgEl.setAttribute('viewBox','-200 -200 400 400'); return; }
  var minX=pts[0].x,maxX=pts[0].x,minY=pts[0].y,maxY=pts[0].y;
  pts.forEach(function(p){ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
  // A floor stops an absurd zoom on a genuinely tiny stub (a 20cm
  // scrap), nothing more — rooms of 3-4m are the common case here, and
  // a floor anywhere near that size would visibly shrink an ordinary
  // room for no reason a user could see (SPEC-lessons, round nine).
  var w=maxX-minX, h=maxY-minY, minSize=100;
  if(w<minSize){ var a=(minSize-w)/2; minX-=a; maxX+=a; w=minSize; }
  if(h<minSize){ var a2=(minSize-h)/2; minY-=a2; maxY+=a2; h=minSize; }
  var padX = Math.max(45, w*0.15);
  var padY = Math.max(45, h*0.15);
  var padBottom = padY;

  // The bottom bar may only ever cover canvas OUTSIDE the room's own
  // bounding box, never any wall's hit rect (SPEC-lessons #15).
  // Reserved PERMANENTLY — unconditionally, whether or not anything is
  // selected, and regardless of which piece or kind it is — never
  // "on demand" (round three's rescale-on-select defect: making room
  // only when something was selected meant every draw stroke, which
  // auto-selects what it just drew, rescaled and shifted the whole
  // room out from under the next stroke). This constant is read from
  // `model`/`dragState` alone, never `selection` — the bar's own two
  // plates change what they show, never how much space fitViewBox
  // sets aside for them.
  //
  // Round nine: the reservation used to be added as a flat CM amount
  // derived from PANEL_RESERVE_PX / baseScale — but baseScale is
  // itself roughly (stage width)/(room width) on a typical wide room
  // and narrow phone, so that CM amount grew right along with the
  // room's own width, and the height ratio it produced never actually
  // stabilised the way the width ratio does — a bigger room reserved
  // more absolute space for a bar whose own pixel size never changes.
  // The fix: figure out how much space the ORDINARY (bar-blind)
  // 1.3x-both-axes fit already leaves below the room for free — the
  // fit is usually width-bound on a narrow phone, which centers a
  // shorter-than-the-stage viewBox and leaves real, unused pixels
  // above and below the room as a side effect — and only reserve the
  // DEFICIT between that and what the bar actually needs, converted
  // at THIS fit's own scale (never iterated against a previous
  // viewBox, never a live measurement of the bar's actual on-screen
  // content — both of those are exactly how lesson 14's feedback-loop
  // bug and round three's rescale-on-select bug happened). When the
  // room already leaves enough room below it for free — the common
  // case for a wide room on a narrow phone — this reserves nothing at
  // all, and the height ratio behaves exactly like the width one.
  var stageEl = $id('stage');
  var stageRect = stageEl ? stageEl.getBoundingClientRect() : null;
  if(stageRect && stageRect.width > 0 && stageRect.height > 0){
    var stdW = w+2*padX, stdH = h+2*padY;
    var stdScale = Math.min(stageRect.width/stdW, stageRect.height/stdH);
    var letterboxPx = Math.max(0, stageRect.height - stdH*stdScale) / 2;
    var spaceBelowRoomPx = padY*stdScale + letterboxPx;
    var neededPx = PANEL_RESERVE_PX + PANEL_GAP_PX;
    var deficitPx = Math.max(0, neededPx - spaceBelowRoomPx);
    if(deficitPx > 0) padBottom = padY + deficitPx/stdScale;
  }
  svgEl.setAttribute('viewBox', (minX-padX)+' '+(minY-padY)+' '+(w+2*padX)+' '+(h+padY+padBottom));
}

/* ======================================================================
   TOP-LEVEL RENDER
   ====================================================================== */
function render(){
  if(destroyed) return;
  // The piece that was selected as of the LAST render, if it no longer
  // is, just became eligible to merge into a collinear same-kind
  // neighbour (segIsFresh no longer protects it) — re-check its own
  // wall now, whichever of the many paths changed `selection` this
  // time (SPEC-lessons, round seven). A `drawn` piece is unaffected
  // either way: it stays protected regardless of selection until its
  // length is actually typed.
  var curSelSegId = selection ? selection.segId : null;
  if(lastSettledSegId !== null && lastSettledSegId !== curSelSegId){
    var settleF = findSegAnywhere(lastSettledSegId);
    if(settleF) mergeAdjacentPlain(settleF.wall);
  }
  lastSettledSegId = curSelSegId;
  // Freeze the view for the whole gesture: re-fitting on every move is a
  // feedback loop, not just wasted work (SPEC-lessons #13). Only refit
  // once a committed gesture ends, using whatever viewBox was already on
  // screen when it started.
  if(!(dragState && dragState.committed)) fitViewBox();
  var t = viewTransform();
  renderSvg(t);
  renderCtrlLayer(t);
  renderBar();
  renderToastDom();
  renderConfirmDialog();
  if(pendingFocusSegId){
    var id = pendingFocusSegId; pendingFocusSegId = null;
    var input = root.querySelector('[data-testid="dim-'+id+'"]');
    if(input){ input.focus(); input.select(); }
  }
  if(exposeGlobals) win.__lastModel = model;
  notifyChange();
}

/* ======================================================================
   SVG — geometry + hit-testing layers ONLY. No text, no foreignObject:
   every readable/typeable control lives in the HTML #ctrlLayer instead.
   ====================================================================== */
function segPoints(w, s){
  var d = wallDir(w);
  var p0 = { x: w.from.x + d.x*s.offsetFromStart, y: w.from.y + d.y*s.offsetFromStart };
  var p1 = { x: w.from.x + d.x*(s.offsetFromStart+s.length.value), y: w.from.y + d.y*(s.offsetFromStart+s.length.value) };
  return { p0:p0, p1:p1 };
}
function hitRectAttrs(p0, p1, hitCm){
  if(Math.abs(p0.y-p1.y) < 1e-6){
    var x0=Math.min(p0.x,p1.x), x1=Math.max(p0.x,p1.x);
    return { x:x0, y:p0.y-hitCm/2, w:(x1-x0), h:hitCm };
  }
  var y0=Math.min(p0.y,p1.y), y1=Math.max(p0.y,p1.y);
  return { x:p0.x-hitCm/2, y:y0, w:hitCm, h:(y1-y0) };
}
function segHitWidthCm(t){ return Math.max(14, 48/t.scale); }

function doorSvg(w, s, p0, p1, selected){
  // No unset case to draw — every door has a hinge/swing from the
  // moment it exists (defaultDoorSwing), so there's always a real leaf
  // and arc to show, never a dashed placeholder plus a "?" mark.
  var hingePt = s.hinge==='start' ? p0 : p1;
  var otherPt = s.hinge==='start' ? p1 : p0;
  var n2 = wallNormal(w);
  var sign = s.swing==='in' ? 1 : -1;
  var width = s.length.value;
  var tip = { x: hingePt.x + n2.x*width*sign, y: hingePt.y + n2.y*width*sign };
  var a1 = Math.atan2(tip.y-hingePt.y, tip.x-hingePt.x);
  var a2 = Math.atan2(otherPt.y-hingePt.y, otherPt.x-hingePt.x);
  var diff = ((a2-a1)+Math.PI*2) % (Math.PI*2);
  var sweep = diff <= Math.PI ? 1 : 0;
  // Leaf and arc are untouched — they were never the problem. The
  // opening itself is: painting it as a stroke the full thickness of
  // the band turned a doorway into a solid slab of colour heavier than
  // any wall on the drawing, which is backwards. A door is a HOLE. So
  // the band is filled with paper here (the hatch simply stops, the way
  // masonry stops at a doorway) and only the two jambs are drawn, one
  // short line across the thickness at each end. That reads as a gap
  // between two pieces of wall, which is what it is, and it leaves the
  // leaf and arc as the only real ink in the opening — the two marks
  // that actually say which way the door swings.
  var bq = wallBandPoints(w, false, false, p0, p1);
  var band = [bq.a, bq.b, bq.c, bq.e].map(function(q){ return q.x+','+q.y; }).join(' ');
  return '<polygon class="door-gap" points="'+band+'"></polygon>'
    + '<line class="door-jamb'+(selected?' selected':'')+'" x1="'+bq.a.x+'" y1="'+bq.a.y+'" x2="'+bq.b.x+'" y2="'+bq.b.y+'"></line>'
    + '<line class="door-jamb'+(selected?' selected':'')+'" x1="'+bq.e.x+'" y1="'+bq.e.y+'" x2="'+bq.c.x+'" y2="'+bq.c.y+'"></line>'
    + '<line class="door-leaf" x1="'+hingePt.x+'" y1="'+hingePt.y+'" x2="'+tip.x+'" y2="'+tip.y+'"></line>'
    + '<path class="door-arc" d="M '+tip.x+' '+tip.y+' A '+width+' '+width+' 0 0 '+sweep+' '+otherPt.x+' '+otherPt.y+'"></path>';
}
function windowSvg(w, p0, p1, selected){
  // Glazing-in-plan: three lines run the LENGTH of the opening — the
  // outer two on the wall band's two faces, one on its centreline —
  // instead of one wide stroke plus cross-ticks, so the symbol reads as
  // glass sitting IN the wall's thickness rather than replacing it.
  var n = wallNormal(w), half = WALL_THICKNESS_CM/2;
  var cls = 'win-line'+(selected?' selected':'');
  function face(off){
    return '<line class="'+cls+'" x1="'+(p0.x+n.x*off)+'" y1="'+(p0.y+n.y*off)+'" x2="'+(p1.x+n.x*off)+'" y2="'+(p1.y+n.y*off)+'"></line>';
  }
  return face(-half) + face(0) + face(half);
}
// The hatch fill for a 'wall' segment's poché band, defined ONCE (both
// a normal and an accent/selected variant, since fill is how a band's
// selection shows — see .wall-band.selected) and pushed at the top of
// every renderSvg string, never per segment: patternUnits=userSpaceOnUse
// plus a spacing in the SAME cm space as the room means the tile is
// fixed in the drawing, not the screen, so it doesn't shimmer on zoom.
var WALL_HATCH_DEFS =
  '<defs>' +
    '<pattern id="wallHatch" patternUnits="userSpaceOnUse" width="'+WALL_HATCH_SPACING_CM+'" height="'+WALL_HATCH_SPACING_CM+'" patternTransform="rotate(45)">' +
      '<line class="wall-hatch-line" x1="0" y1="0" x2="0" y2="'+WALL_HATCH_SPACING_CM+'"></line>' +
    '</pattern>' +
    '<pattern id="wallHatchSelected" patternUnits="userSpaceOnUse" width="'+WALL_HATCH_SPACING_CM+'" height="'+WALL_HATCH_SPACING_CM+'" patternTransform="rotate(45)">' +
      '<line class="wall-hatch-line selected" x1="0" y1="0" x2="0" y2="'+WALL_HATCH_SPACING_CM+'"></line>' +
    '</pattern>' +
  '</defs>';
// The four corners of a 'wall' segment's poché band, centred on the
// segment's own centreline (p0-p1) at WALL_THICKNESS_CM wide.
//
// Butt-jointed bands leave a notch at every corner, so an end gets
// extended by half the wall thickness — but only when THIS segment
// actually sits at the WALL's own physical endpoint (isFirst/isLast:
// an internal boundary between two segments on the same wall, e.g. a
// wall piece next to a window, is already flush with its neighbour and
// has no notch to close) AND that endpoint is welded to another wall.
// Walls are always axis-aligned (headingOf only ever returns N/S/E/W),
// so there's no miter to compute: each wall just extends its own band
// past the shared point, and the two (or more) extended bands overlap
// in the corner square exactly the way real masonry poché overlaps at
// a corner. The weld check is per END, not per wall, because one end
// of a wall can be welded into a corner while the other is still a
// free end standing in open air — only the welded one should square
// off into its neighbour; the free one has to stay flush at its own
// point, not overshoot past it.
function wallBandPoints(w, isFirst, isLast, p0, p1){
  var d = wallDir(w), n = wallNormal(w), half = WALL_THICKNESS_CM/2;
  var extStart = (isFirst && !isFreeEnd(w,'from')) ? half : 0;
  var extEnd = (isLast && !isFreeEnd(w,'to')) ? half : 0;
  var s0 = { x:p0.x - d.x*extStart, y:p0.y - d.y*extStart };
  var s1 = { x:p1.x + d.x*extEnd,   y:p1.y + d.y*extEnd };
  return {
    a:{ x:s0.x+n.x*half, y:s0.y+n.y*half },
    b:{ x:s0.x-n.x*half, y:s0.y-n.y*half },
    c:{ x:s1.x-n.x*half, y:s1.y-n.y*half },
    e:{ x:s1.x+n.x*half, y:s1.y+n.y*half }
  };
}
function snapMarkerMarkup(pt, t){
  var r1 = Math.max(9, 16/t.scale);
  return '<circle class="snap-ring" cx="'+pt.x+'" cy="'+pt.y+'" r="'+r1+'" stroke-width="'+Math.max(2,2.4/t.scale)+'"></circle>'
    + '<circle class="snap-dot" cx="'+pt.x+'" cy="'+pt.y+'" r="'+(r1*0.28)+'"></circle>';
}
function alignGuideMarkup(a, b, t){
  return '<line class="align-guide" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" stroke-width="'+Math.max(1.4,1.8/t.scale)+'"></line>';
}

/* ======================================================================
   ALL DIMENSIONS (ported from src/draw's dims.ts/DimLines/Dimensions,
   then generalised) — every segment shows its own length, always: the
   old defect was never "a number is visible", it was TWO numbers per
   segment (its own length AND its wall's total, both live at once) plus
   a resolver that slid a label off the very thing it measured once they
   collided. Fix those two things and always-on stops being a problem:
   one number per segment (tone alone carries selection), a wall's own
   total kept OFF except while one of its pieces is selected (it is the
   one number that duplicates what is already on screen), and crowding
   solved by fixed lanes instead of a search — see DIM_LANE_STEP_PX
   below. One function, called once from renderSvg (the dimension LINE
   under each number, always in the one consistent lane just outside the
   wall's own band) and once from renderCtrlLayer (the chip riding on
   it) — same a/b/normal/outCm feed both, so a number can never end up
   describing a different stretch of wall than the line drawn under it
   (dims.ts's own words: "one source for both halves").
   ====================================================================== */
// Lane geometry for the dimension chain along the OUTSIDE of a wall's
// own hatched band (WALL_THICKNESS_CM) — not the old hit-rectangle
// guess, which predates the band and could shrink thinner than it at a
// high zoom. Every segment's LINE sits in lane 0, always: a plain chain
// of dimensions the whole length of the wall, same as a real drawing.
// Only a CHIP can be bumped further out, and only when it would
// otherwise collide with a neighbour's (see assignChipLane below) — the
// line under it never moves, so a leader is drawn back to it.
var DIM_LANE0_GAP_PX = 10;   // screen px, band's outer face to lane 0
var DIM_CHIP_HALF_W_PX = 46; // screen px, half a chip's own width  -- how far a chip
var DIM_CHIP_HALF_H_PX = 19; // screen px, half a chip's own height -- must clear lane 0
                              // so that no part of it sits back over its own wall
var DIM_LANE_STEP_PX = 84;   // screen px between lanes -- must clear a
                              // chip's full footprint on EITHER axis, since a
                              // wall can run either way (see DIM_CHIP_FOOTPRINT_PX);
                              // kept tight (not the fatter round number a chip's own
                              // width alone would suggest) because it competes with
                              // fitViewBox's own fixed, selection-independent margin
                              // for room to land in without hitting placeInStage's
                              // edge clamp on anything but a very generous room
// A conservative, FIXED estimate of a chip's own on-screen footprint —
// not a real getBoundingClientRect, because the lane a chip lands in
// has to already be decided when renderSvg draws its line, before any
// chip exists in the DOM to measure (render() calls renderSvg, then
// renderCtrlLayer). The chip's input has a fixed CSS width regardless
// of the digits inside it (see .chip input), so this is stable across
// every value a chip could ever show, and thus across renders.
var DIM_CHIP_FOOTPRINT_PX = 84;
// The exact commit this segment's own chip already used, whether it's
// playing the "selected piece" role or the "gap beside an opening"
// role below — one set of rules, not two, regardless of which chip is
// asking. Mirrors the existing branch verbatim (SPEC-lessons #5/#6).
function segDimCommit(w, s){
  return function(cm){
    if(s.kind==='wall' || s.kind==='open' || !isClosedLoop()){
      commitWallPieceLength(s.id, cm, 'typed');
    } else {
      var res = resizeSegment(w.id, s.id, cm, 'typed');
      if(!res.ok) offerClamp(res, function(v){ resizeSegment(w.id, s.id, v, 'computed'); render(); });
      else render();
    }
  };
}
function segDimLabel(s){ return s.kind==='window' ? 'window width' : s.kind==='door' ? 'door width' : 'wall length'; }
function segDim(w, s, tone, outCm){
  var pts = segPoints(w, s);
  var n = wallNormal(w);
  return { testid:'dim-'+s.id, tone:tone, a:pts.p0, b:pts.p1, normal:{x:-n.x,y:-n.y}, outCm:outCm,
    value:s.length.value, source:s.length.source, label:segDimLabel(s), commit:segDimCommit(w, s) };
}
// Which outer lane a SEGMENT'S CHIP (not its line, which always stays
// in lane 0) lands in on its own wall: walk the wall's segments in
// their own order (offsetFromStart is monotonic, see segPoints) and
// keep, per lane, the along-wall pixel position of the last chip this
// wall already placed there; a new chip stays in lane 0 unless that
// would put it within DIM_CHIP_FOOTPRINT_PX of what's already there,
// in which case it steps out one lane and checks again. Deterministic
// and stable render to render — the only inputs are the model and the
// zoom, never anything a resolver guessed at — and a chip only ever
// moves ACROSS the wall, never ALONG it, so it can't drift away from
// the stretch it measures the way the old collision resolver's slide did.
function assignChipLane(w, mid, laneLastPx, t){
  var alongPx = dist(w.from, mid) * t.scale;
  var lane = 0;
  while(laneLastPx[lane] != null && Math.abs(alongPx - laneLastPx[lane]) < DIM_CHIP_FOOTPRINT_PX) lane++;
  laneLastPx[lane] = alongPx;
  return lane;
}
function allDims(t){
  var out = [];
  var selSegId = selection ? selection.segId : null;
  var lane0Cm = WALL_THICKNESS_CM/2 + DIM_LANE0_GAP_PX/t.scale;
  var laneStepCm = DIM_LANE_STEP_PX/t.scale;

  model.walls.forEach(function(w){
    var laneLastPx = []; // this wall's own bookkeeping only -- lanes never leak across walls
    w.segments.forEach(function(s){
      // A sliver nobody asked for is not a measurement (MIN_GAP_SHOWN's
      // own comment) — UNLESS it's the piece someone actually selected,
      // which still needs its own editable number regardless of size
      // (spec item 6: every number stays directly editable).
      if(s.length.value < MIN_GAP_SHOWN && s.id !== selSegId) return;
      var tone = (s.id === selSegId) ? 'primary' : 'side';
      var d = segDim(w, s, tone, lane0Cm);
      var mid = { x:(d.a.x+d.b.x)/2, y:(d.a.y+d.b.y)/2 };
      d.wallId = w.id;
      // A chip is CENTRED on wherever it's anchored, so anchoring it on
      // lane 0 straddles the dimension line: half the chip sits back
      // over the wall it measures. On a vertical wall that half is the
      // chip's own WIDTH (~46px), which reached all the way to the
      // wall's centreline — measured: a tap aimed at a wall at the row
      // where its number sits landed on the number instead, so the wall
      // could not be selected there at all. Push the chip out by its own
      // half-extent across the wall: its width on a wall whose normal
      // runs horizontally, its (much smaller) height on one whose normal
      // runs vertically. The LINE stays exactly on lane 0 — only the
      // chip clears it, so a plain chain of dimensions still reads
      // straight down the wall.
      var crossPx = Math.abs(d.normal.x) > 0.5 ? DIM_CHIP_HALF_W_PX : DIM_CHIP_HALF_H_PX;
      d.chipOutCm = lane0Cm + crossPx/t.scale + assignChipLane(w, mid, laneLastPx, t)*laneStepCm;
      out.push(d);
    });
  });

  // A wall's own total is the one number that must stay selection-
  // gated (spec item 4): showing it beside its own parts, always, is
  // exactly the duplication that made the old always-on version
  // unreadable. It appears only while a piece on THAT wall is
  // selected, and — line and chip together, a real second dimension
  // level, not a bumped chip — sits one lane past whichever chip lane
  // this render actually used on that wall, so it never lands on one.
  if(selection){
    var f = findSegAnywhere(selection.segId);
    if(f && f.wall.segments.length > 1){
      var w = f.wall, wn = wallNormal(w);
      var maxChipCm = lane0Cm;
      out.forEach(function(d){ if(d.wallId===w.id) maxChipCm = Math.max(maxChipCm, d.chipOutCm); });
      var totalLaneCm = maxChipCm + laneStepCm;
      out.push({
        testid:'wall-total-'+w.id, tone:'side', a:w.from, b:w.to, normal:{x:-wn.x,y:-wn.y},
        outCm:totalLaneCm, chipOutCm:totalLaneCm, isTotal:true,
        value:r(wallLen(w)), source:w.lengthSource, label:'wall length',
        commit:function(cm){
          var anySeg = w.segments[0].id;
          var res = commitWallTotal(anySeg, cm, 'typed');
          if(!res.ok) offerClamp(res, function(v){ commitWallTotal(anySeg, v, 'computed'); });
        }
      });
    }
  }
  return out;
}
// The live in-progress dimension riding the pointer for whichever
// gesture is actively lengthening a wall right now — unlike allDims,
// this reads dragState rather than selection, since a fresh draw
// stroke has no model piece yet to select. A committed 'draw' has no
// wall to hang a segment label on, so its endpoints come straight off
// dragState; a 'resize' already IS a real wall being mutated live, so
// its from/to are read instead; an 'openingEdge' drag is narrower
// still — only that one segment's own two edges move, so its live
// width reads off segPoints for the segment itself, not the whole wall.
function liveDim(t){
  if(!(dragState && dragState.committed && (dragState.kind==='draw' || dragState.kind==='resize' || dragState.kind==='openingEdge'))) return null;
  var a=null, b=null;
  if(dragState.kind==='draw' && dragState.endPoint){ a=dragState.startPt; b=dragState.endPoint; }
  else if(dragState.kind==='resize'){ var lw=findWall(dragState.wallId); if(lw){ a=lw.from; b=lw.to; } }
  else if(dragState.kind==='openingEdge'){ var fO=findSeg(dragState.wallId, dragState.segId); if(fO){ var spO=segPoints(fO.wall, fO.seg); a=spO.p0; b=spO.p1; } }
  if(!a || !b) return null;
  var n = wallNormal({from:a,to:b});
  var outCm = segHitWidthCm(t)/2 + 34/t.scale;
  return { tone:'primary', a:a, b:b, normal:{x:-n.x,y:-n.y}, outCm:outCm, value:r(dist(a,b)) };
}
/** the middle of the dimension LINE, which is where its run/ticks sit */
function dimAnchor(d){
  var mid = { x:(d.a.x+d.b.x)/2, y:(d.a.y+d.b.y)/2 };
  return { x: mid.x + d.normal.x*d.outCm, y: mid.y + d.normal.y*d.outCm };
}
/** where the CHIP sits — usually the same spot as dimAnchor, but bumped
 * to an outer lane (chipOutCm) when assignChipLane pushed it there to
 * clear a neighbour; renderSvg draws the leader that ties the two back
 * together. Falls back to outCm for anything (the live dimension, the
 * wall total) that never set chipOutCm apart from it. */
function chipAnchor(d){
  var mid = { x:(d.a.x+d.b.x)/2, y:(d.a.y+d.b.y)/2 };
  var out = (d.chipOutCm != null) ? d.chipOutCm : d.outCm;
  return { x: mid.x + d.normal.x*out, y: mid.y + d.normal.y*out };
}
// Extension lines off the wall, the run between them, and a 45-degree
// tick at each end (src/draw's DimLines.svelte) — geometry only, drawn
// straight in this file's own cm-space (the SVG's viewBox already IS
// world coordinates here, unlike src/draw's screen-pixel canvas, so
// there's no separate world-to-screen step to do).
function dimLineParts(d, t){
  var overCm = 6/t.scale, tickCm = 5/t.scale;
  var pA = { x:d.a.x+d.normal.x*d.outCm, y:d.a.y+d.normal.y*d.outCm };
  var pB = { x:d.b.x+d.normal.x*d.outCm, y:d.b.y+d.normal.y*d.outCm };
  var eA = { x:d.a.x+d.normal.x*(d.outCm+overCm), y:d.a.y+d.normal.y*(d.outCm+overCm) };
  var eB = { x:d.b.x+d.normal.x*(d.outCm+overCm), y:d.b.y+d.normal.y*(d.outCm+overCm) };
  var dx=d.b.x-d.a.x, dy=d.b.y-d.a.y, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L;
  var tkx=(ux+d.normal.x)*(tickCm/Math.SQRT2), tky=(uy+d.normal.y)*(tickCm/Math.SQRT2);
  return {
    ext: 'M'+d.a.x+' '+d.a.y+' L'+eA.x+' '+eA.y+' M'+d.b.x+' '+d.b.y+' L'+eB.x+' '+eB.y,
    line: 'M'+pA.x+' '+pA.y+' L'+pB.x+' '+pB.y,
    ticks: 'M'+(pA.x-tkx)+' '+(pA.y-tky)+' L'+(pA.x+tkx)+' '+(pA.y+tky)+' M'+(pB.x-tkx)+' '+(pB.y-tky)+' L'+(pB.x+tkx)+' '+(pB.y+tky)
  };
}

function renderSvg(t){
  var hitCm = segHitWidthCm(t);
  var cornerRCm = Math.max(9, 24/t.scale);
  var parts = [];
  var plainSegHitParts = [], openingSegHitParts = [], cornerHitParts = [], freeEndHitParts = [], openingEdgeHitParts = [];

  // Hatch fill defs first, exactly once per render, so every 'wall'
  // band below can reference them by id (see WALL_HATCH_DEFS).
  parts.push(WALL_HATCH_DEFS);
  parts.push('<g class="walls-layer">');
  model.walls.forEach(function(w){
    w.segments.forEach(function(s, idx){
      var pts = segPoints(w, s);
      var sel = !!(selection && selection.segId===s.id);
      parts.push('<g class="segment" data-testid="seg-'+s.id+'">');
      if(s.kind==='wall'){
        var bp = wallBandPoints(w, idx===0, idx===w.segments.length-1, pts.p0, pts.p1);
        var bandCls = 'wall-band'+(sel?' selected':''), edgeCls = 'wall-band-edge'+(sel?' selected':'');
        parts.push('<polygon class="'+bandCls+'" points="'+bp.a.x+','+bp.a.y+' '+bp.b.x+','+bp.b.y+' '+bp.c.x+','+bp.c.y+' '+bp.e.x+','+bp.e.y+'"></polygon>');
        parts.push('<line class="'+edgeCls+'" x1="'+bp.a.x+'" y1="'+bp.a.y+'" x2="'+bp.e.x+'" y2="'+bp.e.y+'"></line>');
        parts.push('<line class="'+edgeCls+'" x1="'+bp.b.x+'" y1="'+bp.b.y+'" x2="'+bp.c.x+'" y2="'+bp.c.y+'"></line>');
      } else if(s.kind==='open'){
        parts.push('<line class="wall-line is-open'+(sel?' selected':'')+'" x1="'+pts.p0.x+'" y1="'+pts.p0.y+'" x2="'+pts.p1.x+'" y2="'+pts.p1.y+'"></line>');
      } else if(s.kind==='window'){
        parts.push(windowSvg(w, pts.p0, pts.p1, sel));
      } else if(s.kind==='door'){
        parts.push(doorSvg(w, s, pts.p0, pts.p1, sel));
      }
      parts.push('</g>');
      var hr = hitRectAttrs(pts.p0, pts.p1, hitCm);
      var isOpeningKind = (s.kind==='window' || s.kind==='door');
      (isOpeningKind ? openingSegHitParts : plainSegHitParts).push('<rect class="seg-hit'+(sel?' selected':'')+'" data-testid="seg-'+s.id+'-hit" data-wall-id="'+w.id+'" data-seg-id="'+s.id+'" data-kind="'+s.kind+'"'
        + ' x="'+hr.x+'" y="'+hr.y+'" width="'+hr.w+'" height="'+hr.h+'"></rect>');
    });
  });
  parts.push('</g>');

  // visual dots at every wall endpoint — free ends and corners alike —
  // plus an extra hollow ring on a free end (isFreeEnd), marking it as
  // a pull-to-resize handle now, not just a plain joint dot.
  model.walls.forEach(function(w){
    parts.push('<circle class="vertex-dot" cx="'+w.from.x+'" cy="'+w.from.y+'" r="'+(cornerRCm*0.32)+'"></circle>');
    parts.push('<circle class="vertex-dot" cx="'+w.to.x+'" cy="'+w.to.y+'" r="'+(cornerRCm*0.32)+'"></circle>');
    // A flat 1.6 stroke-width used to read as a heavy filled donut next
    // to everything else's hairline weight -- thinner, and compensated
    // by t.scale (exactly like a live weld's own snapMarkerMarkup, just
    // lighter than it) so a free end still reads as its own thing next
    // to a welded corner's plain vertex-dot without shouting.
    var feRingW = Math.max(1, 1.3/t.scale);
    if(isFreeEnd(w,'from')) parts.push('<circle class="free-end-ring" cx="'+w.from.x+'" cy="'+w.from.y+'" r="'+(cornerRCm*0.55)+'" stroke-width="'+feRingW+'"></circle>');
    if(isFreeEnd(w,'to'))   parts.push('<circle class="free-end-ring" cx="'+w.to.x+'" cy="'+w.to.y+'" r="'+(cornerRCm*0.55)+'" stroke-width="'+feRingW+'"></circle>');
  });

  // corner HIT targets — only real joints (two or more walls meeting).
  // A free end used to have no handle of its own here (starting a new
  // draw near it was the only way to grow it) — it now gets its own
  // dedicated circle just below, sized the same as a corner's.
  collectVertices().forEach(function(v){
    if(v.refs.length < 2) return;
    cornerHitParts.push('<circle class="corner-hit" data-testid="corner-'+pointKey(v.point)+'" data-vx="'+v.point.x+'" data-vy="'+v.point.y+'" cx="'+v.point.x+'" cy="'+v.point.y+'" r="'+cornerRCm+'"></circle>');
  });

  // free-end HIT targets — a press exactly on this small circle is the
  // undecided gesture the 'freeEnd' drag kind resolves by direction (see
  // GESTURE ROUTER / onSvgPointerDown); a press further out but still
  // within ordinary snap range falls through to findStartSnap instead
  // and is unambiguously a new stroke welding onto this point, same as
  // always — the two gestures live on the same point without either
  // being lost, exactly the way an opening's own edge handle below
  // resolves tap vs. drag on itself.
  collectVertices().forEach(function(v){
    if(v.refs.length !== 1) return;
    var ref = v.refs[0];
    freeEndHitParts.push('<circle class="free-end-hit" data-testid="free-end-'+pointKey(v.point)+'" data-wall-id="'+ref.wall.id+'" data-end="'+ref.end+'" cx="'+v.point.x+'" cy="'+v.point.y+'" r="'+cornerRCm+'"></circle>');
  });

  // opening edge handles — only on the SELECTED window/door, one at
  // each of its two edges, sitting ON the wall line (unlike the free-
  // end ring, which marks a wall's own open END, these sit wherever the
  // opening's edges currently are, which is usually mid-wall). Dragging
  // one moves THAT edge only; see the 'openingEdge' drag kind below.
  if(selection){
    var selO = findSegAnywhere(selection.segId);
    if(selO && (selO.seg.kind==='window' || selO.seg.kind==='door')){
      var ow = selO.wall, oseg = selO.seg;
      var oPts = segPoints(ow, oseg), oN = wallNormal(ow);
      var edgeTickCm = Math.max(10, 20/t.scale);
      [{edge:'start', pt:oPts.p0}, {edge:'end', pt:oPts.p1}].forEach(function(e){
        parts.push('<line class="opening-edge-mark" x1="'+(e.pt.x-oN.x*edgeTickCm)+'" y1="'+(e.pt.y-oN.y*edgeTickCm)+'" x2="'+(e.pt.x+oN.x*edgeTickCm)+'" y2="'+(e.pt.y+oN.y*edgeTickCm)+'"></line>');
        openingEdgeHitParts.push('<circle class="opening-edge-hit" data-testid="opening-edge-'+e.edge+'-'+oseg.id+'" data-wall-id="'+ow.id+'" data-seg-id="'+oseg.id+'" data-edge="'+e.edge+'" cx="'+e.pt.x+'" cy="'+e.pt.y+'" r="'+cornerRCm+'"></circle>');
      });
    }
  }

  // A push/corner drag mutates the live model directly on every move —
  // there's no separate preview line the way 'draw' has — but it still
  // needs to show the same magnet catch a draw stroke shows BEFORE
  // release, or a snap the user never saw catch is a snap they can't
  // trust to let go of.
  if(dragState && dragState.committed && (dragState.kind==='push' || dragState.kind==='corner') && dragState.snapAt){
    parts.push(snapMarkerMarkup(dragState.snapAt, t));
  }

  // live draw preview: the stroke itself, a highlight on whatever it is
  // about to snap onto (shown BEFORE release, per spec), and an
  // alignment guide when the endpoint only lines up on one axis.
  if(dragState && dragState.kind==='draw' && dragState.committed && dragState.endPoint){
    var welded = dragState.endSnap && dragState.endSnap.weld;
    parts.push('<line class="preview-line'+(welded?' welded':'')+'" x1="'+dragState.startPt.x+'" y1="'+dragState.startPt.y+'" x2="'+dragState.endPoint.x+'" y2="'+dragState.endPoint.y+'"></line>');
    if(dragState.startSnap && dragState.startSnap.weld) parts.push(snapMarkerMarkup(dragState.startSnap.point, t));
    if(dragState.endSnap){
      if(dragState.endSnap.weld) parts.push(snapMarkerMarkup(dragState.endSnap.point, t));
      else if(dragState.endSnap.kind === 'align') parts.push(alignGuideMarkup(dragState.endPoint, dragState.endSnap.guideAt, t));
    }
  }

  // live free-end RESIZE: unlike 'draw', the wall being resized already
  // exists in the model and IS the live preview — applyDragMove writes
  // straight into its own from/to on every move, so the walls-layer
  // loop above already renders it growing/shrinking with no dashed
  // stand-in needed. Only the snap CONFIRMATION overlay is worth
  // repeating here, same markup as a draw stroke's own end (spec: "the
  // resize must snap exactly the way a draw does").
  if(dragState && dragState.kind==='resize' && dragState.committed && dragState.endSnap){
    if(dragState.endSnap.weld) parts.push(snapMarkerMarkup(dragState.endSnap.point, t));
    else if(dragState.endSnap.kind === 'align') parts.push(alignGuideMarkup(dragState.endPoint, dragState.endSnap.guideAt, t));
  }

  // Dimension lines for whatever allDims/liveDim are showing right
  // now — geometry only, no text (the number itself is the HTML chip
  // built from this very same data over in renderCtrlLayer). Purely
  // decorative, so pointer-events:none throughout (see CSS).
  var dimsNow = allDims(t);
  var liveNow = liveDim(t);
  if(liveNow) dimsNow = dimsNow.concat([liveNow]);
  if(dimsNow.length){
    var dimHairW = Math.max(1, 1/t.scale);
    parts.push('<g class="dims-layer">');
    dimsNow.forEach(function(d){
      var g = dimLineParts(d, t);
      var cls = d.tone==='side' ? 'side' : 'primary';
      parts.push('<path class="dim-ext '+cls+'" d="'+g.ext+'" stroke-width="'+dimHairW+'"></path>');
      parts.push('<path class="dim-run '+cls+'" d="'+g.line+'" stroke-width="'+dimHairW+'"></path>');
      parts.push('<path class="dim-tick '+cls+'" d="'+g.ticks+'" stroke-width="'+dimHairW+'"></path>');
      // The crowding rule (assignChipLane) only ever moves the CHIP, never
      // this line — when it moved the chip out, this short leader is the
      // only thing tying the two back together visually.
      if(d.chipOutCm != null && Math.abs(d.chipOutCm - d.outCm) > 0.01){
        var innerA = dimAnchor(d), outerA = chipAnchor(d);
        parts.push('<line class="dim-leader '+cls+'" x1="'+innerA.x+'" y1="'+innerA.y+'" x2="'+outerA.x+'" y2="'+outerA.y+'" stroke-width="'+dimHairW+'"></line>');
      }
    });
    parts.push('</g>');
  }

  // Paint order = hit-test priority, later wins ties: plain wall/open
  // hit-rects lowest (a corner sits exactly at two of their own
  // endpoints, and dragging that corner has to be reachable), corner
  // handles above them, then a free end's own dedicated circle (it sits
  // exactly on the wall's own line, on top of that wall's seg-hit, but
  // must not out-rank an opening sitting right next to it), then an
  // opening's own hit-rect — an opening slid flush against a corner
  // still has to win over the corner circle it's sitting inside
  // (SPEC-lessons #16-18) — and highest of all, an opening's own edge
  // handles: they sit exactly on top of that same seg-hit, and a press
  // meant to resize one edge has to win over "slide the whole opening"
  // or it would be unreachable.
  parts.push('<g class="hits-layer">' + plainSegHitParts.join('') + cornerHitParts.join('') + freeEndHitParts.join('') + openingSegHitParts.join('') + openingEdgeHitParts.join('') + '</g>');
  svgEl.innerHTML = parts.join('');
}

// The bottom bar's own two always-JS-driven bits: plate one's undo/redo/
// ceiling state, and the missing-line above it. (Plate two, #cluster, is
// selection-driven and rendered separately by renderCluster.)
function renderBar(){
  ceilingInputEl.value = model.ceilingHeightCm == null ? '' : String(model.ceilingHeightCm);
  ceilingInputEl.className = 'num-input ' + (model.ceilingHeightCm == null ? 'v-empty' : '');
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
  emptyHintEl.classList.toggle('hidden', model.walls.length > 0);
  renderMissingLine();
}
// A scrolling list of prose sentences was the least minimal thing on
// screen for a state that's usually empty. computeUnanswered's sentences
// are still the real signal, so they're kept verbatim — just behind one
// quiet line above the bar: a tappable count while anything's
// outstanding, nothing at all once the room is complete.
function renderMissingLine(){
  // Nothing has been asked for yet on a blank canvas — computeUnanswered's
  // own first line ('Draw the first wall to begin.') is for the exported
  // snapshot, not this line; showing it here would claim something's
  // already missing before the room has anything to be missing FROM, and
  // it would sit right on top of the empty-hint (see .missing-line CSS).
  var items = model.walls.length === 0 ? [] : computeUnanswered();
  missingListEl.innerHTML = '';
  // The count itself lives IN the bar, not floating over the canvas.
  // Anything that claims a pointer has to sit inside the one reserved
  // strip of chrome, because "draw anywhere" is the rule this direction
  // is not allowed to trade against anything else — and a tappable line
  // hovering 100px above the bar swallowed exactly the presses that were
  // aimed at bare canvas below the room (measured: a stroke started on
  // the summary's own box never became a wall at all). The bar is
  // already the one region the fit reserves and the one selector
  // realBoxMisses guards; putting this there means there is no second
  // place on screen where a press can quietly go nowhere.
  missingBtn.hidden = items.length === 0;
  missingDividerEl.hidden = items.length === 0;
  missingBtn.setAttribute('aria-expanded', missingExpanded ? 'true' : 'false');
  if(items.length === 0){
    missingExpanded = false;
    missingListEl.classList.add('hidden');
    // Kept empty and hidden purely so missing-item-none's shape survives.
    var none = doc.createElement('span');
    none.setAttribute('data-testid','missing-item-none');
    none.hidden = true;
    missingListEl.appendChild(none);
    return;
  }
  missingBtn.textContent = RO.missingCount(items.length);
  missingListEl.classList.toggle('hidden', !missingExpanded);
  if(missingExpanded){
    var wrap = doc.createElement('div'); wrap.className = 'missing-items';
    items.forEach(function(txt, i){
      var row = doc.createElement('div');
      row.textContent = txt;
      row.setAttribute('data-testid','missing-item-'+i);
      wrap.appendChild(row);
    });
    missingListEl.appendChild(wrap);
  }
}
function renderToastDom(){
  if(!toastState){ toastEl.classList.add('hidden'); return; }
  toastEl.classList.remove('hidden');
  toastTextEl.textContent = toastState.text;
}
function renderConfirmDialog(){
  if(!confirmState){ confirmDialogEl.classList.add('hidden'); return; }
  confirmDialogEl.classList.remove('hidden');
  confirmDialogTextEl.textContent = confirmState.message;
  confirmYesBtn.textContent = confirmState.yesLabel;
}
/* ======================================================================
   HTML CONTROL LAYER — everything readable or typeable. A piece that is
   NOT selected shows a plain read-only LABEL (provenance-coloured text,
   no input, no button — pure information, never "waiting for you").
   Selecting a piece swaps its label for a real editable chip, anchored
   on the piece, and reveals plate two of the bottom bar (type switcher /
   add-opening / rotate / delete) — fixed screen chrome, never anchored
   at the piece's own coordinates, so it can never cover a chip or a
   free end waiting for the next draw (SPEC-lessons #18).
   ====================================================================== */
function provClass(source){ return source==='typed' ? 'typed' : (source==='drawn' ? 'drawn' : 'computed'); }
function stopChipPointer(node){
  ['pointerdown','mousedown','click'].forEach(function(evt){ node.addEventListener(evt, function(e){ e.stopPropagation(); }); });
}
// Shared obstacle list (stage-relative px) for anything placed in the
// HTML overlay via placeInStage — a chip or a label. The bottom bar is
// fixed screen chrome now, but PANEL_RESERVE_PX only reserves room for
// it in the drawing's own coordinate space — it says nothing about
// where a chip's stage-pixel placement actually lands, so the bar's
// own rendered plates go back in this list (real getBoundingClientRect
// boxes, not a guessed height) or a chip can still sit on top of it.
// Covers every FREE END (SPEC-lessons, round ten): a free end is the
// single most valuable spot on the canvas, since it's exactly where the
// next stroke starts (and, on touch, exactly where the browser's own
// tap disambiguation can retarget a just-finished draw onto whatever
// control happens to render nearby — round ten, defect class). One
// list, reused everywhere something could land on top of one, rather
// than each caller re-deriving its own notion of "too close".
function freeEndObstacles(stageRect, t, radius){
  radius = radius || SNAP_PX;
  var obstacles = [];
  var barClearPx = 6;
  root.querySelectorAll('#bar .plate:not(.hidden)').forEach(function(pl){
    var pr = pl.getBoundingClientRect();
    obstacles.push({ l:pr.left-stageRect.left-barClearPx, t:pr.top-stageRect.top-barClearPx, r:pr.right-stageRect.left+barClearPx, b:pr.bottom-stageRect.top+barClearPx });
  });
  collectVertices().forEach(function(v){
    if(v.refs.length !== 1) return; // free ends only -- a corner already has its own dedicated handle, not a place a stroke starts fresh from
    var p = cmToStage(v.point, t);
    obstacles.push({ l:p.x-radius, t:p.y-radius, r:p.x+radius, b:p.y+radius });
  });
  return obstacles;
}
function obstaclesHitAny(obstacles, l, r, tp, bt){
  return obstacles.some(function(o){ return l < o.r && r > o.l && tp < o.b && bt > o.t; });
}
// A SECOND, narrower obstacle source — only for a wall's own total (see
// allDims / avoidChips below), never for a per-segment chip. A per-
// segment chip's own lane (assignChipLane) is what keeps it clear of
// its neighbours, deterministically; that must stay untouched, or a
// number could get shoved off its own segment's midpoint the exact way
// the old collision resolver did. The total has no single segment of
// its own to stay anchored to, and it is the one number placed a
// further, un-clamped-in-cm lane out from whatever the per-segment
// chips actually used this render — on a tight room, placeInStage's own
// edge clamp (below) can still pull it back onto one of them, and this
// is the fallback for exactly that: the same push-in-4-directions
// escape already trusted for a free end or a bar plate, just given one
// more obstacle type to dodge.
// '#pieceActions' rides along in this query (not just '.chip') so that
// whatever already opts into avoiding chips (today, just the wall
// total) also avoids the per-piece action bar — one shared list, same
// reasoning as freeEndObstacles reading '#bar .plate' straight off the
// DOM, rather than a second obstacle category invented just for it.
function chipObstacles(stageRect, skipEl){
  var obstacles = [];
  var gap = 4;
  ctrlLayerEl.querySelectorAll('.chip, #pieceActions').forEach(function(c){
    if(c === skipEl) return;
    var r = c.getBoundingClientRect();
    obstacles.push({ l:r.left-stageRect.left-gap, t:r.top-stageRect.top-gap, r:r.right-stageRect.left+gap, b:r.bottom-stageRect.top+gap });
  });
  return obstacles;
}
// A chip/label is centred on its anchor via CSS translate(-50%,-50%), so
// a piece near the edge of a narrow (phone-width) stage can render
// partway off-screen with nothing to tap. Place it, then measure and
// pull its centre back in just enough that the whole element stays
// within the stage — the anchor is only a starting point, not a promise.
// `avoidChips` opts into chipObstacles above; every other caller (every
// per-segment chip, every label) leaves it off and is unaffected.
// `extraObstacles`, if given, is concatenated straight onto the same
// list this already builds — the piece action bar's own escape from
// the piece's hit rect and its opening-edge handles (see
// pieceOwnObstacles) uses this, rather than a second push-to-escape
// loop of its own.
function placeInStage(el, anchor, t, avoidChips, extraObstacles){
  var pos = cmToStage(anchor, t);
  el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
  ctrlLayerEl.appendChild(el);
  var stageRect = $id('stage').getBoundingClientRect();
  var w = el.offsetWidth;
  // A chip's own VISIBLE box is a fixed 30px tall, but its input's real
  // hit box overflows that invisibly out to 44px (lesson 17, without
  // the chip itself growing to show it) — collide against the real
  // interactive footprint, not the shorter visible one, or an obstacle
  // check here would pass while the actual touch target still overlaps.
  var h = Math.max(el.offsetHeight, 44);
  var minX = w/2 + 4, maxX = Math.max(minX, stageRect.width - w/2 - 4);
  var minY = h/2 + 4, maxY = Math.max(minY, stageRect.height - h/2 - 4);
  var cx = Math.min(Math.max(pos.x, minX), maxX);
  var cy = Math.min(Math.max(pos.y, minY), maxY);

  // Nothing placed here may cover any FREE END (SPEC-lessons, round
  // ten) — a free end is the single most valuable spot on the canvas,
  // since every stroke's own free end is exactly where the next stroke
  // starts, so nothing — chip included — may sit on top of one.
  var obstacles = freeEndObstacles(stageRect, t);
  if(avoidChips) obstacles = obstacles.concat(chipObstacles(stageRect, el));
  if(extraObstacles && extraObstacles.length) obstacles = obstacles.concat(extraObstacles);
  function hitsAny(l, r, tp, bt){ return obstaclesHitAny(obstacles, l, r, tp, bt); }
  function collidingWith(cx2, cy2){
    return obstacles.filter(function(o){ return (cx2-w/2)<o.r && (cx2+w/2)>o.l && (cy2-h/2)<o.b && (cy2+h/2)>o.t; });
  }
  // Escape is ROUNDS of pushing clear of EVERYTHING currently
  // overlapping, not one push against the first obstacle found: a
  // per-segment chip only ever had to clear ONE further obstacle after
  // its own lane already handled everything else (chipObstacles' own
  // comment), so one push was always enough for it. The piece action
  // bar is a bigger control (several stacked rows on a narrow phone)
  // that can start out overlapping more than one thing at once — its
  // own piece's hit rect AND a neighbour's chip, say — and a push that
  // only clears the first can walk it straight into the second. Each
  // round below re-reads what's ACTUALLY still overlapping (never the
  // original set) and pushes far enough on each axis to clear ALL of
  // it at once; escaping one round's set can reveal a new obstacle on
  // the far side (a real, ordinary case here, not a bug to special-
  // case), so this repeats a small fixed number of times rather than
  // trusting the first round's answer — bounded, since the stage's own
  // edges make an unbounded search unnecessary.
  for(var round=0; round<8; round++){
    var colliding = collidingWith(cx, cy);
    if(!colliding.length) break;
    var pushXOut=0, pushXIn=0, pushYOut=0, pushYIn=0;
    colliding.forEach(function(o){
      pushXOut = Math.max(pushXOut, (o.r-(cx-w/2))+6);
      pushXIn  = Math.max(pushXIn,  ((cx+w/2)-o.l)+6);
      pushYOut = Math.max(pushYOut, (o.b-(cy-h/2))+6);
      pushYIn  = Math.max(pushYIn,  ((cy+h/2)-o.t)+6);
    });
    var options = [
      { cx: Math.min(Math.max(cx+pushXOut, minX), maxX), cy: cy, dist: pushXOut },
      { cx: Math.min(Math.max(cx-pushXIn, minX), maxX), cy: cy, dist: pushXIn },
      { cx: cx, cy: Math.min(Math.max(cy+pushYOut, minY), maxY), dist: pushYOut },
      { cx: cx, cy: Math.min(Math.max(cy-pushYIn, minY), maxY), dist: pushYIn }
    ].sort(function(a,b){ return a.dist - b.dist; });
    // Prefer whichever option clears EVERYTHING outright; failing that
    // (this round's room genuinely has no fully clear spot), take
    // whichever clears the MOST of what's overlapping right now, so
    // every round makes real progress instead of two rounds trading
    // the same obstacle back and forth forever.
    var best = options[0], bestCleared = -1;
    for(var oi=0; oi<options.length; oi++){
      var opt = options[oi];
      var stillColliding = collidingWith(opt.cx, opt.cy).length;
      if(stillColliding === 0){ best = opt; break; }
      var cleared = colliding.length - stillColliding;
      if(cleared > bestCleared){ bestCleared = cleared; best = opt; }
    }
    cx = best.cx; cy = best.cy;
  }
  if(cx !== pos.x) el.style.left = cx+'px';
  if(cy !== pos.y) el.style.top = cy+'px';
  // Every existing caller (a chip, a label) ignores this — it exists
  // for renderPieceActions, which is big enough to sometimes have NO
  // fully clear spot on one side of its piece and needs to know
  // whether to try the other side instead of just trusting whichever
  // it tried first.
  return { remaining: collidingWith(cx, cy).length };
}
// A THIRD obstacle source, only for the piece action bar: unlike a
// chip (which only ever has to dodge other chips and free ends), the
// action bar sits right next to the very thing it acts on, so it also
// has to dodge that piece's own hit rect and — for a window/door — its
// two edge-resize handles, or it would cover the exact geometry someone
// just tapped to select it. Read straight off the real SVG elements
// renderSvg already drew this render (same "measure, don't guess" rule
// freeEndObstacles/chipObstacles already follow for everything else
// placeInStage avoids), never recomputed from cornerRCm/hitCm here —
// two formulas for one box is how they drift apart.
function pieceOwnObstacles(stageRect, seg){
  var gap = 6;
  var obstacles = [];
  var testids = ['seg-'+seg.id+'-hit'];
  if(seg.kind==='window' || seg.kind==='door'){
    testids.push('opening-edge-start-'+seg.id, 'opening-edge-end-'+seg.id);
  }
  testids.forEach(function(tid){
    var node = svgEl.querySelector('[data-testid="'+tid+'"]');
    if(!node) return;
    var r = node.getBoundingClientRect();
    obstacles.push({ l:r.left-stageRect.left-gap, t:r.top-stageRect.top-gap, r:r.right-stageRect.left+gap, b:r.bottom-stageRect.top+gap });
  });
  return obstacles;
}
// Read-only — used only for the live in-progress dimension, which has
// no model piece yet to attach a real chip to.
function addLabel(text, source, anchor, t, testid){
  var div = doc.createElement('div');
  div.className = 'label ' + provClass(source);
  if(testid) div.setAttribute('data-testid', testid);
  div.textContent = text;
  placeInStage(div, anchor, t);
}
// `tone` ('primary' for the selected piece, 'side' for a neighbouring
// gap or a wall's own outer total) is what says which number is the
// one you picked, same idea as src/draw's DimChip (primary/side),
// layered UNDER the existing provenance signal (typed=ink, drawn/
// computed=graphite italic on the input itself) rather than replacing
// it.
function buildChip(testid, value, source, anchor, t, onCommit, label, tone, avoidChips){
  var input = doc.createElement('input');
  input.type = 'text'; input.inputMode = 'decimal';
  input.setAttribute('data-testid', testid);
  input.value = String(value);
  input.className = source==='drawn' ? 'v-drawn' : (source==='computed' ? 'v-computed' : '');
  var chip = doc.createElement('div');
  chip.className = 'chip ' + (tone==='side' ? 'side' : 'primary');
  chip.appendChild(input);
  var unit = doc.createElement('span'); unit.className='unit'; unit.textContent='cm';
  chip.appendChild(unit);
  bindLengthField(input, onCommit, label || RO.fieldLength);
  stopChipPointer(chip);
  // A press usually lands on the chip's padding or its invisible halo,
  // not on the digits themselves — left to the browser, that resolves
  // to "nothing focusable here" and takes focus away again on release
  // (src/draw's DimChip: the reported symptom was a field that opens
  // while held and closes the instant you let go). So the press is
  // taken on the whole chip and focus put on the input explicitly.
  chip.addEventListener('pointerdown', function(e){
    if(doc.activeElement === input) return; // already editing: let the browser place the caret where tapped
    e.preventDefault();
    input.focus();
    input.select();
  });
  placeInStage(chip, anchor, t, avoidChips);
  return input;
}
// Whole-cm parsing with the metres-shorthand trap, and the pointerdown/
// capture-phase commit fix for "the button press does nothing the first
// time because blur just destroyed it" (SPEC-shared-contract bug class 1).
function bindLengthField(inputEl, onCommit, label){
  function tryCommit(){
    if(inputEl._committed) return true;
    inputEl._committed = true;
    if(!inputEl._edited) return true; // focus-then-blur with no keystroke is not a commit
    var parsed = parseLengthInput(inputEl.value);
    if(!parsed.ok) return true;
    if(parsed.needsConfirm){
      var msg = RO.metresQuestion(parsed.raw, label, parsed.cmIfMetres);
      showConfirm(msg, RO.metresYes(parsed.cmIfMetres), function(){ onCommit(parsed.cmIfMetres); }, function(){});
      render();
      return false;
    }
    onCommit(parsed.cm);
    return true;
  }
  inputEl._commit = tryCommit;
  inputEl.addEventListener('keydown', function(e){
    if(e.key==='Enter'){ e.preventDefault(); tryCommit(); inputEl.blur(); }
    else if(e.key==='Escape'){
      // Abandon the edit and show the true value again (src/draw's
      // DimChip). stopPropagation matters even though nothing on
      // `window` currently listens for Escape: editing a number is
      // never a reason for the piece's own canvas selection to vanish
      // out from under it, today or the next time someone adds that
      // listener.
      e.preventDefault(); e.stopPropagation();
      if(inputEl._before != null) inputEl.value = inputEl._before;
      inputEl._committed = true; // blur must not re-commit the reverted value
      inputEl.blur();
    }
  });
  inputEl.addEventListener('blur', tryCommit);
  inputEl.addEventListener('focus', function(){ inputEl._committed=false; inputEl._edited=false; inputEl._before=inputEl.value; inputEl.select(); });
  inputEl.addEventListener('input', function(){ inputEl._edited = true; inputEl._committed = false; });
}
function commitActiveField(){
  var ae = doc.activeElement;
  if(!ae || ae.tagName!=='INPUT' || typeof ae._commit!=='function') return true;
  return ae._commit();
}
function offerClamp(res, apply){
  var msg = RO.clamp(res.max);
  showConfirm(msg, RO.clampYes(res.max), function(){ apply(res.max); }, function(){});
}

// One source, two consumers: allDims/liveDim (defined above, next to
// renderSvg's own use of them for the dimension LINE) drive every chip
// here too, so a number can never end up sitting on a different chip
// than the line drawn under it — chipAnchor rather than dimAnchor here
// is the one deliberate difference, since a chip (unlike its line) can
// have been bumped out a lane by assignChipLane.
function renderCtrlLayer(t){
  ctrlLayerEl.innerHTML = '';

  // renderCluster FIRST, before a single chip is placed: placeInStage's
  // obstacle list (freeEndObstacles) reads the bar's plates straight off
  // the live DOM, and #cluster is that plate two — sized and shown or
  // hidden by selection. With every segment now carrying an always-on
  // chip (not just the one selected piece, back when this was ordered
  // the other way and got away with it), the odds that one of them sits
  // exactly where a just-opened cluster appears are real; building the
  // cluster first means every chip this render sees its true, current
  // footprint rather than last render's stale one.
  renderCluster(t);

  allDims(t).forEach(function(d){
    buildChip(d.testid, d.value, d.source, chipAnchor(d), t, d.commit, d.label, d.tone, d.isTotal);
  });

  // Live dimension, riding the pointer, for whichever gesture is
  // actively lengthening a wall right now (spec's own words for a draw:
  // "orthogonally snapped, live length riding the pointer"). Read-only,
  // since mid-gesture there is nothing yet to commit to.
  var live = liveDim(t);
  if(live) addLabel(live.value + ' cm', 'drawn', dimAnchor(live), t, 'live-dim');

  // LAST: the piece action bar opts into avoiding every chip just
  // placed above (avoidChips) exactly the way the wall-total chip
  // does — that only sees what already exists in the DOM, so this has
  // to render after every chip this pass will ever place, not before.
  renderPieceActions(t);
}

/* ======================================================================
   PIECE ACTION BAR — the selected piece's own verbs, floating right
   beside it on the canvas rather than living in the bottom bar: a
   wall/open edge gets "+ Door"/"+ Window"/Delete, a door gets
   Rotate/Delete, a window gets Delete. Everything else about a
   selection (the kind switcher, the two real measurements) is a mode
   switch or a number, not an action ON the piece, and stays put in
   #cluster (see SELECTION CLUSTER, below) — the user's own split.

   This is the SECOND time this file has tried a control that lives
   next to the piece it acts on. The first was a panel
   that docked itself dynamically below the room's own bounding box
   with bespoke collision-avoidance of its own, and kept re-opening the
   exact "control blocks the canvas" bug every round it tried to close.
   This one invents no new notion of "too close" at all: it is placed
   by the same placeInStage every chip already trusts, avoiding the
   same free ends and the same bottom bar (freeEndObstacles, always)
   and, opting in exactly like the wall-total chip does, every other
   chip too (chipObstacles/avoidChips — which now also protects THIS
   bar in return, see chipObstacles' own comment) — plus one further
   obstacle list of its own (pieceOwnObstacles) for the one thing a
   chip never has to dodge: the piece's own hit rect and, for an
   opening, its own edge-resize handles, since this is the one control
   that renders right next to them rather than out along a dimension
   lane.

   Icons are licensed here even though the rest of this file avoids an
   icon set (see .piece-actions in the stylesheet) — plan-like marks
   that echo what the drawing itself already draws for that piece (a
   door's own leaf+arc, a window's own three lines), always paired with
   the word, since the whole point of this bar is being clearer, not
   more cryptic.
   ====================================================================== */
var ICON_ADD_DOOR = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
  + '<path d="M3 13.5V2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
  + '<path d="M3 2.5A11 11 0 0 1 13.5 13.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>'
  + '</svg>';
var ICON_ADD_WINDOW = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
  + '<line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.3"/>'
  + '<line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.3"/>'
  + '<line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.3"/>'
  + '</svg>';
var ICON_ROTATE = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
  + '<path d="M13 8A5 5 0 1 1 10.6 4.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
  + '<path d="M11.1 1.7 10.6 4.1 13.1 4.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'
  + '</svg>';
var ICON_DELETE = '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
  + '<path d="M3 4.5h10M6.3 4.5V3a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v1.5M4.4 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
  + '<line x1="6.5" y1="7" x2="6.8" y2="11.3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'
  + '<line x1="9.5" y1="7" x2="9.2" y2="11.3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'
  + '</svg>';
// `side` picks which face of the wall to start from: +1 is OPPOSITE
// the dimension chips (segDim uses {-n.x,-n.y}; this is +n), the
// better first guess since the two then rarely compete for the same
// spot before placeInStage's own obstacle-avoidance even has to step
// in; -1 is the chips' own side, tried by renderPieceActions as a
// fallback when +1's side turns out to have no fully clear spot at
// all (a small room on a narrow phone, chips crowding both interior
// and exterior). Either way, it's placeInStage's avoidance — not
// which side this starts from — that actually guarantees no
// collision in the end.
function pieceActionAnchor(w, seg, t, side){
  var pts = segPoints(w, seg);
  var mid = { x:(pts.p0.x+pts.p1.x)/2, y:(pts.p0.y+pts.p1.y)/2 };
  var n = wallNormal(w);
  var outCm = (segHitWidthCm(t)/2 + 40/t.scale) * side;
  return { x: mid.x + n.x*outCm, y: mid.y + n.y*outCm };
}
function renderPieceActions(t){
  // Hidden for the duration of any committed drag, same reasoning as
  // #cluster's identical guard: it would otherwise ride along with the
  // piece being pushed/slid/resized and end up sitting on top of
  // wherever the gesture is about to land.
  if(dragState && dragState.committed) return;
  if(!selection) return;
  var f = findSegAnywhere(selection.segId);
  if(!f) return;
  var w = f.wall, seg = f.seg;

  var bar = doc.createElement('div');
  bar.className = 'plate group piece-actions';
  // The id is load-bearing, not decoration: two guards address this bar
  // by '#pieceActions' — chipObstacles, so the wall-total chip keeps off
  // it, and realBoxMisses, so a press that lands near it but outside its
  // real box still reaches the canvas underneath. A selector that
  // matches nothing fails silently in both, and the second failure is
  // the one that matters: without it this bar quietly eats strokes aimed
  // at the room, which is the single worst thing a control can do here.
  bar.id = 'pieceActions';
  bar.setAttribute('data-testid', 'piece-actions');

  function addBtn(testid, label, icon, warn, onClick){
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = warn ? 'txtbtn warn' : 'txtbtn';
    btn.setAttribute('data-testid', testid);
    btn.innerHTML = icon;
    var span = doc.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
    btn.addEventListener('click', onClick);
    bar.appendChild(btn);
  }

  if(seg.kind==='wall' || seg.kind==='open'){
    addBtn('piece-add-door', RO.addDoor, ICON_ADD_DOOR, false, function(){
      pushHistory();
      var mid = seg.offsetFromStart + seg.length.value/2;
      var id = addOpening(w.id, 'door', mid);
      if(id){ selection={segId:id}; pendingFocusSegId=id; }
      render();
    });
    addBtn('piece-add-window', RO.addWindow, ICON_ADD_WINDOW, false, function(){
      pushHistory();
      var mid = seg.offsetFromStart + seg.length.value/2;
      var id = addOpening(w.id, 'window', mid);
      if(id){ selection={segId:id}; pendingFocusSegId=id; }
      render();
    });
  }
  if(seg.kind==='door'){
    // Same one-button cycle as always (SPEC-lessons, round six, rule
    // 3) — doorSwingLabel is untouched, so the label still says what
    // the door currently IS; the icon just says "press this to turn
    // it", and the arc drawn on the plan is still the real answer.
    addBtn('door-swing-cycle', doorSwingLabel(w, seg), ICON_ROTATE, false, function(){ pushHistory(); cycleDoorSwing(w.id, seg.id); render(); });
  }
  // Any kind can be deleted (a plain wall/open piece — e.g. a stray
  // mis-click stroke — used to be permanent short of undo). Routed
  // through the one deleteSelection() so the keyboard shortcut and
  // this button can never drift apart on what "delete" actually does
  // for each kind.
  addBtn('piece-delete', RO.del, ICON_DELETE, true, function(){ deleteSelection(); });

  stopChipPointer(bar);
  var stageRect = $id('stage').getBoundingClientRect();
  var extraObs = pieceOwnObstacles(stageRect, seg);
  // Try the side opposite the dimension chips first (pieceActionAnchor's
  // own better guess); if that side has nowhere fully clear to land —
  // a small room on a narrow phone, chips and the bottom bar crowding
  // it from every direction — retry starting from the chips' own side
  // instead, same machinery, just a different place to start pushing
  // from. Keep whichever attempt actually ends up clear of everything;
  // if neither does, keep whichever got closer, the same "best effort"
  // every chip already settles for in an equally tight spot.
  var placement = placeInStage(bar, pieceActionAnchor(w, seg, t, 1), t, true, extraObs);
  if(placement.remaining > 0){
    var left1 = bar.style.left, top1 = bar.style.top, remaining1 = placement.remaining;
    var placement2 = placeInStage(bar, pieceActionAnchor(w, seg, t, -1), t, true, extraObs);
    if(placement2.remaining > remaining1){ bar.style.left = left1; bar.style.top = top1; }
  }
}

/* ======================================================================
   SELECTION CLUSTER — plate two of the bottom bar: the kind switcher
   (Wall/Open/Window/Door) plus the real measurements an opening needs
   here ("Starts at", "Sill height"). Only rendered for the selected
   piece; there is no "Done" button — tapping empty canvas already
   deselects, and there is no "Move to" either — dragging an opening
   onto another wall already does that (see moveOpeningToWall / the
   cross-wall drag path in the gesture router), and it is the gesture a
   user finds by trying, which is the whole point.
   Add-opening, rotate and delete used to live here too, in the same
   wrapping row as the kind switcher — but a mode switch and a real
   measurement are not the same category of thing as an action ON the
   selected piece, and the user asked for exactly that split: this
   plate keeps only the former, the latter now floats right beside the
   piece itself (see PIECE ACTION BAR, below renderCtrlLayer).
   ====================================================================== */
// A kind switcher button borrows the drawing's own colour for its kind
// in the swatch, same reasoning as src/draw's Toolbar: the bar should
// say the same thing about a wall/window/door that the drawing does,
// rather than inventing a second vocabulary of UI colours for it.
var KIND_SWATCH = { wall:'var(--fp-wall)', open:'var(--fp-open)', window:'var(--fp-window)', door:'var(--fp-door)' };
function renderCluster(t){
  clusterEl.innerHTML = '';
  // Hidden for the duration of any committed drag — it would otherwise
  // follow the selected piece live (sliding an opening, pushing a wall)
  // and can end up sitting on top of wherever the gesture is about to
  // land, exactly the "control blocks the canvas" defect this file
  // exists to avoid, just reached mid-gesture instead of at rest.
  if(dragState && dragState.committed){ clusterEl.classList.add('hidden'); return; }
  if(!selection){ clusterEl.classList.add('hidden'); return; }
  var f = findSegAnywhere(selection.segId);
  if(!f){ selection = null; clusterEl.classList.add('hidden'); return; }
  var w = f.wall, seg = f.seg;
  clusterEl.classList.remove('hidden');

  // Type switcher only now — a legend, not a row of filled toggles
  // (never more than one solid button in a view, and this app has none
  // at all). It used to share this row with +Door/+Window (or Rotate/
  // Delete); those are actions ON the piece, not a mode switch, and now
  // live on the floating piece action bar next to the piece itself.
  var rowA = doc.createElement('div'); rowA.className = 'crow';
  [['wall',RO.kind.wall],['open',RO.kind.open],['window',RO.kind.window],['door',RO.kind.door]].forEach(function(pair){
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = pair[1];
    btn.className = 'legend';
    btn.style.setProperty('--swatch', KIND_SWATCH[pair[0]]);
    btn.setAttribute('aria-pressed', seg.kind===pair[0] ? 'true' : 'false');
    btn.setAttribute('data-testid','piece-type-'+pair[0]);
    btn.addEventListener('click', function(){ pushHistory(); changeKind(seg.id, pair[0]); render(); });
    rowA.appendChild(btn);
  });
  clusterEl.appendChild(rowA);

  if(seg.kind==='window' || seg.kind==='door'){
    // "Starts at" — the offset from this wall's own start point. Chained
    // measuring types the piece's own length (the dimension chip);
    // cumulative measuring reads a running total off the tape instead —
    // this is that second way in, so neither has to do arithmetic the
    // tape didn't do for them. This is a real measurement input, not
    // chrome, so it stays even though "Move to" (below) doesn't.
    var offRow = doc.createElement('div'); offRow.className='sill-row';
    var offLbl = doc.createElement('label'); offLbl.textContent = RO.startsAt;
    var offInput = doc.createElement('input');
    offInput.type = 'text'; offInput.inputMode = 'decimal';
    offInput.setAttribute('data-testid','offset-'+seg.id);
    offInput.value = String(seg.offsetFromStart);
    offRow.appendChild(offLbl); offRow.appendChild(offInput);
    var offUnit = doc.createElement('span'); offUnit.className='unit'; offUnit.textContent=RO.cmFromStart;
    offRow.appendChild(offUnit);
    bindLengthField(offInput, function(cm){ pushHistory(); slideSegment(w.id, seg.id, cm, 'typed'); render(); }, RO.fieldOffset);
    clusterEl.appendChild(offRow);
  }

  if(seg.kind==='window'){
    // Sill height used to float as its own chip on the canvas, but it
    // has no dimension line to sit on — it's a height, not a length
    // along the wall, so there's no stretch of wall it could ever be
    // drawn beside. It belongs beside the other real measurement this
    // plate already carries ("Starts at"), not hovering over open
    // canvas with nothing under it saying what it's about.
    var sillRow = doc.createElement('div'); sillRow.className='sill-row';
    var sillLbl = doc.createElement('label'); sillLbl.textContent = RO.sillHeight;
    var sillInput = doc.createElement('input');
    sillInput.type = 'text'; sillInput.inputMode = 'decimal';
    sillInput.setAttribute('data-testid','sill-'+seg.id);
    // Same DEFAULT_SILL fallback the floating chip used to show: a
    // window always has a sill worth displaying and editing, whether
    // or not it has ever been typed.
    var sv = seg.sill || { value: DEFAULT_SILL, source:'computed' };
    sillInput.value = String(sv.value);
    sillInput.className = sv.source==='drawn' ? 'v-drawn' : (sv.source==='computed' ? 'v-computed' : '');
    sillRow.appendChild(sillLbl); sillRow.appendChild(sillInput);
    var sillUnit = doc.createElement('span'); sillUnit.className='unit'; sillUnit.textContent='cm';
    sillRow.appendChild(sillUnit);
    bindLengthField(sillInput, function(cm){ pushHistory(); setSegSill(w.id, seg.id, cm, 'typed'); render(); }, RO.fieldSill);
    clusterEl.appendChild(sillRow);
  }

  // Add-opening, Rotate and Delete used to join this row too — they now
  // render on the piece action bar instead (renderPieceActions, below
  // renderCtrlLayer), which is why rowA ends here rather than growing
  // more children the way it used to.
  stopChipPointer(clusterEl);
}
/* ============================================================
   GESTURE ROUTER — the whole direction. Intent comes from where a
   drag STARTS, decided once at pointerdown, before any movement:
     a wall/opening   -> push it (wall/open) or slide it (window/door)
     a corner         -> move that corner, both walls following
     an opening edge  -> resize that opening, the far edge pinned
                          (selected window/door only)
     empty canvas     -> ALWAYS draws — there is no current point, and
                          nothing is off-limits to start from. Snapping
                          (checked at press and again at release) does
                          the joining; see findStartSnap/findEndpointSnap.
   Every drag starts inside a small screen-space dead-zone (TAP_PX) — a
   plain tap never moves anything, it only selects/deselects. Crossing
   it commits to exactly one gesture; each restores from a snapshot
   taken at commit and reapplies fresh on every move, so nothing drifts.
   ============================================================ */
function onSvgPointerDown(e){
  // Commit whatever chip is currently focused on EVERY pointerdown, not
  // just button presses (SPEC-shared-contract bug class 1).
  commitActiveField();
  var t = viewTransform();
  var startCm = clientToCm(e.clientX, e.clientY, t);
  var base = { startClientX:e.clientX, startClientY:e.clientY, startCm:startCm, committed:false };

  // A real corner, an opening's own edge handle, or a free end's own
  // dedicated circle are small, precise targets — they always win
  // outright, before anything else is even considered.
  var dedicated = e.target.closest ? e.target.closest('.corner-hit,.opening-edge-hit,.free-end-hit') : null;
  if(dedicated){
    if(dedicated.classList.contains('corner-hit')){
      var vx = parseFloat(dedicated.getAttribute('data-vx')), vy = parseFloat(dedicated.getAttribute('data-vy'));
      dragState = Object.assign(base, { kind:'corner', vertexPt: {x:vx,y:vy} });
    } else if(dedicated.classList.contains('opening-edge-hit')){
      // Unlike a free end, this target has exactly one meaning — no
      // ambiguity to resolve by direction: any drag here resizes that
      // one edge, along the wall's own axis; the far edge is pinned by
      // applyDragMove (see the 'openingEdge' kind below).
      dragState = Object.assign(base, {
        kind:'openingEdge', wallId: dedicated.getAttribute('data-wall-id'),
        segId: dedicated.getAttribute('data-seg-id'), edge: dedicated.getAttribute('data-edge')
      });
    } else {
      // Unlike an opening's own edge handle above, a free end IS
      // ambiguous (see the comment above handleTap): a plain tap here
      // must select the piece at that end, a drag along the wall's own axis
      // must resize it, and a drag off-axis must still start an
      // ordinary new stroke — three outcomes on one point, none of them
      // knowable yet. 'freeEnd' is the undecided holding kind; movement
      // past TAP_PX resolves it BY DIRECTION in onSvgPointerMove
      // (resolveFreeEndDirection), into either 'resize' or the
      // unchanged 'draw' — everything a fallback to 'draw' needs is
      // captured now, up front, exactly as findStartSnap would.
      var feWallId = dedicated.getAttribute('data-wall-id'), feEnd = dedicated.getAttribute('data-end');
      var feWall = findWall(feWallId);
      var fePt = feWall ? { x:feWall[feEnd].x, y:feWall[feEnd].y } : startCm;
      dragState = Object.assign(base, {
        kind:'freeEnd', wallId: feWallId, movingEnd: feEnd, startPt: fePt,
        startSnap: { kind:'end', point: fePt, weld:true }
      });
    }
    try{ svgEl.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    return;
  }

  // A press near, but not exactly on, a free end's own circle above
  // still has to weld a brand-new stroke onto it (SPEC: "I want to
  // continue from the end of the open border") — so a vertex within the
  // wider snap range is still checked here too, before the wall's own
  // hit-rect. Only an exact press on the dedicated circle above ever
  // becomes 'freeEnd'/'resize'; everything else keeps behaving exactly
  // as it always has.
  var startSnap = findStartSnap(startCm, t);
  if(startSnap.kind !== 'none'){
    dragState = Object.assign(base, { kind:'draw', startPt: startSnap.point, startSnap: startSnap });
    try{ svgEl.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    return;
  }

  var segHitEl = e.target.closest ? e.target.closest('.seg-hit') : null;
  if(segHitEl){
    var k = segHitEl.getAttribute('data-kind');
    dragState = Object.assign(base, {
      kind: (k==='wall'||k==='open') ? 'push' : 'opening',
      wallId: segHitEl.getAttribute('data-wall-id'), segId: segHitEl.getAttribute('data-seg-id')
    });
    try{ svgEl.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    return;
  }

  // Truly empty canvas: always begins a draw. A plain tap here (no
  // movement) just closes whatever is selected, same as any other tap
  // that lands on nothing (see handleTap) — no special case is needed
  // up front, because a tap never commits.
  dragState = Object.assign(base, { kind:'draw', startPt: startSnap.point, startSnap: startSnap });
  try{ svgEl.setPointerCapture(e.pointerId); }catch(err){}
  e.preventDefault();
}

function beginCommittedDrag(ds){
  if(ds.kind==='push' || ds.kind==='corner' || ds.kind==='resize'){
    pushHistory(); ds.base = snapshotModel();
    if(ds.kind==='corner'){
      // Captured once, before any movement — which wall-ends actually
      // sit at this corner right now. A snapped release has to weld
      // exactly these onto the target vertex; once the drag has moved
      // them, wallsAtPoint(ds.vertexPt) can no longer find them by
      // position.
      ds.touches = wallsAtPoint(ds.vertexPt, null).map(function(x){ return { wallId:x.wall.id, end:x.end }; });
    }
  } else if(ds.kind==='opening' || ds.kind==='openingEdge'){
    pushHistory(); ds.base = snapshotModel();
    var f = findSeg(ds.wallId, ds.segId);
    ds.segOffsetStart = f ? f.seg.offsetFromStart : 0;
    var w = findWall(ds.wallId);
    ds.wallDirVec = w ? wallDir(w) : {x:1,y:0};
    // 'openingEdge' also needs the segment's own starting length, to
    // compute the pinned edge's offset fresh on every move below.
    if(ds.kind==='openingEdge') ds.segLengthStart = f ? f.seg.length.value : 0;
  }
  // 'draw' needs no snapshot at all — it only ever adds a brand-new
  // piece at pointerup. 'resize' takes the same base-snapshot
  // discipline as push/corner above (its ds.fixedEnd/ds.heading were
  // already set by resolveFreeEndDirection, before this ever runs)
  // because, like a push, it mutates the live model on every move and
  // has to reapply fresh from an untouched snapshot each time rather
  // than compound. 'freeEnd' itself never reaches here uncommitted — it
  // always resolves into 'resize' or 'draw' first (see onSvgPointerMove).
}

function applyDragMove(ds, curCm, t){
  var dx = curCm.x - ds.startCm.x, dy = curCm.y - ds.startCm.y;
  if(ds.kind==='push'){
    restoreSnapshot(ds.base);
    var w = findWall(ds.wallId); if(!w) return;
    var n = wallNormal(w);
    var rawDelta = dx*n.x + dy*n.y;
    var pushSnap = findPushSnap(w, rawDelta, t);
    ds.snapAt = pushSnap ? pushSnap.point : null;
    ds.snapEnd = pushSnap ? pushSnap.end : null;
    dragPushWall(ds.wallId, pushSnap ? pushSnap.delta : rawDelta);
  } else if(ds.kind==='corner'){
    restoreSnapshot(ds.base);
    var cornerSnap = findCornerSnap(ds.vertexPt, dx, dy, t);
    if(cornerSnap){ dx = cornerSnap.x - ds.vertexPt.x; dy = cornerSnap.y - ds.vertexPt.y; ds.snapAt = cornerSnap; }
    else { ds.snapAt = null; }
    dragCornerAtPoint(ds.vertexPt, dx, dy);
  } else if(ds.kind==='opening'){
    restoreSnapshot(ds.base);
    var along = dx*ds.wallDirVec.x + dy*ds.wallDirVec.y;
    slideSegment(ds.wallId, ds.segId, ds.segOffsetStart + along, 'drawn');
  } else if(ds.kind==='openingEdge'){
    // Reapply fresh from the untouched base on every move, same as
    // push/corner/resize above — this is a conserving edit (unlike
    // typing a width, which grows the outline), so the wall's own
    // total length must come out exactly as it went in: whatever this
    // edge eats or gives back comes only from the plain run right
    // beside it, and the OPPOSITE edge never moves at all.
    restoreSnapshot(ds.base);
    var wE = findWall(ds.wallId), fE = findSeg(ds.wallId, ds.segId);
    if(!wE || !fE) return;
    var along2 = dx*ds.wallDirVec.x + dy*ds.wallDirVec.y;
    var startOffset0 = ds.segOffsetStart, length0 = ds.segLengthStart;
    var wantLen2;
    if(ds.edge==='end'){
      // Growing the END edge may only eat the plain run AFTER this
      // segment — capping the request there (rather than trusting
      // resizeSegment's own next-then-prev preference) is what keeps
      // the START edge from ever drifting, and is also the "stop
      // growing at the limit" the far edge of the wall imposes.
      wantLen2 = length0 + along2;
      if(wantLen2 > length0) wantLen2 = Math.min(wantLen2, length0 + flexRun(wE, fE.idx+1, 1).reduce(function(a,s){ return a+s.length.value; }, 0));
    } else {
      // Same reasoning, mirrored: growing the START edge may only eat
      // the plain run BEFORE this segment.
      wantLen2 = length0 - along2;
      if(wantLen2 > length0) wantLen2 = Math.min(wantLen2, length0 + flexRun(wE, fE.idx-1, -1).reduce(function(a,s){ return a+s.length.value; }, 0));
    }
    wantLen2 = Math.max(MIN_OPEN, wantLen2);
    var resE = resizeSegment(ds.wallId, ds.segId, wantLen2, 'drawn');
    var appliedLen = resE.ok ? resE.applied : resE.max;
    // resizeSegment resized in place, which (when it had to reach past
    // the room on the preferred side) can leave the wrong edge having
    // moved — slideSegment below repositions the whole segment so the
    // edge THIS drag isn't touching lands back exactly where it started.
    slideSegment(ds.wallId, ds.segId, ds.edge==='end' ? startOffset0 : (startOffset0+length0-appliedLen), 'drawn');
  } else if(ds.kind==='resize'){
    // Same "restore the untouched base, then reapply fresh" discipline
    // as push/corner above — nothing here ever compounds move over
    // move. ds.fixedEnd/ds.heading were fixed once, at commit time
    // (resolveFreeEndDirection), and never change for the rest of this
    // gesture even if the wall gets pulled down toward its own floor.
    restoreSnapshot(ds.base);
    var wR = findWall(ds.wallId); if(!wR) return;
    var endSnapR = resizeEndpointSnap(wR, ds, curCm, t);
    ds.endPoint = endSnapR.point;
    ds.endSnap = endSnapR;
    wR[ds.movingEnd].x = endSnapR.point.x; wR[ds.movingEnd].y = endSnapR.point.y;
    wR.lengthSource = 'drawn';
    // No new segment maths: the wall's own geometric length just
    // changed, so let the existing sync repartition it exactly the way
    // any other length change already does.
    syncSegmentsForAllWalls();
  } else if(ds.kind==='draw'){
    var ddx = curCm.x-ds.startPt.x, ddy = curCm.y-ds.startPt.y;
    var heading = snapHeading(ddx,ddy);
    var rawLen = Math.max(Math.abs(ddx), Math.abs(ddy));
    var endSnap = findEndpointSnap(ds.startPt, heading, rawLen, t);
    ds.heading = heading;
    ds.endPoint = endSnap.point;
    ds.endSnap = endSnap;
  }
}

// Resolves a 'freeEnd' press's ambiguity the moment it actually becomes
// a drag (crosses TAP_PX) — by the DIRECTION travelled so far, measured
// against the wall's OWN axis, not screen axes, since that axis is the
// only one a resize is ever allowed to move along. Within ~45 degrees
// of it either way is "pull this end," matching how a hand actually
// grabs and stretches an end; anything more sideways is indistinguishable
// from "start a new stroke here," which is exactly what this same point
// has always supported and must go on supporting unchanged.
function resolveFreeEndDirection(ds, curCm){
  var w = findWall(ds.wallId);
  if(!w){ ds.kind = 'draw'; return; }
  var axis = wallDir(w); // the wall's own from->to direction, fixed regardless of which end is being dragged
  var mvx = curCm.x-ds.startCm.x, mvy = curCm.y-ds.startCm.y;
  var mvLen = Math.hypot(mvx,mvy) || 1;
  var alongFrac = Math.abs(mvx*axis.x + mvy*axis.y) / mvLen; // |cos| of the angle between the drag and the wall's own line
  // The cone that means "pull this end" is deliberately NARROW (about
  // 25 degrees either way), not the even 45-degree split this started
  // as, and the two outcomes are not equally cheap to get wrong. Drawing
  // is what this point has always done and by far the commoner intent —
  // continuing an outline from its own open end — and the natural drag
  // for it aims diagonally at where the next corner goes, not squarely
  // perpendicular. Under an even split that diagonal reads as "along the
  // wall" the moment its along-component wins by a hair, so the stroke
  // meant to close a room silently became a stretch of the wall it
  // started from and the room stayed open, with nothing on screen having
  // claimed otherwise. A wrong draw costs one undo and leaves the
  // geometry intact; a wrong resize destroys a measurement and swallows
  // the stroke. So anything but a deliberate straight pull along the
  // wall's own line falls to draw.
  if(alongFrac >= 0.9){
    ds.kind = 'resize';
    ds.fixedEnd = ds.movingEnd === 'from' ? 'to' : 'from';
    // Heading away from the FIXED end, toward wherever the moving end
    // currently sits — locked in now so it can never flip mid-drag,
    // even pulled all the way down to the MIN_WALL/openings floor.
    ds.heading = headingOf({ from: w[ds.fixedEnd], to: w[ds.movingEnd] });
  } else {
    ds.kind = 'draw'; // unchanged: an ordinary new stroke starting from this free end
  }
}

function onSvgPointerMove(e){
  if(!dragState) return;
  var t = viewTransform();
  var curCm = clientToCm(e.clientX, e.clientY, t);
  if(!dragState.committed){
    var screenDist = Math.hypot(e.clientX-dragState.startClientX, e.clientY-dragState.startClientY);
    if(screenDist < TAP_PX) return;
    if(dragState.kind === 'freeEnd'){
      // Six pixels is enough to know a gesture is a drag and not a tap,
      // but nowhere near enough to know WHICH drag it is: over that
      // distance the direction is mostly the jitter of the first frame
      // after the finger starts moving. Reading the cone off that sample
      // locked the whole gesture to the wrong one of two very different
      // outcomes before the hand had actually said anything. So a free
      // end alone waits longer than every other gesture before it
      // commits — the extra distance is only ever spent deciding, never
      // discarded, because the direction is measured from the press
      // point either way.
      if(screenDist < FREE_END_DECIDE_PX) return;
      resolveFreeEndDirection(dragState, curCm);
    }
    dragState.committed = true;
    beginCommittedDrag(dragState);
  }
  applyDragMove(dragState, curCm, t);
  render();
}

function handleTap(ds){
  // A tap on an opening's own edge handle (no movement, so it never
  // grew into an 'openingEdge' resize) just keeps that opening selected
  // — the handle only exists because it's already the selection, so a
  // tap here has nothing new to do, but must not fall through to the
  // corner/draw case below and deselect it.
  if(ds.kind==='push' || ds.kind==='opening' || ds.kind==='openingEdge'){
    selection = { segId: ds.segId };
  } else if(ds.kind==='freeEnd'){
    // A free end's own dedicated circle is a genuinely ambiguous target
    // (unlike the opening-edge handle above): a tap here (no movement,
    // so it never resolved into 'resize' or 'draw' at all — see
    // resolveFreeEndDirection) selects the piece AT that end, rather
    // than the "deselect everything" a draw-tap on empty canvas
    // gives. Poking the end of a wall selecting that wall is what a
    // user expects. Segments run from->to, so the piece at 'from' is
    // always index 0, and at 'to' always the last one.
    var fw = findWall(ds.wallId);
    selection = fw ? { segId: fw.segments[ds.movingEnd==='from' ? 0 : fw.segments.length-1].id } : null;
  } else {
    // corner / draw: a tap with no movement just closes whatever is
    // selected (SPEC: "Tap empty canvas to deselect, and the canvas
    // goes quiet again") — it never starts anything new.
    selection = null;
  }
}

// Mid-drag, every wall endpoint a push/corner touches sits at whatever
// fractional-cm value the raw pointer movement produced — unlike a
// draw stroke, nothing rounds while it's live, or dragging would feel
// sticky. Release is the one moment it has to happen: a wall landing
// "visually flush" against another is still off by a fraction of a cm,
// and pointsEqual (WELD_EPS=0.5) won't call that a weld. Round every
// wall endpoint in the model to whole cm now (harmless for the ones
// the gesture never touched — they're already integers), then, if a
// snap actually caught mid-drag, force the endpoint(s) it caught onto
// the target vertex's EXACT coordinates so the weld is bit-for-bit
// equal, not just close enough after rounding.
function finalizeDragWeld(ds){
  model.walls.forEach(function(w){
    w.from.x = r(w.from.x); w.from.y = r(w.from.y);
    w.to.x = r(w.to.x); w.to.y = r(w.to.y);
  });
  if(ds.kind==='push' && ds.snapAt && ds.snapEnd){
    var w = findWall(ds.wallId);
    if(w){ w[ds.snapEnd].x = ds.snapAt.x; w[ds.snapEnd].y = ds.snapAt.y; }
  } else if(ds.kind==='corner' && ds.snapAt && ds.touches){
    ds.touches.forEach(function(tc){
      var tw = findWall(tc.wallId);
      if(tw){ tw[tc.end].x = ds.snapAt.x; tw[tc.end].y = ds.snapAt.y; }
    });
  }
  cleanupOutline();
  syncSegmentsForAllWalls();
}

function onSvgPointerUp(e){
  if(!dragState) return;
  var ds = dragState;
  if(!ds.committed){
    handleTap(ds);
  } else if(ds.kind==='openingEdge'){
    // Already fully applied to the live model by the last applyDragMove
    // — like 'push'/'opening', there's no separate release-time commit
    // step, just keeping the piece selected.
    selection = { segId: ds.segId };
  } else if(ds.kind==='opening'){
    var under = doc.elementFromPoint(e.clientX, e.clientY);
    var hitEl2 = under && under.closest ? under.closest('.seg-hit') : null;
    var targetWallId = hitEl2 ? hitEl2.getAttribute('data-wall-id') : null;
    if(targetWallId && targetWallId !== ds.wallId){
      var t2 = viewTransform();
      var dropCm = clientToCm(e.clientX, e.clientY, t2);
      var targetWall = findWall(targetWallId);
      if(targetWall){
        var dvec2 = wallDir(targetWall);
        var alongCm2 = (dropCm.x-targetWall.from.x)*dvec2.x + (dropCm.y-targetWall.from.y)*dvec2.y;
        restoreSnapshot(ds.base);
        var moveRes = moveOpeningToWall(ds.wallId, ds.segId, targetWallId, alongCm2);
        if(moveRes.ok){ selection = { segId: moveRes.newId }; }
        else { showConfirm(RO.openingStayed, RO.gotIt, function(){}, function(){}); }
      }
    } else {
      selection = { segId: ds.segId };
    }
  } else if(ds.kind==='push'){
    finalizeDragWeld(ds);
    selection = { segId: ds.segId };
  } else if(ds.kind==='corner'){
    finalizeDragWeld(ds);
  } else if(ds.kind==='resize'){
    // Re-check fresh at release, same "on press and again on release"
    // discipline as 'draw' just below, using the actual release
    // coordinates rather than whatever the last move event computed.
    var t4 = viewTransform();
    var releaseCm4 = clientToCm(e.clientX, e.clientY, t4);
    var wRel = findWall(ds.wallId);
    if(wRel){
      var endSnap4 = resizeEndpointSnap(wRel, ds, releaseCm4, t4);
      // Weld exactly onto the target's own coordinates (findEndpointSnap
      // already returns whole-cm points on every branch — a weld's own
      // vertex, an align's on-axis point, or a rounded free 'none') —
      // r() here is just the same defensive whole-cm guarantee every
      // other release-time weld already makes.
      wRel[ds.movingEnd].x = r(endSnap4.point.x); wRel[ds.movingEnd].y = r(endSnap4.point.y);
      wRel.lengthSource = 'drawn';
      // Sync FIRST, so a piece grown past an opening (resizeWallKeeping-
      // Segments appends a fresh wall stretch beyond it rather than
      // stretching the opening itself) resolves to whichever segment
      // truly sits at the end now — then capture that id BEFORE
      // cleanupOutline can merge this wall into a collinear neighbour
      // (commitDrawStroke's own newSegId does the same, for the same
      // reason: a merge concatenates rather than regenerating ids, so
      // the piece identified here stays selectable afterward even if
      // it's no longer alone in its wall).
      syncSegmentsForAllWalls();
      var resizedSegId = wRel.segments[ds.movingEnd==='from' ? 0 : wRel.segments.length-1].id;
      cleanupOutline();
      syncSegmentsForAllWalls();
      selection = { segId: resizedSegId };
    }
  } else if(ds.kind==='draw'){
    // Re-check the END snap fresh at release — "on press and again on
    // release" — using the actual release coordinates, not just
    // whatever the last move event happened to compute.
    var t3 = viewTransform();
    var releaseCm = clientToCm(e.clientX, e.clientY, t3);
    var ddx2 = releaseCm.x-ds.startPt.x, ddy2 = releaseCm.y-ds.startPt.y;
    var heading2 = snapHeading(ddx2,ddy2);
    var rawLen2 = Math.max(Math.abs(ddx2), Math.abs(ddy2));
    var endSnap2 = findEndpointSnap(ds.startPt, heading2, rawLen2, t3);
    commitDrawStroke(ds.startPt, ds.startSnap, endSnap2.point, endSnap2, heading2, t3);
  }
  try{ svgEl.releasePointerCapture && svgEl.releasePointerCapture(e.pointerId); }catch(err){}
  dragState = null;
  render();
}

/* ============================================================
   WIRING
   ============================================================ */
function init(){
  svgEl = $id('roomSvg');
  ctrlLayerEl = $id('ctrlLayer');
  emptyHintEl = $id('emptyHint');
  toastEl = $id('toastEl');
  toastTextEl = $id('toastText');
  toastDismissEl = $id('toastDismiss');
  clusterEl = $id('cluster');
  ceilingInputEl = $id('ceilingInput');
  undoBtn = $id('undoBtn');
  redoBtn = $id('redoBtn');
  missingListEl = $id('missingList');
  missingBtn = $id('missingBtn');
  missingDividerEl = $id('missingDivider');
  missingBtn.addEventListener('click', function(){ missingExpanded = !missingExpanded; render(); });
  confirmDialogEl = $id('confirmDialog');
  confirmDialogTextEl = $id('confirmDialogText');
  confirmYesBtn = $id('confirmYesBtn');
  confirmNoBtn = $id('confirmNoBtn');

  svgEl.addEventListener('pointerdown', onSvgPointerDown);
  svgEl.addEventListener('pointermove', onSvgPointerMove);
  svgEl.addEventListener('pointerup', onSvgPointerUp);
  svgEl.addEventListener('pointercancel', function(){ dragState = null; render(); });

  // Real touch input snaps an imprecise press to the nearest interactive
  // element within a small radius (round ten: PANEL_GAP_PX exists
  // because of it) — but that snapping retargets the EVENT, not the
  // coordinates: e.clientX/clientY are still exactly where the finger
  // landed, only e.target is wrong. Round eleven: this meant a press on
  // bare canvas, up to ~20px below the bar, silently hit the bar
  // instead and went nowhere — elementsFromPoint at that exact point
  // still reported the SVG underneath the whole time. PANEL_GAP_PX is a
  // LAYOUT gap (round ten's own fix keeps chips/labels/the bar off of
  // a free end); it was never meant to be a hit-testing boundary too,
  // and must not become one here either — only a chip's or the bar's
  // own actual rendered box may claim a pointer. Caught in the capture
  // phase, before the mistargeted element's own listener sees it: if the
  // real coordinates fall outside that element's real box, this was
  // never a press on it — hand it to the SVG at its real coordinates,
  // exactly as if the browser's own hit-test (which already agrees,
  // underneath) had been trusted in the first place.
  //
  // #bar covers both plates (undo/redo/ceiling always, the selection
  // plate #cluster only when something is selected) — plate one used to
  // live in the docked #rail, which never needed this fix because it
  // wasn't floating over the drawing surface; now that it does, it
  // needs the same touch-retargeting guard #cluster always did.
  // #pieceActions joins the list for the exact same reason a chip is
  // in it: it floats over the drawing surface too, so a near-miss
  // aimed at it must reach the canvas underneath rather than silently
  // eating the stroke.
  function realBoxMisses(e){
    var el = e.target && e.target.closest ? e.target.closest('#bar .plate, .chip, #pieceActions') : null;
    if(!el) return null;
    // A native TouchEvent carries no clientX/clientY of its own — those
    // live on its touches/changedTouches list, unlike a PointerEvent
    // (used for pointerdown/click above) which has them directly. Read
    // whichever this event actually is, or the box check below silently
    // compares against `undefined` and misfires on every touch alike.
    var pt = e;
    if(e.clientX === undefined){
      var list = (e.touches && e.touches.length) ? e.touches : e.changedTouches;
      pt = (list && list[0]) || { clientX:NaN, clientY:NaN };
    }
    // A rect's own bottom/right are the first row/column BEYOND it, not
    // part of it (same convention getBoundingClientRect itself uses) —
    // a press exactly at that edge is already past the box, not on it.
    var r = el.getBoundingClientRect();
    // A chip's real box, for this check, has to include its own
    // invisible halo (.chip::before, inset -7px) — a press that lands
    // there is a genuine, correctly-hit-tested press on the chip's own
    // rendered content, not the browser mis-snap this guard exists for,
    // and must not be forwarded to the canvas underneath (src/draw's
    // DimChip: that's exactly how a miss steals the selection).
    var pad = el.classList.contains('chip') ? 7 : 0;
    var inside = pt.clientX >= r.left-pad && pt.clientX < r.right+pad && pt.clientY >= r.top-pad && pt.clientY < r.bottom+pad;
    return inside ? null : el;
  }
  onRoot('touchstart', function(e){
    if(!realBoxMisses(e)) return;
    // Touch-action eligibility (is this movement a pan/scroll?) is
    // decided from the ORIGINAL hit-tested element's own CSS, before any
    // of this runs — a plain button has no touch-action:none, so
    // preventDefault on pointerdown alone (below) does not reliably
    // stop the browser treating the ensuing drag as a scroll and
    // cancelling it partway through. Only preventDefault on the actual
    // touchstart does that (SPEC: the touch event, not its pointer
    // counterpart, is what native scroll/pan eligibility hangs off of).
    e.preventDefault();
  }, { capture:true, passive:false });
  onRoot('pointerdown', function(e){
    var miss = realBoxMisses(e);
    if(!miss) return;
    e.stopImmediatePropagation();
    onSvgPointerDown(e);
  }, true);
  onRoot('click', function(e){
    // A retargeted press that never moves (a tap, not a draw) still
    // reaches handleTap via the redirect above and needs no click at
    // all — but stop this one regardless of how it got here, so a
    // mistargeted press can never fire whatever button it landed on.
    if(!realBoxMisses(e)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  bindLengthField(ceilingInputEl, function(cm){ pushHistory(); model.ceilingHeightCm = cm; render(); }, RO.fieldCeiling);

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  toastDismissEl.addEventListener('click', function(){ hideToast(); render(); });

  confirmYesBtn.addEventListener('click', function(){ var cs=confirmState; hideConfirm(); if(cs && cs.onYes) cs.onYes(); render(); });
  confirmNoBtn.addEventListener('click', function(){ var cs=confirmState; hideConfirm(); if(cs && cs.onNo) cs.onNo(); render(); });
  confirmDialogEl.addEventListener('mousedown', function(e){ if(e.target.closest('button')) e.preventDefault(); });

  // Commit-seam fix (SPEC-shared-contract bug class 1): a field commits
  // on blur, which re-renders and can destroy the button mid-press.
  // Suppress the focus-shift on mousedown, then read the field's live
  // value in a capture-phase click before any button's own handler runs.
  var appEl = $id('app');
  appEl.addEventListener('mousedown', function(e){ if(e.target.closest('button')) e.preventDefault(); });
  appEl.addEventListener('click', function(e){
    var btn = e.target.closest('button');
    if(!btn) return;
    if(!commitActiveField()) e.stopImmediatePropagation();
  }, true);

  onWin('resize', render);
  onWin('orientationchange', function(){ setTimeout(function(){ if(!destroyed) render(); }, 60); });
  onWin('keydown', function(e){
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
    if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='y' || (e.key.toLowerCase()==='z' && e.shiftKey))){ e.preventDefault(); redo(); }
    if((e.key==='Delete' || e.key==='Backspace') && selection){
      // Guard against a length chip's own text input still focused —
      // Backspace there has to keep editing the number, never delete
      // the whole piece out from under it.
      var tag = e.target && e.target.tagName;
      if(tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      deleteSelection();
    }
  });

  render();
}

/* ======================================================================
   PUBLIC API
   ====================================================================== */
/* Keep uid() ahead of every id in a restored model, so a piece drawn
   after setModel can never collide with one that came back from storage. */
function bumpIdCounter(){
  var max = 0;
  (model.walls || []).forEach(function(w){
    [w.id].concat((w.segments||[]).map(function(s){ return s.id; })).forEach(function(id){
      var m = /(\d+)$/.exec(String(id||''));
      if(m) max = Math.max(max, parseInt(m[1], 10));
    });
  });
  if(_idCounter <= max) _idCounter = max + 1;
}

function setModel(m){
  if(!m || typeof m !== 'object' || !Array.isArray(m.walls)) throw new Error('setModel: expected { ceilingHeightCm, walls }');
  restoreSnapshot({ ceilingHeightCm: (m.ceilingHeightCm == null ? null : m.ceilingHeightCm), walls: m.walls });
  undoStack = []; redoStack = [];
  selection = null; dragState = null; toastState = null; confirmState = null;
  lastSettledSegId = null; missingExpanded = false;
  bumpIdCounter();
  render();
}

function destroy(){
  if(destroyed) return;
  destroyed = true;
  winListeners.forEach(function(l){ win.removeEventListener(l[0], l[1], l[2]); });
  rootListeners.forEach(function(l){ root.removeEventListener(l[0], l[1], l[2]); });
  winListeners.length = 0; rootListeners.length = 0;
  if(exposeGlobals){
    if(win.__room === buildRoomSnapshot) try{ delete win.__room; }catch(e){ win.__room = undefined; }
    if(win.__reset === globalReset) try{ delete win.__reset; }catch(e){ win.__reset = undefined; }
    try{ delete win.__lastModel; }catch(e){ win.__lastModel = undefined; }
  }
  root.innerHTML = '';
  root.classList.remove('fp');
}

function globalReset(){ resetAll(); }

if(exposeGlobals){
  win.__room = buildRoomSnapshot;
  win.__reset = globalReset;
}

init();

return {
  room: function(){ return buildRoomSnapshot(); },
  getModel: function(){ return snapshotModel(); },   // already a deep clone
  setModel: setModel,
  reset: function(){ resetAll(); },
  destroy: destroy
};
}

export default mountFloorplan;
