/* ======================================================================
   floorplan/engine.js — the freehand room-capture editor, as a
   framework-free ES module. A FACTORY: what would be module state is
   per-instance closure state, and every DOM lookup is scoped to the
   mount root, so two editors can share a page. The tool machine, the
   view and the saved drawing are pure TypeScript beside this file
   (tools.ts, view.ts, drawing.ts); what is left here is geometry,
   rendering and pointers.
   ====================================================================== */

import { DRAWING_TOOLS, applyToolEvent, restingTool, toolById, toolForKey } from './tools';
import {
  boxOf,
  cmToPx,
  edgePanStep,
  fitView,
  panByPx,
  panToReveal,
  pxToCm,
  viewBoxOf,
  zoomAround
} from './view';
import { CHAIN_LANE_PX, chainOfPiece, placeChainChips } from './chain';
import { buildRun, extendEndOf, ownOffsetOf, placeAlongRun } from './slide';
import { hasSeen, localSeenStorage, markSeen } from './seen';
import { glyphSvg as glyph } from './glyphs';
import { markColour } from './marks';
import {
  clampToWall,
  entryOffsetCm,
  faceOfSide,
  fitsAt,
  landmarksOfModel,
  marksAsBlockers,
  placeOnWall,
  reassignOnMerge,
  reassignOnSplit,
  settleOnWalls,
  showsOnWall,
  slideOnWall,
  snapshotLandmarks,
  withoutWall
} from './landmarks';
import { LANDMARK_SIZE_CM, landmarkKindOf } from '@urban-moon/domain-data';
import { BASE, ease, ms } from '$lib/ui/motion';

/* ----------------------------------------------------------------------
   RO — every word this editor shows on screen. The app speaks Romanian
   (sentence case, addressing the user as "tu"), so the engine does too;
   geometry, ids, classes, data-testids and the model's own vocabulary
   ('wall' / 'open' / 'window' / 'door') are untouched. A hint that
   differs between a finger and a mouse is a function of `touch`.
   ---------------------------------------------------------------------- */
const RO = {
  undo: 'Anulează',
  redo: 'Refă',
  zoomIn: 'Mărește',
  zoomOut: 'Micșorează',
  fit: 'Încadrează',
  width: 'Lățime',
  sill: 'Înălțime pervaz',
  rotate: 'Rotește',
  del: 'Șterge',
  gotIt: 'Am înțeles',
  help: 'Cum desenez',
  letMeFix: 'Mai schimb eu',
  /* the field names that appear inside the metres question, mid-sentence */
  fieldLength: 'lungime',
  fieldWidth: 'lățime',
  fieldSill: 'înălțimea pervazului',
  hint: {
    empty: function(touch){
      return touch
        ? 'Alege <b>Perete</b>, apoi trage cu degetul ca să faci primul perete.'
        : 'Alege <b>Perete</b> (tasta P), apoi ține apăsat și trage ca să faci primul perete.';
    },
    drawing: function(touch){
      return touch
        ? 'Ridică degetul ca să termini peretele.'
        : 'Dă drumul butonului ca să termini peretele. Esc renunță.';
    },
    wallMade: function(touch){
      return touch
        ? 'Atinge numărul ca să scrii lungimea. Pentru încă un perete, alege din nou Perete.'
        : 'Dă clic pe număr ca să scrii lungimea. Pentru încă un perete, alege din nou Perete (P).';
    },
    wallOn: function(touch){
      return touch
        ? 'Trage cu degetul de la un capăt al peretelui la celălalt.'
        : 'Ține apăsat și trage de la un capăt al peretelui la celălalt.';
    },
    openOn: function(){ return 'Trage pe unde camera se deschide spre altă cameră.'; },
    openFocus: function(touch){
      return touch
        ? 'Atinge numărul ca să scrii lungimea. Trage linia ca s-o muți.'
        : 'Dă clic pe număr ca să scrii lungimea. Trage linia ca s-o muți.';
    },
    windowOn: function(touch){
      return touch ? 'Atinge peretele pe care e fereastra.' : 'Dă clic pe peretele pe care e fereastra.';
    },
    doorOn: function(touch){
      return touch ? 'Atinge peretele pe care e ușa.' : 'Dă clic pe peretele pe care e ușa.';
    },
    noWall: function(){ return 'Desenează întâi un perete.'; },
    windowFocus: function(touch){
      return touch
        ? 'Trage fereastra ca s-o muți pe perete. Atinge înălțimea pervazului ca s-o schimbi.'
        : 'Trage fereastra ca s-o muți pe perete. Dă clic pe înălțimea pervazului ca s-o schimbi.';
    },
    doorFocus: function(touch){
      return touch
        ? 'Trage ușa ca s-o muți pe perete. Apasă Rotește până se deschide ca la tine.'
        : 'Trage ușa ca s-o muți pe perete. Apasă Rotește (R) până se deschide ca la tine.';
    },
    wallFocus: function(touch){
      return touch
        ? 'Trage peretele ca să-l muți. Atinge numărul ca să schimbi lungimea.'
        : 'Trage peretele ca să-l muți. Dă clic pe număr ca să schimbi lungimea.';
    },
    zoom: function(touch){
      return touch
        ? 'Apropie sau depărtează două degete ca să mărești. Cu două degete muți planul.'
        : 'Rotița mărește în jurul cursorului. Trage de fundal ca să muți planul.';
    },
    landmarkOn: function(touch, kind){
      var it = RO.landmarkThe[kind] || '';
      return touch ? 'Atinge peretele unde e ' + it + '.' : 'Dă clic pe peretele unde e ' + it + '.';
    },
    landmarkFocus: function(){
      return 'Trage pătratul pe perete. Trage-l peste perete ca să-l muți pe partea cealaltă.';
    },
    landmarkIdle: function(touch){
      return touch
        ? 'Atinge un pătrat ca să-l muți sau să-l ștergi.'
        : 'Dă clic pe un pătrat ca să-l muți sau să-l ștergi.';
    },
    saving: function(){ return 'Se salvează…'; }
  },
  /* each landmark named the way the hint says it, mid-sentence */
  landmarkThe: {
    water: 'țeava de apă',
    gas: 'gazul',
    boiler: 'centrala',
    airConditioning: 'aerul condiționat',
    fireplace: 'șemineul',
    radiator: 'caloriferul',
    hoodVent: 'evacuarea hotei'
  },
  firstWall: 'Desenează primul perete ca să începi.',
  freeEnds: function(n){
    return n === 1
      ? 'Un capăt de perete nu e legat de nimic încă.'
      : n + ' capete de perete nu sunt legate de nimic încă.';
  },
  notClosed: 'Pereții nu formează încă un contur închis.',
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
  /* the subject of the two sliding lines, by the kind being dragged */
  windowSubject: 'Fereastra',
  doorSubject: 'Ușa',
  slidesOnWall: function(subject){ return subject + ' merge pe perete și după colț, cât timp peretele continuă.'; },
  slidesPastEnd: function(subject){ return subject + ' poate trece de capătul liber. Apoi continuă peretele din capătul ei.'; }
};

/* The editor's own markup, injected into the root; every lookup below
   goes through root.querySelector, so the ids are per-instance. */
export const TEMPLATE = `
<div id="app">
  <main id="stage" data-testid="stage">
    <svg id="roomSvg" data-testid="editor-svg" preserveAspectRatio="xMidYMid meet" viewBox="-200 -200 400 400"></svg>
    <div id="ctrlLayer"></div>
    <div class="fp-plate fp-tools" id="toolPlate"></div>
    <div class="fp-hint" id="hintLine" data-testid="hint"></div>
    <div class="fp-plate fp-hist" id="histPlate"></div>
    <div class="fp-plate fp-view" id="viewPlate"></div>
    <div class="fp-toast fp-off" id="toastEl" data-testid="toast">
      <span id="toastText"></span>
      <button type="button" data-testid="toast-dismiss" id="toastDismiss">${RO.gotIt}</button>
    </div>
  </main>
</div>

<div id="confirmDialog" class="fp-off" data-testid="confirm-dialog">
  <div class="fp-confirm">
    <p id="confirmDialogText"></p>
    <div class="fp-row">
      <button type="button" class="fp-primary" id="confirmYesBtn" data-testid="confirm-yes"></button>
      <button type="button" id="confirmNoBtn" data-testid="confirm-no">${RO.letMeFix}</button>
    </div>
  </div>
</div>
`;

/**
 * Mount the floorplan editor into `root`.
 *
 * @param {HTMLElement} root
 * @param {{ onChange?: (room:any)=>void, onHelp?: ()=>void, mode?: 'plan'|'landmarks',
 *           landmarkKind?: string, exposeGlobals?: boolean }} [opts]
 * @returns {{ room():any, getModel():any, setModel(m:any):void, reset():void, destroy():void }}
 */
export function mountFloorplan(root, opts){
"use strict";
opts = opts || {};
if(!root || !root.nodeType) throw new Error('mountFloorplan: a root element is required');

var doc = root.ownerDocument || document;
var win = doc.defaultView || window;
var onChangeCb = typeof opts.onChange === 'function' ? opts.onChange : null;
/* The help the hint offers lives outside the engine; without a host to show
   it the line carries no link and ? does nothing. */
var onHelpCb = typeof opts.onHelp === 'function' ? opts.onHelp : null;
var exposeGlobals = !!opts.exposeGlobals;
var destroyed = false;

root.classList.add('fp');
if(opts.mode === 'landmarks') root.classList.add('fp-placing');
root.innerHTML = TEMPLATE;

/* Every lookup is root-scoped, so the ids below resolve inside this
   instance's own subtree rather than the document's. */
function $id(id){ return root.querySelector('#' + id); }

/* Listener bookkeeping, so destroy() leaves nothing behind. The
   capture-phase touch-retarget guards sit on `root`, an ancestor of every
   element they guard, so they run before that element's own listener. */
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
var DEFAULT_WINDOW_W = 60;
var DEFAULT_SILL = 90;
var WALL_THICKNESS_CM = 20;     // plan-view wall thickness (a solid band, not a stroke), at the
                                 // plan's own scale
var SNAP_PX = 20;               // screen px — identical feel at every zoom, on every device
var TAP_PX = 6;                 // screen px, movement beyond this counts as a real drag, not a tap
var FREE_END_DECIDE_PX = 16;    // screen px - how far a drag off a free end must travel before it is read as pull-to-resize rather than start-a-new-wall
var WELD_EPS = 0.5;             // cm — two points this close are "the same point"
var MIN_STROKE_PX = 12;         // screen px — a drawn stroke shorter than this on-screen was a
                                 // mis-click, not a deliberate wall; TAP_PX only gates tap-vs-drag
                                 // at press, this is the second gate at commit (screen px, not cm,
                                 // so it behaves identically at every zoom level).

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
var model = { walls: [], landmarks: [] };
var undoStack = [], redoStack = [];
var selection = null;     // null | { segId } | { landmarkId }
// Which segId render() last saw in focus, so it can notice the one
// moment that matters for merging: the piece that was in focus a moment
// ago no longer is. Not keyed to any gesture, because every path that
// moves the focus has to settle the piece it left behind the same way.
var lastSettledSegId = null;
var dragState = null;     // active pointer gesture, see GESTURES
var toastState = null;
var confirmState = null;

/* Session state, not model state: never snapshotted, never undoable, kept
   while the editor is mounted. */
/* The step this mounting is for: the plan itself, or placing one kind of
   landmark on a plan already drawn. A later step narrows the tools and leaves
   what earlier steps made drawn but untouchable. */
var mode = opts.mode === 'landmarks' ? 'landmarks' : 'plan';
var landmarkKind = typeof opts.landmarkKind === 'string' ? opts.landmarkKind : null;
var LANDMARK_TOOL = 'landmark';
function landmarkTools(){
  var entry = landmarkKindOf(landmarkKind);
  return [
    DRAWING_TOOLS[0],
    { id: LANDMARK_TOOL, label: entry ? entry.label : '', key: '', gesture: 'tap',
      makes: LANDMARK_TOOL, needsWall: true }
  ];
}
var tools = Array.isArray(opts.tools) && opts.tools.length
  ? opts.tools
  : (mode === 'landmarks' ? landmarkTools() : DRAWING_TOOLS);
/* The landmark tool is armed the moment the screen opens: the client came here
   from the card that chose it. */
function armedTool(){ return mode === 'landmarks' ? LANDMARK_TOOL : restingTool(tools); }
var activeTool = armedTool();
var view = null;              // { cx, cy, scale }; fitted on the first render
var justMade = null;          // the kind a tool made a moment ago, for the hint
var refusedTool = false;      // a tool that cannot be used yet was picked
var hintState = null;         // an override the host sets, e.g. while saving
var keysEnabled = true;
var zoomHintUntil = 0;
/* The hint speaks in touch words or mouse words, starting from what the
   device says it is and following whatever the client last used. */
var touchWords = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
var seenStorage = opts.seenStorage !== undefined ? opts.seenStorage : localSeenStorage();
var carried = { windowWidth: DEFAULT_WINDOW_W, sill: DEFAULT_SILL };

function snapshotModel(){
  return {
    walls: JSON.parse(JSON.stringify(model.walls)),
    landmarks: JSON.parse(JSON.stringify(model.landmarks || []))
  };
}
function pushHistory(){
  undoStack.push(snapshotModel());
  if(undoStack.length > 300) undoStack.shift();
  redoStack.length = 0;
}
function restoreSnapshot(snap){
  model.walls = JSON.parse(JSON.stringify(snap.walls));
  model.landmarks = JSON.parse(JSON.stringify(landmarksOfModel(snap)));
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
  model = { walls: [], landmarks: [] };
  undoStack = []; redoStack = [];
  selection = null; dragState = null;
  toastState = null; confirmState = null;
  activeTool = armedTool(); justMade = null; refusedTool = false;
  view = null;
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
function makeWall(from, to, source, kind){
  // A wall's two ends must share exactly one coordinate: the room is drawn
  // and squared on axis-aligned strokes only, and a wall that differed on
  // both axes would report its Euclidean distance as the drawn number with
  // nothing on screen saying the room is not square. Every caller lands
  // on-axis before it gets here — refuse rather than store a diagonal.
  if(r(from.x) !== r(to.x) && r(from.y) !== r(to.y)){
    throw new Error('makeWall: refusing a diagonal wall from ('+from.x+','+from.y+') to ('+to.x+','+to.y+')');
  }
  var segKind = kind === 'open' ? 'open' : 'wall';
  var w = {
    id: uid('wall'), from: { x:from.x, y:from.y }, to: { x:to.x, y:to.y },
    lengthSource: source || 'computed', isOpen: segKind === 'open',
    segments: []
  };
  w.segments = [ makeSegment(segKind, dist(w.from, w.to), source || 'computed') ];
  return w;
}
function minFor(kind){ return (kind === 'window' || kind === 'door') ? MIN_OPEN : MIN_WALL; }

/* ======================================================================
   LANDMARKS — what the room has that the plan cannot show, each against a
   wall on one of its two faces. They live in the model beside the walls, so
   they are undone, dragged and reported like everything else; landmarks.ts
   owns where one may sit, and this is what the engine does about it.
   ====================================================================== */
function findLandmark(id){
  var list = model.landmarks || [];
  for(var i=0;i<list.length;i++) if(list[i].id === id) return list[i];
  return null;
}
function landmarksOn(wallId){
  return (model.landmarks || []).filter(function(m){ return m.wallId === wallId; });
}
/** the landmark in focus, whose wall shows the chain */
function focusedLandmark(){
  return (selection && selection.landmarkId) ? findLandmark(selection.landmarkId) : null;
}
/**
 * What a landmark on this wall may not overlap: a stretch with nothing built
 * (a landmark never goes on a Fără perete side) and a landmark already on the
 * same face. A window or a door is not one of them — a radiator sits under a
 * window.
 */
function openSpansOf(w){
  var out = [];
  w.segments.forEach(function(s){
    if(s.kind !== 'open') return;
    out.push({ startCm: s.offsetFromStart, endCm: s.offsetFromStart + s.length.value });
  });
  return out;
}
function blockersFor(w, face, exceptId){
  return openSpansOf(w).concat(marksAsBlockers(model.landmarks || [], w.id, face, exceptId || null));
}
/* The one wall length everything about a landmark is measured against: where
   it may sit, how far it may travel, the chain the client reads and the gaps
   the snapshot carries all use this, so the number in the manifest is the
   number that was on screen. */
function markWallLengthCm(w){ return r(wallLen(w)); }
/** Everything a gap along this wall stops at, whichever face it is on. */
function landmarkObstacles(w, exceptId){
  var out = [];
  w.segments.forEach(function(s){
    if(s.kind === 'wall') return;
    out.push({ startCm: s.offsetFromStart, endCm: s.offsetFromStart + s.length.value });
  });
  landmarksOn(w.id).forEach(function(m){
    if(m.id === exceptId) return;
    out.push({ startCm: m.offsetFromStartCm, endCm: m.offsetFromStartCm + LANDMARK_SIZE_CM });
  });
  return out;
}
/** Whether a landmark's wall can hold it right now: only then is it drawn, touched or reported. */
function landmarkShows(m){
  var w = findWall(m.wallId);
  return !!w && showsOnWall({ lengthCm: markWallLengthCm(w), isOpen: !!w.isOpen });
}
/* Every path that moves a wall ends here: a landmark settles back onto what
   its wall still allows, and goes with a wall that is gone. A wall that no
   longer holds it — shortened past the square, or turned into a side with
   nothing built — keeps it: it stops being drawn and stops being reported, and
   comes back at that wall's start when the wall can hold it again. Splits and
   merges are handled where they happen, because only there is it known which
   piece is which; the settling here is what puts right what they leave. */
function syncLandmarks(){
  var list = model.landmarks || [];
  if(list.length){
    model.landmarks = settleOnWalls(list, function(m){
      var w = findWall(m.wallId);
      if(!w) return null;
      return { lengthCm: markWallLengthCm(w), blockedSpans: openSpansOf(w) };
    }).map(function(m){
      m.offsetFromStartCm = r(m.offsetFromStartCm);
      return m;
    });
  }
  // Nothing hidden or gone is in focus: its square, its plate and its chain
  // have all left the canvas.
  if(selection && selection.landmarkId){
    var focused = findLandmark(selection.landmarkId);
    if(!focused || !landmarkShows(focused)) selection = null;
  }
}

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
        model.landmarks = withoutWall(model.landmarks || [], w.id);
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
      // b is read from->to here, so everything on it moves along by exactly
      // the run a already holds — its landmarks included.
      var seamCm = segTotal(a);
      var mergedSegs = a.segments.concat(b.segments.map(function(s){
        var c = JSON.parse(JSON.stringify(s)); c.offsetFromStart += seamCm; return c;
      }));
      model.landmarks = reassignOnMerge(model.landmarks || [], b.id, a.id, seamCm);
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
  // A window's width carries over from the last one the client typed.
  var defaults = { door:DEFAULT_DOOR_W, window:carried.windowWidth };
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
  if(kind==='window') opening.sill = { value:carried.sill, source:'computed' };
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
// Deleting a piece of a wall shrinks the wall itself by that piece's
// length rather than letting the rest stretch over the gap, so every
// other piece keeps the real-world length the client gave it. The end
// that absorbs the shrink is the far one from the piece, so nothing
// between them moves. A wall's only piece takes the whole wall with it.
function deleteSelection(){
  if(!selection) return;
  if(selection.landmarkId){
    var mark = findLandmark(selection.landmarkId);
    if(!mark) return;
    pushHistory();
    model.landmarks = (model.landmarks || []).filter(function(m){ return m.id !== mark.id; });
    selection = null;
    justMade = null;
    render();
    return;
  }
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
  justMade = null;
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
/* ======================================================================
   SLIDING AN OPENING — how far a window or a door travels while it is
   dragged. slide.ts builds the run out of the walls handed to it, and
   says where along it the opening lands and which way round that is on
   the wall itself; what is here is the world geometry that goes with it
   — the run's corners, how far along it a pointer is asking for — and
   writing the answer into the model. The run is taken once, when the
   drag commits.
   ====================================================================== */
/** every wall as slide.ts reads it: two ends that match exactly when the points do */
function runWallInputs(){
  return model.walls.map(function(w){
    return { id:w.id, lengthCm:r(wallLen(w)), open:!!w.isOpen, fromKey:pointKey(w.from), toKey:pointKey(w.to) };
  });
}
/** the run's corners in run order; a closed run ends back at its first point */
function runPoints(run){
  var pts = [];
  run.walls.forEach(function(e, i){
    var w = findWall(e.id);
    if(!w) return;
    var a = e.forward ? w.from : w.to, b = e.forward ? w.to : w.from;
    if(i === 0) pts.push({ x:a.x, y:a.y });
    pts.push({ x:b.x, y:b.y });
  });
  return pts;
}
/** which leg of the run's polyline an arc falls on */
function legAtArc(pts, arc){
  var acc = 0;
  for(var i=0;i<pts.length-2;i++){
    acc += dist(pts[i], pts[i+1]);
    if(arc < acc) return i;
  }
  return Math.max(0, pts.length-2);
}
// How far along the run the pointer is asking for, in cm from its start.
// An opening travels continuously, so the answer is looked for on the leg
// the drag was on and the one either side of it only: in a room the whole
// ring is one run, and a finger straying toward the far side would
// otherwise re-match to the wall over there and take the opening with it.
function arcOnRun(pts, pt, nearArc, closed){
  var legs = pts.length-1;
  if(legs < 1) return 0;
  // No previous answer (the drag has just begun): the whole run is open
  // to the search, since what is being read off it is already on it.
  var near = (nearArc == null) ? null : legAtArc(pts, nearArc);
  var best = null, arc = 0;
  for(var i=0;i<legs;i++){
    var a = pts[i], b = pts[i+1], len = dist(a,b);
    var step = (near == null) ? 0 : Math.abs(i - near);
    if(closed && near != null) step = Math.min(step, legs - step);
    if(step <= 1 && len > 1e-9){
      var raw = ((pt.x-a.x)*(b.x-a.x) + (pt.y-a.y)*(b.y-a.y)) / (len*len);
      var tc = clamp(raw, 0, 1);
      var on = { x:a.x + (b.x-a.x)*tc, y:a.y + (b.y-a.y)*tc };
      var d = dist(pt, on);
      // Past either outer end of an open run the pointer is still asking
      // for a place on it — which is how an opening gets to travel past a
      // free end at all.
      if(!closed && i === 0 && raw < 0) tc = raw;
      if(!closed && i === legs-1 && raw > 1) tc = raw;
      if(best === null || d < best.d) best = { d:d, arc: arc + tc*len };
    }
    arc += len;
  }
  return best ? best.arc : (nearArc || 0);
}
function entryFor(run, wallId){
  for(var i=0;i<run.walls.length;i++) if(run.walls[i].id === wallId) return run.walls[i];
  return null;
}
// A wall grows at its own free end so the opening slid past it can be the
// last piece of the run; the far jamb becomes the wall's end, which is
// the free end a new stroke welds onto.
function extendWallAtEnd(w, end, byCm){
  if(byCm <= 0) return;
  var d = wallDir(w);
  if(end === 'to'){ w.to.x = r(w.to.x + d.x*byCm); w.to.y = r(w.to.y + d.y*byCm); }
  else { w.from.x = r(w.from.x - d.x*byCm); w.from.y = r(w.from.y - d.y*byCm); }
  w.lengthSource = 'drawn';
}
// One move of an opening drag, applied to the model the drag started
// from (the caller restores it first), so nothing ever compounds and
// sliding back undoes the wall it grew.
function applyOpeningSlide(ds, curCm){
  var f = findSeg(ds.wallId, ds.segId);
  if(!ds.run || !f) return;
  var width = f.seg.length.value;
  var arc = arcOnRun(ds.runPoints, curCm, ds.lastArc, ds.run.closed);
  ds.lastArc = arc;
  var place = placeAlongRun(ds.run, width, ds.centreArc0 + (arc - ds.grabArc));
  if(!place) return;
  var entry = entryFor(ds.run, place.wallId);
  if(!entry) return;
  var wallId = place.wallId, segId = ds.segId;
  if(wallId !== ds.wallId){
    var centreOwn = ownOffsetOf(entry, place, width) + width/2;
    var moved = moveOpeningToWall(ds.wallId, ds.segId, wallId, centreOwn);
    if(moved.ok){
      segId = moved.newId;
    } else {
      // No room for it on the neighbour: it stays on its own wall, as far
      // along it as it can go.
      entry = entryFor(ds.run, ds.wallId);
      if(!entry) return;
      wallId = ds.wallId;
      place = placeAlongRun({ walls:[entry], startFree:false, endFree:false, closed:false }, width, ds.centreArc0 + (arc - ds.grabArc));
      if(!place) return;
    }
  }
  var w = findWall(wallId);
  if(!w) return;
  // Whole cm, so the wall's own ends stay on the grid every other gesture
  // reads them off; ownOffsetOf counts the growth in, so both agree.
  place.extendCm = r(place.extendCm);
  var extendEnd = extendEndOf(entry, place);
  if(extendEnd){
    extendWallAtEnd(w, extendEnd, place.extendCm);
    syncSegmentsForAllWalls();
  }
  slideSegment(wallId, segId, ownOffsetOf(entry, place, width), 'drawn');
  // The chain and the wash follow the piece while it travels, so the
  // focus moves with it rather than pointing at the piece it used to be.
  selection = { segId: segId };
  ds.liveSegId = segId;
  ds.pastFreeEnd = place.extendCm > 0;
}

/* One move of a landmark drag, on the model the drag began from. It travels
   the same run an opening does — along the wall and round a joined corner as
   its middle passes it — but never past a free end: a landmark has to fit
   inside its wall. Along the way it stops against a landmark on its own face,
   and it turns onto the other face the moment the finger crosses the wall. */
function applyLandmarkSlide(ds, curCm){
  var m = findLandmark(ds.landmarkId);
  if(!m || !ds.run) return;
  var arc = arcOnRun(ds.runPoints, curCm, ds.lastArc, ds.run.closed);
  ds.lastArc = arc;
  var run = { walls: ds.run.walls, startFree: false, endFree: false, closed: ds.run.closed };
  var place = placeAlongRun(run, LANDMARK_SIZE_CM, ds.centreArc0 + (arc - ds.grabArc));
  if(!place) return;
  var entry = entryFor(run, place.wallId);
  var w = findWall(place.wallId);
  if(!entry || !w) return;
  var len = markWallLengthCm(w);
  // A run may carry a wall too short to hold the square. Placing already
  // refuses one; travelling onto it would put the landmark somewhere it cannot
  // be seen or reported, so the drag stops at the wall it is on instead.
  if(!showsOnWall({ lengthCm: len, isOpen: !!w.isOpen })) return;
  var want = clampToWall(ownOffsetOf(entry, place, LANDMARK_SIZE_CM), len);
  // Coming round a corner it enters at one of the wall's ends, and that end is
  // where the free stretch it may travel is measured from.
  var from = (w.id === m.wallId) ? m.offsetFromStartCm
    : entryOffsetCm(place.offsetCm + LANDMARK_SIZE_CM/2, len, entry.forward);
  var n = wallNormal(w);
  var across = (curCm.x - w.from.x)*n.x + (curCm.y - w.from.y)*n.y;
  var wanted = faceOfSide(across);
  var face = m.face;
  if(wanted !== face && fitsAt(want, len, blockersFor(w, wanted, m.id))) face = wanted;
  m.wallId = w.id;
  m.face = face;
  m.offsetFromStartCm = r(slideOnWall({
    wantOffsetCm: want, fromOffsetCm: from, wallLengthCm: len,
    blockers: blockersFor(w, face, m.id)
  }));
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
   "STILL MISSING" — what the snapshot reports as not yet answered about
   the plan itself. Nothing here stops a save: the editor has no checks.
   The ceiling height is not part of the plan any more — it is answered on
   its own screen and lives on the saved drawing.
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
   — allowed, not an error.
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
// there is always already inside that wall's own hit rect — which must
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
  model.landmarks = reassignOnSplit(model.landmarks || [], w.id, offset,
    { id: wLead.id, lengthCm: offset }, { id: wTail.id, lengthCm: total - offset });
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
// Commits a drawn stroke, and says whether it made anything. Resolves
// any T-junction splits first, so the new wall's own endpoints land
// exactly on the freshly-made joints, then squares any vertex weld that
// is off the stroke's own axis before the new wall is created — makeWall
// refuses a diagonal outright — then adds the wall and lets
// cleanupOutline merge it into a collinear neighbour it welded onto.
function commitDrawStroke(startPt, startSnap, endPt, endSnap, heading, t, kind){
  // Below the structural floor, or too small on screen to have been a
  // deliberate stroke rather than a mis-click: nothing is made, and no
  // history entry is pushed for a stroke nothing came of.
  if(dist(startPt, endPt) < MIN_WALL || (t && dist(startPt, endPt)*t.scale < MIN_STROKE_PX)){
    return false;
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
      // The fresh stroke is the rough one, so it moves, never the wall
      // the client already measured. Its start end is free, so the whole
      // stroke translates perpendicular to its own heading until its far
      // end lands on the target; its length and heading stay as drawn.
      var rawLen = Math.max(Math.abs(endPt.x-startPt.x), Math.abs(endPt.y-startPt.y));
      finalEndPt = target;
      finalStartPt = { x: r(target.x - dvec.x*rawLen), y: r(target.y - dvec.y*rawLen) };
    } else {
      // The new stroke's other end is welded too, so it cannot be
      // translated without breaking that weld: move the target vertex
      // instead, absorb the difference into the wall attached to it, and
      // say so.
      var sq = squareWeldToVertex(endPt, startPt, heading);
      if(sq.ok){
        finalEndPt = sq.point;
        if(sq.changed.length) squareChanges = sq.changed;
      } else {
        // Neither way squares: leave the ends unjoined rather than force
        // a diagonal wall or shrink one past its own openings. The stroke
        // still commits on its own axis, at the length drawn, and the
        // free end it leaves is reported like any other.
        var fallbackLen = Math.max(Math.abs(endPt.x-startPt.x), Math.abs(endPt.y-startPt.y));
        finalEndPt = { x: r(startPt.x + dvec.x*fallbackLen), y: r(startPt.y + dvec.y*fallbackLen) };
      }
    }
  }

  var w = makeWall(finalStartPt, finalEndPt, 'drawn', kind);
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
  if(squareChanges){
    var msg = squareChanges.map(function(c){
      return RO.squarePart(headingOf(c.wall), c.before, c.after);
    }).join('; ');
    showToast(RO.squareToast(msg));
  }
  return true;
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
  // Each landmark its wall can still hold, with the gaps already measured, so
  // a reader prints the distances the client saw without redoing the geometry.
  var landmarks = snapshotLandmarks(model.landmarks || [], function(m){
    var w = findWall(m.wallId);
    if(!w) return null;
    return {
      lengthCm: markWallLengthCm(w),
      isOpen: !!w.isOpen,
      obstacles: landmarkObstacles(w, m.id)
    };
  });
  var unanswered = computeUnanswered();
  // The ceiling height belongs to the saved drawing, not to the plan the
  // editor holds; whoever saves fills it in.
  return {
    unit: 'cm',
    ceilingHeightCm: null,
    closed: closed,
    outline: outline,
    walls: walls,
    openings: openings,
    landmarks: landmarks,
    unanswered: unanswered,
    finished: unanswered.length === 0
  };
}
/* ======================================================================
   DOM REFS
   ====================================================================== */
var svgEl, stageEl, ctrlLayerEl, toolPlateEl, hintEl, histPlateEl, viewPlateEl,
    toastEl, toastTextEl, toastDismissEl,
    confirmDialogEl, confirmDialogTextEl, confirmYesBtn, confirmNoBtn;

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

/* ======================================================================
   VIEW TRANSFORM — cm (model space) <-> screen px, derived from the
   SVG's own viewBox and its current bounding rect. Chips, plates and
   labels live as ordinary positioned HTML elements over the SVG, never
   inside it, so nothing that carries text or a real input inherits the
   zoom.
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
  var sr = stageEl.getBoundingClientRect();
  return { x:c.x-sr.left, y:c.y-sr.top };
}
/* ======================================================================
   THE VIEW — the canvas never moves by itself. It is fitted when the
   editor opens and when the client asks for it, and otherwise follows
   only a finger, the wheel or a drag that has reached the canvas edge.
   view.ts holds the arithmetic; this turns a view into the SVG's own
   viewBox and measures the bands the floating plates cover.
   ====================================================================== */
function stageSize(){
  var rect = svgEl.getBoundingClientRect();
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
}
function planPoints(){
  var pts = [];
  model.walls.forEach(function(w){ pts.push(w.from); pts.push(w.to); });
  return pts;
}
function planBox(){ return boxOf(planPoints()); }
// Measured, not guessed: the plates are laid out by CSS and their heights
// change with the device and with what the focused piece needs.
function plateBands(){
  var sr = svgEl.getBoundingClientRect();
  var bands = { top:0, right:0, bottom:0, left:0 };
  if(sr.width <= 0 || sr.height <= 0) return bands;
  var gap = 10;
  [toolPlateEl, hintEl].forEach(function(el){
    if(!el || el.classList.contains('fp-off')) return;
    var r1 = el.getBoundingClientRect();
    if(r1.height > 0) bands.top = Math.max(bands.top, r1.bottom - sr.top + gap);
  });
  [histPlateEl, viewPlateEl, focusPlateEl].forEach(function(el){
    if(!el || el.classList.contains('fp-off') || !el.isConnected) return;
    var r2 = el.getBoundingClientRect();
    if(r2.height > 0) bands.bottom = Math.max(bands.bottom, sr.bottom - r2.top + gap);
  });
  bands.top = Math.max(0, Math.min(bands.top, sr.height/3));
  bands.bottom = Math.max(0, Math.min(bands.bottom, sr.height/3));
  return bands;
}
function isNarrow(){ return stageSize().width <= 860; }
var fitFrame = null;
function stopFitEase(){
  if(fitFrame != null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(fitFrame);
  fitFrame = null;
}
// The fit is eased, so the client can see where the plan went; the very
// first fit has nothing to ease from, and the zoom is eased
// geometrically because a scale is a ratio, not a distance.
function fitNow(){
  var target = fitView(planBox(), stageSize(), plateBands());
  stopFitEase();
  var from = view;
  var dur = ms(BASE);
  if(!from || dur <= 0 || typeof win.requestAnimationFrame !== 'function'){ view = target; return; }
  var t0 = null;
  var step = function(now){
    fitFrame = null;
    if(destroyed) return;
    if(t0 == null) t0 = now;
    var k = ease(Math.min(1, (now - t0)/dur));
    view = {
      cx: from.cx + (target.cx - from.cx)*k,
      cy: from.cy + (target.cy - from.cy)*k,
      scale: from.scale * Math.pow(target.scale/from.scale, k)
    };
    render();
    if(k < 1) fitFrame = win.requestAnimationFrame(step);
  };
  fitFrame = win.requestAnimationFrame(step);
}
function applyView(){
  if(!view) fitNow();
  var vb = viewBoxOf(view, stageSize());
  svgEl.setAttribute('viewBox', vb.x+' '+vb.y+' '+vb.w+' '+vb.h);
}
function zoomBy(factor, pointPx){
  stopFitEase();
  var size = stageSize();
  var at = pointPx || { x: size.width/2, y: size.height/2 };
  view = zoomAround(view || fitView(planBox(), size, plateBands()), factor, at, size, planBox());
  noteZoomed();
}
// The view moves for reasons of its own too (the edge auto-pan, clearing
// the docked plate), so noting the client's first zoom or pan belongs to
// the paths a client drives, not here.
function panView(dxPx, dyPx){
  stopFitEase();
  if(!view) fitNow();
  view = panByPx(view, dxPx, dyPx);
}
// The zoom line shows for four seconds, the first time in this browser.
function noteZoomed(){
  if(hasSeen(seenStorage, 'zoomHint')) return;
  markSeen(seenStorage, 'zoomHint');
  zoomHintUntil = Date.now() + 4000;
  if(zoomHintTimer) win.clearTimeout(zoomHintTimer);
  zoomHintTimer = win.setTimeout(function(){ if(!destroyed) render(); }, 4100);
}
/** a client point in stage pixels */
function stagePx(clientX, clientY){
  var sr = svgEl.getBoundingClientRect();
  return { x: clientX - sr.left, y: clientY - sr.top };
}
var zoomHintTimer = null;
var focusPlateEl = null;

/* ======================================================================
   TOP-LEVEL RENDER
   ====================================================================== */
function render(){
  if(destroyed) return;
  syncLandmarks();
  // The piece that was in focus as of the last render, if it no longer
  // is, has just become eligible to merge into a collinear same-kind
  // neighbour: re-check its own wall now, whichever of the many paths
  // moved the focus this time.
  var curSelSegId = (selection && selection.segId) || null;
  if(lastSettledSegId !== null && lastSettledSegId !== curSelSegId){
    var settleF = findSegAnywhere(lastSettledSegId);
    if(settleF) mergeAdjacentPlain(settleF.wall);
  }
  lastSettledSegId = curSelSegId;
  // The plates first: the view is fitted into the canvas minus the bands
  // they cover, so they have to be on screen and measurable before it.
  renderToolPlate();
  renderCornerPlates();
  renderHint();
  applyView();
  var t = viewTransform();
  renderSvg(t);
  renderCtrlLayer(t);
  renderToastDom();
  renderConfirmDialog();
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
  // Every door has a hinge and a swing from the moment it exists
  // (defaultDoorSwing), so there is always a real leaf and arc to draw.
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
  // A door is a hole: the band stops the way masonry stops at a doorway,
  // and a jamb line is drawn across the thickness at each end. The leaf
  // and the dashed quarter arc are the only ink in the opening.
  var bq = wallBandPoints(w, false, false, p0, p1);
  var band = [bq.a, bq.b, bq.c, bq.e].map(function(q){ return q.x+','+q.y; }).join(' ');
  return '<polygon class="fp-gap" points="'+band+'"></polygon>'
    + '<line class="fp-jamb'+(selected?' on':'')+'" x1="'+bq.a.x+'" y1="'+bq.a.y+'" x2="'+bq.b.x+'" y2="'+bq.b.y+'"></line>'
    + '<line class="fp-jamb'+(selected?' on':'')+'" x1="'+bq.e.x+'" y1="'+bq.e.y+'" x2="'+bq.c.x+'" y2="'+bq.c.y+'"></line>'
    + '<line class="fp-leaf" x1="'+hingePt.x+'" y1="'+hingePt.y+'" x2="'+tip.x+'" y2="'+tip.y+'"></line>'
    + '<path class="fp-arc" d="M '+tip.x+' '+tip.y+' A '+width+' '+width+' 0 0 '+sweep+' '+otherPt.x+' '+otherPt.y+'"></path>';
}
function windowSvg(w, p0, p1, selected){
  // Glazing in plan: three thin lines run the length of the opening — one
  // on each face of the band and one on its centreline — with a jamb
  // across the thickness at each end, so the glass sits IN the wall.
  var n = wallNormal(w), half = WALL_THICKNESS_CM/2;
  var cls = 'fp-glass'+(selected?' on':'');
  var bq = wallBandPoints(w, false, false, p0, p1);
  var band = [bq.a, bq.b, bq.c, bq.e].map(function(q){ return q.x+','+q.y; }).join(' ');
  function face(off){
    return '<line class="'+cls+'" x1="'+(p0.x+n.x*off)+'" y1="'+(p0.y+n.y*off)+'" x2="'+(p1.x+n.x*off)+'" y2="'+(p1.y+n.y*off)+'"></line>';
  }
  return '<polygon class="fp-gap" points="'+band+'"></polygon>'
    + face(-half) + face(0) + face(half)
    + '<line class="fp-jamb'+(selected?' on':'')+'" x1="'+bq.a.x+'" y1="'+bq.a.y+'" x2="'+bq.b.x+'" y2="'+bq.b.y+'"></line>'
    + '<line class="fp-jamb'+(selected?' on':'')+'" x1="'+bq.e.x+'" y1="'+bq.e.y+'" x2="'+bq.c.x+'" y2="'+bq.c.y+'"></line>';
}
// The four corners of a 'wall' segment's band, centred on the
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
  var r1 = Math.max(9, 14/t.scale);
  return '<circle class="fp-snap" cx="'+pt.x+'" cy="'+pt.y+'" r="'+r1+'" stroke-width="'+Math.max(1,1.4/t.scale)+'"></circle>';
}
function alignGuideMarkup(a, b, t){
  return '<line class="fp-guide" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" stroke-width="'+Math.max(1,1.2/t.scale)+'"></line>';
}
/** the small white square that marks an end or a jamb of the piece in focus */
function handleMarkup(pt, t){
  var half = Math.max(4, 7/t.scale);
  return '<rect class="fp-handle" x="'+(pt.x-half)+'" y="'+(pt.y-half)+'" width="'+(half*2)+'" height="'+(half*2)+'" stroke-width="'+Math.max(1,1.5/t.scale)+'"></rect>';
}
/** the wash band behind whatever is in focus */
function washMarkup(w, p0, p1){
  var d = wallDir(w), n = wallNormal(w);
  var out = WALL_THICKNESS_CM*1.7, along = WALL_THICKNESS_CM*0.6;
  var a = { x:p0.x - d.x*along, y:p0.y - d.y*along };
  var b = { x:p1.x + d.x*along, y:p1.y + d.y*along };
  var pts = [
    { x:a.x+n.x*out, y:a.y+n.y*out }, { x:b.x+n.x*out, y:b.y+n.y*out },
    { x:b.x-n.x*out, y:b.y-n.y*out }, { x:a.x-n.x*out, y:a.y-n.y*out }
  ];
  return '<polygon class="fp-wash" points="'+pts.map(function(q){ return q.x+','+q.y; }).join(' ')+'"></polygon>';
}

/* ======================================================================
   THE MARKS — a landmark is a square of LANDMARK_SIZE_CM against its wall's
   band, on the face it is on, so it grows and shrinks with the plan at every
   zoom. Its name rides in the HTML layer beside it, where it keeps its own
   size. Colour is the one place the product has any: the square, its name
   chip, and the square that stands for the landmark in the tool plate.
   ====================================================================== */
/** where a landmark's square sits, in the world the plan is drawn in */
function landmarkGeom(m){
  var w = findWall(m.wallId);
  if(!w) return null;
  var d = wallDir(w), n = wallNormal(w);
  var sign = m.face === 'out' ? -1 : 1;
  var half = LANDMARK_SIZE_CM/2;
  var on = pointAlong(w, m.offsetFromStartCm + half);
  var out = WALL_THICKNESS_CM/2 + half;
  return {
    wall: w, dir: d, normal: n, sign: sign, half: half,
    centre: { x: on.x + n.x*sign*out, y: on.y + n.y*sign*out }
  };
}
function landmarkLabel(kind){
  var entry = landmarkKindOf(kind);
  return entry ? entry.label : kind;
}
function landmarkSquarePoints(g, grow){
  var e = g.half + (grow || 0);
  return [
    { x: g.centre.x - g.dir.x*e - g.normal.x*e, y: g.centre.y - g.dir.y*e - g.normal.y*e },
    { x: g.centre.x + g.dir.x*e - g.normal.x*e, y: g.centre.y + g.dir.y*e - g.normal.y*e },
    { x: g.centre.x + g.dir.x*e + g.normal.x*e, y: g.centre.y + g.dir.y*e + g.normal.y*e },
    { x: g.centre.x - g.dir.x*e + g.normal.x*e, y: g.centre.y - g.dir.y*e + g.normal.y*e }
  ].map(function(p){ return p.x+','+p.y; }).join(' ');
}
/** the squares themselves: last, so a mark is never buried under its own hit target */
function landmarkMarkup(t, hitParts){
  var parts = [];
  (model.landmarks || []).forEach(function(m){
    if(!landmarkShows(m)) return;
    var g = landmarkGeom(m);
    if(!g) return;
    var sel = !!(selection && selection.landmarkId === m.id);
    var colour = markColour(m.kind);
    if(sel){
      parts.push('<polygon class="fp-wash" points="'+landmarkSquarePoints(g, g.half*0.7)+'"></polygon>');
    }
    if(mode === 'landmarks'){
      var reach = Math.max(g.half, 24/t.scale);
      hitParts.push('<rect class="fp-grab" data-testid="landmark-'+m.id+'-hit" data-landmark-id="'+m.id+'"'
        + ' x="'+(g.centre.x-reach)+'" y="'+(g.centre.y-reach)+'" width="'+(reach*2)+'" height="'+(reach*2)+'"></rect>');
    }
    parts.push('<polygon class="fp-mark'+(sel?' on':'')+'" data-testid="landmark-'+m.id+'"'
      + ' data-landmark-id="'+m.id+'" data-kind="'+esc(m.kind)+'" data-face="'+m.face+'"'
      + ' style="fill:'+colour+'" stroke-width="'+Math.max(1, 1.5/t.scale)+'"'
      + ' points="'+landmarkSquarePoints(g, 0)+'"></polygon>');
  });
  return parts.join('');
}

/* ======================================================================
   ALL DIMENSIONS — one lane just outside each wall's own ink band. At
   rest it holds one number per wall, that wall's own length; while a
   window or a door on it is in focus or dragged, that number stands down
   and the same lane holds the chain (gap | piece | gap, chain.ts), so the
   numbers never stack up in two places. One function, called once from
   renderSvg (the dimension LINE and its ticks) and once from
   renderCtrlLayer (the chip riding on it) — the same a/b/normal/outCm
   feed both, so a number can never end up describing a different stretch
   of wall than the line drawn under it.
   ====================================================================== */
var DIM_LINE_OUT_PX = 14;    // screen px, band's outer face to the dimension line
// A chip's own footprint on screen, in px: a FIXED estimate rather than a
// real getBoundingClientRect, because a chip's place has to be decided
// while renderSvg draws its line, before any chip exists in the DOM to
// measure; the chip's input has a fixed width whatever the digits inside
// it, so this is stable across renders. Its width counts its 7px halo
// and its height the 44px hit box its input overflows to, since both take
// pointers. Along a wall the chip's extent is its width where the wall
// runs horizontally and its height where it runs vertically; across the
// wall it is the other way round.
var CHIP_ALONG_W_PX = 80;
var CHIP_ALONG_H_PX = 32;
var CHIP_HALF_W_PX = 46;
var CHIP_HALF_H_PX = 22;
// One commit for a segment's number, whether it is read on the drawing
// or in the focus plate: the two are the same value.
function segDimCommit(w, s){
  return function(cm){
    // A typed window width carries over to the next window, wherever it
    // was typed; a door keeps its own default.
    if(s.kind === 'window') carried.windowWidth = r(cm);
    if(s.kind==='wall' || s.kind==='open' || !isClosedLoop()){
      commitWallPieceLength(s.id, cm, 'typed');
    } else {
      var res = resizeSegment(w.id, s.id, cm, 'typed');
      if(!res.ok) offerClamp(res, function(v){ resizeSegment(w.id, s.id, v, 'computed'); render(); });
      else render();
    }
  };
}
function segDimLabel(s){ return (s.kind==='window' || s.kind==='door') ? RO.fieldWidth : RO.fieldLength; }
function isOpeningKind(s){ return s.kind==='window' || s.kind==='door'; }
/** the opening is the last piece of its wall, and that end of the wall is joined to nothing */
function openingAtFreeEnd(w, seg){
  var idx = w.segments.indexOf(seg);
  if(idx === 0 && isFreeEnd(w, 'from')) return true;
  return idx === w.segments.length-1 && isFreeEnd(w, 'to');
}
/** the window or door in focus (or being dragged), whose wall shows the chain */
function focusedOpening(){
  if(!selection) return null;
  var f = findSegAnywhere(selection.segId);
  return (f && isOpeningKind(f.seg)) ? f : null;
}
// The area actually on screen, in cm: the SVG meets its viewBox, so one
// axis shows MORE than the viewBox asks for, and a wall out there is
// still on screen.
function visibleBox(t){
  var halfW = (t.rect.width / t.scale)/2, halfH = (t.rect.height / t.scale)/2;
  var cx = t.vb.x + t.vb.w/2, cy = t.vb.y + t.vb.h/2;
  return { minX:cx-halfW, maxX:cx+halfW, minY:cy-halfH, maxY:cy+halfH };
}
// A number whose wall is off screen is not drawn: placeInStage would
// otherwise pin it to the edge of the stage, where it names a wall the
// client cannot see.
function wallOnScreen(w, t){
  var box = visibleBox(t);
  var pad = WALL_THICKNESS_CM;
  return Math.min(w.from.x, w.to.x) - pad <= box.maxX && Math.max(w.from.x, w.to.x) + pad >= box.minX
    && Math.min(w.from.y, w.to.y) - pad <= box.maxY && Math.max(w.from.y, w.to.y) + pad >= box.minY;
}
function wallAxis(w){ var h = headingOf(w); return (h==='E' || h==='W') ? 'horizontal' : 'vertical'; }
/** how much room a chip takes ALONG the wall it measures */
function chipAlongPx(w){ return wallAxis(w)==='horizontal' ? CHIP_ALONG_W_PX : CHIP_ALONG_H_PX; }
// Half a chip's extent ACROSS the wall. A chip is centred on its anchor
// and takes pointers, so the lane is the distance to the chip's near
// EDGE: anchored on the lane itself, the half of it facing the wall would
// cover the wall's own hit target — on a vertical wall that half is the
// chip's width, wider than the lane, so the wall could not be touched at
// the row its number sits on.
function chipHalfCrossPx(w){ return wallAxis(w)==='horizontal' ? CHIP_HALF_H_PX : CHIP_HALF_W_PX; }
function pointAlong(w, cm){
  var d = wallDir(w);
  return { x: w.from.x + d.x*cm, y: w.from.y + d.y*cm };
}
// A wall's own length, the one number it shows at rest. Typing it
// reshapes the wall and holds every piece on it where it is.
function wallDim(w, focused, t){
  var wn = wallNormal(w);
  // On a later step the plan is what earlier steps made: its numbers are
  // stated, not asked, so the chip neither edits nor takes the pointer away
  // from the wall under it.
  var editable = mode !== 'landmarks';
  return {
    testid: 'dim-'+w.id, tone: focused ? 'primary' : 'side', readOnly: !editable,
    a: w.from, b: w.to, normal: {x:-wn.x, y:-wn.y},
    outCm: WALL_THICKNESS_CM/2 + DIM_LINE_OUT_PX/t.scale,
    chipOutCm: WALL_THICKNESS_CM/2 + (CHAIN_LANE_PX + chipHalfCrossPx(w))/t.scale,
    value: r(wallLen(w)), source: w.lengthSource, label: RO.fieldLength,
    commit: editable ? function(cm){
      var anySeg = w.segments[0].id;
      var res = commitWallTotal(anySeg, cm, 'typed');
      if(!res.ok) offerClamp(res, function(v){ commitWallTotal(anySeg, v, 'computed'); });
    } : null
  };
}
// The chain in place of that wall's own length: gap | piece | gap, each
// with its own run and ticks, adding up to the wall. The gaps are
// read-only — the drawing is what says them — and the piece's number is
// the same value as the first field of its plate.
function chainFrom(w, items, t, piece){
  var wn = wallNormal(w), normal = {x:-wn.x, y:-wn.y};
  var alongPx = chipAlongPx(w), halfCrossPx = chipHalfCrossPx(w);
  var places = placeChainChips(items.map(function(it){
    return { startPx: it.startCm*t.scale, endPx: it.endCm*t.scale, chipLengthPx: alongPx };
  }), wallAxis(w));
  return items.map(function(it, i){
    var p = places[i];
    var isPiece = it.kind === 'piece';
    return {
      testid: 'chain-'+it.kind, inChain: true, readOnly: !isPiece || !piece.commit,
      tone: isPiece ? 'primary' : 'side',
      a: pointAlong(w, it.startCm), b: pointAlong(w, it.endCm), normal: normal,
      outCm: WALL_THICKNESS_CM/2 + DIM_LINE_OUT_PX/t.scale,
      chipOutCm: WALL_THICKNESS_CM/2 + (p.outPx + halfCrossPx)/t.scale,
      chipShiftCm: (p.alongPx - p.spanMidPx)/t.scale,
      leader: p.steppedOut,
      // A piece with no size to state is a break in the line and nothing more.
      value: it.showsNumber ? r(it.lengthCm) : null,
      source: isPiece ? piece.source : 'computed',
      label: isPiece ? piece.label : RO.fieldLength,
      commit: isPiece ? piece.commit : null
    };
  });
}
function chainDims(w, seg, t){
  var obstacles = [];
  w.segments.forEach(function(s){
    if(s.id === seg.id || s.kind === 'wall') return;
    obstacles.push({ startCm: s.offsetFromStart, endCm: s.offsetFromStart + s.length.value });
  });
  landmarksOn(w.id).forEach(function(m){
    obstacles.push({ startCm: m.offsetFromStartCm, endCm: m.offsetFromStartCm + LANDMARK_SIZE_CM });
  });
  var items = chainOfPiece({
    wallLengthCm: segTotal(w),
    pieceStartCm: seg.offsetFromStart,
    pieceEndCm: seg.offsetFromStart + seg.length.value,
    obstacles: obstacles
  });
  return chainFrom(w, items, t, {
    source: seg.length.source, label: segDimLabel(seg), commit: segDimCommit(w, seg)
  });
}
/** The same chain for a landmark: gap | square | gap, with no number on the square. */
function landmarkChainDims(w, m, t){
  var items = chainOfPiece({
    wallLengthCm: markWallLengthCm(w),
    pieceStartCm: m.offsetFromStartCm,
    pieceEndCm: m.offsetFromStartCm + LANDMARK_SIZE_CM,
    obstacles: landmarkObstacles(w, m.id),
    pieceShowsNumber: false
  });
  return chainFrom(w, items, t, { source: 'computed', label: RO.fieldLength, commit: null });
}
function allDims(t){
  var out = [];
  var mark = focusedLandmark();
  var focus = mark ? null : focusedOpening();
  var focusWallId = mark ? mark.wallId : (focus ? focus.wall.id : null);
  var selSeg = selection ? findSegAnywhere(selection.segId) : null;
  model.walls.forEach(function(w){
    if(!wallOnScreen(w, t)) return;
    if(w.id === focusWallId){
      out = out.concat(mark ? landmarkChainDims(w, mark, t) : chainDims(w, focus.seg, t));
      return;
    }
    out.push(wallDim(w, !!(selSeg && selSeg.wall.id === w.id), t));
  });
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
/** where the CHIP sits: in the lane, over the middle of what it measures,
 * unless it was too narrow for its span and stepped out — then it is one
 * lane further out (chipOutCm) and possibly pushed along the wall
 * (chipShiftCm) to clear the number beside it, with a leader from
 * renderSvg tying it back. Falls back to outCm for anything (the live
 * dimension) that never set chipOutCm apart from it. */
function chipAnchor(d){
  var mid = { x:(d.a.x+d.b.x)/2, y:(d.a.y+d.b.y)/2 };
  var out = (d.chipOutCm != null) ? d.chipOutCm : d.outCm;
  var shift = d.chipShiftCm || 0;
  if(shift){
    var dx=d.b.x-d.a.x, dy=d.b.y-d.a.y, L=Math.hypot(dx,dy)||1;
    mid = { x: mid.x + (dx/L)*shift, y: mid.y + (dy/L)*shift };
  }
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

  // The wash band of whatever is in focus goes down first, so the piece
  // itself is drawn over it.
  var selFocus = selection ? findSegAnywhere(selection.segId) : null;
  if(selFocus){
    var fp = segPoints(selFocus.wall, selFocus.seg);
    parts.push(washMarkup(selFocus.wall, fp.p0, fp.p1));
  }

  parts.push('<g class="fp-plan">');
  model.walls.forEach(function(w){
    w.segments.forEach(function(s, idx){
      var pts = segPoints(w, s);
      var sel = !!(selection && selection.segId===s.id);
      parts.push('<g data-testid="seg-'+s.id+'">');
      if(s.kind==='wall'){
        var bp = wallBandPoints(w, idx===0, idx===w.segments.length-1, pts.p0, pts.p1);
        parts.push('<polygon class="fp-band'+(sel?' on':'')+'" points="'+bp.a.x+','+bp.a.y+' '+bp.b.x+','+bp.b.y+' '+bp.c.x+','+bp.c.y+' '+bp.e.x+','+bp.e.y+'"></polygon>');
      } else if(s.kind==='open'){
        var on = wallNormal(w), tickCm = WALL_THICKNESS_CM/2;
        parts.push('<line class="fp-open'+(sel?' on':'')+'" x1="'+pts.p0.x+'" y1="'+pts.p0.y+'" x2="'+pts.p1.x+'" y2="'+pts.p1.y+'" stroke-width="'+Math.max(1.6, 2.4/t.scale)+'"></line>');
        [pts.p0, pts.p1].forEach(function(p){
          parts.push('<line class="fp-open-tick" x1="'+(p.x-on.x*tickCm)+'" y1="'+(p.y-on.y*tickCm)+'" x2="'+(p.x+on.x*tickCm)+'" y2="'+(p.y+on.y*tickCm)+'" stroke-width="'+Math.max(1, 1.5/t.scale)+'"></line>');
        });
      } else if(s.kind==='window'){
        parts.push(windowSvg(w, pts.p0, pts.p1, sel));
      } else if(s.kind==='door'){
        parts.push(doorSvg(w, s, pts.p0, pts.p1, sel));
      }
      parts.push('</g>');
      // On the landmark step the plan is drawn but takes no pointer: walls,
      // windows and doors are changed back on the plan step.
      if(mode === 'landmarks') return;
      var hr = hitRectAttrs(pts.p0, pts.p1, hitCm);
      var isOpeningKind = (s.kind==='window' || s.kind==='door');
      (isOpeningKind ? openingSegHitParts : plainSegHitParts).push('<rect class="fp-hit'+(sel?' on':'')+'" data-testid="seg-'+s.id+'-hit" data-wall-id="'+w.id+'" data-seg-id="'+s.id+'" data-kind="'+s.kind+'"'
        + ' x="'+hr.x+'" y="'+hr.y+'" width="'+hr.w+'" height="'+hr.h+'"></rect>');
    });
  });
  parts.push('</g>');

  // A free end shows as a small white circle only while a tool that draws
  // is on: that is the moment it matters, because a stroke started or
  // ended near it joins it.
  var toolNow = toolById(tools, activeTool);
  if(toolNow && toolNow.gesture === 'stroke'){
    var endRCm = Math.max(5, 8/t.scale);
    collectVertices().forEach(function(v){
      if(v.refs.length !== 1) return;
      parts.push('<circle class="fp-free-end" cx="'+v.point.x+'" cy="'+v.point.y+'" r="'+endRCm+'" stroke-width="'+Math.max(1, 1.4/t.scale)+'"></circle>');
    });
  }

  // The handles of the piece in focus: a white square at each end, or at
  // each jamb of an opening.
  if(selFocus){
    var hp = segPoints(selFocus.wall, selFocus.seg);
    parts.push(handleMarkup(hp.p0, t));
    parts.push(handleMarkup(hp.p1, t));
  }

  // Corner and free-end hit targets exist only while Selectează is on:
  // with a making tool on, the canvas is for making, and a press near a
  // free end is a stroke that welds onto it.
  var selecting = (!toolNow || toolNow.gesture === 'none') && mode !== 'landmarks';
  if(selecting){
    collectVertices().forEach(function(v){
      if(v.refs.length < 2) return;
      cornerHitParts.push('<circle class="fp-grab" data-testid="corner-'+pointKey(v.point)+'" data-vx="'+v.point.x+'" data-vy="'+v.point.y+'" cx="'+v.point.x+'" cy="'+v.point.y+'" r="'+cornerRCm+'"></circle>');
    });
    collectVertices().forEach(function(v){
      if(v.refs.length !== 1) return;
      var ref = v.refs[0];
      freeEndHitParts.push('<circle class="fp-grab fp-free-hit" data-testid="free-end-'+pointKey(v.point)+'" data-wall-id="'+ref.wall.id+'" data-end="'+ref.end+'" cx="'+v.point.x+'" cy="'+v.point.y+'" r="'+cornerRCm+'"></circle>');
    });

    // An opening's own jamb handles: dragging one moves that jamb only.
    if(selFocus && (selFocus.seg.kind==='window' || selFocus.seg.kind==='door')){
      var ow = selFocus.wall, oseg = selFocus.seg;
      var oPts = segPoints(ow, oseg);
      [{edge:'start', pt:oPts.p0}, {edge:'end', pt:oPts.p1}].forEach(function(e){
        openingEdgeHitParts.push('<circle class="fp-grab" data-testid="opening-edge-'+e.edge+'-'+oseg.id+'" data-wall-id="'+ow.id+'" data-seg-id="'+oseg.id+'" data-edge="'+e.edge+'" cx="'+e.pt.x+'" cy="'+e.pt.y+'" r="'+cornerRCm+'"></circle>');
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
    // The stroke as it will be: a translucent band of the wall's own
    // thickness, with a dashed centre line down it.
    if(dragState.tool !== 'open'){
      parts.push('<line class="fp-preview-band" x1="'+dragState.startPt.x+'" y1="'+dragState.startPt.y+'" x2="'+dragState.endPoint.x+'" y2="'+dragState.endPoint.y+'" stroke-width="'+WALL_THICKNESS_CM+'"></line>');
    }
    parts.push('<line class="fp-preview'+(welded?' on':'')+(dragState.tool==='open'?' fp-preview-open':'')+'" x1="'+dragState.startPt.x+'" y1="'+dragState.startPt.y+'" x2="'+dragState.endPoint.x+'" y2="'+dragState.endPoint.y+'" stroke-width="'+Math.max(1.4, 2/t.scale)+'"></line>');
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
    parts.push('<g class="fp-dims">');
    dimsNow.forEach(function(d){
      var g = dimLineParts(d, t);
      parts.push('<path class="fp-dim-ext" d="'+g.ext+'" stroke-width="'+dimHairW+'"></path>');
      parts.push('<path class="fp-dim-run" d="'+g.line+'" stroke-width="'+dimHairW+'"></path>');
      parts.push('<path class="fp-dim-tick" d="'+g.ticks+'" stroke-width="'+dimHairW+'"></path>');
      // A number that stepped out of the lane left its own run behind:
      // this thin leader is the only thing tying the two back together.
      if(d.leader){
        var innerA = dimAnchor(d), outerA = chipAnchor(d);
        parts.push('<line class="fp-dim-ext" x1="'+innerA.x+'" y1="'+innerA.y+'" x2="'+outerA.x+'" y2="'+outerA.y+'" stroke-width="'+dimHairW+'"></line>');
      }
    });
    parts.push('</g>');
  }

  // Paint order is hit-test priority, later winning ties: a wall's own
  // hit rect lowest, because a corner sits at two of them and has to stay
  // reachable; then the corner handles; then a free end's circle; then an
  // opening's hit rect, so an opening slid flush against a corner still
  // wins over the corner it sits inside; and highest an opening's jamb
  // handles, so resizing one jamb wins over sliding the whole opening.
  var landmarkHitParts = [];
  var marksGroup = landmarkMarkup(t, landmarkHitParts);
  parts.push('<g class="fp-hits">' + plainSegHitParts.join('') + cornerHitParts.join('') + freeEndHitParts.join('') + openingSegHitParts.join('') + openingEdgeHitParts.join('') + landmarkHitParts.join('') + '</g>');
  // The marks last of all, so a square is never buried under the target that
  // makes it easy to grab with a finger.
  if(marksGroup) parts.push('<g class="fp-marks">' + marksGroup + '</g>');
  svgEl.innerHTML = parts.join('');
}

/* ======================================================================
   THE PLATES — the tools at the top of the canvas, undo and redo, the
   view controls and the hint line. White, a hairline, 44px rows; the
   active tool is filled ink. On a wide screen undo and redo sit in the
   tool plate after a divider, on a phone in their own plate bottom left.
   ====================================================================== */
function plateButton(testid, label, glyphName, opts){
  var o = opts || {};
  var btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'fp-tool' + (o.on ? ' on' : '') + (o.iconOnly ? ' fp-ico' : '') + (o.breath ? ' fp-breath' : '');
  btn.setAttribute('data-testid', testid);
  if(o.pressed != null) btn.setAttribute('aria-pressed', o.pressed ? 'true' : 'false');
  if(o.disabled) btn.disabled = true;
  // The accessible name is the word on the button, so voice control and the
  // eye agree; the key goes in the tooltip, which only a mouse ever opens.
  btn.setAttribute('aria-label', label);
  btn.title = (o.key && !touchWords) ? label + ' (' + o.key.toUpperCase() + ')' : label;
  // The tool that places a mark has no glyph: it is a small square in the
  // mark's own colour.
  if(o.swatch){
    btn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">'
      + '<rect x="4.5" y="4.5" width="11" height="11" rx="1" style="fill:'+o.swatch+';stroke:none"></rect></svg>';
  } else if(glyphName) btn.innerHTML = glyph(glyphName);
  if(!o.iconOnly){
    var span = doc.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
  }
  if(o.onClick) btn.addEventListener('click', o.onClick);
  return btn;
}
function divider(){
  var d = doc.createElement('span');
  d.className = 'fp-sep';
  return d;
}
function undoButtons(into){
  into.appendChild(plateButton('undo', RO.undo, 'undo', {
    iconOnly: true, disabled: undoStack.length === 0, onClick: undo
  }));
  into.appendChild(plateButton('redo', RO.redo, 'redo', {
    iconOnly: true, disabled: redoStack.length === 0, onClick: redo
  }));
}
function renderToolPlate(){
  toolPlateEl.innerHTML = '';
  var empty = model.walls.length === 0;
  tools.forEach(function(tool){
    var isMark = tool.id === LANDMARK_TOOL;
    var btn = plateButton('tool-' + tool.id, tool.label, tool.id, {
      on: activeTool === tool.id,
      pressed: activeTool === tool.id,
      key: tool.key,
      swatch: isMark ? markColour(landmarkKind) : null,
      // The drawn outline breathes round Perete until it has been used.
      breath: empty && tool.makes === 'wall',
      onClick: function(){ pickTool(tool.id); }
    });
    if(isMark && landmarkKind) btn.setAttribute('data-kind', landmarkKind);
    toolPlateEl.appendChild(btn);
  });
  if(!isNarrow()){
    toolPlateEl.appendChild(divider());
    undoButtons(toolPlateEl);
  }
}
function renderCornerPlates(){
  histPlateEl.innerHTML = '';
  viewPlateEl.innerHTML = '';
  var narrow = isNarrow();
  histPlateEl.classList.toggle('fp-off', !narrow);
  if(narrow) undoButtons(histPlateEl);
  if(!narrow){
    viewPlateEl.appendChild(plateButton('view-zoom-in', RO.zoomIn, 'zoomIn', {
      iconOnly: true, onClick: function(){ zoomBy(1.25, null); render(); }
    }));
    viewPlateEl.appendChild(plateButton('view-zoom-out', RO.zoomOut, 'zoomOut', {
      iconOnly: true, onClick: function(){ zoomBy(1/1.25, null); render(); }
    }));
  }
  viewPlateEl.appendChild(plateButton('view-fit', RO.fit, 'fit', {
    iconOnly: true, onClick: function(){ fitNow(); render(); }
  }));
}

/* ======================================================================
   THE HINT — one grey line under the tool plate saying the one next
   thing, in the words of whatever the client last touched the screen
   with. `data-state` names the state it is in.
   ====================================================================== */
function hintFor(){
  // A state the host names but the engine has no line for shows nothing:
  // a wrong line reads as the truth.
  if(hintState){
    var override = RO.hint[hintState];
    return { state: hintState, text: override ? override(touchWords) : '' };
  }
  if(refusedTool) return { state: 'no-wall', text: RO.hint.noWall(touchWords) };
  if(dragState && dragState.committed && dragState.kind === 'draw'){
    return { state: 'drawing', text: RO.hint.drawing(touchWords) };
  }
  if(dragState && dragState.committed && dragState.kind === 'opening'){
    var sliding = findSegAnywhere(dragState.liveSegId || dragState.segId);
    var subject = (sliding && sliding.seg.kind === 'door') ? RO.doorSubject : RO.windowSubject;
    return dragState.pastFreeEnd
      ? { state: 'opening-past-end', text: RO.slidesPastEnd(subject) }
      : { state: 'opening-slides', text: RO.slidesOnWall(subject) };
  }
  // The zoom line, the first time in this browser, for four seconds.
  if(Date.now() < zoomHintUntil) return { state: 'zoom', text: RO.hint.zoom(touchWords) };
  if(mode === 'landmarks'){
    if(activeTool === LANDMARK_TOOL){
      return { state: 'landmark-on', text: RO.hint.landmarkOn(touchWords, landmarkKind) };
    }
    if(selection && selection.landmarkId){
      return { state: 'landmark-focus', text: RO.hint.landmarkFocus() };
    }
    // With the tool down and nothing on the canvas there is nothing to say: a
    // line pointing at squares would point at none.
    if((model.landmarks || []).some(landmarkShows)){
      return { state: 'landmark-idle', text: RO.hint.landmarkIdle(touchWords) };
    }
    return { state: 'idle', text: '' };
  }
  var tool = toolById(tools, activeTool);
  if(tool && tool.gesture !== 'none'){
    var byTool = { wall: 'wallOn', open: 'openOn', window: 'windowOn', door: 'doorOn' };
    var key = byTool[tool.makes];
    if(key) return { state: tool.id + '-on', text: RO.hint[key](touchWords) };
  }
  var f = selection ? findSegAnywhere(selection.segId) : null;
  if(f){
    // An opening that ended up past a free end IS the end of the run now,
    // so what to do next is that a wall drawn from its far jamb joins it.
    if(isOpeningKind(f.seg) && openingAtFreeEnd(f.wall, f.seg)){
      var atEnd = f.seg.kind === 'door' ? RO.doorSubject : RO.windowSubject;
      return { state: 'opening-past-end', text: RO.slidesPastEnd(atEnd) };
    }
    if(f.seg.kind === 'window') return { state: 'window-focus', text: RO.hint.windowFocus(touchWords) };
    if(f.seg.kind === 'door') return { state: 'door-focus', text: RO.hint.doorFocus(touchWords) };
    if(f.seg.kind === 'open') return { state: 'open-focus', text: RO.hint.openFocus(touchWords) };
    if(justMade === 'wall') return { state: 'wall-made', text: RO.hint.wallMade(touchWords) };
    return { state: 'wall-focus', text: RO.hint.wallFocus(touchWords) };
  }
  if(model.walls.length === 0) return { state: 'empty', text: RO.hint.empty(touchWords) };
  return { state: 'idle', text: '' };
}
function renderHint(){
  var h = hintFor();
  var help = onHelpCb
    ? '<button type="button" class="fp-help" data-testid="hint-help">' + RO.help + '</button>'
    : '';
  hintEl.setAttribute('data-state', h.state);
  hintEl.innerHTML = h.text + (h.text && help ? ' · ' : '') + help;
  hintEl.classList.toggle('fp-off', !h.text && !help);
}
function renderToastDom(){
  if(!toastState){ toastEl.classList.add('fp-off'); return; }
  toastEl.classList.remove('fp-off');
  toastTextEl.textContent = toastState.text;
}
function renderConfirmDialog(){
  if(!confirmState){ confirmDialogEl.classList.add('fp-off'); return; }
  confirmDialogEl.classList.remove('fp-off');
  confirmDialogTextEl.textContent = confirmState.message;
  confirmYesBtn.textContent = confirmState.yesLabel;
}
/* ======================================================================
   THE HTML LAYER — everything readable or typeable sits over the SVG as
   ordinary positioned elements, so nothing carrying text or a real input
   inherits the zoom: the numbers on the drawing, the live length, and
   the plate of the thing in focus.
   ====================================================================== */
function stopChipPointer(node){
  ['pointerdown','mousedown','click'].forEach(function(evt){ node.addEventListener(evt, function(e){ e.stopPropagation(); }); });
}
// Where a chip or a plate may not land, in stage pixels: over one of the
// floating plates, or over a free end — the spot the next stroke starts
// from, and where a browser's own tap disambiguation is most likely to
// retarget a press onto whatever control renders nearby.
function freeEndObstacles(stageRect, t, radius){
  radius = radius || SNAP_PX;
  var obstacles = [];
  var clearPx = 6;
  root.querySelectorAll('#toolPlate, #histPlate, #viewPlate, #hintLine').forEach(function(pl){
    if(pl.classList.contains('fp-off')) return;
    var pr = pl.getBoundingClientRect();
    if(pr.width <= 0) return;
    obstacles.push({ l:pr.left-stageRect.left-clearPx, t:pr.top-stageRect.top-clearPx, r:pr.right-stageRect.left+clearPx, b:pr.bottom-stageRect.top+clearPx });
  });
  collectVertices().forEach(function(v){
    if(v.refs.length !== 1) return; // free ends only
    var p = cmToStage(v.point, t);
    obstacles.push({ l:p.x-radius, t:p.y-radius, r:p.x+radius, b:p.y+radius });
  });
  return obstacles;
}
// A second, narrower obstacle source, for the focus plate: every chip and
// every mark's name already on screen. A number on the drawing stays out of
// this on purpose — its lane and the chain's own placement keep it clear of
// the numbers beside it, and pushing it would move it off the stretch of
// wall it measures.
function chipObstacles(stageRect, skipEl){
  var obstacles = [];
  var gap = 4;
  ctrlLayerEl.querySelectorAll('.fp-chip, .fp-mark-name, #focusPlate').forEach(function(c){
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
// `avoidChips` opts into chipObstacles above; a chip on the drawing and a
// label leave it off. `extraObstacles` is concatenated onto the same
// list — the focus plate's own escape from the piece it acts on. `parent`
// is where the element lands, the control layer itself unless the caller
// has a group of its own (the chain) to keep it in.
function placeInStage(el, anchor, t, avoidChips, extraObstacles, parent){
  var pos = cmToStage(anchor, t);
  el.style.left = pos.x+'px'; el.style.top = pos.y+'px';
  (parent || ctrlLayerEl).appendChild(el);
  var stageRect = stageEl.getBoundingClientRect();
  var w = el.offsetWidth;
  // A chip's own VISIBLE box is a fixed 30px tall, but its input's real
  // hit box overflows that invisibly out to 44px — collide against the real
  // interactive footprint, not the shorter visible one, or an obstacle
  // check here would pass while the actual touch target still overlaps.
  var h = Math.max(el.offsetHeight, 44);
  var minX = w/2 + 4, maxX = Math.max(minX, stageRect.width - w/2 - 4);
  var minY = h/2 + 4, maxY = Math.max(minY, stageRect.height - h/2 - 4);
  var cx = Math.min(Math.max(pos.x, minX), maxX);
  var cy = Math.min(Math.max(pos.y, minY), maxY);

  // Nothing placed here may cover a free end: that is where the next
  // stroke starts from, so a chip on top of one costs the client the
  // stroke.
  var obstacles = freeEndObstacles(stageRect, t);
  if(avoidChips) obstacles = obstacles.concat(chipObstacles(stageRect, el));
  if(extraObstacles && extraObstacles.length) obstacles = obstacles.concat(extraObstacles);
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
  // A chip ignores this; the focus plate is big enough to sometimes have
  // no fully clear spot on one side of its piece, and needs to know
  // whether to try the other side.
  return { remaining: collidingWith(cx, cy).length };
}
// A third obstacle source, only for the focus plate: it sits right next
// to the very thing it acts on, so it also has to dodge that piece's own
// hit rect and, for an opening, its two jamb handles. Read off the real
// SVG elements this render already drew, never recomputed here.
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
// Read-only — used only for the live length riding the pointer, which
// has no model piece yet to attach a real chip to.
function addLabel(text, anchor, t, testid){
  var div = doc.createElement('div');
  div.className = 'fp-live';
  if(testid) div.setAttribute('data-testid', testid);
  div.textContent = text;
  placeInStage(div, anchor, t);
}
// A number on the drawing: a white chip with a hairline. Typed is ink,
// drawn or prefilled is grey italic; the one belonging to the piece in
// focus is framed in ink. Tapping it edits it in place — the chip is
// the field, so the keyboard never opens on its own.
function buildChip(testid, value, source, anchor, t, onCommit, label, focused, avoidChips, parent){
  var input = doc.createElement('input');
  input.type = 'text'; input.inputMode = 'decimal';
  input.setAttribute('data-testid', testid);
  input.value = String(value);
  input.className = source==='typed' ? '' : 'fp-derived';
  var chip = doc.createElement('div');
  chip.className = 'fp-chip' + (focused ? ' on' : '');
  chip.appendChild(input);
  var unit = doc.createElement('span'); unit.className='fp-unit'; unit.textContent='cm';
  chip.appendChild(unit);
  bindLengthField(input, onCommit, label || RO.fieldLength);
  stopChipPointer(chip);
  // A press usually lands on the chip's padding or its invisible halo,
  // not on the digits themselves — left to the browser that resolves to
  // "nothing focusable here" and takes focus away again on release. So
  // the press is taken on the whole chip and focus put on the input.
  chip.addEventListener('pointerdown', function(e){
    if(doc.activeElement === input) return; // already editing: let the browser place the caret where tapped
    e.preventDefault();
    input.focus();
    input.select();
  });
  placeInStage(chip, anchor, t, avoidChips, null, parent);
  return input;
}
// A number the client cannot write here: a gap in the chain, or a wall's own
// length on a step that does not change the plan. The same chip, with a span
// where the editable one has its field — the one part that would take an
// editor if gaps ever become typed. A length the client typed is still ink:
// read-only says who may change it, not who said it.
function buildGapChip(testid, value, source, anchor, t, parent){
  var chip = doc.createElement('div');
  chip.className = 'fp-chip fp-read';
  chip.setAttribute('data-testid', testid);
  var num = doc.createElement('span');
  num.className = 'fp-gapnum' + (source === 'typed' ? '' : ' fp-derived');
  num.textContent = String(value);
  chip.appendChild(num);
  var unit = doc.createElement('span'); unit.className='fp-unit'; unit.textContent='cm';
  chip.appendChild(unit);
  placeInStage(chip, anchor, t, false, null, parent);
  return chip;
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

// One source, two consumers: allDims and liveDim drive the dimension
// LINES over in renderSvg and every chip here, so a number can never end
// up sitting on a different stretch of wall than the line under it.
function renderCtrlLayer(t){
  ctrlLayerEl.innerHTML = '';
  focusPlateEl = null;

  // The chain's numbers go in a group of their own, there only while the
  // chain is up; it lies over the whole stage and takes no pointer of its
  // own, so a chip inside it sits exactly where it was placed.
  var chainGroup = null;
  allDims(t).forEach(function(d){
    // A landmark's own place in the chain carries no number: its square is a
    // break in the line and nothing more.
    if(d.value == null) return;
    if(d.inChain && !chainGroup){
      chainGroup = doc.createElement('div');
      chainGroup.className = 'fp-chain';
      chainGroup.setAttribute('data-testid', 'chain');
      ctrlLayerEl.appendChild(chainGroup);
    }
    var parent = d.inChain ? chainGroup : null;
    if(d.readOnly) buildGapChip(d.testid, d.value, d.source, chipAnchor(d), t, parent);
    else buildChip(d.testid, d.value, d.source, chipAnchor(d), t, d.commit, d.label, d.tone === 'primary', false, parent);
  });

  // A mark's name, so a plan full of squares reads without a legend. It keeps
  // its screen size whatever the zoom, which is why it lives here and not in
  // the SVG with the square it names.
  renderMarkNames(t);

  // The live length riding the pointer while a stroke or a resize is
  // lengthening a wall. Read-only: mid-gesture there is nothing to commit.
  var live = liveDim(t);
  if(live) addLabel(live.value + ' cm', dimAnchor(live), t, 'live-dim');

  // Last, so it can avoid every chip this pass has already placed.
  renderFocusPlate(t);
}

/* How far out of the square a name chip's centre sits: clear of the square,
   plus half the chip's own extent across the wall, so the chip's near edge is
   what lands beside the square rather than its middle. */
var MARK_NAME_HALF_W_PX = 52;
var MARK_NAME_HALF_H_PX = 14;
function markNameHalfCrossPx(w){
  return wallAxis(w) === 'horizontal' ? MARK_NAME_HALF_H_PX : MARK_NAME_HALF_W_PX;
}
function renderMarkNames(t){
  (model.landmarks || []).forEach(function(m){
    if(!landmarkShows(m)) return;
    var g = landmarkGeom(m);
    if(!g || !wallOnScreen(g.wall, t)) return;
    var chip = doc.createElement('div');
    chip.className = 'fp-mark-name';
    chip.setAttribute('data-testid', 'landmark-name-' + m.id);
    chip.textContent = landmarkLabel(m.kind);
    chip.style.color = markColour(m.kind);
    chip.style.borderColor = markColour(m.kind);
    var outCm = g.half + (8 + markNameHalfCrossPx(g.wall))/t.scale;
    placeInStage(chip, {
      x: g.centre.x + g.normal.x*g.sign*outCm,
      y: g.centre.y + g.normal.y*g.sign*outCm
    }, t);
  });
}

/* ======================================================================
   THE FOCUS PLATE — the plate of the thing in focus, holding only what
   that thing needs: a wall or a Fără perete side, "Șterge"; a window,
   Lățime, Înălțime pervaz and "Șterge"; a door, Lățime, "Rotește" and
   "Șterge". Lengths of walls are never here — they are on the drawing.
   Beside the piece on a wide screen, docked bottom centre on a phone,
   above the undo and view plates.
   ====================================================================== */
function plateField(row, label, value, source, testid, onCommit, fieldName){
  var lbl = doc.createElement('span');
  lbl.className = 'fp-fl';
  lbl.textContent = label;
  var input = doc.createElement('input');
  input.type = 'text'; input.inputMode = 'decimal';
  input.setAttribute('data-testid', testid);
  input.setAttribute('aria-label', label);
  input.className = 'fp-num' + (source === 'typed' ? '' : ' fp-derived');
  input.value = String(value);
  bindLengthField(input, onCommit, fieldName);
  var unit = doc.createElement('span');
  unit.className = 'fp-unit';
  unit.textContent = 'cm';
  row.appendChild(lbl); row.appendChild(input); row.appendChild(unit);
  return input;
}
function plateAction(row, testid, label, glyphName, onClick){
  var btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'fp-tool';
  btn.setAttribute('data-testid', testid);
  btn.innerHTML = glyph(glyphName);
  var span = doc.createElement('span');
  span.textContent = label;
  btn.appendChild(span);
  btn.addEventListener('click', onClick);
  row.appendChild(btn);
}
function focusPlateAnchor(w, seg, t, side){
  var pts = segPoints(w, seg);
  var mid = { x:(pts.p0.x+pts.p1.x)/2, y:(pts.p0.y+pts.p1.y)/2 };
  var n = wallNormal(w);
  var outCm = (segHitWidthCm(t)/2 + 44/t.scale) * side;
  return { x: mid.x + n.x*outCm, y: mid.y + n.y*outCm };
}
function newFocusPlate(){
  var plate = doc.createElement('div');
  plate.className = 'fp-plate fp-focus';
  plate.id = 'focusPlate';
  plate.setAttribute('data-testid', 'focus-plate');
  return plate;
}
/** A landmark's own plate: it has nothing to state, so only "Șterge". */
function renderLandmarkPlate(m, t){
  var g = landmarkGeom(m);
  if(!g) return;
  var plate = newFocusPlate();
  var row = doc.createElement('div');
  row.className = 'fp-row';
  plate.appendChild(row);
  plateAction(row, 'plate-delete', RO.del, 'del', function(){ deleteSelection(); });
  stopChipPointer(plate);
  focusPlateEl = plate;
  if(isNarrow()){
    plate.classList.add('fp-docked');
    ctrlLayerEl.appendChild(plate);
    return;
  }
  var outCm = g.half + 44/t.scale;
  placeInStage(plate, {
    x: g.centre.x + g.normal.x*g.sign*outCm,
    y: g.centre.y + g.normal.y*g.sign*outCm
  }, t, true);
}
function renderFocusPlate(t){
  // Hidden while a drag is running: it would ride along with the piece
  // and end up on top of wherever the gesture is about to land.
  if(dragState && dragState.committed) return;
  if(!selection) return;
  if(selection.landmarkId){
    var mark = findLandmark(selection.landmarkId);
    if(mark) renderLandmarkPlate(mark, t);
    return;
  }
  var f = findSegAnywhere(selection.segId);
  if(!f) return;
  var w = f.wall, seg = f.seg;

  var plate = newFocusPlate();

  var row = doc.createElement('div');
  row.className = 'fp-row';
  plate.appendChild(row);

  if(seg.kind === 'window' || seg.kind === 'door'){
    // The width is the same value as the piece's own number on the
    // drawing: editing either edits both.
    plateField(row, RO.width, seg.length.value, seg.length.source, 'plate-width',
      segDimCommit(w, seg), RO.fieldWidth);
  }
  if(seg.kind === 'door'){
    row.appendChild(divider());
    plateAction(row, 'plate-rotate', RO.rotate, 'rotate', function(){
      pushHistory(); cycleDoorSwing(w.id, seg.id); render();
    });
  }
  if(seg.kind === 'window'){
    // Two rows on a phone: the sill goes under the width.
    var second = row;
    if(isNarrow()){
      second = doc.createElement('div');
      second.className = 'fp-row';
      plate.appendChild(second);
      plate.classList.add('fp-two');
    } else {
      row.appendChild(divider());
    }
    var sv = seg.sill || { value: carried.sill, source: 'computed' };
    plateField(second, RO.sill, sv.value, sv.source, 'plate-sill', function(cm){
      pushHistory();
      carried.sill = r(cm);
      setSegSill(w.id, seg.id, cm, 'typed');
      render();
    }, RO.fieldSill);
  }
  if(row.childNodes.length) row.appendChild(divider());
  plateAction(row, 'plate-delete', RO.del, 'del', function(){ deleteSelection(); });

  stopChipPointer(plate);
  focusPlateEl = plate;

  if(isNarrow()){
    // Docked bottom centre, above the undo and view plates: a plate wide
    // enough for two fields next to a piece on a 360px screen would
    // always land on the drawing or run off the edge.
    plate.classList.add('fp-docked');
    ctrlLayerEl.appendChild(plate);
    return;
  }
  var stageRect = svgEl.getBoundingClientRect();
  var extraObs = pieceOwnObstacles(stageRect, seg);
  var placement = placeInStage(plate, focusPlateAnchor(w, seg, t, 1), t, true, extraObs);
  if(placement.remaining > 0){
    var left1 = plate.style.left, top1 = plate.style.top, remaining1 = placement.remaining;
    var placement2 = placeInStage(plate, focusPlateAnchor(w, seg, t, -1), t, true, extraObs);
    if(placement2.remaining > remaining1){ plate.style.left = left1; plate.style.top = top1; }
  }
}

/* ============================================================
   TOOLS — picking one, using it, and turning it off. tools.ts owns the
   rules; this is what the engine does about them.
   ============================================================ */
function hasAnyWall(){
  for(var i=0;i<model.walls.length;i++){
    if(!model.walls[i].isOpen) return true;
  }
  return false;
}
function pickTool(id){
  var res = applyToolEvent(tools, activeTool, { type:'pick', id:id }, { hasWall: hasAnyWall() });
  if(!res.handled) return;
  activeTool = res.active;
  refusedTool = res.refused;
  justMade = null;
  // Picking a tool ends the focus: the canvas is for making now.
  if(!res.refused && res.active !== restingTool(tools)) selection = null;
  render();
}
/** One use of the active tool is over: it either made something or it did not. */
function toolUsed(made, kindMade){
  var res = applyToolEvent(tools, activeTool, { type:'use', made: !!made }, { hasWall: hasAnyWall() });
  activeTool = res.active;
  refusedTool = false;
  justMade = made ? kindMade : null;
}
function activeToolDef(){ return toolById(tools, activeTool); }
function toolMakes(){ var td = activeToolDef(); return td ? td.makes : null; }
function isMakingStroke(){ var td = activeToolDef(); return !!td && td.gesture === 'stroke'; }
function isPlacingTap(){ var td = activeToolDef(); return !!td && td.gesture === 'tap'; }

/* ============================================================
   GESTURE ROUTER — intent comes from the tool that is on and from where
   a drag starts, decided once at pointerdown, before any movement:
     Perete / Fără perete -> one drag draws one piece, snapping at press
                              and again at release
     Fereastră / Ușă      -> one tap on a wall places one opening
     Selectează, on a piece    -> push a wall, slide an opening
     Selectează, on a corner   -> move that corner, both walls following
     Selectează, on a jamb     -> resize that opening, the far jamb pinned
     Selectează, on empty canvas -> move the view
   Two fingers pinch and pan whatever the tool, and a second finger
   landing during a stroke cancels it. Every drag starts inside a small
   screen-space dead-zone (TAP_PX): a plain tap never moves anything.
   ============================================================ */
var pointers = new Map();
var pinch = null;
var spaceDown = false;

function pinchDistance(){
  var pts = Array.from(pointers.values());
  return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
}
function pinchCentre(){
  var pts = Array.from(pointers.values());
  var sr = svgEl.getBoundingClientRect();
  return { x: (pts[0].x + pts[1].x)/2 - sr.left, y: (pts[0].y + pts[1].y)/2 - sr.top };
}
function cancelStroke(){
  if(dragState && dragState.committed && dragState.base){
    restoreSnapshot(dragState.base);
    // The drag took its undo step the moment it committed; abandoned, it
    // would leave a step that undoes to the very same drawing.
    undoStack.pop();
    // An opening that travelled to another wall was re-made there, so the
    // focus has to come back to the piece the model holds again.
    if(dragState.kind === 'opening' && dragState.segId) selection = { segId: dragState.segId };
    if(dragState.kind === 'landmark' && dragState.landmarkId) selection = { landmarkId: dragState.landmarkId };
  }
  dragState = null;
  stopEdgePan();
}

function onSvgPointerDown(e){
  // Commit whatever chip is focused on every pointerdown, not just on a
  // button press: a field commits on blur, and blur re-renders.
  commitActiveField();
  refusedTool = false;
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(pointers.size === 2){
    // A second finger takes over: whatever the first was doing stops.
    cancelStroke();
    pinch = { dist: pinchDistance(), centre: pinchCentre() };
    render();
    return;
  }
  if(pointers.size > 2) return;

  var t = viewTransform();
  var startCm = clientToCm(e.clientX, e.clientY, t);
  var base = { startClientX:e.clientX, startClientY:e.clientY, startCm:startCm, committed:false };

  // Space or the middle button pans with any tool.
  if(spaceDown || e.button === 1){
    dragState = Object.assign(base, { kind:'pan', lastClientX:e.clientX, lastClientY:e.clientY });
    capture(e);
    return;
  }

  if(isMakingStroke()){
    var startSnap = findStartSnap(startCm, t);
    dragState = Object.assign(base, {
      kind:'draw', tool: toolMakes(), startPt: startSnap.point, startSnap: startSnap
    });
    capture(e);
    return;
  }

  // A landmark is the one thing the landmark step can take hold of, and it
  // wins over the armed tool: the tool is armed on arrival, so a press on a
  // square already there would otherwise always try to place another one.
  var markEl = e.target.closest ? e.target.closest('[data-landmark-id]') : null;
  if(mode === 'landmarks' && markEl){
    // Taking hold of one puts the tool down, so the plate, the hint and the
    // focus all say the same thing: this square is what the client is on.
    activeTool = restingTool(tools);
    justMade = null;
    dragState = Object.assign(base, { kind:'landmark', landmarkId: markEl.getAttribute('data-landmark-id') });
    capture(e);
    render();
    return;
  }

  if(isPlacingTap()){
    // Resolved at release: an opening goes where the tap landed, on a
    // plain stretch of wall.
    dragState = Object.assign(base, { kind:'place' });
    capture(e);
    return;
  }

  var dedicated = e.target.closest ? e.target.closest('.fp-grab') : null;
  if(dedicated){
    if(dedicated.hasAttribute('data-vx')){
      var vx = parseFloat(dedicated.getAttribute('data-vx')), vy = parseFloat(dedicated.getAttribute('data-vy'));
      dragState = Object.assign(base, { kind:'corner', vertexPt: {x:vx,y:vy} });
    } else if(dedicated.hasAttribute('data-edge')){
      dragState = Object.assign(base, {
        kind:'openingEdge', wallId: dedicated.getAttribute('data-wall-id'),
        segId: dedicated.getAttribute('data-seg-id'), edge: dedicated.getAttribute('data-edge')
      });
    } else {
      // A free end resizes its wall along the wall's own axis; anything
      // more sideways is a pan, since Selectează never draws.
      var feWallId = dedicated.getAttribute('data-wall-id'), feEnd = dedicated.getAttribute('data-end');
      var feWall = findWall(feWallId);
      var fePt = feWall ? { x:feWall[feEnd].x, y:feWall[feEnd].y } : startCm;
      dragState = Object.assign(base, { kind:'freeEnd', wallId: feWallId, movingEnd: feEnd, startPt: fePt });
    }
    capture(e);
    return;
  }

  var segHitEl = e.target.closest ? e.target.closest('.fp-hit') : null;
  if(segHitEl){
    var k = segHitEl.getAttribute('data-kind');
    dragState = Object.assign(base, {
      kind: (k==='wall'||k==='open') ? 'push' : 'opening',
      wallId: segHitEl.getAttribute('data-wall-id'), segId: segHitEl.getAttribute('data-seg-id')
    });
    capture(e);
    return;
  }

  // Empty canvas with Selectează on: one finger moves the view, and a
  // tap that never moves ends the focus.
  dragState = Object.assign(base, { kind:'pan', lastClientX:e.clientX, lastClientY:e.clientY });
  capture(e);
}
function capture(e){
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
  } else if(ds.kind==='landmark'){
    pushHistory(); ds.base = snapshotModel();
    var mk = findLandmark(ds.landmarkId);
    var mw = mk ? findWall(mk.wallId) : null;
    if(mk && mw){
      // The run and where on it the drag began, both fixed now, exactly as an
      // opening's are.
      ds.run = buildRun(mw.id, runWallInputs());
      ds.runPoints = ds.run ? runPoints(ds.run) : [];
      var mClosed = !!(ds.run && ds.run.closed);
      ds.grabArc = arcOnRun(ds.runPoints, ds.startCm, null, mClosed);
      ds.centreArc0 = arcOnRun(ds.runPoints, pointAlong(mw, mk.offsetFromStartCm + LANDMARK_SIZE_CM/2), null, mClosed);
      ds.lastArc = ds.grabArc;
    }
  } else if(ds.kind==='opening' || ds.kind==='openingEdge'){
    pushHistory(); ds.base = snapshotModel();
    var f = findSeg(ds.wallId, ds.segId);
    var w = findWall(ds.wallId);
    if(ds.kind==='openingEdge'){
      // One jamb moves and the other stays: both are measured off where
      // the segment was when the drag began.
      ds.segOffsetStart = f ? f.seg.offsetFromStart : 0;
      ds.segLengthStart = f ? f.seg.length.value : 0;
      ds.wallDirVec = w ? wallDir(w) : {x:1,y:0};
    } else if(w && f){
      // The run the opening may travel, and where on it the drag began:
      // both fixed now, so a wall growing past a free end mid-drag cannot
      // move the ground under the gesture.
      ds.run = buildRun(w.id, runWallInputs());
      ds.runPoints = ds.run ? runPoints(ds.run) : [];
      var closed = !!(ds.run && ds.run.closed);
      // Both seeds are read off the whole run: the press and the piece's
      // own middle are on it already, so there is no previous answer to
      // stay continuous with yet.
      ds.grabArc = arcOnRun(ds.runPoints, ds.startCm, null, closed);
      ds.centreArc0 = arcOnRun(ds.runPoints, pointAlong(w, f.seg.offsetFromStart + f.seg.length.value/2), null, closed);
      ds.lastArc = ds.grabArc;
      ds.liveSegId = ds.segId;
    }
  }
  // 'draw' needs no snapshot: it only adds a piece at pointerup. 'resize'
  // takes the same base-snapshot discipline as push and corner, because
  // it mutates the live model on every move and has to reapply fresh
  // rather than compound.
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
  } else if(ds.kind==='landmark'){
    restoreSnapshot(ds.base);
    selection = { landmarkId: ds.landmarkId };
    applyLandmarkSlide(ds, curCm);
  } else if(ds.kind==='opening'){
    restoreSnapshot(ds.base);
    // The model is the one the drag began on again, so the piece in focus
    // is the one it began on until this move says otherwise.
    selection = { segId: ds.segId };
    ds.liveSegId = ds.segId;
    applyOpeningSlide(ds, curCm);
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

// Resolves a free end's press the moment it becomes a drag, by the
// direction travelled against the wall's own axis — the only axis a
// resize may move along. Anything more sideways than a deliberate pull
// moves the view instead, since Selectează never draws.
function resolveFreeEndDirection(ds, curCm){
  var w = findWall(ds.wallId);
  if(!w){ ds.kind = 'pan'; return; }
  var axis = wallDir(w);
  var mvx = curCm.x-ds.startCm.x, mvy = curCm.y-ds.startCm.y;
  var mvLen = Math.hypot(mvx,mvy) || 1;
  var alongFrac = Math.abs(mvx*axis.x + mvy*axis.y) / mvLen;
  // About 25 degrees either way: a wrong pan costs nothing, a wrong
  // resize destroys a measurement.
  if(alongFrac >= 0.9){
    ds.kind = 'resize';
    ds.fixedEnd = ds.movingEnd === 'from' ? 'to' : 'from';
    // Heading away from the fixed end, locked in now so it cannot flip
    // mid-drag even when the wall is pulled down to its own floor.
    ds.heading = headingOf({ from: w[ds.fixedEnd], to: w[ds.movingEnd] });
  } else {
    ds.kind = 'pan';
    ds.lastClientX = ds.startClientX; ds.lastClientY = ds.startClientY;
  }
}

/* While a stroke or a drag comes within 32px of a canvas edge, the view
   pans toward it at a steady pace. */
var edgePanFrame = null, edgePanAt = null;
function startEdgePan(){
  if(edgePanFrame != null || typeof win.requestAnimationFrame !== 'function') return;
  var step = function(){
    edgePanFrame = null;
    if(destroyed || !dragState || !edgePanAt) return;
    var d = edgePanStep(edgePanAt.stage, stageSize());
    if(d.dx || d.dy){
      panView(d.dx, d.dy);
      applyView();
      var t = viewTransform();
      applyDragMove(dragState, clientToCm(edgePanAt.clientX, edgePanAt.clientY, t), t);
      render();
    }
    edgePanFrame = win.requestAnimationFrame(step);
  };
  edgePanFrame = win.requestAnimationFrame(step);
}
function stopEdgePan(){
  if(edgePanFrame != null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(edgePanFrame);
  edgePanFrame = null; edgePanAt = null;
}

function onSvgPointerMove(e){
  if(pointers.has(e.pointerId)) pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(pinch && pointers.size >= 2){
    var dist2 = pinchDistance(), centre = pinchCentre();
    if(pinch.dist > 0){
      zoomBy(dist2/pinch.dist, centre);
      panView(centre.x - pinch.centre.x, centre.y - pinch.centre.y);
      noteZoomed();
    }
    pinch = { dist: dist2, centre: centre };
    render();
    return;
  }
  if(!dragState) return;
  var t = viewTransform();
  var curCm = clientToCm(e.clientX, e.clientY, t);
  if(!dragState.committed){
    var screenDist = Math.hypot(e.clientX-dragState.startClientX, e.clientY-dragState.startClientY);
    if(screenDist < TAP_PX) return;
    if(dragState.kind === 'place') return;  // a tap places; a drag with the tool on places nothing
    if(dragState.kind === 'freeEnd'){
      // Six pixels say a gesture is a drag, not which drag: over that
      // distance the direction is mostly the jitter of the first frame.
      if(screenDist < FREE_END_DECIDE_PX) return;
      resolveFreeEndDirection(dragState, curCm);
    }
    dragState.committed = true;
    beginCommittedDrag(dragState);
  }
  if(dragState.kind === 'pan'){
    panView(e.clientX - dragState.lastClientX, e.clientY - dragState.lastClientY);
    noteZoomed();
    dragState.lastClientX = e.clientX; dragState.lastClientY = e.clientY;
    render();
    return;
  }
  applyDragMove(dragState, curCm, t);
  edgePanAt = { stage: stagePx(e.clientX, e.clientY), clientX: e.clientX, clientY: e.clientY };
  startEdgePan();
  render();
}

function handleTap(ds){
  if(ds.kind==='landmark'){
    selection = { landmarkId: ds.landmarkId };
    justMade = null;
  } else if(ds.kind==='push' || ds.kind==='opening' || ds.kind==='openingEdge'){
    selection = { segId: ds.segId };
    justMade = null;
  } else if(ds.kind==='freeEnd'){
    // Poking the end of a wall selects that wall. Segments run from->to,
    // so the piece at 'from' is index 0 and at 'to' the last one.
    var fw = findWall(ds.wallId);
    selection = fw ? { segId: fw.segments[ds.movingEnd==='from' ? 0 : fw.segments.length-1].id } : null;
    justMade = null;
  } else {
    // Empty canvas, or a corner: the focus ends.
    selection = null;
    justMade = null;
  }
}

/** One tap with Fereastră or Ușă on: a 60 cm window or a 90 cm door on the wall touched. */
function placeOpening(ds, clientX, clientY){
  var kind = toolMakes();
  var under = doc.elementFromPoint(clientX, clientY);
  var hit = under && under.closest ? under.closest('.fp-hit') : null;
  // Never on a Fără perete side, and never on top of another opening.
  if(!hit || hit.getAttribute('data-kind') !== 'wall'){
    toolUsed(false, null);
    return;
  }
  var wallId = hit.getAttribute('data-wall-id');
  var w = findWall(wallId);
  if(!w){ toolUsed(false, null); return; }
  var t = viewTransform();
  var atCm = clientToCm(clientX, clientY, t);
  var d = wallDir(w);
  var along = (atCm.x - w.from.x)*d.x + (atCm.y - w.from.y)*d.y;
  pushHistory();
  var id = addOpening(wallId, kind, along);
  if(!id){
    undoStack.pop();
    toolUsed(false, null);
    return;
  }
  selection = { segId: id };
  toolUsed(true, kind);
}

/**
 * The wall a tap landed on, found from the geometry rather than from what is
 * under the pointer: on the landmark step the plan carries no hit targets of
 * its own. A Fără perete side is never one of them.
 */
function wallUnderPoint(pt, t){
  var reach = segHitWidthCm(t)/2;
  var best = null, bestAcross = Infinity;
  model.walls.forEach(function(w){
    if(w.isOpen) return;
    var d = wallDir(w), n = wallNormal(w), len = wallLen(w);
    var along = (pt.x - w.from.x)*d.x + (pt.y - w.from.y)*d.y;
    if(along < -reach || along > len + reach) return;
    var across = Math.abs((pt.x - w.from.x)*n.x + (pt.y - w.from.y)*n.y);
    if(across > reach || across >= bestAcross) return;
    bestAcross = across;
    best = { wall: w, alongCm: clamp(along, 0, len) };
  });
  return best;
}

/** One tap with the landmark tool on: a 30 cm square against the wall touched. */
function placeLandmark(ds, clientX, clientY){
  var t = viewTransform();
  var found = wallUnderPoint(clientToCm(clientX, clientY, t), t);
  if(!found){ toolUsed(false, null); return; }
  var w = found.wall;
  // A new landmark goes on the room side, the same side a new door opens
  // into — the wall normal's own positive side.
  var face = 'in';
  var offset = placeOnWall({
    wallLengthCm: markWallLengthCm(w),
    isOpen: !!w.isOpen,
    wantCentreCm: found.alongCm,
    blockers: blockersFor(w, face, null)
  });
  if(offset == null){ toolUsed(false, null); return; }
  pushHistory();
  var mark = {
    id: uid('mark'), kind: landmarkKind, wallId: w.id,
    offsetFromStartCm: r(offset), face: face
  };
  model.landmarks.push(mark);
  selection = { landmarkId: mark.id };
  toolUsed(true, LANDMARK_TOOL);
}

/** What the focus is on right now, whatever kind of thing it is. */
function focusKey(){
  if(!selection) return null;
  return selection.landmarkId ? 'mark:' + selection.landmarkId : 'seg:' + selection.segId;
}

/** When the piece in focus would sit under a plate, pan just enough to show it. */
function revealFocused(){
  if(!selection || !view) return;
  var box;
  if(selection.landmarkId){
    var mk = findLandmark(selection.landmarkId);
    var g = mk ? landmarkGeom(mk) : null;
    if(!g) return;
    var pad = g.half + WALL_THICKNESS_CM;
    box = { minX: g.centre.x - pad, minY: g.centre.y - pad, maxX: g.centre.x + pad, maxY: g.centre.y + pad };
    stopFitEase();
    view = panToReveal(view, box, stageSize(), plateBands());
    return;
  }
  var f = findSegAnywhere(selection.segId);
  if(!f) return;
  var pts = segPoints(f.wall, f.seg);
  box = {
    minX: Math.min(pts.p0.x, pts.p1.x) - WALL_THICKNESS_CM,
    minY: Math.min(pts.p0.y, pts.p1.y) - WALL_THICKNESS_CM,
    maxX: Math.max(pts.p0.x, pts.p1.x) + WALL_THICKNESS_CM,
    maxY: Math.max(pts.p0.y, pts.p1.y) + WALL_THICKNESS_CM
  };
  stopFitEase();
  view = panToReveal(view, box, stageSize(), plateBands());
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
  pointers.delete(e.pointerId);
  if(pinch){
    // The pinch ends with the last of the two fingers; whatever is left
    // does not become a stroke halfway through.
    if(pointers.size < 2) pinch = null;
    try{ svgEl.releasePointerCapture && svgEl.releasePointerCapture(e.pointerId); }catch(err){}
    render();
    return;
  }
  if(!dragState) return;
  var ds = dragState;
  var focusBefore = focusKey();
  stopEdgePan();
  if(!ds.committed && ds.kind === 'place'){
    if(toolMakes() === LANDMARK_TOOL) placeLandmark(ds, e.clientX, e.clientY);
    else placeOpening(ds, e.clientX, e.clientY);
  } else if(!ds.committed){
    if(ds.kind === 'draw'){
      // A tool use that drew nothing keeps the tool on, and the hint
      // repeats what to do.
      toolUsed(false, null);
    } else {
      handleTap(ds);
    }
  } else if(ds.kind==='pan'){
    /* the view has already followed the finger */
  } else if(ds.kind==='landmark'){
    // The drag has already put the square where it goes, wall by wall and face
    // by face; release only settles the focus on it.
    selection = { landmarkId: ds.landmarkId };
  } else if(ds.kind==='openingEdge'){
    selection = { segId: ds.segId };
  } else if(ds.kind==='opening'){
    // The drag has already put the opening where it goes, wall by wall;
    // release only settles the focus on wherever it ended up.
    selection = { segId: ds.liveSegId || ds.segId };
  } else if(ds.kind==='push'){
    finalizeDragWeld(ds);
    selection = { segId: ds.segId };
  } else if(ds.kind==='corner'){
    finalizeDragWeld(ds);
  } else if(ds.kind==='resize'){
    // Re-checked fresh at release, on the actual release coordinates
    // rather than whatever the last move event computed.
    var t4 = viewTransform();
    var releaseCm4 = clientToCm(e.clientX, e.clientY, t4);
    var wRel = findWall(ds.wallId);
    if(wRel){
      var endSnap4 = resizeEndpointSnap(wRel, ds, releaseCm4, t4);
      wRel[ds.movingEnd].x = r(endSnap4.point.x); wRel[ds.movingEnd].y = r(endSnap4.point.y);
      wRel.lengthSource = 'drawn';
      // Sync first, so a piece grown past an opening resolves to whichever
      // segment truly sits at the end now, and capture that id before
      // cleanupOutline can merge this wall into a collinear neighbour.
      syncSegmentsForAllWalls();
      var resizedSegId = wRel.segments[ds.movingEnd==='from' ? 0 : wRel.segments.length-1].id;
      cleanupOutline();
      syncSegmentsForAllWalls();
      selection = { segId: resizedSegId };
    }
  } else if(ds.kind==='draw'){
    var t3 = viewTransform();
    var releaseCm = clientToCm(e.clientX, e.clientY, t3);
    var ddx2 = releaseCm.x-ds.startPt.x, ddy2 = releaseCm.y-ds.startPt.y;
    var heading2 = snapHeading(ddx2,ddy2);
    var rawLen2 = Math.max(Math.abs(ddx2), Math.abs(ddy2));
    var endSnap2 = findEndpointSnap(ds.startPt, heading2, rawLen2, t3);
    var made = commitDrawStroke(ds.startPt, ds.startSnap, endSnap2.point, endSnap2, heading2, t3, ds.tool);
    toolUsed(made, ds.tool);
  }
  // Whatever moved the focus this time, a piece that would land under a
  // plate is brought out from under it once, here.
  if(focusKey() !== focusBefore) revealFocused();
  try{ svgEl.releasePointerCapture && svgEl.releasePointerCapture(e.pointerId); }catch(err){}
  dragState = null;
  render();
}

/* ============================================================
   WIRING
   ============================================================ */
function init(){
  svgEl = $id('roomSvg');
  stageEl = $id('stage');
  ctrlLayerEl = $id('ctrlLayer');
  toolPlateEl = $id('toolPlate');
  hintEl = $id('hintLine');
  histPlateEl = $id('histPlate');
  viewPlateEl = $id('viewPlate');
  toastEl = $id('toastEl');
  toastTextEl = $id('toastText');
  toastDismissEl = $id('toastDismiss');
  confirmDialogEl = $id('confirmDialog');
  confirmDialogTextEl = $id('confirmDialogText');
  confirmYesBtn = $id('confirmYesBtn');
  confirmNoBtn = $id('confirmNoBtn');

  svgEl.addEventListener('pointerdown', onSvgPointerDown);
  svgEl.addEventListener('pointermove', onSvgPointerMove);
  svgEl.addEventListener('pointerup', onSvgPointerUp);
  svgEl.addEventListener('pointercancel', function(e){
    pointers.delete(e.pointerId);
    if(pointers.size < 2) pinch = null;
    cancelStroke();
    render();
  });

  // The wheel zooms around the pointer; a trackpad pinch arrives as a
  // wheel event with ctrlKey set.
  svgEl.addEventListener('wheel', function(e){
    e.preventDefault();
    var at = stagePx(e.clientX, e.clientY);
    var factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomBy(factor, at);
    render();
  }, { passive:false });

  // A touch snaps an imprecise press to the nearest interactive element
  // within a small radius, retargeting the event but not its
  // coordinates. Caught in the capture phase: when the real coordinates
  // fall outside that element's real box, this was never a press on it,
  // so it goes to the canvas underneath at its real coordinates.
  function realBoxMisses(e){
    var el = e.target && e.target.closest ? e.target.closest('.fp-plate, .fp-chip, .fp-hint') : null;
    if(!el) return null;
    // A native TouchEvent carries no clientX/clientY of its own — those
    // live on its touches list, unlike a PointerEvent.
    var pt = e;
    if(e.clientX === undefined){
      var list = (e.touches && e.touches.length) ? e.touches : e.changedTouches;
      pt = (list && list[0]) || { clientX:NaN, clientY:NaN };
    }
    // A rect's own bottom and right are the first row and column beyond
    // it, so a press exactly at that edge is already past the box.
    var rb = el.getBoundingClientRect();
    // A chip's real box includes its own invisible halo: a press there is
    // a genuine press on the chip, not the mis-snap this guard is for.
    var pad = el.classList.contains('fp-chip') ? 7 : 0;
    var inside = pt.clientX >= rb.left-pad && pt.clientX < rb.right+pad && pt.clientY >= rb.top-pad && pt.clientY < rb.bottom+pad;
    return inside ? null : el;
  }
  // The words a hint uses follow the pointer last used.
  onRoot('pointerdown', function(e){
    if(!e.pointerType) return;
    var nowTouch = e.pointerType !== 'mouse';
    if(nowTouch !== touchWords){ touchWords = nowTouch; renderHint(); }
  }, true);

  onRoot('touchstart', function(e){
    if(!realBoxMisses(e)) return;
    // Whether a movement may become a native scroll is decided from the
    // originally hit-tested element's own CSS, before any of this runs,
    // so only preventDefault on the touch event itself stops it.
    e.preventDefault();
  }, { capture:true, passive:false });
  onRoot('pointerdown', function(e){
    var miss = realBoxMisses(e);
    if(!miss) return;
    e.stopImmediatePropagation();
    onSvgPointerDown(e);
  }, true);
  onRoot('click', function(e){
    if(!realBoxMisses(e)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  hintEl.addEventListener('click', function(e){
    var link = e.target && e.target.closest ? e.target.closest('.fp-help') : null;
    if(!link || !onHelpCb) return;
    e.preventDefault();
    onHelpCb();
  });

  toastDismissEl.addEventListener('click', function(){ hideToast(); render(); });

  confirmYesBtn.addEventListener('click', function(){ var cs=confirmState; hideConfirm(); if(cs && cs.onYes) cs.onYes(); render(); });
  confirmNoBtn.addEventListener('click', function(){ var cs=confirmState; hideConfirm(); if(cs && cs.onNo) cs.onNo(); render(); });
  confirmDialogEl.addEventListener('mousedown', function(e){ if(e.target.closest('button')) e.preventDefault(); });

  // A field commits on blur, and blur re-renders, which can destroy the
  // button mid-press: suppress the focus shift on mousedown, then read
  // the field's live value in a capture-phase click before any button's
  // own handler runs.
  var appEl = $id('app');
  appEl.addEventListener('mousedown', function(e){ if(e.target.closest('button')) e.preventDefault(); });
  appEl.addEventListener('click', function(e){
    var btn = e.target.closest('button');
    if(!btn) return;
    if(!commitActiveField()) e.stopImmediatePropagation();
  }, true);

  // A resize keeps the view where it is; only its pixel size changed.
  onWin('resize', render);
  onWin('orientationchange', function(){ setTimeout(function(){ if(!destroyed) render(); }, 60); });
  onWin('keyup', function(e){ if(e.code === 'Space') spaceDown = false; });
  // A tab switch swallows the keyup, and the pan would stay armed.
  onWin('blur', function(){ spaceDown = false; });
  onWin('keydown', onKeyDown);

  render();
}

function typingInField(e){
  var tag = e.target && e.target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}
function pressingControl(e){
  var tag = e.target && e.target.tagName;
  return tag === 'BUTTON' || tag === 'A' || tag === 'SELECT';
}
function onKeyDown(e){
  if(!keysEnabled) return;
  if(e.code === 'Space'){
    // Space on a focused control is that control's own press, and
    // anywhere else it would scroll the page rather than arm the pan.
    if(typingInField(e) || pressingControl(e)) return;
    e.preventDefault();
    spaceDown = true;
    return;
  }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); undo(); return; }
  if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='y' || (e.key.toLowerCase()==='z' && e.shiftKey))){ e.preventDefault(); redo(); return; }
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  if(e.key === 'Escape'){
    if(dragState){ cancelStroke(); }
    var esc = applyToolEvent(tools, activeTool, { type:'escape' }, { hasWall: hasAnyWall() });
    activeTool = esc.active;
    refusedTool = false;
    render();
    return;
  }
  if(typingInField(e)) return;
  if(e.key === '?'){
    if(!onHelpCb) return;
    e.preventDefault();
    onHelpCb();
    return;
  }
  if((e.key==='Delete' || e.key==='Backspace') && selection){
    e.preventDefault();
    deleteSelection();
    return;
  }
  if(e.key === '+' || e.key === '='){ e.preventDefault(); zoomBy(1.25, null); render(); return; }
  if(e.key === '-' || e.key === '_'){ e.preventDefault(); zoomBy(1/1.25, null); render(); return; }
  if(e.key === '0'){ e.preventDefault(); fitNow(); render(); return; }
  if(e.key.toLowerCase() === 'r' && selection){
    var f = findSegAnywhere(selection.segId);
    if(f && f.seg.kind === 'door'){
      e.preventDefault();
      pushHistory(); cycleDoorSwing(f.wall.id, f.seg.id); render();
      return;
    }
  }
  var picked = toolForKey(tools, e.key);
  if(picked){ e.preventDefault(); pickTool(picked.id); }
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
  (model.landmarks || []).forEach(function(mk){
    var m = /(\d+)$/.exec(String(mk.id || ''));
    if(m) max = Math.max(max, parseInt(m[1], 10));
  });
  if(_idCounter <= max) _idCounter = max + 1;
}

/* A model saved by an earlier editor still carries the ceiling height;
   it is accepted and ignored, because the height now lives on the saved
   drawing's own snapshot. One saved before landmarks existed simply has none. */
function setModel(m){
  if(!m || typeof m !== 'object' || !Array.isArray(m.walls)) throw new Error('setModel: expected { walls }');
  restoreSnapshot({ walls: m.walls, landmarks: landmarksOfModel(m) });
  undoStack = []; redoStack = [];
  selection = null; dragState = null; toastState = null; confirmState = null;
  lastSettledSegId = null;
  activeTool = armedTool(); justMade = null; refusedTool = false;
  stopFitEase();
  view = null;
  bumpIdCounter();
  render();
}

function destroy(){
  if(destroyed) return;
  destroyed = true;
  stopEdgePan();
  stopFitEase();
  if(zoomHintTimer) win.clearTimeout(zoomHintTimer);
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
  root.classList.remove('fp-placing');
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
  isEmpty: function(){ return model.walls.length === 0; },
  /** an override for the hint line, e.g. while the host is saving */
  setHintState: function(state){ hintState = state || null; render(); },
  /** the engine's keys stand down while the host has a note open */
  setKeysEnabled: function(on){ keysEnabled = !!on; },
  destroy: destroy
};
}

export default mountFloorplan;
