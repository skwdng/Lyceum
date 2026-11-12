const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./AdminLayout-sEv7kvgc.js","./admin-C68Hrkh7.js","./helpers-C9csyb4n.js","./AdminLayout-Dcwc-E51.css","./AdminLogin-DqfZXONu.js","./DashboardView-D36qMKKi.js","./LineChart-CMgoFnhZ.js","./LineChart-mMQnDcD4.css","./DashboardView-C8pX9Oep.css","./AnalyticsView-P18GJnWt.js","./AnalyticsView-BIzlUv8N.css","./ReportsView-CwoNVjQf.js","./UsersView-BbkUDTZ-.js","./UserProfilePop-xzT6T0wh.js","./UserProfilePop-ClBGGcQj.css","./ContentPostsView-DKzvPzg3.js","./ModerationBar-BEA55eLJ.js","./ModerationBar-BRGjagrt.css","./ContentPostsView-DP3z5k04.css","./ContentCommentsView-D5jUv8NY.js","./ContentCommentsView-DibEnM10.css","./VideoAuditView-5pHRGSw_.js","./VideoAuditView-BuU5QJ60.css","./TopicReviewView-BVYKhcCa.js","./TopicReviewView-DF8PIEJZ.css","./AuditView-DqWlUFjU.js","./SettingsView-DkQizUbT.js"])))=>i.map(i=>d[i]);
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
/**
* @vue/shared v3.5.45
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(",")) map[key] = 1;
  return (val) => val in map;
}
const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const NOOP = () => {
};
const NO = () => false;
const isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // uppercase letter
(key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
const isModelListener = (key) => key.startsWith("onUpdate:");
const extend = Object.assign;
const remove = (arr, el) => {
  const i = arr.indexOf(el);
  if (i > -1) {
    arr.splice(i, 1);
  }
};
const hasOwnProperty$1 = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
const isArray$1 = Array.isArray;
const isMap = (val) => toTypeString(val) === "[object Map]";
const isSet = (val) => toTypeString(val) === "[object Set]";
const isDate = (val) => toTypeString(val) === "[object Date]";
const isFunction = (val) => typeof val === "function";
const isString = (val) => typeof val === "string";
const isSymbol = (val) => typeof val === "symbol";
const isObject = (val) => val !== null && typeof val === "object";
const isPromise = (val) => {
  return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
};
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
const isPlainObject$1 = (val) => toTypeString(val) === "[object Object]";
const isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
);
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return ((str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  });
};
const camelizeRE = /-\w/g;
const camelize = /* @__PURE__ */ cacheStringFunction((str) => {
  return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
});
const hyphenateRE = /\B([A-Z])/g;
const hyphenate = /* @__PURE__ */ cacheStringFunction(
  (str) => str.replace(hyphenateRE, "-$1").toLowerCase()
);
const capitalize = /* @__PURE__ */ cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
const toHandlerKey = /* @__PURE__ */ cacheStringFunction((str) => {
  const s = str ? `on${capitalize(str)}` : ``;
  return s;
});
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value
  });
};
const looseToNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? val : n;
};
let _globalThis;
const getGlobalThis = () => {
  return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
function normalizeStyle(value) {
  if (isArray$1(value)) {
    const res = {};
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key];
        }
      }
    }
    return res;
  } else if (isString(value) || isObject(value)) {
    return value;
  }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
  const ret = {};
  cssText.replace(styleCommentRE, (match) => match.startsWith("/*") ? "" : match).split(listDelimiterRE).forEach((item) => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE);
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return ret;
}
function normalizeClass(value) {
  let res = "";
  if (isString(value)) {
    res = value;
  } else if (isArray$1(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + " ";
      }
    }
  }
  return res.trim();
}
const specialBooleanAttrs = `itemscope,allowfullscreen,disablepictureinpicture,disableremoteplayback,formnovalidate,ismap,nomodule,novalidate,playsinline,readonly`;
const isSpecialBooleanAttr = /* @__PURE__ */ makeMap(specialBooleanAttrs);
function includeBooleanAttr(value) {
  return !!value || value === "";
}
function looseCompareArrays(a, b, seen2) {
  if (a.length !== b.length) return false;
  let equal = true;
  for (let i = 0; equal && i < a.length; i++) {
    equal = looseEqual(a[i], b[i], seen2);
  }
  return equal;
}
function looseCompareCollections(a, b, seen2) {
  if (a.size !== b.size) return false;
  const candidates = Array.from(b);
  const matched = new Uint8Array(candidates.length);
  for (const item of a) {
    let index = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (!matched[i] && looseEqual(item, candidates[i], seen2)) {
        index = i;
        break;
      }
    }
    if (index < 0) return false;
    matched[index] = 1;
  }
  return true;
}
function looseCompareObjects(a, b, seen2) {
  let aValidType = isMap(a);
  let bValidType = isMap(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareCollections(a, b, seen2) : false;
  }
  aValidType = isSet(a);
  bValidType = isSet(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareCollections(a, b, seen2) : false;
  }
  const aKeysCount = Object.keys(a).length;
  const bKeysCount = Object.keys(b).length;
  if (aKeysCount !== bKeysCount) {
    return false;
  }
  for (const key in a) {
    const aHasKey = a.hasOwnProperty(key);
    const bHasKey = b.hasOwnProperty(key);
    if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key], seen2)) {
      return false;
    }
  }
  return String(a) === String(b);
}
function looseCompareNested(a, b, seen2, compare) {
  if (!seen2) {
    seen2 = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
  }
  const [seenA, seenB] = seen2;
  if (seenA.has(a) || seenB.has(b)) {
    return seenA.get(a) === b && seenB.get(b) === a;
  }
  seenA.set(a, b);
  seenB.set(b, a);
  const equal = compare(a, b, seen2);
  seenA.delete(a);
  seenB.delete(b);
  return equal;
}
function looseEqual(a, b, seen2) {
  if (a === b) return true;
  let aValidType = isDate(a);
  let bValidType = isDate(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? a.getTime() === b.getTime() : false;
  }
  aValidType = isSymbol(a);
  bValidType = isSymbol(b);
  if (aValidType || bValidType) {
    return a === b;
  }
  aValidType = isArray$1(a);
  bValidType = isArray$1(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareNested(a, b, seen2, looseCompareArrays) : false;
  }
  aValidType = isObject(a);
  bValidType = isObject(b);
  if (aValidType || bValidType) {
    if (!aValidType || !bValidType) {
      return false;
    }
    return looseCompareNested(a, b, seen2, looseCompareObjects);
  }
  return String(a) === String(b);
}
function looseIndexOf(arr, val) {
  return arr.findIndex((item) => looseEqual(item, val));
}
const isRef$1 = (val) => {
  return !!(val && val["__v_isRef"] === true);
};
const toDisplayString = (val) => {
  return isString(val) ? val : val == null ? "" : isArray$1(val) || isObject(val) && (val.toString === objectToString || !isFunction(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
};
const replacer = (_key, val) => {
  if (isRef$1(val)) {
    return replacer(_key, val.value);
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce(
        (entries, [key, val2], i) => {
          entries[stringifySymbol(key, i) + " =>"] = val2;
          return entries;
        },
        {}
      )
    };
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()].map((v) => stringifySymbol(v))
    };
  } else if (isSymbol(val)) {
    return stringifySymbol(val);
  } else if (isObject(val) && !isArray$1(val) && !isPlainObject$1(val)) {
    return String(val);
  }
  return val;
};
const stringifySymbol = (v, i = "") => {
  var _a;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    isSymbol(v) ? `Symbol(${(_a = v.description) != null ? _a : i})` : v
  );
};
/**
* @vue/reactivity v3.5.45
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let activeEffectScope;
class EffectScope {
  // TODO isolatedDeclarations "__v_skip"
  constructor(detached = false) {
    this.detached = detached;
    this._active = true;
    this._on = 0;
    this.effects = [];
    this.cleanups = [];
    this._isPaused = false;
    this._warnOnRun = true;
    this.__v_skip = true;
    if (!detached && activeEffectScope) {
      if (activeEffectScope.active) {
        this.parent = activeEffectScope;
        this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this
        ) - 1;
      } else {
        this._active = false;
        this._warnOnRun = false;
      }
    }
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = true;
      let i, l;
      if (this.scopes) {
        const scopes = this.scopes.slice();
        for (i = 0, l = scopes.length; i < l; i++) {
          scopes[i].pause();
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause();
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i, l;
        if (this.scopes) {
          const scopes = this.scopes.slice();
          for (i = 0, l = scopes.length; i < l; i++) {
            scopes[i].resume();
          }
        }
        const effects = this.effects.slice();
        for (i = 0, l = effects.length; i < l; i++) {
          effects[i].resume();
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (activeEffectScope === this) {
        activeEffectScope = this.prevScope;
      } else {
        let current = activeEffectScope;
        while (current) {
          if (current.prevScope === this) {
            current.prevScope = this.prevScope;
            break;
          }
          current = current.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false;
      let i, l;
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop();
      }
      this.effects.length = 0;
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]();
      }
      this.cleanups.length = 0;
      if (this.scopes) {
        const scopes = this.scopes.slice();
        for (i = 0, l = scopes.length; i < l; i++) {
          scopes[i].stop(true);
        }
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop();
        if (last && last !== this) {
          this.parent.scopes[this.index] = last;
          last.index = this.index;
        }
      }
      this.parent = void 0;
    }
  }
}
function effectScope(detached) {
  return new EffectScope(detached);
}
function getCurrentScope() {
  return activeEffectScope;
}
function onScopeDispose(fn, failSilently = false) {
  if (activeEffectScope) {
    if (activeEffectScope.active) {
      activeEffectScope.cleanups.push(fn);
    } else {
      fn();
    }
  }
}
let activeSub;
const pausedQueueEffects = /* @__PURE__ */ new WeakSet();
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 1 | 4;
    this.next = void 0;
    this.cleanup = void 0;
    this.scheduler = void 0;
    if (activeEffectScope) {
      if (activeEffectScope.active) {
        activeEffectScope.effects.push(this);
      } else {
        this.flags &= -2;
      }
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = void 0;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
}
let batchDepth = 0;
let batchedSub;
let batchedComputed;
function batch(sub, isComputed2 = false) {
  sub.flags |= 8;
  if (isComputed2) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e = batchedComputed;
    batchedComputed = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      e = next;
    }
  }
  let error;
  while (batchedSub) {
    let e = batchedSub;
    batchedSub = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      if (e.flags & 1) {
        try {
          ;
          e.trigger();
        } catch (err) {
          if (!error) error = err;
        }
      }
      e = next;
    }
  }
  if (error) throw error;
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail) tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = void 0;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return;
  }
  computed2.flags &= -17;
  if (computed2.globalVersion === globalVersion) {
    return;
  }
  computed2.globalVersion = globalVersion;
  if (!computed2.isSSR && computed2.flags & 128 && (!computed2.deps && !computed2._dirty || !isDirty(computed2))) {
    return;
  }
  computed2.flags |= 2;
  const dep = computed2.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed2;
  shouldTrack = true;
  try {
    prepareDeps(computed2);
    const value = computed2.fn(computed2._value);
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128;
      computed2._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed2);
    computed2.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = void 0;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = void 0;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = void 0;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = void 0;
  }
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
  const { cleanup } = e;
  e.cleanup = void 0;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = void 0;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
let globalVersion = 0;
class Link {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2;
    this.version = 0;
    this.activeLink = void 0;
    this.subs = void 0;
    this.map = void 0;
    this.key = void 0;
    this.sc = 0;
    this.__v_skip = true;
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = void 0;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (false) ;
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          ;
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
}
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed;
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16;
      for (let l = computed2.deps; l; l = l.nextDep) {
        addSub(l);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail) currentTail.nextSub = link;
    }
    link.dep.subs = link;
  }
}
const targetMap = /* @__PURE__ */ new WeakMap();
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep());
      dep.map = depsMap;
      dep.key = key;
    }
    {
      dep.track();
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      {
        dep.trigger();
      }
    }
  };
  startBatch();
  if (type === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray$1(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function getDepFromReactive(object, key) {
  const depMap = targetMap.get(object);
  return depMap && depMap.get(key);
}
function reactiveReadArray(array) {
  const raw = /* @__PURE__ */ toRaw(array);
  if (raw === array) return raw;
  track(raw, "iterate", ARRAY_ITERATE_KEY);
  if (/* @__PURE__ */ isShallow(array)) return raw;
  if (!/* @__PURE__ */ isReadonly(array)) return raw.map(toReactive);
  return /* @__PURE__ */ isReactive(array) ? raw.map((item) => toReadonly(toReactive(item))) : raw.map(toReadonly);
}
function shallowReadArray(arr) {
  track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => isArray$1(x) ? reactiveReadArray(x) : x)
    );
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, void 0, arguments);
  },
  filter(fn, thisArg) {
    return apply(
      this,
      "filter",
      fn,
      thisArg,
      (v) => v.map((item) => toWrapped(this, item)),
      arguments
    );
  },
  find(fn, thisArg) {
    return apply(
      this,
      "find",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, void 0, arguments);
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      "findLast",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, void 0, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, void 0, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, void 0, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self2, method, wrapValue) {
  const arr = shallowReadArray(self2);
  const methodFn = arr[method];
  const iter = methodFn.call(arr);
  if (arr !== self2 && !/* @__PURE__ */ isShallow(self2)) {
    if (iter[Symbol.toStringTag] === "Array Iterator") {
      const wrapped = Object.create(Object.getPrototypeOf(iter));
      wrapped.next = () => wrapResult(iter.next(), wrapValue);
      if (methodFn !== arrayProto[method]) {
        Object.defineProperties(wrapped, {
          return: {
            get() {
              const fn = iter.return;
              return typeof fn === "function" ? fn.bind(iter) : fn;
            }
          },
          throw: {
            get() {
              const fn = iter.throw;
              return typeof fn === "function" ? fn.bind(iter) : fn;
            }
          }
        });
      }
      return wrapped;
    }
    iter._next = iter.next;
    iter.next = () => wrapResult(iter._next(), wrapValue);
  }
  return iter;
}
function wrapResult(result, wrapValue) {
  if (!result.done) {
    result.value = wrapValue(result.value);
  }
  return result;
}
const arrayProto = Array.prototype;
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  const methodFn = arr[method];
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self2, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function(item, index) {
        return fn.call(this, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index) {
        return fn.call(this, item, index, self2);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method, fn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self2) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function(acc, item, index) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self2, acc);
        }
        return fn.call(this, acc, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, item, index, self2);
      };
    }
  }
  const result = arr[method](wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self2, result) : result;
}
function searchProxy(self2, method, args) {
  const arr = /* @__PURE__ */ toRaw(self2);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method](...args);
  if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
    args[0] = /* @__PURE__ */ toRaw(args[0]);
    return arr[method](...args);
  }
  return res;
}
function noTracking(self2, method, args = []) {
  pauseTracking();
  startBatch();
  const res = (/* @__PURE__ */ toRaw(self2))[method].apply(self2, args);
  endBatch();
  resetTracking();
  return res;
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = /* @__PURE__ */ new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol)
);
function hasOwnProperty(key) {
  if (!isSymbol(key)) key = String(key);
  const obj = /* @__PURE__ */ toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip") return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray$1(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (/* @__PURE__ */ isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject(value) ? /* @__PURE__ */ readonly(value) : value;
    }
    if (isObject(res)) {
      return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
    }
    return res;
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray$1(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
      if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
        oldValue = /* @__PURE__ */ toRaw(oldValue);
        value = /* @__PURE__ */ toRaw(value);
      }
      if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
        if (isOldValueReadonly) {
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(
      target,
      key,
      value,
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (target === /* @__PURE__ */ toRaw(receiver) && result) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(
      target,
      "iterate",
      isArray$1(target) ? "length" : ITERATE_KEY
    );
    return Reflect.ownKeys(target);
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    return true;
  }
  deleteProperty(target, key) {
    return true;
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(true);
const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = /* @__PURE__ */ toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
    const isKeyOnly = method === "keys" && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(
      rawTarget,
      "iterate",
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
    );
    return extend(
      // inheriting all iterator properties
      Object.create(innerIterator),
      {
        // iterator protocol
        next() {
          const { value, done } = innerIterator.next();
          return done ? { value, done } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        }
      }
    );
  };
}
function createReadonlyMethod(type) {
  return function(...args) {
    return type === "delete" ? false : type === "clear" ? void 0 : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend(
    instrumentations,
    readonly2 ? {
      add: createReadonlyMethod("add"),
      set: createReadonlyMethod("set"),
      delete: createReadonlyMethod("delete"),
      clear: createReadonlyMethod("clear")
    } : {
      add(value) {
        const target = /* @__PURE__ */ toRaw(this);
        const proto = getProto(target);
        const rawValue = /* @__PURE__ */ toRaw(value);
        const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
        const hadKey = proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue);
        if (!hadKey) {
          target.add(valueToAdd);
          trigger(target, "add", valueToAdd, valueToAdd);
        }
        return this;
      },
      set(key, value) {
        if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
          value = /* @__PURE__ */ toRaw(value);
        }
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        const oldValue = get.call(target, key);
        target.set(key, value);
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value);
        }
        return this;
      },
      delete(key) {
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        get ? get.call(target, key) : void 0;
        const result = target.delete(key);
        if (hadKey) {
          trigger(target, "delete", key, void 0);
        }
        return result;
      },
      clear() {
        const target = /* @__PURE__ */ toRaw(this);
        const hadItems = target.size !== 0;
        const result = target.clear();
        if (hadItems) {
          trigger(
            target,
            "clear",
            void 0,
            void 0
          );
        }
        return result;
      }
    }
  );
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return shallow;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver
    );
  };
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true)
};
const reactiveMap = /* @__PURE__ */ new WeakMap();
const shallowReactiveMap = /* @__PURE__ */ new WeakMap();
const readonlyMap = /* @__PURE__ */ new WeakMap();
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return target;
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  );
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject(target)) {
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  if (target["__v_skip"] || !Object.isExtensible(target)) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const targetType = targetTypeMap(toRawType(target));
  if (targetType === 0) {
    return target;
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers
  );
  proxyMap.set(target, proxy);
  return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
  if (/* @__PURE__ */ isReadonly(value)) {
    return /* @__PURE__ */ isReactive(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
  const raw = observed && observed["__v_raw"];
  return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
  if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) {
    def(value, "__v_skip", true);
  }
  return value;
}
const toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive(value) : value;
const toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
  return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
  return createRef(value, false);
}
// @__NO_SIDE_EFFECTS__
function shallowRef(value) {
  return createRef(value, true);
}
function createRef(rawValue, shallow) {
  if (/* @__PURE__ */ isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue, shallow);
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep();
    this["__v_isRef"] = true;
    this["__v_isShallow"] = false;
    this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
    this._value = isShallow2 ? value : toReactive(value);
    this["__v_isShallow"] = isShallow2;
  }
  get value() {
    {
      this.dep.track();
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
    newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue;
      this._value = useDirectValue ? newValue : toReactive(newValue);
      {
        this.dep.trigger();
      }
    }
  }
}
function unref(ref2) {
  return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  }
};
function proxyRefs(objectWithRefs) {
  return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
// @__NO_SIDE_EFFECTS__
function toRefs(object) {
  const ret = isArray$1(object) ? new Array(object.length) : {};
  for (const key in object) {
    ret[key] = propertyToRef(object, key);
  }
  return ret;
}
class ObjectRefImpl {
  constructor(_object, key, _defaultValue) {
    this._object = _object;
    this._defaultValue = _defaultValue;
    this["__v_isRef"] = true;
    this._value = void 0;
    this._key = isSymbol(key) ? key : String(key);
    this._raw = /* @__PURE__ */ toRaw(_object);
    let shallow = true;
    let obj = _object;
    if (!isArray$1(_object) || isSymbol(this._key) || !isIntegerKey(this._key)) {
      do {
        shallow = !/* @__PURE__ */ isProxy(obj) || /* @__PURE__ */ isShallow(obj);
      } while (shallow && (obj = obj["__v_raw"]));
    }
    this._shallow = shallow;
  }
  get value() {
    let val = this._object[this._key];
    if (this._shallow) {
      val = unref(val);
    }
    return this._value = val === void 0 ? this._defaultValue : val;
  }
  set value(newVal) {
    if (this._shallow && /* @__PURE__ */ isRef(this._raw[this._key])) {
      const nestedRef = this._object[this._key];
      if (/* @__PURE__ */ isRef(nestedRef)) {
        nestedRef.value = newVal;
        return;
      }
    }
    this._object[this._key] = newVal;
  }
  get dep() {
    return getDepFromReactive(this._raw, this._key);
  }
}
function propertyToRef(source, key, defaultValue) {
  return new ObjectRefImpl(source, key, defaultValue);
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn;
    this.setter = setter;
    this._value = void 0;
    this.dep = new Dep(this);
    this.__v_isRef = true;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 16;
    this.globalVersion = globalVersion - 1;
    this.next = void 0;
    this.effect = this;
    this["__v_isReadonly"] = !setter;
    this.isSSR = isSSR;
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16;
    if (!(this.flags & 8) && // avoid infinite self recursion
    activeSub !== this) {
      batch(this, true);
      return true;
    }
  }
  get value() {
    const link = this.dep.track();
    refreshComputed(this);
    if (link) {
      link.version = this.dep.version;
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    }
  }
}
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter;
  let setter;
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions;
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR);
  return cRef;
}
const INITIAL_WATCHER_VALUE = {};
const cleanupMap = /* @__PURE__ */ new WeakMap();
let activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
  if (owner) {
    let cleanups = cleanupMap.get(owner);
    if (!cleanups) cleanupMap.set(owner, cleanups = []);
    cleanups.push(cleanupFn);
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call } = options;
  const reactiveGetter = (source2) => {
    if (deep) return source2;
    if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1);
    return traverse(source2);
  };
  let effect2;
  let getter;
  let cleanup;
  let boundCleanup;
  let forceTrigger = false;
  let isMultiSource = false;
  if (/* @__PURE__ */ isRef(source)) {
    getter = () => source.value;
    forceTrigger = /* @__PURE__ */ isShallow(source);
  } else if (/* @__PURE__ */ isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (isArray$1(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
    getter = () => source.map((s) => {
      if (/* @__PURE__ */ isRef(s)) {
        return s.value;
      } else if (/* @__PURE__ */ isReactive(s)) {
        return reactiveGetter(s);
      } else if (isFunction(s)) {
        return call ? call(s, 2) : s();
      } else ;
    });
  } else if (isFunction(source)) {
    if (cb) {
      getter = call ? () => call(source, 2) : source;
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking();
          try {
            cleanup();
          } finally {
            resetTracking();
          }
        }
        const currentEffect = activeWatcher;
        activeWatcher = effect2;
        try {
          return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
        } finally {
          activeWatcher = currentEffect;
        }
      };
    }
  } else {
    getter = NOOP;
  }
  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  const scope = getCurrentScope();
  const watchHandle = () => {
    effect2.stop();
    if (scope && scope.active) {
      remove(scope.effects, effect2);
    }
  };
  if (once && cb) {
    const _cb = cb;
    cb = (...args) => {
      try {
        return _cb(...args);
      } finally {
        watchHandle();
      }
    };
  }
  let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
  const job = (immediateFirstRun) => {
    if (!(effect2.flags & 1) || !effect2.dirty && !immediateFirstRun) {
      return;
    }
    if (cb) {
      const newValue = effect2.run();
      if (immediateFirstRun || deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
        const currentWatcher = activeWatcher;
        pauseTracking();
        try {
          if (cleanup) {
            cleanup();
          }
          activeWatcher = effect2;
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
            boundCleanup
          ];
          oldValue = newValue;
          call ? call(cb, 3, args) : (
            // @ts-expect-error
            cb(...args)
          );
        } finally {
          activeWatcher = currentWatcher;
          resetTracking();
        }
      }
    } else {
      effect2.run();
    }
  };
  if (augmentJob) {
    augmentJob(job);
  }
  effect2 = new ReactiveEffect(getter);
  effect2.scheduler = scheduler ? () => scheduler(job, false) : job;
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect2);
  cleanup = effect2.onStop = () => {
    const cleanups = cleanupMap.get(effect2);
    if (cleanups) {
      if (call) {
        call(cleanups, 4);
      } else {
        for (const cleanup2 of cleanups) cleanup2();
      }
      cleanupMap.delete(effect2);
    }
  };
  if (cb) {
    if (immediate) {
      job(true);
    } else {
      oldValue = effect2.run();
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true);
  } else {
    effect2.run();
  }
  watchHandle.pause = effect2.pause.bind(effect2);
  watchHandle.resume = effect2.resume.bind(effect2);
  watchHandle.stop = watchHandle;
  return watchHandle;
}
function traverse(value, depth = Infinity, seen2) {
  if (depth <= 0 || !isObject(value) || value["__v_skip"]) {
    return value;
  }
  seen2 = seen2 || /* @__PURE__ */ new Map();
  if ((seen2.get(value) || 0) >= depth) {
    return value;
  }
  seen2.set(value, depth);
  depth--;
  if (/* @__PURE__ */ isRef(value)) {
    traverse(value.value, depth, seen2);
  } else if (isArray$1(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen2);
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v) => {
      traverse(v, depth, seen2);
    });
  } else if (isPlainObject$1(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen2);
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen2);
      }
    }
  }
  return value;
}
/**
* @vue/runtime-core v3.5.45
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const stack = [];
let isWarning = false;
function warn$1(msg, ...args) {
  if (isWarning) return;
  isWarning = true;
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();
  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map((a) => {
          var _a, _b;
          return (_b = (_a = a.toString) == null ? void 0 : _a.call(a)) != null ? _b : JSON.stringify(a);
        }).join(""),
        instance && instance.proxy,
        trace.map(
          ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`
        ).join("\n"),
        trace
      ]
    );
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];
    if (trace.length && // avoid spamming console during tests
    true) {
      warnArgs.push(`
`, ...formatTrace(trace));
    }
    console.warn(...warnArgs);
  }
  resetTracking();
  isWarning = false;
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];
  if (!currentVNode) {
    return [];
  }
  const normalizedStack = [];
  while (currentVNode) {
    const last = normalizedStack[0];
    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }
    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }
  return normalizedStack;
}
function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i) => {
    logs.push(...i === 0 ? [] : [`
`], ...formatTraceEntry(entry));
  });
  return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot
  )}`;
  const close = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
}
function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]));
  });
  if (keys.length > 3) {
    res.push(` ...`);
  }
  return res;
}
function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (/* @__PURE__ */ isRef(value)) {
    value = formatProp(key, /* @__PURE__ */ toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = /* @__PURE__ */ toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}
function callWithErrorHandling(fn, instance, type, args) {
  try {
    return args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type);
  }
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args);
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type, void 0, true);
      });
    }
    return res;
  }
  if (isArray$1(fn)) {
    const values = [];
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
    }
    return values;
  }
}
function handleError(err, instance, type, throwInDev = true, isAsyncError = false) {
  const contextVNode = instance ? instance.vnode : null;
  const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
  if (instance) {
    let cur = instance.parent;
    const exposedInstance = instance.proxy;
    const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
    while (cur) {
      const errorCapturedHooks = cur.ec;
      if (errorCapturedHooks && !cur.isUnmounted && // Async failures may outlive stopped scopes whose unmount effects
      // are deferred or discarded by Suspense.
      (!isAsyncError || cur.scope.active)) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
            return;
          }
        }
      }
      cur = cur.parent;
    }
    if (errorHandler) {
      pauseTracking();
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo
      ]);
      resetTracking();
      return;
    }
  }
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
  if (throwInProd) {
    throw err;
  } else {
    console.error(err);
  }
}
const queue = [];
let flushIndex = -1;
const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;
const resolvedPromise = /* @__PURE__ */ Promise.resolve();
let currentFlushPromise = null;
function nextTick(fn) {
  const p2 = currentFlushPromise || resolvedPromise;
  return fn ? p2.then(this ? fn.bind(this) : fn) : p2;
}
function findInsertionIndex$1(id) {
  let start2 = flushIndex + 1;
  let end = queue.length;
  while (start2 < end) {
    const middle = start2 + end >>> 1;
    const middleJob = queue[middle];
    const middleJobId = getId(middleJob);
    if (middleJobId < id || middleJobId === id && middleJob.flags & 2) {
      start2 = middle + 1;
    } else {
      end = middle;
    }
  }
  return start2;
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job);
    const lastJob = queue[queue.length - 1];
    if (!lastJob || // fast path when the job id is larger than the tail
    !(job.flags & 2) && jobId >= getId(lastJob)) {
      queue.push(job);
    } else {
      queue.splice(findInsertionIndex$1(jobId), 0, job);
    }
    job.flags |= 1;
    queueFlush();
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
function queuePostFlushCb(cb) {
  if (!isArray$1(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb);
      cb.flags |= 1;
    }
  } else {
    for (let i = 0; i < cb.length; i++) {
      pendingPostFlushCbs.push(cb[i]);
    }
  }
  queueFlush();
}
function flushPreFlushCbs(instance, minUid, seen2, i = flushIndex + 1) {
  for (; i < queue.length; i++) {
    const cb = queue[i];
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid || minUid !== void 0 && !(cb.id >= minUid)) {
        continue;
      }
      queue.splice(i, 1);
      i = instance ? i - 1 : flushIndex;
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      cb();
      if (!(cb.flags & 4)) {
        cb.flags &= -2;
      }
    }
  }
}
function flushPostFlushCbs(seen2, skip, minUid = 0) {
  if (pendingPostFlushCbs.length) {
    let cbs = pendingPostFlushCbs;
    let kept = 0;
    if (skip) {
      cbs = [];
      for (let i = 0; i < pendingPostFlushCbs.length; i++) {
        const cb = pendingPostFlushCbs[i];
        if (cb.i !== void 0 ? !cb.i || cb.i.uid < minUid : skip.has(cb)) {
          pendingPostFlushCbs[kept++] = cb;
        } else {
          cbs.push(cb);
        }
      }
    }
    const deduped = [...new Set(cbs)].sort((a, b) => getId(a) - getId(b));
    pendingPostFlushCbs.length = kept;
    if (activePostFlushCbs) {
      for (let i = 0; i < deduped.length; i++) {
        activePostFlushCbs.push(deduped[i]);
      }
      return;
    }
    activePostFlushCbs = deduped;
    for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
      const cb = activePostFlushCbs[postFlushIndex];
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      if (!(cb.flags & 8)) cb();
      cb.flags &= -2;
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
let isFlushing = false;
function flushOnAppMount(fn, minUid) {
  if (isFlushing) {
    fn();
    return;
  }
  const queued = minUid === void 0 ? void 0 : new Set(pendingPostFlushCbs);
  fn();
  isFlushing = true;
  try {
    flushPreFlushCbs(void 0, minUid);
    flushPostFlushCbs(void 0, queued, minUid);
  } finally {
    isFlushing = false;
  }
}
const getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen2) {
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && !(job.flags & 8)) {
        if (false) ;
        if (job.flags & 4) {
          job.flags &= ~1;
        }
        callWithErrorHandling(
          job,
          job.i,
          job.i ? 15 : 14
        );
        if (!(job.flags & 4)) {
          job.flags &= ~1;
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job) {
        job.flags &= -2;
      }
    }
    flushIndex = -1;
    queue.length = 0;
    flushPostFlushCbs();
    currentFlushPromise = null;
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs();
    }
  }
}
let currentRenderingInstance = null;
let currentScopeId = null;
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance;
  currentRenderingInstance = instance;
  currentScopeId = instance && instance.type.__scopeId || null;
  return prev;
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn;
  if (fn._n) {
    return fn;
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1);
    }
    const prevInstance = setCurrentRenderingInstance(ctx);
    const prevStackSize = blockStack.length;
    let res;
    try {
      res = fn(...args);
    } finally {
      for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
      setCurrentRenderingInstance(prevInstance);
      if (renderFnWithContext._d) {
        setBlockTracking(1);
      }
    }
    return res;
  };
  renderFnWithContext._n = true;
  renderFnWithContext._c = true;
  renderFnWithContext._d = true;
  return renderFnWithContext;
}
function withDirectives(vnode, directives) {
  if (currentRenderingInstance === null) {
    return vnode;
  }
  const instance = getComponentPublicInstance(currentRenderingInstance);
  const bindings = vnode.dirs || (vnode.dirs = []);
  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];
    if (dir) {
      if (isFunction(dir)) {
        dir = {
          mounted: dir,
          updated: dir
        };
      }
      if (dir.deep) {
        traverse(value);
      }
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers
      });
    }
  }
  return vnode;
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  let hookVNode = vnode;
  if (name === "beforeMount") {
    vnode._mount = vnode;
  } else if (name === "beforeUpdate") {
    const mount = prevVNode && prevVNode._mount;
    if (mount) {
      mount._latest = vnode;
      vnode._mount = mount;
    }
  } else if (name === "mounted") {
    const latest = vnode._latest;
    vnode._mount = vnode._latest = void 0;
    if (latest) {
      hookVNode = latest;
      latest._mount = void 0;
    }
  }
  const bindings = hookVNode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;
  for (let i = 0; i < bindings.length; i++) {
    let binding = bindings[i];
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value;
    } else if (name === "mounted" && binding.oldValue !== void 0) {
      binding = extend({}, binding, { oldValue: void 0 });
    }
    let hook = binding.dir[name];
    if (hook) {
      pauseTracking();
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        hookVNode,
        prevVNode
      ]);
      resetTracking();
    }
  }
}
function provide(key, value) {
  if (currentInstance) {
    let provides = currentInstance.provides;
    const parentProvides = currentInstance.parent && currentInstance.parent.provides;
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    }
    provides[key] = value;
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance();
  if (instance || currentApp) {
    let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
    if (provides && key in provides) {
      return provides[key];
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
    } else ;
  }
}
function hasInjectionContext() {
  return !!(getCurrentInstance() || currentApp);
}
const ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);
    return ctx;
  }
};
function watch(source, cb, options) {
  return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options;
  const baseWatchOptions = extend({}, options);
  const runsImmediately = cb && immediate || !cb && flush !== "post";
  let ssrCleanup;
  if (isInSSRComponentSetup) {
    if (flush === "sync") {
      const ctx = useSSRContext();
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
    } else if (!runsImmediately) {
      const watchStopHandle = () => {
      };
      watchStopHandle.stop = NOOP;
      watchStopHandle.resume = NOOP;
      watchStopHandle.pause = NOOP;
      return watchStopHandle;
    }
  }
  const instance = currentInstance;
  baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
  let isPre = false;
  if (flush === "post") {
    baseWatchOptions.scheduler = (job) => {
      job.i = instance;
      queuePostRenderEffect(job, instance && instance.suspense);
    };
  } else if (flush !== "sync") {
    isPre = true;
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job();
      } else {
        queueJob(job);
      }
    };
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4;
    }
    if (isPre) {
      job.flags |= 2;
      if (instance) {
        job.id = instance.uid;
        job.i = instance;
      }
    }
  };
  const watchHandle = watch$1(source, cb, baseWatchOptions);
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle);
    } else if (runsImmediately) {
      watchHandle();
    }
  }
  return watchHandle;
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy;
  const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
  let cb;
  if (isFunction(value)) {
    cb = value;
  } else {
    cb = value.handler;
    options = value;
  }
  const reset = setCurrentInstance(this);
  const res = doWatch(getter, cb.bind(publicThis), options);
  reset();
  return res;
}
function createPathGetter(ctx, path) {
  const segments = path.split(".");
  return () => {
    let cur = ctx;
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]];
    }
    return cur;
  };
}
const TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
const isTeleport = (type) => type.__isTeleport;
const leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
function findNonCommentChild(children) {
  let child = children[0];
  if (children.length > 1) {
    for (const c of children) {
      if (c.type !== Comment) {
        child = c;
        break;
      }
    }
  }
  return child;
}
function getInnerChild$1(vnode) {
  if (!isKeepAlive(vnode)) {
    if (isTeleport(vnode.type) && vnode.children) {
      return findNonCommentChild(vnode.children);
    }
    return vnode;
  }
  if (vnode.component) {
    return vnode.component.subTree;
  }
  const { shapeFlag, children } = vnode;
  if (children) {
    if (shapeFlag & 16) {
      return children[0];
    }
    if (shapeFlag & 32 && isFunction(children.default)) {
      return children.default();
    }
  }
}
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks;
    const subTree = vnode.component.subTree;
    setTransitionHooks(
      isTeleport(subTree.type) ? getInnerChild$1(subTree) || subTree : subTree,
      hooks
    );
  } else if (vnode.shapeFlag & 128) {
    const suspense = vnode.suspense;
    if (suspense) {
      const branch = suspense.isHydrating ? suspense.pendingBranch : suspense.activeBranch;
      if (branch) {
        setTransitionHooks(branch, hooks.clone(branch));
      }
    } else {
      vnode.ssContent.transition = hooks.clone(vnode.ssContent);
      vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
    }
  } else {
    vnode.transition = hooks;
    if (vnode.type === Fragment && isArray$1(vnode.children)) {
      const child = filterSingleRoot(vnode.children, false);
      if (child) {
        setTransitionHooks(child, hooks);
      }
    }
  }
}
function getTransitionRoot(vnode) {
  if (vnode.component) {
    return getTransitionRoot(vnode.component.subTree);
  }
  if (vnode.type === Fragment) {
    const child = isArray$1(vnode.children) && filterSingleRoot(vnode.children, false);
    return child ? getTransitionRoot(child) : void 0;
  }
  if (vnode.type !== Comment) {
    return vnode;
  }
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction(options) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    /* @__PURE__ */ (() => extend({ name: options.name }, extraOptions, { setup: options }))()
  ) : options;
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + "-", 0, 0];
}
function isTemplateRefKey(refs, key) {
  let desc;
  return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
}
const pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray$1(rawRef)) {
    rawRef.forEach(
      (r, i) => setRef(
        r,
        oldRawRef && (isArray$1(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount
      )
    );
    return;
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
    }
    return;
  }
  const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
  const value = isUnmount ? null : refValue;
  const { i: owner, r: ref3 } = rawRef;
  const oldRef = oldRawRef && oldRawRef.r;
  const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
  const setupState = owner.setupState;
  const rawSetupState = /* @__PURE__ */ toRaw(setupState);
  const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
    if (isTemplateRefKey(refs, key)) {
      return false;
    }
    return hasOwn(rawSetupState, key);
  };
  const canSetRef = (ref22, key) => {
    if (key && isTemplateRefKey(refs, key)) {
      return false;
    }
    return true;
  };
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef);
    if (isString(oldRef)) {
      refs[oldRef] = null;
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null;
      }
    } else if (/* @__PURE__ */ isRef(oldRef)) {
      const oldRawRefAtom = oldRawRef;
      if (canSetRef(oldRef, oldRawRefAtom.k)) {
        oldRef.value = null;
      }
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
    }
  }
  if (isFunction(ref3)) {
    callWithErrorHandling(ref3, owner, 12, [value, refs]);
  } else {
    const _isString = isString(ref3);
    const _isRef = /* @__PURE__ */ isRef(ref3);
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString ? canSetSetupRef(ref3) ? setupState[ref3] : refs[ref3] : canSetRef() || !rawRef.k ? ref3.value : refs[rawRef.k];
          if (isUnmount) {
            isArray$1(existing) && remove(existing, refValue);
          } else {
            if (!isArray$1(existing)) {
              if (_isString) {
                refs[ref3] = [refValue];
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3];
                }
              } else {
                const newVal = [refValue];
                if (canSetRef(ref3, rawRef.k)) {
                  ref3.value = newVal;
                }
                if (rawRef.k) refs[rawRef.k] = newVal;
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue);
            }
          }
        } else if (_isString) {
          refs[ref3] = value;
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value;
          }
        } else if (_isRef) {
          if (canSetRef(ref3, rawRef.k)) {
            ref3.value = value;
          }
          if (rawRef.k) refs[rawRef.k] = value;
        } else ;
      };
      if (value) {
        const job = () => {
          doSet();
          pendingSetRefMap.delete(rawRef);
        };
        job.id = -1;
        pendingSetRefMap.set(rawRef, job);
        queuePostRenderEffect(job, parentSuspense);
      } else {
        invalidatePendingSetRef(rawRef);
        doSet();
      }
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef);
  if (pendingSetRef) {
    pendingSetRef.flags |= 8;
    pendingSetRefMap.delete(rawRef);
  }
}
getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1));
getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id));
const isAsyncWrapper = (i) => !!i.type.__asyncLoader;
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    let current = target;
    while (current) {
      if (current.isDeactivated) {
        return;
      }
      current = current.parent;
    }
    return hook();
  });
  injectHook(type, wrappedHook, target);
  if (target) {
    let current = target.parent;
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current);
      }
      current = current.parent;
    }
  }
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  const injected = injectHook(
    type,
    hook,
    keepAliveRoot,
    true
    /* prepend */
  );
  const removal = injectHook(
    "um",
    () => remove(keepAliveRoot[type], injected),
    target
  );
  removal.flags = 16;
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = []);
    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      pauseTracking();
      const reset = setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type, args);
      reset();
      resetTracking();
      return res;
    });
    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
    return wrappedHook;
  }
}
const createHook = (lifecycle) => (hook, target = currentInstance) => {
  if (!isInSSRComponentSetup || lifecycle === "sp") {
    injectHook(lifecycle, (...args) => hook(...args), target);
  }
};
const onBeforeMount = createHook("bm");
const onMounted = createHook("m");
const onBeforeUpdate = createHook(
  "bu"
);
const onUpdated = createHook("u");
const onBeforeUnmount = createHook(
  "bum"
);
const onUnmounted = createHook("um");
const onServerPrefetch = createHook(
  "sp"
);
const onRenderTriggered = createHook("rtg");
const onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
  injectHook("ec", hook, target);
}
const COMPONENTS = "components";
function resolveComponent(name, maybeSelfReference) {
  return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name;
}
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
function resolveAsset(type, name, warnMissing = true, maybeSelfReference = false) {
  const instance = currentRenderingInstance || currentInstance;
  if (instance) {
    const Component = instance.type;
    {
      const selfName = getComponentName(
        Component,
        false
      );
      if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) {
        return Component;
      }
    }
    const res = (
      // local registration
      // check instance[type] first which is resolved for options API
      resolve(instance[type] || Component[type], name) || // global registration
      resolve(instance.appContext[type], name)
    );
    if (!res && maybeSelfReference) {
      return Component;
    }
    return res;
  }
}
function resolve(registry, name) {
  return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
}
function renderList(source, renderItem, cache, index) {
  let ret;
  const cached = cache;
  const sourceIsArray = isArray$1(source);
  if (sourceIsArray || isString(source)) {
    const sourceIsReactiveArray = sourceIsArray && /* @__PURE__ */ isReactive(source);
    let needsWrap = false;
    let isReadonlySource = false;
    if (sourceIsReactiveArray) {
      needsWrap = !/* @__PURE__ */ isShallow(source);
      isReadonlySource = /* @__PURE__ */ isReadonly(source);
      source = shallowReadArray(source);
    }
    ret = new Array(source.length);
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(
        needsWrap ? isReadonlySource ? toReadonly(toReactive(source[i])) : toReactive(source[i]) : source[i],
        i,
        void 0,
        cached
      );
    }
  } else if (typeof source === "number") {
    if (!Number.isInteger(source) || source < 0) {
      ret = [];
    } else {
      ret = new Array(source);
      for (let i = 0; i < source; i++) {
        ret[i] = renderItem(i + 1, i, void 0, cached);
      }
    }
  } else if (isObject(source)) {
    if (source[Symbol.iterator]) {
      ret = Array.from(
        source,
        (item, i) => renderItem(item, i, void 0, cached)
      );
    } else {
      const keys = Object.keys(source);
      ret = new Array(keys.length);
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i];
        ret[i] = renderItem(source[key], key, i, cached);
      }
    }
  } else {
    ret = [];
  }
  return ret;
}
function renderSlot(slots, name, props, fallback, noSlotted, branchKey) {
  if (props == null) props = {};
  if (currentRenderingInstance.ce || currentRenderingInstance.parent && isAsyncWrapper(currentRenderingInstance.parent) && currentRenderingInstance.parent.ce) {
    const slotProps = props.key == null ? extend({}, props, { key: branchKey }) : props;
    const hasProps = Object.keys(slotProps).length > 0;
    return openBlock(), createBlock(
      Fragment,
      null,
      [createVNode("slot", slotProps, fallback)],
      hasProps ? -2 : 64
    );
  }
  let slot = slots[name];
  if (slot && slot._c) {
    slot._d = false;
  }
  const prevStackSize = blockStack.length;
  openBlock();
  let rendered;
  try {
    const validSlotContent = slot && ensureValidVNode(slot(props));
    const slotKey = props.key || branchKey || // slot content array of a dynamic conditional slot may have a branch
    // key attached in the `createSlots` helper, respect that
    validSlotContent && validSlotContent.key;
    rendered = createBlock(
      Fragment,
      {
        key: (slotKey && !isSymbol(slotKey) ? slotKey : `_${name}`) + // #7256 force differentiate fallback content from actual content
        (!validSlotContent && fallback ? "_fb" : "")
      },
      validSlotContent || (fallback ? fallback() : []),
      validSlotContent && slots._ === 1 ? 64 : -2
    );
  } catch (err) {
    for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
    throw err;
  } finally {
    if (slot && slot._c) {
      slot._d = true;
    }
  }
  return rendered;
}
function ensureValidVNode(vnodes) {
  return vnodes.some((child) => {
    if (!isVNode(child)) return true;
    if (child.type === Comment) return false;
    if (child.type === Fragment && !ensureValidVNode(child.children))
      return false;
    return true;
  }) ? vnodes : null;
}
const getPublicInstance = (i) => {
  if (!i) return null;
  if (isStatefulComponent(i)) return getComponentPublicInstance(i);
  return getPublicInstance(i.parent);
};
const publicPropertiesMap = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
    $: (i) => i,
    $el: (i) => i.vnode.el,
    $data: (i) => i.data,
    $props: (i) => i.props,
    $attrs: (i) => i.attrs,
    $slots: (i) => i.slots,
    $refs: (i) => i.refs,
    $parent: (i) => getPublicInstance(i.parent),
    $root: (i) => getPublicInstance(i.root),
    $host: (i) => i.ce,
    $emit: (i) => i.emit,
    $options: (i) => resolveMergedOptions(i),
    $forceUpdate: (i) => i.f || (i.f = () => {
      queueJob(i.update);
    }),
    $nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
    $watch: (i) => instanceWatch.bind(i)
  })
);
const hasSetupBinding = (state2, key) => state2 !== EMPTY_OBJ && !state2.__isScriptSetup && hasOwn(state2, key);
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === "__v_skip") {
      return true;
    }
    const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
    if (key[0] !== "$") {
      const n = accessCache[key];
      if (n !== void 0) {
        switch (n) {
          case 1:
            return setupState[key];
          case 2:
            return data[key];
          case 4:
            return ctx[key];
          case 3:
            return props[key];
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1;
        return setupState[key];
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2;
        return data[key];
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4;
        return ctx[key];
      } else if (shouldCacheAccess) {
        accessCache[key] = 0;
      }
    }
    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties;
    if (publicGetter) {
      if (key === "$attrs") {
        track(instance.attrs, "get", "");
      }
      return publicGetter(instance);
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) && (cssModule = cssModule[key])
    ) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4;
      return ctx[key];
    } else if (
      // global properties
      globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)
    ) {
      {
        return globalProperties[key];
      }
    } else ;
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance;
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value;
      return true;
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
      return true;
    } else if (hasOwn(instance.props, key)) {
      return false;
    }
    if (key[0] === "$" && key.slice(1) in instance) {
      return false;
    } else {
      {
        ctx[key] = value;
      }
    }
    return true;
  },
  has({
    _: { data, setupState, accessCache, ctx, appContext, props, type }
  }, key) {
    let cssModules;
    return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0;
    } else if (hasOwn(descriptor, "value")) {
      this.set(target, key, descriptor.value, null);
    }
    return Reflect.defineProperty(target, key, descriptor);
  }
};
function normalizePropsOrEmits(props) {
  return isArray$1(props) ? props.reduce(
    (normalized, p2) => (normalized[p2] = null, normalized),
    {}
  ) : props;
}
let shouldCacheAccess = true;
function applyOptions(instance) {
  const options = resolveMergedOptions(instance);
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  shouldCacheAccess = false;
  if (options.beforeCreate) {
    callHook(options.beforeCreate, instance, "bc");
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters
  } = options;
  const checkDuplicateProperties = null;
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties);
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];
      if (isFunction(methodHandler)) {
        {
          ctx[key] = methodHandler.bind(publicThis);
        }
      }
    }
  }
  if (dataOptions) {
    const data = dataOptions.call(publicThis, publicThis);
    if (!isObject(data)) ;
    else {
      instance.data = /* @__PURE__ */ reactive(data);
    }
  }
  shouldCacheAccess = true;
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      const set = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP;
      const c = computed({
        get,
        set
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: (v) => c.value = v
      });
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key);
    }
  }
  if (provideOptions) {
    const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key]);
    });
  }
  if (created) {
    callHook(created, instance, "c");
  }
  function registerLifecycleHook(register, hook) {
    if (isArray$1(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)));
    } else if (hook) {
      register(hook.bind(publicThis));
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
  registerLifecycleHook(onBeforeUpdate, beforeUpdate);
  registerLifecycleHook(onUpdated, updated);
  registerLifecycleHook(onActivated, activated);
  registerLifecycleHook(onDeactivated, deactivated);
  registerLifecycleHook(onErrorCaptured, errorCaptured);
  registerLifecycleHook(onRenderTracked, renderTracked);
  registerLifecycleHook(onRenderTriggered, renderTriggered);
  registerLifecycleHook(onBeforeUnmount, beforeUnmount);
  registerLifecycleHook(onUnmounted, unmounted);
  registerLifecycleHook(onServerPrefetch, serverPrefetch);
  if (isArray$1(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {});
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => publicThis[key] = val,
          enumerable: true
        });
      });
    } else if (!instance.exposed) {
      instance.exposed = {};
    }
  }
  if (render && instance.render === NOOP) {
    instance.render = render;
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs;
  }
  if (components) instance.components = components;
  if (directives) instance.directives = directives;
  if (serverPrefetch) {
    markAsyncBoundary(instance);
  }
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
  if (isArray$1(injectOptions)) {
    injectOptions = normalizeInject(injectOptions);
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key];
    let injected;
    if (isObject(opt)) {
      if ("default" in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true
        );
      } else {
        injected = inject(opt.from || key);
      }
    } else {
      injected = inject(opt);
    }
    if (/* @__PURE__ */ isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v) => injected.value = v
      });
    } else {
      ctx[key] = injected;
    }
  }
}
function callHook(hook, instance, type) {
  callWithAsyncErrorHandling(
    isArray$1(hook) ? hook.map((h2) => h2.bind(instance.proxy)) : hook.bind(instance.proxy),
    instance,
    type
  );
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
  if (isString(raw)) {
    const handler = ctx[raw];
    if (isFunction(handler)) {
      {
        watch(getter, handler);
      }
    }
  } else if (isFunction(raw)) {
    {
      watch(getter, raw.bind(publicThis));
    }
  } else if (isObject(raw)) {
    if (isArray$1(raw)) {
      raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
    } else {
      const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
      if (isFunction(handler)) {
        watch(getter, handler, raw);
      }
    }
  } else ;
}
function resolveMergedOptions(instance) {
  const base = instance.type;
  const { mixins, extends: extendsOptions } = base;
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies }
  } = instance.appContext;
  const cached = cache.get(base);
  let resolved;
  if (cached) {
    resolved = cached;
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base;
    }
  } else {
    resolved = {};
    if (globalMixins.length) {
      globalMixins.forEach(
        (m) => mergeOptions$1(resolved, m, optionMergeStrategies, true)
      );
    }
    mergeOptions$1(resolved, base, optionMergeStrategies);
  }
  if (isObject(base)) {
    cache.set(base, resolved);
  }
  return resolved;
}
function mergeOptions$1(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from;
  if (extendsOptions) {
    mergeOptions$1(to, extendsOptions, strats, true);
  }
  if (mixins) {
    mixins.forEach(
      (m) => mergeOptions$1(to, m, strats, true)
    );
  }
  for (const key in from) {
    if (asMixin && key === "expose") ;
    else {
      const strat = internalOptionMergeStrats[key] || strats && strats[key];
      to[key] = strat ? strat(to[key], from[key]) : from[key];
    }
  }
  return to;
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject
};
function mergeDataFn(to, from) {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  return function mergedDataFn() {
    return extend(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from
    );
  };
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
  if (isArray$1(raw)) {
    const res = {};
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i];
    }
    return res;
  }
  return raw;
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
  return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray$1(to) && isArray$1(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])];
    }
    return extend(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {})
    );
  } else {
    return from;
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from;
  if (!from) return to;
  const merged = extend(/* @__PURE__ */ Object.create(null), to);
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key]);
  }
  return merged;
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let uid$1 = 0;
function createAppAPI(render, hydrate) {
  return function createApp2(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent);
    }
    if (rootProps != null && !isObject(rootProps)) {
      rootProps = null;
    }
    const context = createAppContext();
    const installedPlugins = /* @__PURE__ */ new WeakSet();
    const pluginCleanupFns = [];
    let isMounted = false;
    const app2 = context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config;
      },
      set config(v) {
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) ;
        else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app2, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app2, ...options);
        } else ;
        return app2;
      },
      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          }
        }
        return app2;
      },
      component(name, component) {
        if (!component) {
          return context.components[name];
        }
        context.components[name] = component;
        return app2;
      },
      directive(name, directive) {
        if (!directive) {
          return context.directives[name];
        }
        context.directives[name] = directive;
        return app2;
      },
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          const vnode = app2._ceVNode || createVNode(rootComponent, rootProps);
          vnode.appContext = context;
          if (namespace === true) {
            namespace = "svg";
          } else if (namespace === false) {
            namespace = void 0;
          }
          {
            render(vnode, rootContainer, namespace);
          }
          isMounted = true;
          app2._container = rootContainer;
          rootContainer.__vue_app__ = app2;
          return getComponentPublicInstance(vnode.component);
        }
      },
      onUnmount(cleanupFn) {
        pluginCleanupFns.push(cleanupFn);
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app2._instance,
            16
          );
          render(null, app2._container);
          delete app2._container.__vue_app__;
        }
      },
      provide(key, value) {
        context.provides[key] = value;
        return app2;
      },
      runWithContext(fn) {
        const lastApp = currentApp;
        currentApp = app2;
        try {
          return fn();
        } finally {
          currentApp = lastApp;
        }
      }
    };
    return app2;
  };
}
let currentApp = null;
const getModelModifiers = (props, modelName) => {
  return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event, ...rawArgs) {
  if (instance.isUnmounted) return;
  const props = instance.vnode.props || EMPTY_OBJ;
  let args = rawArgs;
  const isModelListener2 = event.startsWith("update:");
  const modifiers = isModelListener2 && getModelModifiers(props, event.slice(7));
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a) => isString(a) ? a.trim() : a);
    }
    if (modifiers.number) {
      args = args.map(looseToNumber);
    }
  }
  let handlerName;
  let handler = props[handlerName = toHandlerKey(event)] || // also try camelCase event handler (#2249)
  props[handlerName = toHandlerKey(camelize(event))];
  if (!handler && isModelListener2) {
    handler = props[handlerName = toHandlerKey(hyphenate(event))];
  }
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      6,
      args
    );
  }
  const onceHandler = props[handlerName + `Once`];
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {};
    } else if (instance.emitted[handlerName]) {
      return;
    }
    instance.emitted[handlerName] = true;
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      6,
      args
    );
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
  const cached = cache.get(comp);
  if (cached !== void 0) {
    return cached;
  }
  const raw = comp.emits;
  let normalized = {};
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
      if (normalizedFromExtend) {
        hasExtends = true;
        extend(normalized, normalizedFromExtend);
      }
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits);
    }
    if (comp.extends) {
      extendEmits(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null);
    }
    return null;
  }
  if (isArray$1(raw)) {
    raw.forEach((key) => normalized[key] = null);
  } else {
    extend(normalized, raw);
  }
  if (isObject(comp)) {
    cache.set(comp, normalized);
  }
  return normalized;
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false;
  }
  key = key.slice(2);
  key = key === "Once" ? key : key.replace(/Once$/, "");
  return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
function markAttrsAccessed() {
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit2,
    render,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs
  } = instance;
  const prev = setCurrentRenderingInstance(instance);
  let result;
  let fallthroughAttrs;
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy;
      const thisProxy = false ? new Proxy(proxyToUse, {
        get(target, key, receiver) {
          warn$1(
            `Property '${String(
              key
            )}' was accessed via 'this'. Avoid using 'this' in templates.`
          );
          return Reflect.get(target, key, receiver);
        }
      }) : proxyToUse;
      result = normalizeVNode(
        render.call(
          thisProxy,
          proxyToUse,
          renderCache,
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          setupState,
          data,
          ctx
        )
      );
      fallthroughAttrs = attrs;
    } else {
      const render2 = Component;
      if (false) ;
      result = normalizeVNode(
        render2.length > 1 ? render2(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          false ? {
            get attrs() {
              markAttrsAccessed();
              return /* @__PURE__ */ shallowReadonly(attrs);
            },
            slots,
            emit: emit2
          } : { attrs, slots, emit: emit2 }
        ) : render2(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          null
        )
      );
      fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
    }
  } catch (err) {
    blockStack.length = 0;
    handleError(err, instance, 1);
    result = createVNode(Comment);
  }
  let root = result;
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs);
    const { shapeFlag } = root;
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions
          );
        }
        root = cloneVNode(root, fallthroughAttrs, false, true);
      }
    }
  }
  if (vnode.dirs) {
    root = cloneVNode(root, null, false, true);
    root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
  }
  if (vnode.transition) {
    const child = isTeleport(root.type) ? getInnerChild$1(root) || root : root;
    setTransitionHooks(child, vnode.transition);
  }
  {
    result = root;
  }
  setCurrentRenderingInstance(prev);
  return result;
}
function filterSingleRoot(children, recurse = true) {
  let singleRoot;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (isVNode(child)) {
      if (child.type !== Comment || child.children === "v-if") {
        if (singleRoot) {
          return;
        } else {
          singleRoot = child;
        }
      }
    } else {
      return;
    }
  }
  return singleRoot;
}
const getFunctionalFallthrough = (attrs) => {
  let res;
  for (const key in attrs) {
    if (key === "class" || key === "style" || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }
  return res;
};
const filterModelListeners = (attrs, props) => {
  const res = {};
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key];
    }
  }
  return res;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode;
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
  const emits = component.emitsOptions;
  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true;
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps;
      }
      return hasPropsChanged(prevProps, nextProps, emits);
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps;
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i];
        if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) {
          return true;
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }
    if (prevProps === nextProps) {
      return false;
    }
    if (!prevProps) {
      return !!nextProps;
    }
    if (!nextProps) {
      return true;
    }
    return hasPropsChanged(prevProps, nextProps, emits);
  }
  return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (!hasOwn(prevProps, key) || hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) {
      return true;
    }
  }
  return false;
}
function hasPropValueChanged(nextProps, prevProps, key) {
  const nextProp = nextProps[key];
  const prevProp = prevProps[key];
  if (key === "style" && isObject(nextProp) && isObject(prevProp)) {
    return !looseEqual(nextProp, prevProp);
  }
  return nextProp !== prevProp;
}
function updateHOCHostEl({ vnode, parent, suspense }, el) {
  while (parent) {
    const root = parent.subTree;
    if (root.suspense && root.suspense.activeBranch === vnode) {
      root.suspense.vnode.el = root.el = el;
      vnode = root;
    }
    if (root === vnode) {
      (vnode = parent.vnode).el = el;
      parent = parent.parent;
    } else {
      break;
    }
  }
  if (suspense && suspense.activeBranch === vnode) {
    suspense.vnode.el = el;
  }
}
const internalObjectProto = {};
const createInternalObject = () => Object.create(internalObjectProto);
const isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {};
  const attrs = createInternalObject();
  instance.propsDefaults = /* @__PURE__ */ Object.create(null);
  setFullProps(instance, rawProps, props, attrs);
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0;
    }
  }
  if (isStateful) {
    instance.props = isSSR ? props : /* @__PURE__ */ shallowReactive(props);
  } else {
    if (!instance.type.props) {
      instance.props = attrs;
    } else {
      instance.props = props;
    }
  }
  instance.attrs = attrs;
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance;
  const rawCurrentProps = /* @__PURE__ */ toRaw(props);
  const [options] = instance.propsOptions;
  let hasAttrsChanged = false;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (optimized || patchFlag > 0) && !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps;
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i];
        if (isEmitListener(instance.emitsOptions, key)) {
          continue;
        }
        const value = rawProps[key];
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value;
              hasAttrsChanged = true;
            }
          } else {
            const camelizedKey = camelize(key);
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false
            );
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value;
            hasAttrsChanged = true;
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true;
    }
    let kebabKey;
    for (const key in rawCurrentProps) {
      if (!rawProps || // for camelCase
      !hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && // for camelCase
          (rawPrevProps[key] !== void 0 || // for kebab-case
          rawPrevProps[kebabKey] !== void 0)) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true
            );
          }
        } else {
          delete props[key];
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key) && true) {
          delete attrs[key];
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, "set", "");
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions;
  let hasAttrsChanged = false;
  let rawCastValues;
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue;
      }
      const value = rawProps[key];
      let camelKey;
      if (options && hasOwn(options, camelKey = camelize(key))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value;
        } else {
          (rawCastValues || (rawCastValues = {}))[camelKey] = value;
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value;
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = /* @__PURE__ */ toRaw(props);
    const castValues = rawCastValues || EMPTY_OBJ;
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i];
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key)
      );
    }
  }
  return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key];
  if (opt != null) {
    const hasDefault = hasOwn(opt, "default");
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default;
      if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
        const { propsDefaults } = instance;
        if (key in propsDefaults) {
          value = propsDefaults[key];
        } else {
          const reset = setCurrentInstance(instance);
          value = propsDefaults[key] = defaultValue.call(
            null,
            props
          );
          reset();
        }
      } else {
        value = defaultValue;
      }
      if (instance.ce) {
        instance.ce._setProp(key, value);
      }
    }
    if (opt[
      0
      /* shouldCast */
    ]) {
      if (isAbsent && !hasDefault) {
        value = false;
      } else if (opt[
        1
        /* shouldCastTrue */
      ] && (value === "" || value === hyphenate(key))) {
        value = true;
      }
    }
  }
  return value;
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinPropsCache : appContext.propsCache;
  const cached = cache.get(comp);
  if (cached) {
    return cached;
  }
  const raw = comp.props;
  const normalized = {};
  const needCastKeys = [];
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true;
      const [props, keys] = normalizePropsOptions(raw2, appContext, true);
      extend(normalized, props);
      if (keys) needCastKeys.push(...keys);
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps);
    }
    if (comp.extends) {
      extendProps(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR);
    }
    return EMPTY_ARR;
  }
  if (isArray$1(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const normalizedKey = camelize(raw[i]);
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else if (raw) {
    for (const key in raw) {
      const normalizedKey = camelize(key);
      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray$1(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
        const propType = prop.type;
        let shouldCast = false;
        let shouldCastTrue = true;
        if (isArray$1(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index];
            const typeName2 = isFunction(type) && type.name;
            if (typeName2 === "Boolean") {
              shouldCast = true;
              break;
            } else if (typeName2 === "String") {
              shouldCastTrue = false;
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === "Boolean";
        }
        prop[
          0
          /* shouldCast */
        ] = shouldCast;
        prop[
          1
          /* shouldCastTrue */
        ] = shouldCastTrue;
        if (shouldCast || hasOwn(prop, "default")) {
          needCastKeys.push(normalizedKey);
        }
      }
    }
  }
  const res = [normalized, needCastKeys];
  if (isObject(comp)) {
    cache.set(comp, res);
  }
  return res;
}
function validatePropName(key) {
  if (key[0] !== "$" && !isReservedProp(key)) {
    return true;
  }
  return false;
}
const isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
const normalizeSlotValue = (value) => isArray$1(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
const normalizeSlot$1 = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot;
  }
  const normalized = withCtx((...args) => {
    if (false) ;
    return normalizeSlotValue(rawSlot(...args));
  }, ctx);
  normalized._c = false;
  return normalized;
};
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx;
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];
    if (isFunction(value)) {
      slots[key] = normalizeSlot$1(key, value, ctx);
    } else if (value != null) {
      const normalized = normalizeSlotValue(value);
      slots[key] = () => normalized;
    }
  }
};
const normalizeVNodeSlots = (instance, children) => {
  const normalized = normalizeSlotValue(children);
  instance.slots.default = () => normalized;
};
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key];
    }
  }
};
const initSlots = (instance, children, optimized) => {
  const slots = instance.slots = createInternalObject();
  if (instance.vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      assignSlots(slots, children, optimized);
      if (optimized) {
        def(slots, "_", type, true);
      }
    } else {
      normalizeObjectSlots(children, slots);
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children);
  }
};
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;
  if (vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      if (optimized && type === 1) {
        needDeletionCheck = false;
      } else {
        assignSlots(slots, children, optimized);
      }
    } else {
      needDeletionCheck = !children.$stable;
      normalizeObjectSlots(children, slots);
    }
    deletionComparisonTarget = children;
  } else if (children) {
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = { default: 1 };
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key];
      }
    }
  }
};
const queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
  return baseCreateRenderer(options);
}
function baseCreateRenderer(options, createHydrationFns) {
  const target = getGlobalThis();
  target.__VUE__ = true;
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent
  } = options;
  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
    if (n1 === n2) {
      return;
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }
    if (n2.patchFlag === -2) {
      optimized = false;
      n2.dynamicChildren = null;
    }
    if (n2.dynamicChildren && n1 && n1.dynamicChildren && n1.dynamicChildren.hasOnce) {
      if (n2.dynamicChildren === EMPTY_ARR) {
        n2.dynamicChildren = [];
      }
      n2.dynamicChildren.hasOnce = true;
    }
    const { type, ref: ref3, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        break;
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 64) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (shapeFlag & 128) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else ;
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true);
    }
  };
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateText(n2.children),
        container,
        anchor
      );
    } else {
      const el = n2.el = n1.el;
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateComment(n2.children || ""),
        container,
        anchor
      );
    } else {
      n2.el = n1.el;
    }
  };
  const mountStaticNode = (n2, container, anchor, namespace) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor
    );
  };
  const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostInsert(el, container, nextSibling);
      el = next;
    }
    hostInsert(anchor, container, nextSibling);
  };
  const removeStaticNode = ({ el, anchor }) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostRemove(el);
      el = next;
    }
    hostRemove(anchor);
  };
  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    if (n2.type === "svg") {
      namespace = "svg";
    } else if (n2.type === "math") {
      namespace = "mathml";
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
      try {
        if (customElement) {
          customElement._beginPatch();
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } finally {
        if (customElement) {
          customElement._endPatch();
        }
      }
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let el;
    let vnodeHook;
    const { props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace,
      props && props.is,
      props
    );
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized
      );
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "created");
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    if (props) {
      for (const key in props) {
        if (key !== "value" && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace, parentComponent);
        }
      }
      if ("value" in props) {
        hostPatchProp(el, "value", null, props.value, namespace);
      }
      if (vnodeHook = props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode);
      }
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition);
    if (needCallTransitionHooks) {
      transition.beforeEnter(el);
    } else if (transition && !transition.persisted) {
      el[deferredEnterKey] = true;
    }
    hostInsert(el, container, anchor);
    if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
      queuePostRenderEffect(() => {
        try {
          vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
          needCallTransitionHooks && transition.enter(el);
          dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
        } finally {
        }
      }, parentSuspense);
    }
  };
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId);
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i]);
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree;
      if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
        const parentVNode = parentComponent.vnode;
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent
        );
      }
    }
  };
  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start2 = 0) => {
    for (let i = start2; i < children.length; i++) {
      const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
  };
  const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const el = n2.el = n1.el;
    let { patchFlag, dynamicChildren, dirs } = n2;
    patchFlag |= n1.patchFlag & 16;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;
    parentComponent && toggleRecurse(parentComponent, false);
    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
    }
    parentComponent && toggleRecurse(parentComponent, true);
    if (
      // #6385 the old vnode may be a user-wrapped non-isomorphic block
      // Force full diff when block metadata is unstable.
      dynamicChildren && (!n1.dynamicChildren || n1.dynamicChildren.length !== dynamicChildren.length)
    ) {
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }
    if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) {
      hostSetElementText(el, "");
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds
      );
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false
      );
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace);
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, "class", null, newProps.class, namespace);
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps;
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i];
            const prev = oldProps[key];
            const next = newProps[key];
            if (next !== prev || key === "value") {
              hostPatchProp(el, key, prev, next, namespace, parentComponent);
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace);
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
      }, parentSuspense);
    }
  };
  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const newVNode = newChildren[i];
      const oldEl = oldVNode.el || resolveAsyncComponentPlaceholder(oldVNode);
      const container = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldEl && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & (6 | 64 | 128)) ? hostParentNode(oldEl) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          fallbackContainer
        )
      );
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true
      );
    }
  };
  const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              parentComponent
            );
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev && key !== "value") {
          hostPatchProp(el, key, prev, next, namespace, parentComponent);
        }
      }
      if ("value" in newProps) {
        hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
      }
    }
  };
  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null || parentComponent && n2 === parentComponent.subTree
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true
            /* shallow */
          );
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace,
          optimized
        );
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
    const instance = initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    );
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }
    {
      setupComponent(instance, false, optimized);
    }
    if (instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(
        instance,
        setupRenderEffect,
        optimized,
        namespace
      );
      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
        initialVNode.placeholder = placeholder.el;
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized
      );
    }
  };
  const updateComponent = (n1, n2, optimized) => {
    const instance = n2.component = n1.component;
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        n2.el = n1.el;
        n2.placeholder = n1.placeholder;
        updateComponentPreRender(instance, n2, optimized);
        return;
      } else {
        instance.next = n2;
        instance.update();
      }
    } else {
      n2.el = n1.el;
      n2.placeholder = n1.placeholder;
      instance.vnode = n2;
    }
  };
  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook;
        const { el, props } = initialVNode;
        const { bm, m, parent, root, type } = instance;
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
        toggleRecurse(instance, false);
        if (bm) {
          invokeArrayFns(bm);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }
        toggleRecurse(instance, true);
        {
          if (root.ce && root.ce._hasShadowRoot()) {
            root.ce._injectChildStyle(
              type,
              instance.parent ? instance.parent.type : void 0
            );
          }
          const subTree = instance.subTree = renderComponentRoot(instance);
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace
          );
          initialVNode.el = subTree.el;
        }
        if (m) {
          queuePostRenderEffect(m, parentSuspense);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
          const scopedInitialVNode = initialVNode;
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense
          );
        }
        if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        }
        instance.isMounted = true;
        initialVNode = container = anchor = null;
      } else {
        let { next, bu, u, parent, vnode } = instance;
        {
          const unresolvedAsyncRoot = locateUnresolvedAsyncRoot(instance);
          if (unresolvedAsyncRoot) {
            if (next) {
              next.el = vnode.el;
              updateComponentPreRender(instance, next, optimized);
            }
            unresolvedAsyncRoot.asyncDep.then(() => {
              const retry = () => {
                if (instance.job.flags & 8) return;
                if (parentSuspense && parentSuspense.pendingBranch) {
                  queuePostRenderEffect(retry, parentSuspense);
                } else {
                  update();
                }
              };
              retry.flags = 16 | 32;
              queuePostRenderEffect(retry, parentSuspense);
            });
            return;
          }
        }
        let originNext = next;
        let vnodeHook;
        toggleRecurse(instance, false);
        if (next) {
          next.el = vnode.el;
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }
        if (bu) {
          invokeArrayFns(bu);
        }
        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        }
        toggleRecurse(instance, true);
        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport. a root that is a
          // pending async component only has its placeholder comment
          hostParentNode(
            prevTree.el || resolveAsyncComponentPlaceholder(prevTree)
          ),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace
        );
        next.el = nextTree.el;
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el);
        }
        if (u) {
          queuePostRenderEffect(u, parentSuspense);
        }
        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense
          );
        }
      }
    };
    instance.scope.on();
    const effect2 = instance.effect = new ReactiveEffect(componentUpdateFn);
    instance.scope.off();
    const update = instance.update = effect2.run.bind(effect2);
    const job = instance.job = effect2.runIfDirty.bind(effect2);
    job.i = instance;
    job.id = instance.uid;
    effect2.scheduler = () => queueJob(job);
    toggleRecurse(instance, true);
    update();
  };
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children, optimized);
    pauseTracking();
    flushPreFlushCbs(instance);
    resetTracking();
  };
  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const { patchFlag, shapeFlag } = n2;
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true);
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, "");
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };
  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;
    for (i = 0; i < commonLength; i++) {
      const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      );
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength
      );
    }
  };
  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      i++;
    }
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      e1--;
      e2--;
    }
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
        while (i <= e2) {
          patch(
            null,
            c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          i++;
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true);
        i++;
      }
    } else {
      const s1 = i;
      const s2 = i;
      const keyToNewIndexMap = /* @__PURE__ */ new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
        if (nextChild.key != null) {
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }
      let j;
      let patched = 0;
      const toBePatched = e2 - s2 + 1;
      let moved = false;
      let maxNewIndexSoFar = 0;
      const newIndexToOldIndexMap = new Array(toBePatched);
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true);
          continue;
        }
        let newIndex;
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          for (j = s2; j <= e2; j++) {
            if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
              newIndex = j;
              break;
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true);
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          patched++;
        }
      }
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
      j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchorVNode = c2[nextIndex + 1];
        const anchor = nextIndex + 1 < l2 ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
        ) : parentAnchor;
        if (newIndexToOldIndexMap[i] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, 2);
          } else {
            j--;
          }
        }
      }
    }
  };
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type, transition, children, shapeFlag } = vnode;
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType);
      return;
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType);
      return;
    }
    if (shapeFlag & 64) {
      type.move(vnode, container, anchor, internals);
      return;
    }
    if (type === Fragment) {
      hostInsert(el, container, anchor);
      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType);
      }
      hostInsert(vnode.anchor, container, anchor);
      return;
    }
    if (type === Static) {
      moveStaticNode(vnode, container, anchor);
      return;
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition;
    if (needTransition2) {
      if (moveType === 0) {
        if (transition.persisted && !el[leaveCbKey]) {
          hostInsert(el, container, anchor);
        } else {
          transition.beforeEnter(el);
          hostInsert(el, container, anchor);
          queuePostRenderEffect(() => transition.enter(el), parentSuspense);
        }
      } else {
        const { leave, delayLeave, afterLeave } = transition;
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el);
          } else {
            hostInsert(el, container, anchor);
          }
        };
        const performLeave = () => {
          const wasLeaving = el._isLeaving || !!el[leaveCbKey];
          if (el._isLeaving) {
            el[leaveCbKey](
              true
              /* cancelled */
            );
          }
          if (transition.persisted && !wasLeaving) {
            remove22();
          } else {
            leave(el, () => {
              remove22();
              afterLeave && afterLeave();
            });
          }
        };
        if (delayLeave) {
          delayLeave(el, remove22, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };
  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
    const {
      type,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex,
      memo
    } = vnode;
    if (patchFlag === -2 || dynamicChildren && dynamicChildren.hasOnce) {
      optimized = false;
    }
    if (ref3 != null) {
      pauseTracking();
      setRef(ref3, null, parentSuspense, vnode, true);
      resetTracking();
    }
    if (cacheIndex != null && (!vnode.ctx || vnode.ctx === parentComponent)) {
      parentComponent.renderCache[cacheIndex] = void 0;
    }
    if (shapeFlag & 256 && parentComponent.ctx.deactivate(vnode)) {
      return;
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs;
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
    let vnodeHook;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove);
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove);
        return;
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove
        );
      } else if (dynamicChildren && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (type !== Fragment || patchFlag > 0 && patchFlag & 64)) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true
        );
      } else if (type === Fragment && patchFlag & (128 | 256) || !optimized && shapeFlag & 16) {
        unmountChildren(children, parentComponent, parentSuspense);
      }
      if (doRemove) {
        remove2(vnode);
      }
    }
    const shouldInvalidateMemo = memo != null && cacheIndex == null;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
        if (shouldInvalidateMemo) {
          vnode.el = null;
        }
      }, parentSuspense);
    }
  };
  const remove2 = (vnode) => {
    const { type, el, anchor, transition } = vnode;
    const isFragment = type === Fragment;
    if (isFragment && !transition) {
      removeFragment(el, anchor);
      return;
    }
    if (type === Static) {
      removeStaticNode(vnode);
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
      return;
    }
    const leavingNode = isFragment ? getTransitionRoot(vnode) : vnode;
    const performRemove = () => {
      if (isFragment) {
        if (hostParentNode(el)) {
          removeFragment(el, anchor);
        }
      } else {
        hostRemove(el);
      }
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };
    if (leavingNode && leavingNode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition;
      const leavingEl = leavingNode.el;
      const performLeave = () => leave(leavingEl, performRemove);
      if (delayLeave) {
        delayLeave(leavingEl, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };
  const removeFragment = (cur, end) => {
    let next;
    while (cur !== end) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }
    hostRemove(end);
  };
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    const { bum, scope, job, subTree, um, m, a } = instance;
    invalidateMount(m);
    invalidateMount(a);
    if (bum) {
      invokeArrayFns(bum);
    }
    scope.stop();
    if (job) {
      job.flags |= 8;
      unmount(subTree, instance, parentSuspense, doRemove);
    } else if (subTree) {
      subTree.transition = instance.vnode.transition;
      unmount(subTree, instance, parentSuspense, doRemove);
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    }
    const markUnmounted = () => {
      instance.isUnmounted = true;
    };
    markUnmounted.flags = 16;
    queuePostRenderEffect(markUnmounted, parentSuspense);
  };
  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start2 = 0) => {
    for (let i = start2; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
    }
  };
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree);
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next();
    }
    const el = hostNextSibling(vnode.anchor || vnode.el);
    const teleportEnd = el && el[TeleportEndKey];
    return teleportEnd ? hostNextSibling(teleportEnd) : el;
  };
  const render = (vnode, container, namespace) => {
    const minUid = vnode && container._vnode ? void 0 : vnode && vnode.component ? vnode.component.uid : getNextUid();
    flushOnAppMount(() => {
      if (vnode == null) {
        if (container._vnode) {
          unmount(container._vnode, null, null, true);
        }
      } else {
        patch(
          container._vnode || null,
          vnode,
          container,
          null,
          null,
          null,
          namespace
        );
      }
      container._vnode = vnode;
    }, minUid);
  };
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate;
  return {
    render,
    hydrate,
    createApp: createAppAPI(render)
  };
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
  return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32;
    job.flags |= 4;
  } else {
    effect2.flags &= -33;
    job.flags &= -5;
  }
}
function needTransition(parentSuspense, transition) {
  return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children;
  const ch2 = n2.children;
  if (isArray$1(ch1) && isArray$1(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      const c1 = ch1[i];
      let c2 = ch2[i];
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i] = cloneIfMounted(ch2[i]);
          c2.el = c1.el;
        }
        if (!shallow && c2.patchFlag !== -2)
          traverseStaticChildren(c1, c2);
      }
      if (c2.type === Text) {
        if (c2.patchFlag === -1) {
          c2 = ch2[i] = cloneIfMounted(c2);
        }
        c2.el = c1.el;
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el;
      }
    }
  }
}
function getSequence(arr) {
  const p2 = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p2[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = u + v >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p2[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p2[v];
  }
  return result;
}
function locateUnresolvedAsyncRoot(instance) {
  const subComponent = instance.subTree.component;
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent;
    } else {
      return locateUnresolvedAsyncRoot(subComponent);
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i = 0; i < hooks.length; i++)
      hooks[i].flags |= 8;
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder;
  }
  const instance = anchorVnode.component;
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree);
  }
  const suspense = anchorVnode.suspense;
  if (suspense && suspense.activeBranch) {
    return resolveAsyncComponentPlaceholder(suspense.activeBranch);
  }
  return null;
}
const isSuspense = (type) => type.__isSuspense;
const deferredEnterKey = /* @__PURE__ */ Symbol("_deferredEnter");
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray$1(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
const Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
const Text = /* @__PURE__ */ Symbol.for("v-txt");
const Comment = /* @__PURE__ */ Symbol.for("v-cmt");
const Static = /* @__PURE__ */ Symbol.for("v-stc");
const blockStack = [];
let currentBlock = null;
function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null;
}
let isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value;
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true;
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
  closeBlock();
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode);
  }
  return vnode;
}
function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
  return setupBlock(
    createBaseVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag,
      true
    )
  );
}
function createBlock(type, props, children, patchFlag, dynamicProps) {
  return setupBlock(
    createVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      true
    )
  );
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
const normalizeKey = ({ key }) => key != null ? key : null;
const normalizeRef = ({
  ref: ref3,
  ref_key,
  ref_for
}) => {
  if (typeof ref3 === "number") {
    ref3 = "" + ref3;
  }
  return ref3 != null ? isString(ref3) || /* @__PURE__ */ isRef(ref3) || isFunction(ref3) ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for } : ref3 : null;
};
function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance
  };
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    if (shapeFlag & 128) {
      type.normalize(vnode);
    }
  } else if (children) {
    vnode.shapeFlag |= isString(children) ? 8 : 16;
  }
  if (isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
  !isBlockNode && // has current parent block
  currentBlock && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  vnode.patchFlag !== 32) {
    currentBlock.push(vnode);
  }
  return vnode;
}
const createVNode = _createVNode;
function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    type = Comment;
  }
  if (isVNode(type)) {
    const cloned = cloneVNode(
      type,
      props,
      true
      /* mergeRef: true */
    );
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag = -2;
    return cloned;
  }
  if (isClassComponent(type)) {
    type = type.__vccOpts;
  }
  if (props) {
    props = guardReactiveProps(props);
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject(style)) {
      if (/* @__PURE__ */ isProxy(style) && !isArray$1(style)) {
        style = extend({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }
  const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
function guardReactiveProps(props) {
  if (!props) return null;
  if (/* @__PURE__ */ isProxy(props)) return extend({}, props);
  return isInternalObject(props) ? extend({}, props[rawAttrsKey] || props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode;
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref: extraProps && extraProps.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      mergeRef && ref3 ? isArray$1(ref3) ? ref3.concat(normalizeRef(extraProps)) : [ref3, normalizeRef(extraProps)] : normalizeRef(extraProps)
    ) : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce,
    cacheIndex: vnode.cacheIndex
  };
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned,
      transition.clone(cloned)
    );
  }
  return cloned;
}
function createTextVNode(text = " ", flag = 0) {
  return createVNode(Text, null, text, flag);
}
function createCommentVNode(text = "", asBlock = false) {
  return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
}
function normalizeVNode(child) {
  if (child == null || typeof child === "boolean") {
    return createVNode(Comment);
  } else if (isArray$1(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    );
  } else if (isVNode(child)) {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}
function cloneIfMounted(child) {
  return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
  let type = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray$1(children)) {
    type = 16;
  } else if (typeof children === "object") {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default;
      if (slot) {
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type = 32;
      const slotFlag = children._;
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance;
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1;
        } else {
          children._ = 2;
          vnode.patchFlag |= 1024;
        }
      }
    }
  } else if (isFunction(children)) {
    if (shapeFlag & (1 | 64)) {
      normalizeChildren(vnode, { default: children });
      return;
    }
    children = { default: children, _ctx: currentRenderingInstance };
    type = 32;
  } else {
    children = String(children);
    if (shapeFlag & 64) {
      type = 16;
      children = [createTextVNode(children)];
    } else {
      type = 8;
    }
  }
  vnode.children = children;
  vnode.shapeFlag |= type;
}
function mergeProps(...args) {
  const ret = {};
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i];
    for (const key in toMerge) {
      if (key === "class") {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === "style") {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (isOn(key)) {
        const existing = ret[key];
        const incoming = toMerge[key];
        if (incoming && existing !== incoming && !(isArray$1(existing) && existing.includes(incoming))) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming;
        } else if (incoming == null && existing == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !isModelListener(key)) {
          ret[key] = incoming;
        }
      } else if (key !== "") {
        ret[key] = toMerge[key];
      }
    }
  }
  return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [
    vnode,
    prevVNode
  ]);
}
const emptyAppContext = /* @__PURE__ */ createAppContext();
let uid = 0;
function getNextUid() {
  return uid;
}
function createComponentInstance(vnode, parent, suspense) {
  const type = vnode.type;
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  {
    instance.ctx = { _: instance };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  if (vnode.ce) {
    vnode.ce(instance);
  }
  return instance;
}
let currentInstance = null;
const getCurrentInstance = () => currentInstance || currentRenderingInstance;
let internalSetCurrentInstance;
let setInSSRSetupState;
{
  const g = getGlobalThis();
  const registerGlobalSetter = (key, setter) => {
    let setters;
    if (!(setters = g[key])) setters = g[key] = [];
    setters.push(setter);
    return (v) => {
      if (setters.length > 1) setters.forEach((set) => set(v));
      else setters[0](v);
    };
  };
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v) => currentInstance = v
  );
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v) => isInSSRComponentSetup = v
  );
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance;
  internalSetCurrentInstance(instance);
  instance.scope.on();
  return () => {
    instance.scope.off();
    internalSetCurrentInstance(prev);
  };
};
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off();
  internalSetCurrentInstance(null);
};
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4;
}
let isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR);
  const { props, children } = instance.vnode;
  const isStateful = isStatefulComponent(instance);
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children, optimized || isSSR);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
  isSSR && setInSSRSetupState(false);
  return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type;
  instance.accessCache = /* @__PURE__ */ Object.create(null);
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
  const { setup } = Component;
  if (setup) {
    pauseTracking();
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    const reset = setCurrentInstance(instance);
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      0,
      [
        instance.props,
        setupContext
      ]
    );
    const isAsyncSetup = isPromise(setupResult);
    resetTracking();
    reset();
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance);
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
      if (isSSR) {
        return setupResult.then((resolvedResult) => {
          setInSSRSetupState(true);
          try {
            handleSetupResult(instance, resolvedResult, isSSR);
          } finally {
            setInSSRSetupState(false);
          }
        }).catch((e) => {
          handleError(e, instance, 0, void 0, true);
          instance.ssrRender = (_, push) => push("<!---->");
        });
      } else {
        instance.asyncDep = setupResult;
      }
    } else {
      handleSetupResult(instance, setupResult);
    }
  } else {
    finishComponentSetup(instance);
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult;
    } else {
      instance.render = setupResult;
    }
  } else if (isObject(setupResult)) {
    instance.setupState = proxyRefs(setupResult);
  } else ;
  finishComponentSetup(instance);
}
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type;
  if (!instance.render) {
    instance.render = Component.render || NOOP;
  }
  {
    const reset = setCurrentInstance(instance);
    pauseTracking();
    try {
      applyOptions(instance);
    } finally {
      resetTracking();
      reset();
    }
  }
}
const rawAttrsKey = /* @__PURE__ */ Symbol();
const attrsProxyHandlers = {
  get(target, key) {
    track(target, "get", "");
    return key === rawAttrsKey ? target : target[key];
  }
};
function createSetupContext(instance) {
  const expose = (exposed) => {
    instance.exposed = exposed || {};
  };
  {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose
    };
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
      get(target, key) {
        if (key in target) {
          return target[key];
        } else if (key in publicPropertiesMap) {
          return publicPropertiesMap[key](instance);
        }
      },
      has(target, key) {
        return key in target || key in publicPropertiesMap;
      }
    }));
  } else {
    return instance.proxy;
  }
}
const classifyRE = /(?:^|[-_])\w/g;
const classify = (str) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, "");
function getComponentName(Component, includeInferred = true) {
  return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component);
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/);
    if (match) {
      name = match[1];
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key;
        }
      }
    };
    name = inferFromRegistry(instance.components) || instance.parent && inferFromRegistry(
      instance.parent.type.components
    ) || inferFromRegistry(instance.appContext.components);
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}
function isClassComponent(value) {
  return isFunction(value) && "__vccOpts" in value;
}
const computed = (getterOrOptions, debugOptions) => {
  const c = /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
  return c;
};
function h(type, propsOrChildren, children) {
  try {
    setBlockTracking(-1);
    const l = arguments.length;
    if (l === 2) {
      if (isObject(propsOrChildren) && !isArray$1(propsOrChildren)) {
        if (isVNode(propsOrChildren)) {
          return createVNode(type, null, [propsOrChildren]);
        }
        return createVNode(type, propsOrChildren);
      } else {
        return createVNode(type, null, propsOrChildren);
      }
    } else {
      if (l > 3) {
        children = Array.prototype.slice.call(arguments, 2);
      } else if (l === 3 && isVNode(children)) {
        children = [children];
      }
      return createVNode(type, propsOrChildren, children);
    }
  } finally {
    setBlockTracking(1);
  }
}
const version = "3.5.45";
/**
* @vue/runtime-dom v3.5.45
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let policy = void 0;
const tt = typeof window !== "undefined" && window.trustedTypes;
if (tt) {
  try {
    policy = /* @__PURE__ */ tt.createPolicy("vue", {
      createHTML: (val) => val
    });
  } catch (e) {
  }
}
const unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
const svgNS = "http://www.w3.org/2000/svg";
const mathmlNS = "http://www.w3.org/1998/Math/MathML";
const doc = typeof document !== "undefined" ? document : null;
const templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
const nodeOps = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },
  createElement: (tag, namespace, is, props) => {
    const el = namespace === "svg" ? doc.createElementNS(svgNS, tag) : namespace === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
    if (tag === "select" && props && props.multiple != null) {
      el.setAttribute("multiple", props.multiple);
    }
    return el;
  },
  createText: (text) => doc.createTextNode(text),
  createComment: (text) => doc.createComment(text),
  setText: (node, text) => {
    node.nodeValue = text;
  },
  setElementText: (el, text) => {
    el.textContent = text;
  },
  parentNode: (node) => node.parentNode,
  nextSibling: (node) => node.nextSibling,
  querySelector: (selector) => doc.querySelector(selector),
  setScopeId(el, id) {
    el.setAttribute(id, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, namespace, start2, end) {
    const before = anchor ? anchor.previousSibling : parent.lastChild;
    if (start2 && (start2 === end || start2.nextSibling)) {
      while (true) {
        parent.insertBefore(start2.cloneNode(true), anchor);
        if (start2 === end || !(start2 = start2.nextSibling)) break;
      }
    } else {
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content
      );
      const template = templateContainer.content;
      if (namespace === "svg" || namespace === "mathml") {
        const wrapper = template.firstChild;
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild);
        }
        template.removeChild(wrapper);
      }
      parent.insertBefore(template, anchor);
    }
    return [
      // first
      before ? before.nextSibling : parent.firstChild,
      // last
      anchor ? anchor.previousSibling : parent.lastChild
    ];
  }
};
const vtcKey = /* @__PURE__ */ Symbol("_vtc");
function patchClass(el, value, isSVG) {
  const transitionClasses = el[vtcKey];
  if (transitionClasses) {
    value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
  }
  if (value == null) {
    el.removeAttribute("class");
  } else if (isSVG) {
    el.setAttribute("class", value);
  } else {
    el.className = value;
  }
}
const vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
const vShowHidden = /* @__PURE__ */ Symbol("_vsh");
const CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
const displayRE = /(?:^|;)\s*display\s*:/;
function patchStyle(el, prev, next) {
  const style = el.style;
  const isCssString = isString(next);
  let hasControlledDisplay = false;
  if (next && !isCssString) {
    if (prev) {
      if (!isString(prev)) {
        for (const key in prev) {
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      } else {
        for (const prevStyle of prev.split(";")) {
          const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      }
    }
    for (const key in next) {
      if (key === "display") {
        hasControlledDisplay = true;
      }
      const value = next[key];
      if (value != null) {
        if (!shouldPreserveTextareaResizeStyle(
          el,
          key,
          !isString(prev) && prev ? prev[key] : void 0,
          value
        )) {
          setStyle(style, key, value);
        }
      } else {
        setStyle(style, key, "");
      }
    }
  } else {
    if (isCssString) {
      if (prev !== next) {
        const cssVarText = style[CSS_VAR_TEXT];
        if (cssVarText) {
          next += ";" + cssVarText;
        }
        style.cssText = next;
        hasControlledDisplay = displayRE.test(next);
      }
    } else if (prev) {
      el.removeAttribute("style");
    }
  }
  if (vShowOriginalDisplay in el) {
    if (!isCssString || prev !== next) {
      el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
    }
    if (el[vShowHidden]) {
      style.display = "none";
    }
  }
}
const importantRE = /\s*!important$/;
function setStyle(style, name, val) {
  if (isArray$1(val)) {
    val.forEach((v) => setStyle(style, name, v));
  } else {
    if (val == null) val = "";
    if (name.startsWith("--")) {
      if (importantRE.test(val)) {
        style.setProperty(name, val.replace(importantRE, ""), "important");
      } else {
        style.setProperty(name, val);
      }
    } else {
      const prefixed = autoPrefix(style, name);
      if (importantRE.test(val)) {
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ""),
          "important"
        );
      } else {
        style[prefixed] = val;
      }
    }
  }
}
const prefixes = ["Webkit", "Moz", "ms"];
const prefixCache = {};
function autoPrefix(style, rawName) {
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }
  let name = camelize(rawName);
  if (name !== "filter" && name in style) {
    return prefixCache[rawName] = name;
  }
  name = capitalize(name);
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name;
    if (prefixed in style) {
      return prefixCache[rawName] = prefixed;
    }
  }
  return rawName;
}
function shouldPreserveTextareaResizeStyle(el, key, prev, next) {
  return el.tagName === "TEXTAREA" && (key === "width" || key === "height") && isString(next) && prev === next;
}
const xlinkNS = "http://www.w3.org/1999/xlink";
function patchAttr(el, key, value, isSVG, instance, isBoolean = isSpecialBooleanAttr(key)) {
  if (isSVG && key.startsWith("xlink:")) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    if (value == null || isBoolean && !includeBooleanAttr(value)) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(
        key,
        isBoolean ? "" : isSymbol(value) ? String(value) : value
      );
    }
  }
}
function patchDOMProp(el, key, value, parentComponent, attrName) {
  if (key === "innerHTML" || key === "textContent") {
    if (value != null) {
      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
    }
    return;
  }
  const tag = el.tagName;
  if (key === "value" && tag !== "PROGRESS" && // custom elements may use _value internally
  !tag.includes("-")) {
    const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
    const newValue = value == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      el.type === "checkbox" ? "on" : ""
    ) : String(value);
    if (oldValue !== newValue || !("_value" in el)) {
      el.value = newValue;
    }
    if (value == null) {
      el.removeAttribute(key);
    }
    el._value = value;
    return;
  }
  let needRemove = false;
  if (value === "" || value == null) {
    const type = typeof el[key];
    if (type === "boolean") {
      value = includeBooleanAttr(value);
    } else if (value == null && type === "string") {
      value = "";
      needRemove = true;
    } else if (type === "number") {
      value = 0;
      needRemove = true;
    }
  }
  try {
    el[key] = value;
  } catch (e) {
  }
  needRemove && el.removeAttribute(attrName || key);
}
function addEventListener(el, event, handler, options) {
  el.addEventListener(event, handler, options);
}
function removeEventListener(el, event, handler, options) {
  el.removeEventListener(event, handler, options);
}
const veiKey = /* @__PURE__ */ Symbol("_vei");
function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
  const invokers = el[veiKey] || (el[veiKey] = {});
  const existingInvoker = invokers[rawName];
  if (nextValue && existingInvoker) {
    existingInvoker.value = nextValue;
  } else {
    const [name, options] = parseName(rawName);
    if (nextValue) {
      const invoker = invokers[rawName] = createInvoker(
        nextValue,
        instance
      );
      addEventListener(el, name, invoker, options);
    } else if (existingInvoker) {
      removeEventListener(el, name, existingInvoker, options);
      invokers[rawName] = void 0;
    }
  }
}
const optionsModifierRE = /(Once|Passive|Capture)$/;
const optionsModifierEventRE = /^on:?(?:Once|Passive|Capture)$/;
function parseName(name) {
  let options;
  let m;
  while ((m = name.match(optionsModifierRE)) && !optionsModifierEventRE.test(name)) {
    if (!options) options = {};
    name = name.slice(0, name.length - m[1].length);
    options[m[1].toLowerCase()] = true;
  }
  const event = name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2));
  return [event, options];
}
let cachedNow = 0;
const p = /* @__PURE__ */ Promise.resolve();
const getNow = () => cachedNow || (p.then(() => cachedNow = 0), cachedNow = Date.now());
function createInvoker(initialValue, instance) {
  const invoker = (e) => {
    if (!e._vts) {
      e._vts = Date.now();
    } else if (e._vts <= invoker.attached) {
      return;
    }
    const value = invoker.value;
    if (isArray$1(value)) {
      const originalStop = e.stopImmediatePropagation;
      e.stopImmediatePropagation = () => {
        originalStop.call(e);
        e._stopped = true;
      };
      const handlers2 = value.slice();
      const args = [e];
      for (let i = 0; i < handlers2.length; i++) {
        if (e._stopped) {
          break;
        }
        const handler = handlers2[i];
        if (handler) {
          callWithAsyncErrorHandling(
            handler,
            instance,
            5,
            args
          );
        }
      }
    } else {
      callWithAsyncErrorHandling(
        value,
        instance,
        5,
        [e]
      );
    }
  };
  invoker.value = initialValue;
  invoker.attached = getNow();
  return invoker;
}
const isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // lowercase letter
key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
const patchProp = (el, key, prevValue, nextValue, namespace, parentComponent) => {
  const isSVG = namespace === "svg";
  if (key === "class") {
    patchClass(el, nextValue, isSVG);
  } else if (key === "style") {
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent);
    }
  } else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
    patchDOMProp(el, key, nextValue);
    if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
    }
  } else if (
    // #11081 force set props for possible async custom element
    el._isVueCE && // #12408 check if it's declared prop or it's async custom element
    (shouldSetAsPropForVueCE(el, key) || // @ts-expect-error _def is private
    el._def.__asyncLoader && (/[A-Z]/.test(key) || !isString(nextValue)))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
  } else {
    if (key === "true-value") {
      el._trueValue = nextValue;
    } else if (key === "false-value") {
      el._falseValue = nextValue;
    }
    patchAttr(el, key, nextValue, isSVG);
  }
};
function shouldSetAsProp(el, key, value, isSVG) {
  if (isSVG) {
    if (key === "innerHTML" || key === "textContent") {
      return true;
    }
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true;
    }
    return false;
  }
  if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") {
    return false;
  }
  if (key === "sandbox" && el.tagName === "IFRAME") {
    return false;
  }
  if (key === "form") {
    return false;
  }
  if (key === "list" && el.tagName === "INPUT") {
    return false;
  }
  if (key === "type" && el.tagName === "TEXTAREA") {
    return false;
  }
  if (key === "width" || key === "height") {
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") {
      return false;
    }
  }
  if (isNativeOn(key) && isString(value)) {
    return false;
  }
  return key in el;
}
function shouldSetAsPropForVueCE(el, key) {
  const props = (
    // @ts-expect-error _def is private
    el._def.props
  );
  if (!props) {
    return false;
  }
  const camelKey = camelize(key);
  return Array.isArray(props) ? props.some((prop) => camelize(prop) === camelKey) : Object.keys(props).some((prop) => camelize(prop) === camelKey);
}
const getModelAssigner = (vnode) => {
  const fn = vnode.props["onUpdate:modelValue"] || false;
  return isArray$1(fn) ? (value) => invokeArrayFns(fn, value) : fn;
};
function onCompositionStart(e) {
  e.target.composing = true;
}
function onCompositionEnd(e) {
  const target = e.target;
  if (target.composing) {
    target.composing = false;
    target.dispatchEvent(new Event("input"));
  }
}
const assignKey = /* @__PURE__ */ Symbol("_assign");
const initialValueKey = /* @__PURE__ */ Symbol("_initialValue");
function castValue(value, trim, number) {
  if (trim) value = value.trim();
  if (number) value = looseToNumber(value);
  return value;
}
const vModelText = {
  created(el, { modifiers: { lazy, trim, number } }, vnode) {
    if (el.parentNode) {
      if (el.type === "text") {
        el[initialValueKey] = el.defaultValue.replace(/[\r\n]/g, "");
      } else if (el.type === "textarea") {
        el[initialValueKey] = el.defaultValue.replace(/\r\n?/g, "\n");
      }
    }
    el[assignKey] = getModelAssigner(vnode);
    const castToNumber = number || vnode.props && vnode.props.type === "number";
    addEventListener(el, lazy ? "change" : "input", (e) => {
      if (e.target.composing) return;
      el[assignKey](castValue(el.value, trim, castToNumber));
    });
    if (trim || castToNumber) {
      addEventListener(el, "change", () => {
        el.value = castValue(el.value, trim, castToNumber);
      });
    }
    if (!lazy) {
      addEventListener(el, "compositionstart", onCompositionStart);
      addEventListener(el, "compositionend", onCompositionEnd);
      addEventListener(el, "change", onCompositionEnd);
    }
  },
  // set value on mounted so it's after min/max for type="range"
  mounted(el, { value, modifiers: { trim, number } }) {
    const newValue = value == null ? "" : value;
    const initialValue = el[initialValueKey];
    delete el[initialValueKey];
    if (initialValue !== void 0 && (el.type === "text" || el.type === "textarea") && el.value !== initialValue) {
      el[assignKey](castValue(el.value, trim, number));
    } else {
      el.value = newValue;
    }
  },
  beforeUpdate(el, { value, oldValue, modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    if (el.composing) return;
    const elValue = (number || el.type === "number") && !/^0\d/.test(el.value) ? looseToNumber(el.value) : el.value;
    const newValue = value == null ? "" : value;
    if (elValue === newValue) {
      return;
    }
    const rootNode = el.getRootNode();
    if ((rootNode instanceof Document || rootNode instanceof ShadowRoot) && rootNode.activeElement === el && el.type !== "range") {
      if (lazy && value === oldValue) {
        return;
      }
      if (trim && el.value.trim() === newValue) {
        return;
      }
    }
    el.value = newValue;
  }
};
const vModelSelect = {
  // <select multiple> value need to be deep traversed
  deep: true,
  created(el, { value, modifiers: { number } }, vnode) {
    el._modelValue = value;
    addEventListener(el, "change", () => {
      const selectedVal = Array.prototype.filter.call(el.options, (o) => o.selected).map(
        (o) => number ? looseToNumber(getValue(o)) : getValue(o)
      );
      const multiple = el.multiple;
      const assignedValue = multiple ? isSet(el._modelValue) ? new Set(selectedVal) : selectedVal : selectedVal[0];
      const pending = el._pendingValue = [
        multiple,
        multiple ? isArray$1(assignedValue) ? selectedVal.slice() : selectedVal : assignedValue
      ];
      try {
        el[assignKey](assignedValue);
      } finally {
        nextTick(() => {
          if (el._pendingValue === pending) {
            el._pendingValue = void 0;
          }
        });
      }
    });
    el[assignKey] = getModelAssigner(vnode);
  },
  // set value in mounted & updated because <select> relies on its children
  // <option>s.
  mounted(el, { value, modifiers: { number } }) {
    setSelected(el, value, number);
  },
  beforeUpdate(el, { value }, vnode) {
    el._modelValue = value;
    el[assignKey] = getModelAssigner(vnode);
  },
  updated(el, { value, modifiers: { number } }) {
    const pending = el._pendingValue;
    el._pendingValue = void 0;
    if (!pending || pending[0] !== el.multiple || !isSameSelectValue(value, pending[1], pending[0])) {
      setSelected(el, value, number);
    }
  }
};
function isSameSelectValue(value, assignedValue, multiple) {
  if (!multiple) return looseEqual(value, assignedValue);
  if (isArray$1(value)) return looseEqual(value, assignedValue);
  if (isSet(value)) {
    if (value.size !== assignedValue.length) return false;
    for (const item of assignedValue) {
      if (!value.has(item)) return false;
    }
    return true;
  }
  return false;
}
function setSelected(el, value, number = false) {
  const isMultiple = el.multiple;
  const isArrayValue = isArray$1(value);
  if (isMultiple && !isArrayValue && !isSet(value)) {
    return;
  }
  for (let i = 0, l = el.options.length; i < l; i++) {
    const option = el.options[i];
    const optionValue = getValue(option);
    if (isMultiple) {
      if (isArrayValue) {
        const optionType = typeof optionValue;
        if (optionType === "string" || optionType === "number") {
          option.selected = value.some((v) => String(v) === String(optionValue));
        } else {
          option.selected = looseIndexOf(value, optionValue) > -1;
        }
      } else {
        option.selected = value.has(optionValue) || number && typeof optionValue === "string" && value.has(looseToNumber(optionValue));
      }
    } else if (looseEqual(getValue(option), value)) {
      if (el.selectedIndex !== i) el.selectedIndex = i;
      return;
    }
  }
  if (!isMultiple && el.selectedIndex !== -1) {
    el.selectedIndex = -1;
  }
}
function getValue(el) {
  return "_value" in el ? el._value : el.value;
}
const systemModifiers = ["ctrl", "shift", "alt", "meta"];
const modifierGuards = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !e.ctrlKey,
  shift: (e) => !e.shiftKey,
  alt: (e) => !e.altKey,
  meta: (e) => !e.metaKey,
  left: (e) => "button" in e && e.button !== 0,
  middle: (e) => "button" in e && e.button !== 1,
  right: (e) => "button" in e && e.button !== 2,
  exact: (e, modifiers) => systemModifiers.some((m) => e[`${m}Key`] && !modifiers.includes(m))
};
const withModifiers = (fn, modifiers) => {
  if (!fn) return fn;
  const cache = fn._withMods || (fn._withMods = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = ((event, ...args) => {
    for (let i = 0; i < modifiers.length; i++) {
      const guard = modifierGuards[modifiers[i]];
      if (guard && guard(event, modifiers)) return;
    }
    return fn(event, ...args);
  }));
};
const keyNames = {
  esc: "escape",
  space: " ",
  up: "arrow-up",
  left: "arrow-left",
  right: "arrow-right",
  down: "arrow-down",
  delete: "backspace"
};
const withKeys = (fn, modifiers) => {
  const cache = fn._withKeys || (fn._withKeys = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = ((event) => {
    if (!("key" in event)) {
      return;
    }
    const eventKey = hyphenate(event.key);
    if (modifiers.some(
      (k) => k === eventKey || keyNames[k] === eventKey
    )) {
      return fn(event);
    }
  }));
};
const rendererOptions = /* @__PURE__ */ extend({ patchProp }, nodeOps);
let renderer;
function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions));
}
const createApp = ((...args) => {
  const app2 = ensureRenderer().createApp(...args);
  const { mount } = app2;
  app2.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    const component = app2._component;
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML;
    }
    if (container.nodeType === 1) {
      container.textContent = "";
    }
    const proxy = mount(container, false, resolveRootNamespace(container));
    if (container instanceof Element) {
      container.removeAttribute("v-cloak");
      container.setAttribute("data-v-app", "");
    }
    return proxy;
  };
  return app2;
});
function resolveRootNamespace(container) {
  if (container instanceof SVGElement) {
    return "svg";
  }
  if (typeof MathMLElement === "function" && container instanceof MathMLElement) {
    return "mathml";
  }
}
function normalizeContainer(container) {
  if (isString(container)) {
    const res = document.querySelector(container);
    return res;
  }
  return container;
}
/*!
 * pinia v2.3.1
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let activePinia;
const setActivePinia = (pinia) => activePinia = pinia;
const piniaSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function isPlainObject(o) {
  return o && typeof o === "object" && Object.prototype.toString.call(o) === "[object Object]" && typeof o.toJSON !== "function";
}
var MutationType;
(function(MutationType2) {
  MutationType2["direct"] = "direct";
  MutationType2["patchObject"] = "patch object";
  MutationType2["patchFunction"] = "patch function";
})(MutationType || (MutationType = {}));
function createPinia() {
  const scope = effectScope(true);
  const state2 = scope.run(() => /* @__PURE__ */ ref({}));
  let _p = [];
  let toBeInstalled = [];
  const pinia = markRaw({
    install(app2) {
      setActivePinia(pinia);
      {
        pinia._a = app2;
        app2.provide(piniaSymbol, pinia);
        app2.config.globalProperties.$pinia = pinia;
        toBeInstalled.forEach((plugin) => _p.push(plugin));
        toBeInstalled = [];
      }
    },
    use(plugin) {
      if (!this._a && true) {
        toBeInstalled.push(plugin);
      } else {
        _p.push(plugin);
      }
      return this;
    },
    _p,
    // it's actually undefined here
    // @ts-expect-error
    _a: null,
    _e: scope,
    _s: /* @__PURE__ */ new Map(),
    state: state2
  });
  return pinia;
}
const noop$1 = () => {
};
function addSubscription(subscriptions, callback, detached, onCleanup = noop$1) {
  subscriptions.push(callback);
  const removeSubscription = () => {
    const idx = subscriptions.indexOf(callback);
    if (idx > -1) {
      subscriptions.splice(idx, 1);
      onCleanup();
    }
  };
  if (!detached && getCurrentScope()) {
    onScopeDispose(removeSubscription);
  }
  return removeSubscription;
}
function triggerSubscriptions(subscriptions, ...args) {
  subscriptions.slice().forEach((callback) => {
    callback(...args);
  });
}
const fallbackRunWithContext = (fn) => fn();
const ACTION_MARKER = Symbol();
const ACTION_NAME = Symbol();
function mergeReactiveObjects(target, patchToApply) {
  if (target instanceof Map && patchToApply instanceof Map) {
    patchToApply.forEach((value, key) => target.set(key, value));
  } else if (target instanceof Set && patchToApply instanceof Set) {
    patchToApply.forEach(target.add, target);
  }
  for (const key in patchToApply) {
    if (!patchToApply.hasOwnProperty(key))
      continue;
    const subPatch = patchToApply[key];
    const targetValue = target[key];
    if (isPlainObject(targetValue) && isPlainObject(subPatch) && target.hasOwnProperty(key) && !/* @__PURE__ */ isRef(subPatch) && !/* @__PURE__ */ isReactive(subPatch)) {
      target[key] = mergeReactiveObjects(targetValue, subPatch);
    } else {
      target[key] = subPatch;
    }
  }
  return target;
}
const skipHydrateSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function shouldHydrate(obj) {
  return !isPlainObject(obj) || !obj.hasOwnProperty(skipHydrateSymbol);
}
const { assign: assign$1 } = Object;
function isComputed(o) {
  return !!(/* @__PURE__ */ isRef(o) && o.effect);
}
function createOptionsStore(id, options, pinia, hot) {
  const { state: state2, actions, getters } = options;
  const initialState = pinia.state.value[id];
  let store;
  function setup() {
    if (!initialState && true) {
      {
        pinia.state.value[id] = state2 ? state2() : {};
      }
    }
    const localState = /* @__PURE__ */ toRefs(pinia.state.value[id]);
    return assign$1(localState, actions, Object.keys(getters || {}).reduce((computedGetters, name) => {
      computedGetters[name] = markRaw(computed(() => {
        setActivePinia(pinia);
        const store2 = pinia._s.get(id);
        return getters[name].call(store2, store2);
      }));
      return computedGetters;
    }, {}));
  }
  store = createSetupStore(id, setup, options, pinia, hot, true);
  return store;
}
function createSetupStore($id, setup, options = {}, pinia, hot, isOptionsStore) {
  let scope;
  const optionsForPlugin = assign$1({ actions: {} }, options);
  const $subscribeOptions = { deep: true };
  let isListening;
  let isSyncListening;
  let subscriptions = [];
  let actionSubscriptions = [];
  let debuggerEvents;
  const initialState = pinia.state.value[$id];
  if (!isOptionsStore && !initialState && true) {
    {
      pinia.state.value[$id] = {};
    }
  }
  let activeListener;
  function $patch(partialStateOrMutator) {
    let subscriptionMutation;
    isListening = isSyncListening = false;
    if (typeof partialStateOrMutator === "function") {
      partialStateOrMutator(pinia.state.value[$id]);
      subscriptionMutation = {
        type: MutationType.patchFunction,
        storeId: $id,
        events: debuggerEvents
      };
    } else {
      mergeReactiveObjects(pinia.state.value[$id], partialStateOrMutator);
      subscriptionMutation = {
        type: MutationType.patchObject,
        payload: partialStateOrMutator,
        storeId: $id,
        events: debuggerEvents
      };
    }
    const myListenerId = activeListener = Symbol();
    nextTick().then(() => {
      if (activeListener === myListenerId) {
        isListening = true;
      }
    });
    isSyncListening = true;
    triggerSubscriptions(subscriptions, subscriptionMutation, pinia.state.value[$id]);
  }
  const $reset = isOptionsStore ? function $reset2() {
    const { state: state2 } = options;
    const newState = state2 ? state2() : {};
    this.$patch(($state) => {
      assign$1($state, newState);
    });
  } : (
    /* istanbul ignore next */
    noop$1
  );
  function $dispose() {
    scope.stop();
    subscriptions = [];
    actionSubscriptions = [];
    pinia._s.delete($id);
  }
  const action = (fn, name = "") => {
    if (ACTION_MARKER in fn) {
      fn[ACTION_NAME] = name;
      return fn;
    }
    const wrappedAction = function() {
      setActivePinia(pinia);
      const args = Array.from(arguments);
      const afterCallbackList = [];
      const onErrorCallbackList = [];
      function after(callback) {
        afterCallbackList.push(callback);
      }
      function onError(callback) {
        onErrorCallbackList.push(callback);
      }
      triggerSubscriptions(actionSubscriptions, {
        args,
        name: wrappedAction[ACTION_NAME],
        store,
        after,
        onError
      });
      let ret;
      try {
        ret = fn.apply(this && this.$id === $id ? this : store, args);
      } catch (error) {
        triggerSubscriptions(onErrorCallbackList, error);
        throw error;
      }
      if (ret instanceof Promise) {
        return ret.then((value) => {
          triggerSubscriptions(afterCallbackList, value);
          return value;
        }).catch((error) => {
          triggerSubscriptions(onErrorCallbackList, error);
          return Promise.reject(error);
        });
      }
      triggerSubscriptions(afterCallbackList, ret);
      return ret;
    };
    wrappedAction[ACTION_MARKER] = true;
    wrappedAction[ACTION_NAME] = name;
    return wrappedAction;
  };
  const partialStore = {
    _p: pinia,
    // _s: scope,
    $id,
    $onAction: addSubscription.bind(null, actionSubscriptions),
    $patch,
    $reset,
    $subscribe(callback, options2 = {}) {
      const removeSubscription = addSubscription(subscriptions, callback, options2.detached, () => stopWatcher());
      const stopWatcher = scope.run(() => watch(() => pinia.state.value[$id], (state2) => {
        if (options2.flush === "sync" ? isSyncListening : isListening) {
          callback({
            storeId: $id,
            type: MutationType.direct,
            events: debuggerEvents
          }, state2);
        }
      }, assign$1({}, $subscribeOptions, options2)));
      return removeSubscription;
    },
    $dispose
  };
  const store = /* @__PURE__ */ reactive(partialStore);
  pinia._s.set($id, store);
  const runWithContext = pinia._a && pinia._a.runWithContext || fallbackRunWithContext;
  const setupStore = runWithContext(() => pinia._e.run(() => (scope = effectScope()).run(() => setup({ action }))));
  for (const key in setupStore) {
    const prop = setupStore[key];
    if (/* @__PURE__ */ isRef(prop) && !isComputed(prop) || /* @__PURE__ */ isReactive(prop)) {
      if (!isOptionsStore) {
        if (initialState && shouldHydrate(prop)) {
          if (/* @__PURE__ */ isRef(prop)) {
            prop.value = initialState[key];
          } else {
            mergeReactiveObjects(prop, initialState[key]);
          }
        }
        {
          pinia.state.value[$id][key] = prop;
        }
      }
    } else if (typeof prop === "function") {
      const actionValue = action(prop, key);
      {
        setupStore[key] = actionValue;
      }
      optionsForPlugin.actions[key] = prop;
    } else ;
  }
  {
    assign$1(store, setupStore);
    assign$1(/* @__PURE__ */ toRaw(store), setupStore);
  }
  Object.defineProperty(store, "$state", {
    get: () => pinia.state.value[$id],
    set: (state2) => {
      $patch(($state) => {
        assign$1($state, state2);
      });
    }
  });
  pinia._p.forEach((extender) => {
    {
      assign$1(store, scope.run(() => extender({
        store,
        app: pinia._a,
        pinia,
        options: optionsForPlugin
      })));
    }
  });
  if (initialState && isOptionsStore && options.hydrate) {
    options.hydrate(store.$state, initialState);
  }
  isListening = true;
  isSyncListening = true;
  return store;
}
/*! #__NO_SIDE_EFFECTS__ */
// @__NO_SIDE_EFFECTS__
function defineStore(idOrOptions, setup, setupOptions) {
  let id;
  let options;
  const isSetupStore = typeof setup === "function";
  if (typeof idOrOptions === "string") {
    id = idOrOptions;
    options = isSetupStore ? setupOptions : setup;
  } else {
    options = idOrOptions;
    id = idOrOptions.id;
  }
  function useStore(pinia, hot) {
    const hasContext = hasInjectionContext();
    pinia = // in test mode, ignore the argument provided as we can always retrieve a
    // pinia instance with getActivePinia()
    pinia || (hasContext ? inject(piniaSymbol, null) : null);
    if (pinia)
      setActivePinia(pinia);
    pinia = activePinia;
    if (!pinia._s.has(id)) {
      if (isSetupStore) {
        createSetupStore(id, setup, options, pinia);
      } else {
        createOptionsStore(id, options, pinia);
      }
    }
    const store = pinia._s.get(id);
    return store;
  }
  useStore.$id = id;
  return useStore;
}
/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
const isBrowser = typeof document !== "undefined";
function isRouteComponent(component) {
  return typeof component === "object" || "displayName" in component || "props" in component || "__vccOpts" in component;
}
function isESModule(obj) {
  return obj.__esModule || obj[Symbol.toStringTag] === "Module" || obj.default && isRouteComponent(obj.default);
}
const assign = Object.assign;
function applyToParams(fn, params) {
  const newParams = {};
  for (const key in params) {
    const value = params[key];
    newParams[key] = isArray(value) ? value.map(fn) : fn(value);
  }
  return newParams;
}
const noop = () => {
};
const isArray = Array.isArray;
function mergeOptions(defaults, partialOptions) {
  const options = {};
  for (const key in defaults) options[key] = key in partialOptions ? partialOptions[key] : defaults[key];
  return options;
}
const HASH_RE = /#/g;
const AMPERSAND_RE = /&/g;
const SLASH_RE = /\//g;
const EQUAL_RE = /=/g;
const IM_RE = /\?/g;
const PLUS_RE = /\+/g;
const ENC_BRACKET_OPEN_RE = /%5B/g;
const ENC_BRACKET_CLOSE_RE = /%5D/g;
const ENC_CARET_RE = /%5E/g;
const ENC_BACKTICK_RE = /%60/g;
const ENC_CURLY_OPEN_RE = /%7B/g;
const ENC_PIPE_RE = /%7C/g;
const ENC_CURLY_CLOSE_RE = /%7D/g;
const ENC_SPACE_RE = /%20/g;
function commonEncode(text) {
  return text == null ? "" : encodeURI("" + text).replace(ENC_PIPE_RE, "|").replace(ENC_BRACKET_OPEN_RE, "[").replace(ENC_BRACKET_CLOSE_RE, "]");
}
function encodeHash(text) {
  return commonEncode(text).replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
function encodeQueryValue(text) {
  return commonEncode(text).replace(PLUS_RE, "%2B").replace(ENC_SPACE_RE, "+").replace(HASH_RE, "%23").replace(AMPERSAND_RE, "%26").replace(ENC_BACKTICK_RE, "`").replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
function encodeQueryKey(text) {
  return encodeQueryValue(text).replace(EQUAL_RE, "%3D");
}
function encodePath(text) {
  return commonEncode(text).replace(HASH_RE, "%23").replace(IM_RE, "%3F");
}
function encodeParam(text) {
  return encodePath(text).replace(SLASH_RE, "%2F");
}
function decode(text) {
  if (text == null) return null;
  try {
    return decodeURIComponent("" + text);
  } catch (err) {
  }
  return "" + text;
}
const TRAILING_SLASH_RE = /\/$/;
const removeTrailingSlash = (path) => path.replace(TRAILING_SLASH_RE, "");
function parseURL(parseQuery$1, location2, currentLocation = "/") {
  let path, query = {}, searchString = "", hash = "";
  const hashPos = location2.indexOf("#");
  let searchPos = location2.indexOf("?");
  searchPos = hashPos >= 0 && searchPos > hashPos ? -1 : searchPos;
  if (searchPos >= 0) {
    path = location2.slice(0, searchPos);
    searchString = location2.slice(searchPos, hashPos > 0 ? hashPos : location2.length);
    query = parseQuery$1(searchString.slice(1));
  }
  if (hashPos >= 0) {
    path = path || location2.slice(0, hashPos);
    hash = location2.slice(hashPos, location2.length);
  }
  path = resolveRelativePath(path != null ? path : location2, currentLocation);
  return {
    fullPath: path + searchString + hash,
    path,
    query,
    hash: decode(hash)
  };
}
function stringifyURL(stringifyQuery$1, location2) {
  const query = location2.query ? stringifyQuery$1(location2.query) : "";
  return location2.path + (query && "?") + query + (location2.hash || "");
}
function stripBase(pathname, base) {
  if (!base || !pathname.toLowerCase().startsWith(base.toLowerCase())) return pathname;
  return pathname.slice(base.length) || "/";
}
function isSameRouteLocation(stringifyQuery$1, a, b) {
  const aLastIndex = a.matched.length - 1;
  const bLastIndex = b.matched.length - 1;
  return aLastIndex > -1 && aLastIndex === bLastIndex && isSameRouteRecord(a.matched[aLastIndex], b.matched[bLastIndex]) && isSameRouteLocationParams(a.params, b.params) && stringifyQuery$1(a.query) === stringifyQuery$1(b.query) && a.hash === b.hash;
}
function isSameRouteRecord(a, b) {
  return (a.aliasOf || a) === (b.aliasOf || b);
}
function isSameRouteLocationParams(a, b) {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (var key in a) if (!isSameRouteLocationParamsValue(a[key], b[key])) return false;
  return true;
}
function isSameRouteLocationParamsValue(a, b) {
  return isArray(a) ? isEquivalentArray(a, b) : isArray(b) ? isEquivalentArray(b, a) : (a == null ? void 0 : a.valueOf()) === (b == null ? void 0 : b.valueOf());
}
function isEquivalentArray(a, b) {
  return isArray(b) ? a.length === b.length && a.every((value, i) => value === b[i]) : a.length === 1 && a[0] === b;
}
function resolveRelativePath(to, from) {
  if (to.startsWith("/")) return to;
  if (!to) return from;
  const fromSegments = from.split("/");
  const toSegments = to.split("/");
  const lastToSegment = toSegments[toSegments.length - 1];
  if (lastToSegment === ".." || lastToSegment === ".") toSegments.push("");
  let position = fromSegments.length - 1;
  let toPosition;
  let segment;
  for (toPosition = 0; toPosition < toSegments.length; toPosition++) {
    segment = toSegments[toPosition];
    if (segment === ".") continue;
    if (segment === "..") {
      if (position > 1) position--;
    } else break;
  }
  return fromSegments.slice(0, position).join("/") + "/" + toSegments.slice(toPosition).join("/");
}
const START_LOCATION_NORMALIZED = {
  path: "/",
  name: void 0,
  params: {},
  query: {},
  hash: "",
  fullPath: "/",
  matched: [],
  meta: {},
  redirectedFrom: void 0
};
let NavigationType = /* @__PURE__ */ (function(NavigationType$1) {
  NavigationType$1["pop"] = "pop";
  NavigationType$1["push"] = "push";
  return NavigationType$1;
})({});
let NavigationDirection = /* @__PURE__ */ (function(NavigationDirection$1) {
  NavigationDirection$1["back"] = "back";
  NavigationDirection$1["forward"] = "forward";
  NavigationDirection$1["unknown"] = "";
  return NavigationDirection$1;
})({});
function normalizeBase(base) {
  if (!base) if (isBrowser) {
    const baseEl = document.querySelector("base");
    base = baseEl && baseEl.getAttribute("href") || "/";
    base = base.replace(/^\w+:\/\/[^\/]+/, "");
  } else base = "/";
  if (base[0] !== "/" && base[0] !== "#") base = "/" + base;
  return removeTrailingSlash(base);
}
const BEFORE_HASH_RE = /^[^#]+#/;
function createHref(base, location2) {
  return base.replace(BEFORE_HASH_RE, "#") + location2;
}
function getElementPosition(el, offset) {
  const docRect = document.documentElement.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return {
    behavior: offset.behavior,
    left: elRect.left - docRect.left - (offset.left || 0),
    top: elRect.top - docRect.top - (offset.top || 0)
  };
}
const computeScrollPosition = () => ({
  left: window.scrollX,
  top: window.scrollY
});
function scrollToPosition(position) {
  let scrollToOptions;
  if ("el" in position) {
    const positionEl = position.el;
    const isIdSelector = typeof positionEl === "string" && positionEl.startsWith("#");
    const el = typeof positionEl === "string" ? isIdSelector ? document.getElementById(positionEl.slice(1)) : document.querySelector(positionEl) : positionEl;
    if (!el) {
      return;
    }
    scrollToOptions = getElementPosition(el, position);
  } else scrollToOptions = position;
  if ("scrollBehavior" in document.documentElement.style) window.scrollTo(scrollToOptions);
  else window.scrollTo(scrollToOptions.left != null ? scrollToOptions.left : window.scrollX, scrollToOptions.top != null ? scrollToOptions.top : window.scrollY);
}
function getScrollKey(path, delta) {
  return (history.state ? history.state.position - delta : -1) + path;
}
const scrollPositions = /* @__PURE__ */ new Map();
function saveScrollPosition(key, scrollPosition) {
  scrollPositions.set(key, scrollPosition);
}
function getSavedScrollPosition(key) {
  const scroll = scrollPositions.get(key);
  scrollPositions.delete(key);
  return scroll;
}
function isRouteLocation(route) {
  return typeof route === "string" || route && typeof route === "object";
}
function isRouteName(name) {
  return typeof name === "string" || typeof name === "symbol";
}
let ErrorTypes = /* @__PURE__ */ (function(ErrorTypes$1) {
  ErrorTypes$1[ErrorTypes$1["MATCHER_NOT_FOUND"] = 1] = "MATCHER_NOT_FOUND";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_GUARD_REDIRECT"] = 2] = "NAVIGATION_GUARD_REDIRECT";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_ABORTED"] = 4] = "NAVIGATION_ABORTED";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_CANCELLED"] = 8] = "NAVIGATION_CANCELLED";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_DUPLICATED"] = 16] = "NAVIGATION_DUPLICATED";
  return ErrorTypes$1;
})({});
const NavigationFailureSymbol = Symbol("");
({
  [ErrorTypes.MATCHER_NOT_FOUND]({ location: location2, currentLocation }) {
    return `No match for
 ${JSON.stringify(location2)}${currentLocation ? "\nwhile being at\n" + JSON.stringify(currentLocation) : ""}`;
  },
  [ErrorTypes.NAVIGATION_GUARD_REDIRECT]({ from, to }) {
    return `Redirected from "${from.fullPath}" to "${stringifyRoute(to)}" via a navigation guard.`;
  },
  [ErrorTypes.NAVIGATION_ABORTED]({ from, to }) {
    return `Navigation aborted from "${from.fullPath}" to "${to.fullPath}" via a navigation guard.`;
  },
  [ErrorTypes.NAVIGATION_CANCELLED]({ from, to }) {
    return `Navigation cancelled from "${from.fullPath}" to "${to.fullPath}" with a new navigation.`;
  },
  [ErrorTypes.NAVIGATION_DUPLICATED]({ from, to }) {
    return `Avoided redundant navigation to current location: "${from.fullPath}".`;
  }
});
function createRouterError(type, params) {
  return assign(/* @__PURE__ */ new Error(), {
    type,
    [NavigationFailureSymbol]: true
  }, params);
}
function isNavigationFailure(error, type) {
  return error instanceof Error && NavigationFailureSymbol in error && (type == null || !!(error.type & type));
}
const propertiesToLog = [
  "params",
  "query",
  "hash"
];
function stringifyRoute(to) {
  if (typeof to === "string") return to;
  if (to.path != null) return to.path;
  const location2 = {};
  for (const key of propertiesToLog) if (key in to) location2[key] = to[key];
  return JSON.stringify(location2, null, 2);
}
function parseQuery(search) {
  const query = {};
  if (search === "" || search === "?") return query;
  const searchParams = (search[0] === "?" ? search.slice(1) : search).split("&");
  for (let i = 0; i < searchParams.length; ++i) {
    const searchParam = searchParams[i].replace(PLUS_RE, " ");
    const eqPos = searchParam.indexOf("=");
    const key = decode(eqPos < 0 ? searchParam : searchParam.slice(0, eqPos));
    const value = eqPos < 0 ? null : decode(searchParam.slice(eqPos + 1));
    if (key in query) {
      let currentValue = query[key];
      if (!isArray(currentValue)) currentValue = query[key] = [currentValue];
      currentValue.push(value);
    } else query[key] = value;
  }
  return query;
}
function stringifyQuery(query) {
  let search = "";
  for (let key in query) {
    const value = query[key];
    key = encodeQueryKey(key);
    if (value == null) {
      if (value !== void 0) search += (search.length ? "&" : "") + key;
      continue;
    }
    (isArray(value) ? value.map((v) => v && encodeQueryValue(v)) : [value && encodeQueryValue(value)]).forEach((value$1) => {
      if (value$1 !== void 0) {
        search += (search.length ? "&" : "") + key;
        if (value$1 != null) search += "=" + value$1;
      }
    });
  }
  return search;
}
function normalizeQuery(query) {
  const normalizedQuery = {};
  for (const key in query) {
    const value = query[key];
    if (value !== void 0) normalizedQuery[key] = isArray(value) ? value.map((v) => v == null ? null : "" + v) : value == null ? value : "" + value;
  }
  return normalizedQuery;
}
const matchedRouteKey = Symbol("");
const viewDepthKey = Symbol("");
const routerKey = Symbol("");
const routeLocationKey = Symbol("");
const routerViewLocationKey = Symbol("");
function useCallbacks() {
  let handlers2 = [];
  function add(handler) {
    handlers2.push(handler);
    return () => {
      const i = handlers2.indexOf(handler);
      if (i > -1) handlers2.splice(i, 1);
    };
  }
  function reset() {
    handlers2 = [];
  }
  return {
    add,
    list: () => handlers2.slice(),
    reset
  };
}
function guardToPromiseFn(guard, to, from, record, name, runWithContext = (fn) => fn()) {
  const enterCallbackArray = record && (record.enterCallbacks[name] = record.enterCallbacks[name] || []);
  return () => new Promise((resolve2, reject) => {
    const next = (valid) => {
      if (valid === false) reject(createRouterError(ErrorTypes.NAVIGATION_ABORTED, {
        from,
        to
      }));
      else if (valid instanceof Error) reject(valid);
      else if (isRouteLocation(valid)) reject(createRouterError(ErrorTypes.NAVIGATION_GUARD_REDIRECT, {
        from: to,
        to: valid
      }));
      else {
        if (enterCallbackArray && record.enterCallbacks[name] === enterCallbackArray && typeof valid === "function") enterCallbackArray.push(valid);
        resolve2();
      }
    };
    const guardReturn = runWithContext(() => guard.call(record && record.instances[name], to, from, next));
    let guardCall = Promise.resolve(guardReturn);
    if (guard.length < 3) guardCall = guardCall.then(next);
    guardCall.catch((err) => reject(err));
  });
}
function extractComponentsGuards(matched, guardType, to, from, runWithContext = (fn) => fn()) {
  const guards = [];
  for (const record of matched) {
    for (const name in record.components) {
      let rawComponent = record.components[name];
      if (guardType !== "beforeRouteEnter" && !record.instances[name]) continue;
      if (isRouteComponent(rawComponent)) {
        const guard = (rawComponent.__vccOpts || rawComponent)[guardType];
        guard && guards.push(guardToPromiseFn(guard, to, from, record, name, runWithContext));
      } else {
        let componentPromise = rawComponent();
        guards.push(() => componentPromise.then((resolved) => {
          if (!resolved) throw new Error(`Couldn't resolve component "${name}" at "${record.path}"`);
          const resolvedComponent = isESModule(resolved) ? resolved.default : resolved;
          record.mods[name] = resolved;
          record.components[name] = resolvedComponent;
          const guard = (resolvedComponent.__vccOpts || resolvedComponent)[guardType];
          return guard && guardToPromiseFn(guard, to, from, record, name, runWithContext)();
        }));
      }
    }
  }
  return guards;
}
function extractChangingRecords(to, from) {
  const leavingRecords = [];
  const updatingRecords = [];
  const enteringRecords = [];
  const len = Math.max(from.matched.length, to.matched.length);
  for (let i = 0; i < len; i++) {
    const recordFrom = from.matched[i];
    if (recordFrom) if (to.matched.find((record) => isSameRouteRecord(record, recordFrom))) updatingRecords.push(recordFrom);
    else leavingRecords.push(recordFrom);
    const recordTo = to.matched[i];
    if (recordTo) {
      if (!from.matched.find((record) => isSameRouteRecord(record, recordTo))) enteringRecords.push(recordTo);
    }
  }
  return [
    leavingRecords,
    updatingRecords,
    enteringRecords
  ];
}
/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let createBaseLocation = () => location.protocol + "//" + location.host;
function createCurrentLocation(base, location$1) {
  const { pathname, search, hash } = location$1;
  const hashPos = base.indexOf("#");
  if (hashPos > -1) {
    let slicePos = hash.includes(base.slice(hashPos)) ? base.slice(hashPos).length : 1;
    let pathFromHash = hash.slice(slicePos);
    if (pathFromHash[0] !== "/") pathFromHash = "/" + pathFromHash;
    return stripBase(pathFromHash, "");
  }
  return stripBase(pathname, base) + search + hash;
}
function useHistoryListeners(base, historyState, currentLocation, replace) {
  let listeners = [];
  let teardowns = [];
  let pauseState = null;
  const popStateHandler = ({ state: state2 }) => {
    const to = createCurrentLocation(base, location);
    const from = currentLocation.value;
    const fromState = historyState.value;
    let delta = 0;
    if (state2) {
      currentLocation.value = to;
      historyState.value = state2;
      if (pauseState && pauseState === from) {
        pauseState = null;
        return;
      }
      delta = fromState ? state2.position - fromState.position : 0;
    } else replace(to);
    listeners.forEach((listener) => {
      listener(currentLocation.value, from, {
        delta,
        type: NavigationType.pop,
        direction: delta ? delta > 0 ? NavigationDirection.forward : NavigationDirection.back : NavigationDirection.unknown
      });
    });
  };
  function pauseListeners() {
    pauseState = currentLocation.value;
  }
  function listen(callback) {
    listeners.push(callback);
    const teardown = () => {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    };
    teardowns.push(teardown);
    return teardown;
  }
  function beforeUnloadListener() {
    if (document.visibilityState === "hidden") {
      const { history: history$1 } = window;
      if (!history$1.state) return;
      history$1.replaceState(assign({}, history$1.state, { scroll: computeScrollPosition() }), "");
    }
  }
  function destroy() {
    for (const teardown of teardowns) teardown();
    teardowns = [];
    window.removeEventListener("popstate", popStateHandler);
    window.removeEventListener("pagehide", beforeUnloadListener);
    document.removeEventListener("visibilitychange", beforeUnloadListener);
  }
  window.addEventListener("popstate", popStateHandler);
  window.addEventListener("pagehide", beforeUnloadListener);
  document.addEventListener("visibilitychange", beforeUnloadListener);
  return {
    pauseListeners,
    listen,
    destroy
  };
}
function buildState(back, current, forward, replaced = false, computeScroll = false) {
  return {
    back,
    current,
    forward,
    replaced,
    position: window.history.length,
    scroll: computeScroll ? computeScrollPosition() : null
  };
}
function useHistoryStateNavigation(base) {
  const { history: history$1, location: location$1 } = window;
  const currentLocation = { value: createCurrentLocation(base, location$1) };
  const historyState = { value: history$1.state };
  if (!historyState.value) changeLocation(currentLocation.value, {
    back: null,
    current: currentLocation.value,
    forward: null,
    position: history$1.length - 1,
    replaced: true,
    scroll: null
  }, true);
  function changeLocation(to, state2, replace$1) {
    const hashIndex = base.indexOf("#");
    const url = hashIndex > -1 ? (location$1.host && document.querySelector("base") ? base : base.slice(hashIndex)) + to : createBaseLocation() + base + to;
    try {
      history$1[replace$1 ? "replaceState" : "pushState"](state2, "", url);
      historyState.value = state2;
    } catch (err) {
      console.error(err);
      location$1[replace$1 ? "replace" : "assign"](url);
    }
  }
  function replace(to, data) {
    changeLocation(to, assign({}, history$1.state, buildState(historyState.value.back, to, historyState.value.forward, true), data, { position: historyState.value.position }), true);
    currentLocation.value = to;
  }
  function push(to, data) {
    const currentState = assign({}, historyState.value, history$1.state, {
      forward: to,
      scroll: computeScrollPosition()
    });
    changeLocation(currentState.current, currentState, true);
    changeLocation(to, assign({}, buildState(currentLocation.value, to, null), { position: currentState.position + 1 }, data), false);
    currentLocation.value = to;
  }
  return {
    location: currentLocation,
    state: historyState,
    push,
    replace
  };
}
function createWebHistory(base) {
  base = normalizeBase(base);
  const historyNavigation = useHistoryStateNavigation(base);
  const historyListeners = useHistoryListeners(base, historyNavigation.state, historyNavigation.location, historyNavigation.replace);
  function go(delta, triggerListeners = true) {
    if (!triggerListeners) historyListeners.pauseListeners();
    history.go(delta);
  }
  const routerHistory = assign({
    location: "",
    base,
    go,
    createHref: createHref.bind(null, base)
  }, historyNavigation, historyListeners);
  Object.defineProperty(routerHistory, "location", {
    enumerable: true,
    get: () => historyNavigation.location.value
  });
  Object.defineProperty(routerHistory, "state", {
    enumerable: true,
    get: () => historyNavigation.state.value
  });
  return routerHistory;
}
function createWebHashHistory(base) {
  base = location.host ? base || location.pathname + location.search : "";
  if (!base.includes("#")) base += "#";
  return createWebHistory(base);
}
let TokenType = /* @__PURE__ */ (function(TokenType$1) {
  TokenType$1[TokenType$1["Static"] = 0] = "Static";
  TokenType$1[TokenType$1["Param"] = 1] = "Param";
  TokenType$1[TokenType$1["Group"] = 2] = "Group";
  return TokenType$1;
})({});
var TokenizerState = /* @__PURE__ */ (function(TokenizerState$1) {
  TokenizerState$1[TokenizerState$1["Static"] = 0] = "Static";
  TokenizerState$1[TokenizerState$1["Param"] = 1] = "Param";
  TokenizerState$1[TokenizerState$1["ParamRegExp"] = 2] = "ParamRegExp";
  TokenizerState$1[TokenizerState$1["ParamRegExpEnd"] = 3] = "ParamRegExpEnd";
  TokenizerState$1[TokenizerState$1["EscapeNext"] = 4] = "EscapeNext";
  return TokenizerState$1;
})(TokenizerState || {});
const ROOT_TOKEN = {
  type: TokenType.Static,
  value: ""
};
const VALID_PARAM_RE = /[a-zA-Z0-9_]/;
function tokenizePath(path) {
  if (!path) return [[]];
  if (path === "/") return [[ROOT_TOKEN]];
  if (!path.startsWith("/")) throw new Error(`Invalid path "${path}"`);
  function crash(message) {
    throw new Error(`ERR (${state2})/"${buffer}": ${message}`);
  }
  let state2 = TokenizerState.Static;
  let previousState = state2;
  const tokens = [];
  let segment;
  function finalizeSegment() {
    if (segment) tokens.push(segment);
    segment = [];
  }
  let i = 0;
  let char;
  let buffer = "";
  let customRe = "";
  function consumeBuffer() {
    if (!buffer) return;
    if (state2 === TokenizerState.Static) segment.push({
      type: TokenType.Static,
      value: buffer
    });
    else if (state2 === TokenizerState.Param || state2 === TokenizerState.ParamRegExp || state2 === TokenizerState.ParamRegExpEnd) {
      if (segment.length > 1 && (char === "*" || char === "+")) crash(`A repeatable param (${buffer}) must be alone in its segment. eg: '/:ids+.`);
      segment.push({
        type: TokenType.Param,
        value: buffer,
        regexp: customRe,
        repeatable: char === "*" || char === "+",
        optional: char === "*" || char === "?"
      });
    } else crash("Invalid state to consume buffer");
    buffer = "";
  }
  function addCharToBuffer() {
    buffer += char;
  }
  while (i < path.length) {
    char = path[i++];
    if (char === "\\" && state2 !== TokenizerState.ParamRegExp) {
      previousState = state2;
      state2 = TokenizerState.EscapeNext;
      continue;
    }
    switch (state2) {
      case TokenizerState.Static:
        if (char === "/") {
          if (buffer) consumeBuffer();
          finalizeSegment();
        } else if (char === ":") {
          consumeBuffer();
          state2 = TokenizerState.Param;
        } else addCharToBuffer();
        break;
      case TokenizerState.EscapeNext:
        addCharToBuffer();
        state2 = previousState;
        break;
      case TokenizerState.Param:
        if (char === "(") state2 = TokenizerState.ParamRegExp;
        else if (VALID_PARAM_RE.test(char)) addCharToBuffer();
        else {
          consumeBuffer();
          state2 = TokenizerState.Static;
          if (char !== "*" && char !== "?" && char !== "+") i--;
        }
        break;
      case TokenizerState.ParamRegExp:
        if (char === ")") if (customRe[customRe.length - 1] == "\\") customRe = customRe.slice(0, -1) + char;
        else state2 = TokenizerState.ParamRegExpEnd;
        else customRe += char;
        break;
      case TokenizerState.ParamRegExpEnd:
        consumeBuffer();
        state2 = TokenizerState.Static;
        if (char !== "*" && char !== "?" && char !== "+") i--;
        customRe = "";
        break;
      default:
        crash("Unknown state");
        break;
    }
  }
  if (state2 === TokenizerState.ParamRegExp) crash(`Unfinished custom RegExp for param "${buffer}"`);
  consumeBuffer();
  finalizeSegment();
  return tokens;
}
const BASE_PARAM_PATTERN = "[^/]+?";
const BASE_PATH_PARSER_OPTIONS = {
  sensitive: false,
  strict: false,
  start: true,
  end: true
};
var PathScore = /* @__PURE__ */ (function(PathScore$1) {
  PathScore$1[PathScore$1["_multiplier"] = 10] = "_multiplier";
  PathScore$1[PathScore$1["Root"] = 90] = "Root";
  PathScore$1[PathScore$1["Segment"] = 40] = "Segment";
  PathScore$1[PathScore$1["SubSegment"] = 30] = "SubSegment";
  PathScore$1[PathScore$1["Static"] = 40] = "Static";
  PathScore$1[PathScore$1["Dynamic"] = 20] = "Dynamic";
  PathScore$1[PathScore$1["BonusCustomRegExp"] = 10] = "BonusCustomRegExp";
  PathScore$1[PathScore$1["BonusWildcard"] = -50] = "BonusWildcard";
  PathScore$1[PathScore$1["BonusRepeatable"] = -20] = "BonusRepeatable";
  PathScore$1[PathScore$1["BonusOptional"] = -8] = "BonusOptional";
  PathScore$1[PathScore$1["BonusStrict"] = 0.7000000000000001] = "BonusStrict";
  PathScore$1[PathScore$1["BonusCaseSensitive"] = 0.25] = "BonusCaseSensitive";
  return PathScore$1;
})(PathScore || {});
const REGEX_CHARS_RE = /[.+*?^${}()[\]/\\]/g;
function tokensToParser(segments, extraOptions) {
  const options = assign({}, BASE_PATH_PARSER_OPTIONS, extraOptions);
  const score = [];
  let pattern = options.start ? "^" : "";
  const keys = [];
  for (const segment of segments) {
    const segmentScores = segment.length ? [] : [PathScore.Root];
    if (options.strict && !segment.length) pattern += "/";
    for (let tokenIndex = 0; tokenIndex < segment.length; tokenIndex++) {
      const token = segment[tokenIndex];
      let subSegmentScore = PathScore.Segment + (options.sensitive ? PathScore.BonusCaseSensitive : 0);
      if (token.type === TokenType.Static) {
        if (!tokenIndex) pattern += "/";
        pattern += token.value.replace(REGEX_CHARS_RE, "\\$&");
        subSegmentScore += PathScore.Static;
      } else if (token.type === TokenType.Param) {
        const { value, repeatable, optional, regexp } = token;
        keys.push({
          name: value,
          repeatable,
          optional
        });
        const re$1 = regexp ? regexp : BASE_PARAM_PATTERN;
        if (re$1 !== BASE_PARAM_PATTERN) {
          subSegmentScore += PathScore.BonusCustomRegExp;
          try {
            `${re$1}`;
          } catch (err) {
            throw new Error(`Invalid custom RegExp for param "${value}" (${re$1}): ` + err.message);
          }
        }
        let subPattern = repeatable ? `((?:${re$1})(?:/(?:${re$1}))*)` : `(${re$1})`;
        if (!tokenIndex) subPattern = optional && segment.length < 2 ? `(?:/${subPattern})` : "/" + subPattern;
        if (optional) subPattern += "?";
        pattern += subPattern;
        subSegmentScore += PathScore.Dynamic;
        if (optional) subSegmentScore += PathScore.BonusOptional;
        if (repeatable) subSegmentScore += PathScore.BonusRepeatable;
        if (re$1 === ".*") subSegmentScore += PathScore.BonusWildcard;
      }
      segmentScores.push(subSegmentScore);
    }
    score.push(segmentScores);
  }
  if (options.strict && options.end) {
    const i = score.length - 1;
    score[i][score[i].length - 1] += PathScore.BonusStrict;
  }
  if (!options.strict) pattern += "/?";
  if (options.end) pattern += "$";
  else if (options.strict && !pattern.endsWith("/")) pattern += "(?:/|$)";
  const re = new RegExp(pattern, options.sensitive ? "" : "i");
  function parse(path) {
    const match = path.match(re);
    const params = {};
    if (!match) return null;
    for (let i = 1; i < match.length; i++) {
      const value = match[i] || "";
      const key = keys[i - 1];
      params[key.name] = value && key.repeatable ? value.split("/") : value;
    }
    return params;
  }
  function stringify(params) {
    let path = "";
    let avoidDuplicatedSlash = false;
    for (const segment of segments) {
      if (!avoidDuplicatedSlash || !path.endsWith("/")) path += "/";
      avoidDuplicatedSlash = false;
      for (const token of segment) if (token.type === TokenType.Static) path += token.value;
      else if (token.type === TokenType.Param) {
        const { value, repeatable, optional } = token;
        const param = value in params ? params[value] : "";
        if (isArray(param) && !repeatable) throw new Error(`Provided param "${value}" is an array but it is not repeatable (* or + modifiers)`);
        const text = isArray(param) ? param.join("/") : param;
        if (!text) if (optional) {
          if (segment.length < 2) if (path.endsWith("/")) path = path.slice(0, -1);
          else avoidDuplicatedSlash = true;
        } else throw new Error(`Missing required param "${value}"`);
        path += text;
      }
    }
    return path || "/";
  }
  return {
    re,
    score,
    keys,
    parse,
    stringify
  };
}
function compareScoreArray(a, b) {
  let i = 0;
  while (i < a.length && i < b.length) {
    const diff = b[i] - a[i];
    if (diff) return diff;
    i++;
  }
  if (a.length < b.length) return a.length === 1 && a[0] === PathScore.Static + PathScore.Segment ? -1 : 1;
  else if (a.length > b.length) return b.length === 1 && b[0] === PathScore.Static + PathScore.Segment ? 1 : -1;
  return 0;
}
function comparePathParserScore(a, b) {
  let i = 0;
  const aScore = a.score;
  const bScore = b.score;
  while (i < aScore.length && i < bScore.length) {
    const comp = compareScoreArray(aScore[i], bScore[i]);
    if (comp) return comp;
    i++;
  }
  if (Math.abs(bScore.length - aScore.length) === 1) {
    if (isLastScoreNegative(aScore)) return 1;
    if (isLastScoreNegative(bScore)) return -1;
  }
  return bScore.length - aScore.length;
}
function isLastScoreNegative(score) {
  const last = score[score.length - 1];
  return score.length > 0 && last[last.length - 1] < 0;
}
const PATH_PARSER_OPTIONS_DEFAULTS = {
  strict: false,
  end: true,
  sensitive: false
};
function createRouteRecordMatcher(record, parent, options) {
  const parser = tokensToParser(tokenizePath(record.path), options);
  const matcher = assign(parser, {
    record,
    parent,
    children: [],
    alias: []
  });
  if (parent) {
    if (!matcher.record.aliasOf === !parent.record.aliasOf) parent.children.push(matcher);
  }
  return matcher;
}
function createRouterMatcher(routes2, globalOptions) {
  const matchers = [];
  const matcherMap = /* @__PURE__ */ new Map();
  globalOptions = mergeOptions(PATH_PARSER_OPTIONS_DEFAULTS, globalOptions);
  function getRecordMatcher(name) {
    return matcherMap.get(name);
  }
  function addRoute(record, parent, originalRecord) {
    const isRootAdd = !originalRecord;
    const mainNormalizedRecord = normalizeRouteRecord(record);
    mainNormalizedRecord.aliasOf = originalRecord && originalRecord.record;
    const options = mergeOptions(globalOptions, record);
    const normalizedRecords = [mainNormalizedRecord];
    if ("alias" in record) {
      const aliases = typeof record.alias === "string" ? [record.alias] : record.alias;
      for (const alias of aliases) normalizedRecords.push(normalizeRouteRecord(assign({}, mainNormalizedRecord, {
        components: originalRecord ? originalRecord.record.components : mainNormalizedRecord.components,
        path: alias,
        aliasOf: originalRecord ? originalRecord.record : mainNormalizedRecord
      })));
    }
    let matcher;
    let originalMatcher;
    for (const normalizedRecord of normalizedRecords) {
      const { path } = normalizedRecord;
      if (parent && path[0] !== "/") {
        const parentPath = parent.record.path;
        const connectingSlash = parentPath[parentPath.length - 1] === "/" ? "" : "/";
        normalizedRecord.path = parent.record.path + (path && connectingSlash + path);
      }
      matcher = createRouteRecordMatcher(normalizedRecord, parent, options);
      if (originalRecord) {
        originalRecord.alias.push(matcher);
      } else {
        originalMatcher = originalMatcher || matcher;
        if (originalMatcher !== matcher) originalMatcher.alias.push(matcher);
        if (isRootAdd && record.name && !isAliasRecord(matcher)) {
          removeRoute(record.name);
        }
      }
      if (isMatchable(matcher)) insertMatcher(matcher);
      if (mainNormalizedRecord.children) {
        const children = mainNormalizedRecord.children;
        for (let i = 0; i < children.length; i++) addRoute(children[i], matcher, originalRecord && originalRecord.children[i]);
      }
      originalRecord = originalRecord || matcher;
    }
    return originalMatcher ? () => {
      removeRoute(originalMatcher);
    } : noop;
  }
  function removeRoute(matcherRef) {
    if (isRouteName(matcherRef)) {
      const matcher = matcherMap.get(matcherRef);
      if (matcher) {
        matcherMap.delete(matcherRef);
        matchers.splice(matchers.indexOf(matcher), 1);
        matcher.children.forEach(removeRoute);
        matcher.alias.forEach(removeRoute);
      }
    } else {
      const index = matchers.indexOf(matcherRef);
      if (index > -1) {
        matchers.splice(index, 1);
        if (matcherRef.record.name) matcherMap.delete(matcherRef.record.name);
        matcherRef.children.forEach(removeRoute);
        matcherRef.alias.forEach(removeRoute);
      }
    }
  }
  function getRoutes() {
    return matchers;
  }
  function insertMatcher(matcher) {
    const index = findInsertionIndex(matcher, matchers);
    matchers.splice(index, 0, matcher);
    if (matcher.record.name && !isAliasRecord(matcher)) matcherMap.set(matcher.record.name, matcher);
  }
  function resolve2(location$1, currentLocation) {
    let matcher;
    let params = {};
    let path;
    let name;
    if ("name" in location$1 && location$1.name) {
      matcher = matcherMap.get(location$1.name);
      if (!matcher) throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, { location: location$1 });
      name = matcher.record.name;
      params = assign(pickParams(currentLocation.params, matcher.keys.filter((k) => !k.optional).concat(matcher.parent ? matcher.parent.keys.filter((k) => k.optional) : []).map((k) => k.name)), location$1.params && pickParams(location$1.params, matcher.keys.map((k) => k.name)));
      path = matcher.stringify(params);
    } else if (location$1.path != null) {
      path = location$1.path;
      matcher = matchers.find((m) => m.re.test(path));
      if (matcher) {
        params = matcher.parse(path);
        name = matcher.record.name;
      }
    } else {
      matcher = currentLocation.name ? matcherMap.get(currentLocation.name) : matchers.find((m) => m.re.test(currentLocation.path));
      if (!matcher) throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, {
        location: location$1,
        currentLocation
      });
      name = matcher.record.name;
      params = assign({}, currentLocation.params, location$1.params);
      path = matcher.stringify(params);
    }
    const matched = [];
    let parentMatcher = matcher;
    while (parentMatcher) {
      matched.unshift(parentMatcher.record);
      parentMatcher = parentMatcher.parent;
    }
    return {
      name,
      path,
      params,
      matched,
      meta: mergeMetaFields(matched)
    };
  }
  routes2.forEach((route) => addRoute(route));
  function clearRoutes() {
    matchers.length = 0;
    matcherMap.clear();
  }
  return {
    addRoute,
    resolve: resolve2,
    removeRoute,
    clearRoutes,
    getRoutes,
    getRecordMatcher
  };
}
function pickParams(params, keys) {
  const newParams = {};
  for (const key of keys) if (key in params) newParams[key] = params[key];
  return newParams;
}
function normalizeRouteRecord(record) {
  const normalized = {
    path: record.path,
    redirect: record.redirect,
    name: record.name,
    meta: record.meta || {},
    aliasOf: record.aliasOf,
    beforeEnter: record.beforeEnter,
    props: normalizeRecordProps(record),
    children: record.children || [],
    instances: {},
    leaveGuards: /* @__PURE__ */ new Set(),
    updateGuards: /* @__PURE__ */ new Set(),
    enterCallbacks: {},
    components: "components" in record ? record.components || null : record.component && { default: record.component }
  };
  Object.defineProperty(normalized, "mods", { value: {} });
  return normalized;
}
function normalizeRecordProps(record) {
  const propsObject = {};
  const props = record.props || false;
  if ("component" in record) propsObject.default = props;
  else for (const name in record.components) propsObject[name] = typeof props === "object" ? props[name] : props;
  return propsObject;
}
function isAliasRecord(record) {
  while (record) {
    if (record.record.aliasOf) return true;
    record = record.parent;
  }
  return false;
}
function mergeMetaFields(matched) {
  return matched.reduce((meta, record) => assign(meta, record.meta), {});
}
function findInsertionIndex(matcher, matchers) {
  let lower = 0;
  let upper = matchers.length;
  while (lower !== upper) {
    const mid = lower + upper >> 1;
    if (comparePathParserScore(matcher, matchers[mid]) < 0) upper = mid;
    else lower = mid + 1;
  }
  const insertionAncestor = getInsertionAncestor(matcher);
  if (insertionAncestor) {
    upper = matchers.lastIndexOf(insertionAncestor, upper - 1);
  }
  return upper;
}
function getInsertionAncestor(matcher) {
  let ancestor = matcher;
  while (ancestor = ancestor.parent) if (isMatchable(ancestor) && comparePathParserScore(matcher, ancestor) === 0) return ancestor;
}
function isMatchable({ record }) {
  return !!(record.name || record.components && Object.keys(record.components).length || record.redirect);
}
function useLink(props) {
  const router2 = inject(routerKey);
  const currentRoute = inject(routeLocationKey);
  const route = computed(() => {
    const to = unref(props.to);
    return router2.resolve(to);
  });
  const activeRecordIndex = computed(() => {
    const { matched } = route.value;
    const { length } = matched;
    const routeMatched = matched[length - 1];
    const currentMatched = currentRoute.matched;
    if (!routeMatched || !currentMatched.length) return -1;
    const index = currentMatched.findIndex(isSameRouteRecord.bind(null, routeMatched));
    if (index > -1) return index;
    const parentRecordPath = getOriginalPath(matched[length - 2]);
    return length > 1 && getOriginalPath(routeMatched) === parentRecordPath && currentMatched[currentMatched.length - 1].path !== parentRecordPath ? currentMatched.findIndex(isSameRouteRecord.bind(null, matched[length - 2])) : index;
  });
  const isActive = computed(() => activeRecordIndex.value > -1 && includesParams(currentRoute.params, route.value.params));
  const isExactActive = computed(() => activeRecordIndex.value > -1 && activeRecordIndex.value === currentRoute.matched.length - 1 && isSameRouteLocationParams(currentRoute.params, route.value.params));
  function navigate(e = {}) {
    if (guardEvent(e)) {
      const p2 = router2[unref(props.replace) ? "replace" : "push"](unref(props.to)).catch(noop);
      if (props.viewTransition && typeof document !== "undefined" && "startViewTransition" in document) document.startViewTransition(() => p2);
      return p2;
    }
    return Promise.resolve();
  }
  return {
    route,
    href: computed(() => route.value.href),
    isActive,
    isExactActive,
    navigate
  };
}
function preferSingleVNode(vnodes) {
  return vnodes.length === 1 ? vnodes[0] : vnodes;
}
const RouterLinkImpl = /* @__PURE__ */ defineComponent({
  name: "RouterLink",
  compatConfig: { MODE: 3 },
  props: {
    to: {
      type: [String, Object],
      required: true
    },
    replace: Boolean,
    activeClass: String,
    exactActiveClass: String,
    custom: Boolean,
    ariaCurrentValue: {
      type: String,
      default: "page"
    },
    viewTransition: Boolean
  },
  useLink,
  setup(props, { slots }) {
    const link = /* @__PURE__ */ reactive(useLink(props));
    const { options } = inject(routerKey);
    const elClass = computed(() => ({
      [getLinkClass(props.activeClass, options.linkActiveClass, "router-link-active")]: link.isActive,
      [getLinkClass(props.exactActiveClass, options.linkExactActiveClass, "router-link-exact-active")]: link.isExactActive
    }));
    return () => {
      const children = slots.default && preferSingleVNode(slots.default(link));
      return props.custom ? children : h("a", {
        "aria-current": link.isExactActive ? props.ariaCurrentValue : null,
        href: link.href,
        onClick: link.navigate,
        class: elClass.value
      }, children);
    };
  }
});
const RouterLink = RouterLinkImpl;
function guardEvent(e) {
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
  if (e.defaultPrevented) return;
  if (e.button !== void 0 && e.button !== 0) return;
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute("target");
    if (/\b_blank\b/i.test(target)) return;
  }
  if (e.preventDefault) e.preventDefault();
  return true;
}
function includesParams(outer, inner) {
  for (const key in inner) {
    const innerValue = inner[key];
    const outerValue = outer[key];
    if (typeof innerValue === "string") {
      if (innerValue !== outerValue) return false;
    } else if (!isArray(outerValue) || outerValue.length !== innerValue.length || innerValue.some((value, i) => value.valueOf() !== outerValue[i].valueOf())) return false;
  }
  return true;
}
function getOriginalPath(record) {
  return record ? record.aliasOf ? record.aliasOf.path : record.path : "";
}
const getLinkClass = (propClass, globalClass, defaultClass) => propClass != null ? propClass : globalClass != null ? globalClass : defaultClass;
const RouterViewImpl = /* @__PURE__ */ defineComponent({
  name: "RouterView",
  inheritAttrs: false,
  props: {
    name: {
      type: String,
      default: "default"
    },
    route: Object
  },
  compatConfig: { MODE: 3 },
  setup(props, { attrs, slots }) {
    const injectedRoute = inject(routerViewLocationKey);
    const routeToDisplay = computed(() => props.route || injectedRoute.value);
    const injectedDepth = inject(viewDepthKey, 0);
    const depth = computed(() => {
      let initialDepth = unref(injectedDepth);
      const { matched } = routeToDisplay.value;
      let matchedRoute;
      while ((matchedRoute = matched[initialDepth]) && !matchedRoute.components) initialDepth++;
      return initialDepth;
    });
    const matchedRouteRef = computed(() => routeToDisplay.value.matched[depth.value]);
    provide(viewDepthKey, computed(() => depth.value + 1));
    provide(matchedRouteKey, matchedRouteRef);
    provide(routerViewLocationKey, routeToDisplay);
    const viewRef = /* @__PURE__ */ ref();
    watch(() => [
      viewRef.value,
      matchedRouteRef.value,
      props.name
    ], ([instance, to, name], [oldInstance, from, oldName]) => {
      if (to) {
        to.instances[name] = instance;
        if (from && from !== to && instance && instance === oldInstance) {
          if (!to.leaveGuards.size) to.leaveGuards = from.leaveGuards;
          if (!to.updateGuards.size) to.updateGuards = from.updateGuards;
        }
      }
      if (instance && to && (!from || !isSameRouteRecord(to, from) || !oldInstance)) (to.enterCallbacks[name] || []).forEach((callback) => callback(instance));
    }, { flush: "post" });
    return () => {
      const route = routeToDisplay.value;
      const currentName = props.name;
      const matchedRoute = matchedRouteRef.value;
      const ViewComponent = matchedRoute && matchedRoute.components[currentName];
      if (!ViewComponent) return normalizeSlot(slots.default, {
        Component: ViewComponent,
        route
      });
      const routePropsOption = matchedRoute.props[currentName];
      const routeProps = routePropsOption ? routePropsOption === true ? route.params : typeof routePropsOption === "function" ? routePropsOption(route) : routePropsOption : null;
      const onVnodeUnmounted = (vnode) => {
        if (vnode.component.isUnmounted) matchedRoute.instances[currentName] = null;
      };
      const component = h(ViewComponent, assign({}, routeProps, attrs, {
        onVnodeUnmounted,
        ref: viewRef
      }));
      return normalizeSlot(slots.default, {
        Component: component,
        route
      }) || component;
    };
  }
});
function normalizeSlot(slot, data) {
  if (!slot) return null;
  const slotContent = slot(data);
  return slotContent.length === 1 ? slotContent[0] : slotContent;
}
const RouterView = RouterViewImpl;
function createRouter(options) {
  const matcher = createRouterMatcher(options.routes, options);
  const parseQuery$1 = options.parseQuery || parseQuery;
  const stringifyQuery$1 = options.stringifyQuery || stringifyQuery;
  const routerHistory = options.history;
  const beforeGuards = useCallbacks();
  const beforeResolveGuards = useCallbacks();
  const afterGuards = useCallbacks();
  const currentRoute = /* @__PURE__ */ shallowRef(START_LOCATION_NORMALIZED);
  let pendingLocation = START_LOCATION_NORMALIZED;
  if (isBrowser && options.scrollBehavior && "scrollRestoration" in history) history.scrollRestoration = "manual";
  const normalizeParams = applyToParams.bind(null, (paramValue) => "" + paramValue);
  const encodeParams = applyToParams.bind(null, encodeParam);
  const decodeParams = applyToParams.bind(null, decode);
  function addRoute(parentOrRoute, route) {
    let parent;
    let record;
    if (isRouteName(parentOrRoute)) {
      parent = matcher.getRecordMatcher(parentOrRoute);
      record = route;
    } else record = parentOrRoute;
    return matcher.addRoute(record, parent);
  }
  function removeRoute(name) {
    const recordMatcher = matcher.getRecordMatcher(name);
    if (recordMatcher) matcher.removeRoute(recordMatcher);
  }
  function getRoutes() {
    return matcher.getRoutes().map((routeMatcher) => routeMatcher.record);
  }
  function hasRoute(name) {
    return !!matcher.getRecordMatcher(name);
  }
  function resolve2(rawLocation, currentLocation) {
    currentLocation = assign({}, currentLocation || currentRoute.value);
    if (typeof rawLocation === "string") {
      const locationNormalized = parseURL(parseQuery$1, rawLocation, currentLocation.path);
      const matchedRoute$1 = matcher.resolve({ path: locationNormalized.path }, currentLocation);
      const href$1 = routerHistory.createHref(locationNormalized.fullPath);
      return assign(locationNormalized, matchedRoute$1, {
        params: decodeParams(matchedRoute$1.params),
        hash: decode(locationNormalized.hash),
        redirectedFrom: void 0,
        href: href$1
      });
    }
    let matcherLocation;
    if (rawLocation.path != null) {
      matcherLocation = assign({}, rawLocation, { path: parseURL(parseQuery$1, rawLocation.path, currentLocation.path).path });
    } else {
      const targetParams = assign({}, rawLocation.params);
      for (const key in targetParams) if (targetParams[key] == null) delete targetParams[key];
      matcherLocation = assign({}, rawLocation, { params: encodeParams(targetParams) });
      currentLocation.params = encodeParams(currentLocation.params);
    }
    const matchedRoute = matcher.resolve(matcherLocation, currentLocation);
    const hash = rawLocation.hash || "";
    matchedRoute.params = normalizeParams(decodeParams(matchedRoute.params));
    const fullPath = stringifyURL(stringifyQuery$1, assign({}, rawLocation, {
      hash: encodeHash(hash),
      path: matchedRoute.path
    }));
    const href = routerHistory.createHref(fullPath);
    return assign({
      fullPath,
      hash,
      query: stringifyQuery$1 === stringifyQuery ? normalizeQuery(rawLocation.query) : rawLocation.query || {}
    }, matchedRoute, {
      redirectedFrom: void 0,
      href
    });
  }
  function locationAsObject(to) {
    return typeof to === "string" ? parseURL(parseQuery$1, to, currentRoute.value.path) : assign({}, to);
  }
  function checkCanceledNavigation(to, from) {
    if (pendingLocation !== to) return createRouterError(ErrorTypes.NAVIGATION_CANCELLED, {
      from,
      to
    });
  }
  function push(to) {
    return pushWithRedirect(to);
  }
  function replace(to) {
    return push(assign(locationAsObject(to), { replace: true }));
  }
  function handleRedirectRecord(to, from) {
    const lastMatched = to.matched[to.matched.length - 1];
    if (lastMatched && lastMatched.redirect) {
      const { redirect } = lastMatched;
      let newTargetLocation = typeof redirect === "function" ? redirect(to, from) : redirect;
      if (typeof newTargetLocation === "string") {
        newTargetLocation = newTargetLocation.includes("?") || newTargetLocation.includes("#") ? newTargetLocation = locationAsObject(newTargetLocation) : { path: newTargetLocation };
        newTargetLocation.params = {};
      }
      return assign({
        query: to.query,
        hash: to.hash,
        params: newTargetLocation.path != null ? {} : to.params
      }, newTargetLocation);
    }
  }
  function pushWithRedirect(to, redirectedFrom) {
    const targetLocation = pendingLocation = resolve2(to);
    const from = currentRoute.value;
    const data = to.state;
    const force = to.force;
    const replace$1 = to.replace === true;
    const shouldRedirect = handleRedirectRecord(targetLocation, from);
    if (shouldRedirect) return pushWithRedirect(assign(locationAsObject(shouldRedirect), {
      state: typeof shouldRedirect === "object" ? assign({}, data, shouldRedirect.state) : data,
      force,
      replace: replace$1
    }), redirectedFrom || targetLocation);
    const toLocation = targetLocation;
    toLocation.redirectedFrom = redirectedFrom;
    let failure;
    if (!force && isSameRouteLocation(stringifyQuery$1, from, targetLocation)) {
      failure = createRouterError(ErrorTypes.NAVIGATION_DUPLICATED, {
        to: toLocation,
        from
      });
      handleScroll(from, from, true, false);
    }
    return (failure ? Promise.resolve(failure) : navigate(toLocation, from)).catch((error) => isNavigationFailure(error) ? isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT) ? error : markAsReady(error) : triggerError(error, toLocation, from)).then((failure$1) => {
      if (failure$1) {
        if (isNavigationFailure(failure$1, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
          return pushWithRedirect(assign({ replace: replace$1 }, locationAsObject(failure$1.to), {
            state: typeof failure$1.to === "object" ? assign({}, data, failure$1.to.state) : data,
            force
          }), redirectedFrom || toLocation);
        }
      } else failure$1 = finalizeNavigation(toLocation, from, true, replace$1, data);
      triggerAfterEach(toLocation, from, failure$1);
      return failure$1;
    });
  }
  function checkCanceledNavigationAndReject(to, from) {
    const error = checkCanceledNavigation(to, from);
    return error ? Promise.reject(error) : Promise.resolve();
  }
  function runWithContext(fn) {
    const app2 = installedApps.values().next().value;
    return app2 && typeof app2.runWithContext === "function" ? app2.runWithContext(fn) : fn();
  }
  function navigate(to, from) {
    let guards;
    const [leavingRecords, updatingRecords, enteringRecords] = extractChangingRecords(to, from);
    guards = extractComponentsGuards(leavingRecords.reverse(), "beforeRouteLeave", to, from);
    for (const record of leavingRecords) record.leaveGuards.forEach((guard) => {
      guards.push(guardToPromiseFn(guard, to, from));
    });
    const canceledNavigationCheck = checkCanceledNavigationAndReject.bind(null, to, from);
    guards.push(canceledNavigationCheck);
    return runGuardQueue(guards).then(() => {
      guards = [];
      for (const guard of beforeGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = extractComponentsGuards(updatingRecords, "beforeRouteUpdate", to, from);
      for (const record of updatingRecords) record.updateGuards.forEach((guard) => {
        guards.push(guardToPromiseFn(guard, to, from));
      });
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = [];
      for (const record of enteringRecords) if (record.beforeEnter) if (isArray(record.beforeEnter)) for (const beforeEnter of record.beforeEnter) guards.push(guardToPromiseFn(beforeEnter, to, from));
      else guards.push(guardToPromiseFn(record.beforeEnter, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      to.matched.forEach((record) => record.enterCallbacks = {});
      guards = extractComponentsGuards(enteringRecords, "beforeRouteEnter", to, from, runWithContext);
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = [];
      for (const guard of beforeResolveGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).catch((err) => isNavigationFailure(err, ErrorTypes.NAVIGATION_CANCELLED) ? err : Promise.reject(err));
  }
  function triggerAfterEach(to, from, failure) {
    afterGuards.list().forEach((guard) => runWithContext(() => guard(to, from, failure)));
  }
  function finalizeNavigation(toLocation, from, isPush, replace$1, data) {
    const error = checkCanceledNavigation(toLocation, from);
    if (error) return error;
    const isFirstNavigation = from === START_LOCATION_NORMALIZED;
    const state2 = !isBrowser ? {} : history.state;
    if (isPush) if (replace$1 || isFirstNavigation) routerHistory.replace(toLocation.fullPath, assign({ scroll: isFirstNavigation && state2 && state2.scroll }, data));
    else routerHistory.push(toLocation.fullPath, data);
    currentRoute.value = toLocation;
    handleScroll(toLocation, from, isPush, isFirstNavigation);
    markAsReady();
  }
  let removeHistoryListener;
  function setupListeners() {
    if (removeHistoryListener) return;
    removeHistoryListener = routerHistory.listen((to, _from, info) => {
      if (!router2.listening) return;
      const toLocation = resolve2(to);
      const shouldRedirect = handleRedirectRecord(toLocation, router2.currentRoute.value);
      if (shouldRedirect) {
        pushWithRedirect(assign(shouldRedirect, {
          replace: true,
          force: true
        }), toLocation).catch(noop);
        return;
      }
      pendingLocation = toLocation;
      const from = currentRoute.value;
      if (isBrowser) saveScrollPosition(getScrollKey(from.fullPath, info.delta), computeScrollPosition());
      navigate(toLocation, from).catch((error) => {
        if (isNavigationFailure(error, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_CANCELLED)) return error;
        if (isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
          pushWithRedirect(assign(locationAsObject(error.to), { force: true }), toLocation).then((failure) => {
            if (isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED) && !info.delta && info.type === NavigationType.pop) routerHistory.go(-1, false);
          }).catch(noop);
          return Promise.reject();
        }
        if (info.delta) routerHistory.go(-info.delta, false);
        return triggerError(error, toLocation, from);
      }).then((failure) => {
        failure = failure || finalizeNavigation(toLocation, from, false);
        if (failure) {
          if (info.delta && !isNavigationFailure(failure, ErrorTypes.NAVIGATION_CANCELLED)) routerHistory.go(-info.delta, false);
          else if (info.type === NavigationType.pop && isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED)) routerHistory.go(-1, false);
        }
        triggerAfterEach(toLocation, from, failure);
      }).catch(noop);
    });
  }
  let readyHandlers = useCallbacks();
  let errorListeners = useCallbacks();
  let ready;
  function triggerError(error, to, from) {
    markAsReady(error);
    const list = errorListeners.list();
    if (list.length) list.forEach((handler) => handler(error, to, from));
    else {
      console.error(error);
    }
    return Promise.reject(error);
  }
  function isReady() {
    if (ready && currentRoute.value !== START_LOCATION_NORMALIZED) return Promise.resolve();
    return new Promise((resolve$1, reject) => {
      readyHandlers.add([resolve$1, reject]);
    });
  }
  function markAsReady(err) {
    if (!ready) {
      ready = !err;
      setupListeners();
      readyHandlers.list().forEach(([resolve$1, reject]) => err ? reject(err) : resolve$1());
      readyHandlers.reset();
    }
    return err;
  }
  function handleScroll(to, from, isPush, isFirstNavigation) {
    const { scrollBehavior } = options;
    if (!isBrowser || !scrollBehavior) return Promise.resolve();
    const scrollPosition = !isPush && getSavedScrollPosition(getScrollKey(to.fullPath, 0)) || (isFirstNavigation || !isPush) && history.state && history.state.scroll || null;
    return nextTick().then(() => scrollBehavior(to, from, scrollPosition)).then((position) => position && scrollToPosition(position)).catch((err) => triggerError(err, to, from));
  }
  const go = (delta) => routerHistory.go(delta);
  let started;
  const installedApps = /* @__PURE__ */ new Set();
  const router2 = {
    currentRoute,
    listening: true,
    addRoute,
    removeRoute,
    clearRoutes: matcher.clearRoutes,
    hasRoute,
    getRoutes,
    resolve: resolve2,
    options,
    push,
    replace,
    go,
    back: () => go(-1),
    forward: () => go(1),
    beforeEach: beforeGuards.add,
    beforeResolve: beforeResolveGuards.add,
    afterEach: afterGuards.add,
    onError: errorListeners.add,
    isReady,
    install(app2) {
      app2.component("RouterLink", RouterLink);
      app2.component("RouterView", RouterView);
      app2.config.globalProperties.$router = router2;
      Object.defineProperty(app2.config.globalProperties, "$route", {
        enumerable: true,
        get: () => unref(currentRoute)
      });
      if (isBrowser && !started && currentRoute.value === START_LOCATION_NORMALIZED) {
        started = true;
        push(routerHistory.location).catch((err) => {
        });
      }
      const reactiveRoute = {};
      for (const key in START_LOCATION_NORMALIZED) Object.defineProperty(reactiveRoute, key, {
        get: () => currentRoute.value[key],
        enumerable: true
      });
      app2.provide(routerKey, router2);
      app2.provide(routeLocationKey, /* @__PURE__ */ shallowReactive(reactiveRoute));
      app2.provide(routerViewLocationKey, currentRoute);
      const unmountApp = app2.unmount;
      installedApps.add(app2);
      app2.unmount = function() {
        installedApps.delete(app2);
        if (installedApps.size < 1) {
          pendingLocation = START_LOCATION_NORMALIZED;
          removeHistoryListener && removeHistoryListener();
          removeHistoryListener = null;
          currentRoute.value = START_LOCATION_NORMALIZED;
          started = false;
          ready = false;
        }
        unmountApp();
      };
    }
  };
  function runGuardQueue(guards) {
    return guards.reduce((promise, guard) => promise.then(() => runWithContext(guard)), Promise.resolve());
  }
  return router2;
}
function useRouter() {
  return inject(routerKey);
}
function useRoute(_name) {
  return inject(routeLocationKey);
}
const NAV = [
  { g: "训练" },
  { k: "solo", n: "单人辩论" },
  { k: "room", n: "多人辩论" },
  { k: "hot", n: "热辩榜" },
  { g: "我的" },
  { k: "diag", n: "能力分析" },
  { k: "records", n: "辩论记录" },
  { g: "社区" },
  { k: "community", n: "讨论社区" },
  { g: "视频" },
  { k: "video", n: "视频" },
  { g: "消息" },
  { k: "chat", n: "消息" },
  { k: "friends", n: "好友" },
  { k: "notify", n: "通知" }
];
const TOKEN_KEY = "sy_jwt";
const API_BASE = typeof location !== "undefined" && location.pathname.indexOf("/siyige") === 0 ? "/siyige" : "";
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch (e) {
    return "";
  }
}
function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
  }
}
class ApiError extends Error {
  constructor(message, code, status) {
    super(message || "请求失败");
    this.name = "ApiError";
    this.code = code || "";
    this.status = status || 0;
  }
}
async function request(path, opts = {}) {
  const method = opts.method || "GET";
  const headers = {};
  if (opts.body !== void 0) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  let resp;
  try {
    resp = await fetch(API_BASE + path, {
      method,
      headers,
      body: opts.body !== void 0 ? JSON.stringify(opts.body) : void 0
    });
  } catch (e) {
    throw new ApiError("后端未连接", "NETWORK", 0);
  }
  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
  }
  if (resp.status === 401) {
    setToken("");
    window.dispatchEvent(new CustomEvent("sy:unauthorized"));
  }
  if (!resp.ok) {
    const message = data && data.message || typeof text === "string" && text || "HTTP " + resp.status;
    throw new ApiError(message, data && data.code || "HTTP_" + resp.status, resp.status);
  }
  return data;
}
const http = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  del: (path, opts) => request(path, { ...opts, method: "DELETE" })
};
const authApi = {
  login: (account, password) => http.post("/api/auth/login", { account, password }),
  register: (account, password) => http.post("/api/auth/register", { account, password }),
  logout: () => http.post("/api/auth/logout"),
  me: () => http.get("/api/auth/me"),
  rename: (name) => http.patch("/api/auth/me", { name }),
  changePassword: (oldPassword, newPassword) => http.patch("/api/auth/password", { oldPassword, newPassword })
};
const baseApi = {
  topics: () => http.get("/api/topics"),
  hot: (n = 12) => http.get("/api/hot?n=" + n),
  /** n>0 只看最近 n 场；0/省略 = 全部（累计滑动平均） */
  diag: (n) => http.get("/api/diag" + (n > 0 ? "?n=" + n : "")),
  records: () => http.get("/api/records")
};
const socialApi = {
  friends: () => http.get("/api/social/friends"),
  requests: () => http.get("/api/social/friends/requests"),
  /** 搜人：账号要完全一致，昵称可以是片段（后端规则，前端不猜） */
  search: (q) => http.get("/api/social/users?q=" + encodeURIComponent(q)),
  request: (toId, note) => http.post("/api/social/friends/requests", { toId, note: note || null }),
  accept: (requestId) => http.post("/api/social/friends/requests/" + requestId + "/accept"),
  reject: (requestId) => http.post("/api/social/friends/requests/" + requestId + "/reject"),
  unfriend: (userId) => http.del("/api/social/friends/" + encodeURIComponent(userId))
};
const communityApi = {
  /** 列表：type/title/topicId/range/sort/page/size，空值不拼 */
  posts: (q) => {
    const p2 = q || {};
    const qs = Object.keys(p2).filter((k) => p2[k] !== void 0 && p2[k] !== null && p2[k] !== "").map((k) => k + "=" + encodeURIComponent(p2[k])).join("&");
    return http.get("/api/community/posts" + (qs ? "?" + qs : ""));
  },
  post: (id) => http.get("/api/community/posts/" + id),
  /** 进详情先计数（旧版 B3 的顺序：先 view 再拉详情，否则每次都少算一次） */
  markView: (id) => http.post("/api/community/posts/" + id + "/view", {}),
  likePost: (id, on) => on ? http.post("/api/community/posts/" + id + "/like", {}) : http.del("/api/community/posts/" + id + "/like"),
  createPost: (payload) => http.post("/api/community/posts", payload),
  updatePost: (id, payload) => http.patch("/api/community/posts/" + id, payload),
  deletePost: (id) => http.del("/api/community/posts/" + id),
  comments: (postId, q) => {
    const p2 = q || {};
    const qs = Object.keys(p2).filter((k) => p2[k] !== void 0 && p2[k] !== null && p2[k] !== "").map((k) => k + "=" + encodeURIComponent(p2[k])).join("&");
    return http.get("/api/community/posts/" + postId + "/comments" + (qs ? "?" + qs : ""));
  },
  addComment: (postId, payload) => http.post("/api/community/posts/" + postId + "/comments", payload),
  replies: (commentId, page = 1, size2 = 50) => http.get("/api/community/comments/" + commentId + "/replies?page=" + page + "&size=" + size2),
  likeComment: (id, on) => on ? http.post("/api/community/comments/" + id + "/like", {}) : http.del("/api/community/comments/" + id + "/like"),
  deleteComment: (id) => http.del("/api/community/comments/" + id),
  report: (payload) => http.post("/api/community/reports", payload),
  myReports: (page = 1, size2 = 10) => http.get("/api/community/my-reports?page=" + page + "&size=" + size2),
  myBan: () => http.get("/api/community/me/ban"),
  /** @ 提及候选（要登录） */
  users: (q) => http.get("/api/community/users?q=" + encodeURIComponent(q))
};
const debateApi = {
  topics: () => http.get("/api/topics"),
  /** 自定义辩题先过可辩性审核：返回 {result: PASS|REJECT|FIX, reason, suggestions, cached} */
  auditTopic: (title) => http.post("/api/topics/audit", { title }),
  evidence: (topicId) => http.get("/api/topics/" + topicId + "/evidence"),
  /** 作战卡（模型生成要几秒，首次点开才拉） */
  brief: (topicId, side) => http.get("/api/topics/" + topicId + "/brief?side=" + side),
  /** AI 档位说明：{basic,pro,byok} 各含 key/label/available/model/note */
  aiTiers: () => http.get("/api/ai-tiers"),
  createMatch: (payload) => http.post("/api/matches", payload),
  match: (matchId) => http.get("/api/matches/" + matchId),
  submitTurn: (matchId, content) => http.post("/api/matches/" + matchId + "/turns", { content, inputType: "kb" }),
  keepalive: (matchId) => http.post("/api/matches/" + matchId + "/keepalive"),
  buzz: (matchId) => http.post("/api/matches/" + matchId + "/buzz"),
  skip: (matchId) => http.post("/api/matches/" + matchId + "/skip"),
  review: (matchId) => http.get("/api/matches/" + matchId + "/review"),
  panel: (matchId) => http.post("/api/matches/" + matchId + "/panel"),
  /** SSE 地址：EventSource 不能设请求头，令牌只能走 ?token=（后端只对 /events 开口子） */
  eventsUrl: (matchId, token) => API_BASE + "/api/matches/" + matchId + "/events?token=" + encodeURIComponent(token || "")
};
const roomApi = {
  list: () => http.get("/api/rooms"),
  /** 建房：topicId 为空则后端随机抽题，房主坐 A1 */
  create: (topicId) => http.post("/api/rooms", { topicId: topicId || null }),
  detail: (code) => http.get("/api/rooms/" + encodeURIComponent(code)),
  join: (code) => http.post("/api/rooms/" + encodeURIComponent(code) + "/join", {}),
  leave: (code) => http.post("/api/rooms/" + encodeURIComponent(code) + "/leave", {}),
  ready: (code, ready) => http.post("/api/rooms/" + encodeURIComponent(code) + "/ready", { ready }),
  start: (code) => http.post("/api/rooms/" + encodeURIComponent(code) + "/start", {}),
  /** 邀请走私聊消息（type=INVITE）：对方在聊天窗看到卡片，点一下就能进 */
  invite: (toId, roomCode, topicTitle) => http.post("/api/social/messages", { toId, type: "INVITE", roomCode, topicTitle })
};
const chatApi = {
  conversations: () => http.get("/api/social/conversations"),
  /** 只刷角标：一次请求，不拉列表 */
  unreadCount: () => http.get("/api/social/unread-count"),
  /** 历史消息：不给 beforeId 就是最近一页（后端固定 20 条） */
  messages: (convId, beforeId) => http.get("/api/social/messages?convId=" + convId + (beforeId ? "&beforeId=" + beforeId : "")),
  /** 轮询补拉：只要 afterId 之后的新消息 */
  messagesAfter: (convId, afterId) => http.get("/api/social/messages?convId=" + convId + "&afterId=" + (afterId || 0)),
  /** HTTP 兜底发送（WS 不可用时走这条） */
  send: (toId, body) => http.post("/api/social/messages", { toId, body }),
  markRead: (convId, lastMsgId) => http.post("/api/social/conversations/" + convId + "/read", lastMsgId ? { lastMsgId } : {})
};
const walletApi = {
  info: () => http.get("/api/wallet"),
  history: (limit = 10) => http.get("/api/wallet/history?limit=" + limit),
  /** 下单（此时不入账），返回 {orderId, amountCents, sign} */
  createOrder: (amountCents) => http.post("/api/pay/orders", { amountCents }),
  /** 支付回调：带签名，服务端验签 + 幂等入账 */
  payCallback: (orderId, amountCents, sign, tradeNo) => http.post("/api/pay/callback", { orderId, amountCents, sign, tradeNo }),
  llmProfile: () => http.get("/api/llm/profile"),
  saveLlmProfile: (body) => http.post("/api/llm/profile", body),
  testLlm: () => http.post("/api/llm/test")
};
const notifyApi = {
  /** 注意：这个接口有副作用——拉一页会把该页标已读，调用后必须刷新角标 */
  list: (page = 1, size2 = 20) => http.get("/api/community/notifications?page=" + page + "&size=" + size2),
  unreadCount: () => http.get("/api/community/notifications/unread-count")
};
const videoApi = {
  /** 信息流：size 默认 6；cursor 分页；segment 按环节筛 */
  feed: (cursor, segment) => http.get("/api/video/feed?size=6" + (cursor ? "&cursor=" + cursor : "") + (segment ? "&segment=" + encodeURIComponent(segment) : "")),
  detail: (id) => http.get("/api/video/videos/" + id),
  like: (id, cancel) => http.post("/api/video/videos/" + id + "/like", { cancel: !!cancel }),
  comment: (id, content) => http.post("/api/video/videos/" + id + "/comments", { content }),
  publish: (payload) => http.post("/api/video/videos", payload),
  /** 审核台是否开放由后端决定 */
  rules: () => http.get("/api/video/audit/rules"),
  queue: (status, size2 = 50) => http.get("/api/video/audit/queue?status=" + status + "&size=" + size2),
  logs: (id) => http.get("/api/video/audit/" + id + "/logs"),
  decide: (id, decision, reason) => http.post("/api/video/audit/" + id + "/decide", { decision, reason }),
  restore: (id) => http.post("/api/video/audit/" + id + "/restore", {})
};
const ADMIN_TOKEN_KEY = "sy_admin_jwt";
function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch (e) {
    return "";
  }
}
function setAdminToken(t) {
  try {
    if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (e) {
  }
}
async function adminRequest(path, opts = {}) {
  const method = opts.method || "GET";
  const headers = {};
  if (opts.body !== void 0) headers["Content-Type"] = "application/json";
  const token = getAdminToken();
  if (token) headers.Authorization = "Bearer " + token;
  let resp;
  try {
    resp = await fetch(API_BASE + "/api/admin" + path, {
      method,
      headers,
      body: opts.body !== void 0 ? JSON.stringify(opts.body) : void 0
    });
  } catch (e) {
    throw new ApiError("后端未连接", "NETWORK", 0);
  }
  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
  }
  if (resp.status === 401 && !opts.keepLogin) {
    setAdminToken("");
    window.dispatchEvent(new CustomEvent("sy:admin-unauthorized"));
  }
  if (!resp.ok) {
    const message = data && data.message || typeof text === "string" && text || "HTTP " + resp.status;
    throw new ApiError(message, data && data.code || "HTTP_" + resp.status, resp.status);
  }
  return data;
}
const adminApi = {
  login: (account, password) => adminRequest("/auth/login", { method: "POST", body: { account, password } }),
  password: (oldPassword, newPassword) => adminRequest("/auth/password", { method: "PATCH", body: { oldPassword, newPassword }, keepLogin: true }),
  stats: () => adminRequest("/stats"),
  reports: (status, page, size2 = 20) => adminRequest("/reports?status=" + (status || "PENDING") + "&page=" + (page || 1) + "&size=" + size2),
  report: (reportId) => adminRequest("/reports/" + reportId),
  resolve: (reportId, body) => adminRequest("/reports/" + reportId + "/resolve", { method: "POST", body }),
  audit: (page, size2 = 20) => adminRequest("/audit?page=" + (page || 1) + "&size=" + size2),
  restoreAudit: (id) => adminRequest("/audit/" + encodeURIComponent(id) + "/restore", { method: "POST" }),
  users: (q, page, size2 = 20) => adminRequest("/users?q=" + encodeURIComponent(q || "") + "&page=" + (page || 1) + "&size=" + size2),
  ban: (id, days, reason) => adminRequest("/users/" + encodeURIComponent(id) + "/ban", { method: "POST", body: { days, reason } }),
  unban: (id) => adminRequest("/users/" + encodeURIComponent(id) + "/unban", { method: "POST" }),
  setStatus: (id, status) => adminRequest("/users/" + encodeURIComponent(id) + "/status", { method: "POST", body: { status } })
};
function toQuery(params) {
  return Object.keys(params || {}).filter((k) => params[k] !== void 0 && params[k] !== null && params[k] !== "").map((k) => k + "=" + encodeURIComponent(params[k])).join("&");
}
const analyticsApi = {
  overview: (from, to) => adminRequest("/analytics/overview?" + toQuery({ from, to })),
  modules: (range) => adminRequest("/analytics/modules?" + toQuery({ range })),
  trend: (metric, range) => adminRequest("/analytics/trend?" + toQuery({ metric, range })),
  breakdown: (dim, range) => adminRequest("/analytics/breakdown?" + toQuery({ dim, range })),
  active: (range) => adminRequest("/analytics/active?" + toQuery({ range })),
  quality: (range) => adminRequest("/analytics/quality?" + toQuery({ range })),
  /** 导出走二进制下载，用 exportFile.js 里的 downloadExport（要带令牌，不能直接 window.open） */
  exportPath: (params) => "/api/admin/analytics/export?" + toQuery(params)
};
const contentApi = {
  posts: (p2) => adminRequest("/posts?" + toQuery(p2)),
  post: (id) => adminRequest("/posts/" + id),
  postComments: (id, page, size2) => adminRequest("/posts/" + id + "/comments?" + toQuery({ page, size: size2 })),
  comments: (p2) => adminRequest("/comments?" + toQuery(p2)),
  /** type = 'post' | 'comment' */
  hide: (type, id, note) => adminRequest("/content/" + type + "/" + id + "/hide", { method: "POST", body: { note } }),
  unhide: (type, id) => adminRequest("/content/" + type + "/" + id + "/unhide", { method: "POST" }),
  /** 禁言 1/3/7 天（BanService 内部校验），带 MANUAL 审计 */
  mute: (id, days, reason) => adminRequest("/users/" + encodeURIComponent(id) + "/mute", { method: "POST", body: { days, reason } }),
  /** 用户违规浮窗：基本信息 + 统计 + 违规历史 */
  profile: (id) => adminRequest("/users/" + encodeURIComponent(id) + "/profile")
};
const videoAuditApi = {
  queue: (status, page = 1, size2 = 20) => adminRequest("/video-audit/queue?" + toQuery({ status, page, size: size2 })),
  logs: (id) => adminRequest("/video-audit/" + id + "/logs"),
  decide: (id, decision, reason) => adminRequest("/video-audit/" + id + "/decide", { method: "POST", body: { decision, reason } }),
  restore: (id) => adminRequest("/video-audit/" + id + "/restore", { method: "POST" }),
  rules: () => adminRequest("/video-audit/rules")
};
const topicAdminApi = {
  list: (p2) => adminRequest("/topics?" + toQuery(p2)),
  approve: (id) => adminRequest("/topics/" + encodeURIComponent(id) + "/approve", { method: "POST" }),
  reject: (id, reason) => adminRequest("/topics/" + encodeURIComponent(id) + "/reject", { method: "POST", body: { reason } }),
  offline: (id, reason) => adminRequest("/topics/" + encodeURIComponent(id) + "/offline", { method: "POST", body: { reason } })
};
const api = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ADMIN_TOKEN_KEY,
  API_BASE,
  ApiError,
  TOKEN_KEY,
  adminApi,
  adminRequest,
  analyticsApi,
  authApi,
  baseApi,
  chatApi,
  communityApi,
  contentApi,
  debateApi,
  getAdminToken,
  getToken,
  http,
  notifyApi,
  request,
  roomApi,
  setAdminToken,
  setToken,
  socialApi,
  topicAdminApi,
  videoApi,
  videoAuditApi,
  walletApi
}, Symbol.toStringTag, { value: "Module" }));
const NOTIFY_POLL_MS = 45e3;
const useUnreadStore = /* @__PURE__ */ defineStore("unread", {
  state: () => ({
    notifyCount: 0,
    notifyTimer: null
  }),
  actions: {
    /** 拉一次未读数。失败静默（角标是锦上添花，不能打断任何操作）。 */
    async refresh() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.notifyCount = 0;
        return 0;
      }
      try {
        const r = await notifyApi.unreadCount();
        this.notifyCount = Number(r && r.unread) || 0;
      } catch (e) {
      }
      return this.notifyCount;
    },
    /** 登录后启动轮询（幂等：重复调用不会产生第二个计时器）。 */
    start() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.stop();
        return;
      }
      if (this.notifyTimer) return;
      this.refresh();
      this.notifyTimer = setInterval(() => this.refresh(), NOTIFY_POLL_MS);
    },
    stop() {
      if (this.notifyTimer) {
        clearInterval(this.notifyTimer);
        this.notifyTimer = null;
      }
    },
    /** 换账号 / 退出时清空（由 auth store 的 resetAll 调用）。 */
    reset() {
      this.stop();
      this.notifyCount = 0;
    }
  }
});
const useWalletStore = /* @__PURE__ */ defineStore("wallet", {
  state: () => ({
    info: null,
    loading: false
  }),
  getters: {
    /** 余额（分）；未加载时给 null，界面上显示「—」而不是假装的 0 */
    balanceCents: (s) => s.info ? Number(s.info.balanceCents) || 0 : null
  },
  actions: {
    async refresh() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.info = null;
        return null;
      }
      this.loading = true;
      try {
        this.info = await walletApi.info();
        return this.info;
      } catch (e) {
        this.info = null;
        return null;
      } finally {
        this.loading = false;
      }
    },
    /** 换账号 / 退出时清空（由 auth.resetAll 调用） */
    reset() {
      this.info = null;
      this.loading = false;
    }
  }
});
const BACKOFF_MAX = 3e4;
const HB_MS = 25e3;
const POLL_MS = 3e3;
const FAIL_TO_DEGRADE = 3;
const state$1 = {
  ws: null,
  /** idle | connecting | open | degraded */
  status: "idle",
  failCount: 0,
  backoff: 1e3,
  hbTimer: null,
  pollTimer: null,
  reconnectTimer: null,
  pongSeen: true
};
const handlers = {
  /** 收到一帧（已解析） */
  onEvent: () => {
  },
  /** 通道状态变化：live / polling / connecting */
  onModeChange: () => {
  },
  /** 降级轮询每 3 秒触发一次（由 store 决定拉什么） */
  onPollTick: () => {
  },
  /** 重连成功后补拉 */
  onResync: () => {
  }
};
function configureChatWs(h2) {
  Object.assign(handlers, h2 || {});
}
function wsUrl() {
  const { API_BASE: API_BASE2, getToken: getToken2 } = apiRef;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return proto + "://" + location.host + API_BASE2 + "/ws/chat?token=" + encodeURIComponent(getToken2() || "");
}
const apiRef = { API_BASE: "", getToken: () => "" };
function setChatWsEnv(env) {
  Object.assign(apiRef, env || {});
}
function isOpen() {
  return state$1.status === "open" && state$1.ws && state$1.ws.readyState === 1;
}
function mode() {
  if (state$1.pollTimer) return "polling";
  if (isOpen()) return "live";
  return "connecting";
}
function clearTimers() {
  if (state$1.hbTimer) {
    clearInterval(state$1.hbTimer);
    state$1.hbTimer = null;
  }
  if (state$1.pollTimer) {
    clearInterval(state$1.pollTimer);
    state$1.pollTimer = null;
  }
  if (state$1.reconnectTimer) {
    clearTimeout(state$1.reconnectTimer);
    state$1.reconnectTimer = null;
  }
}
function start() {
  if (state$1.status === "open" || state$1.status === "connecting") return;
  connect();
}
function stop() {
  clearTimers();
  if (state$1.ws) {
    try {
      state$1.ws.onclose = null;
      state$1.ws.close();
    } catch (e) {
    }
    state$1.ws = null;
  }
  state$1.status = "idle";
  state$1.failCount = 0;
  state$1.backoff = 1e3;
  handlers.onModeChange(mode());
}
function connect() {
  clearTimers();
  state$1.status = "connecting";
  let ws;
  try {
    ws = new WebSocket(wsUrl());
  } catch (e) {
    onDown("构造失败");
    return;
  }
  state$1.ws = ws;
  ws.onopen = () => {
    state$1.status = "open";
    state$1.failCount = 0;
    state$1.backoff = 1e3;
    state$1.pongSeen = true;
    stopPolling();
    startHeartbeat();
    handlers.onModeChange(mode());
    handlers.onResync();
  };
  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch (err) {
      return;
    }
    if (m && m.type === "pong") state$1.pongSeen = true;
    handlers.onEvent(m);
  };
  ws.onerror = () => {
  };
  ws.onclose = () => {
    state$1.ws = null;
    if (state$1.status !== "idle") onDown("连接断开");
  };
}
function onDown(why) {
  state$1.failCount += 1;
  state$1.status = "connecting";
  if (state$1.hbTimer) {
    clearInterval(state$1.hbTimer);
    state$1.hbTimer = null;
  }
  handlers.onModeChange(mode());
  if (state$1.failCount >= FAIL_TO_DEGRADE) startPolling();
  const wait = Math.min(BACKOFF_MAX, state$1.backoff);
  state$1.backoff = Math.min(BACKOFF_MAX, state$1.backoff * 2);
  state$1.reconnectTimer = setTimeout(connect, wait);
  console.debug("[chat-ws] " + why + "，" + wait + "ms 后重连（第 " + state$1.failCount + " 次）");
}
function startHeartbeat() {
  if (state$1.hbTimer) clearInterval(state$1.hbTimer);
  state$1.hbTimer = setInterval(() => {
    if (!isOpen()) return;
    if (!state$1.pongSeen) {
      try {
        state$1.ws.close();
      } catch (e) {
      }
      return;
    }
    state$1.pongSeen = false;
    sendRaw({ type: "ping" });
  }, HB_MS);
}
function startPolling() {
  state$1.status = "degraded";
  handlers.onModeChange(mode());
  if (state$1.pollTimer) return;
  state$1.pollTimer = setInterval(() => handlers.onPollTick(), POLL_MS);
  console.debug("[chat-ws] 已降级为 3 秒轮询");
}
function stopPolling() {
  if (state$1.pollTimer) {
    clearInterval(state$1.pollTimer);
    state$1.pollTimer = null;
  }
  if (state$1.status === "degraded") state$1.status = "open";
  handlers.onModeChange(mode());
}
function sendRaw(obj) {
  if (!isOpen()) return false;
  try {
    state$1.ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
}
function sendMessage(toId, body, clientMsgId) {
  if (!isOpen()) return false;
  return sendRaw({ type: "send", toId, body, clientMsgId });
}
function sendRead(convId, lastMsgId) {
  if (!isOpen() || !convId) return false;
  return sendRaw({ type: "read", convId: Number(convId), lastMsgId: lastMsgId || null });
}
const state = /* @__PURE__ */ reactive({ items: [] });
let seq = 0;
const toastState = state;
function toast(msg, ms = 2200) {
  const id = ++seq;
  state.items.push({ id, msg: String(msg == null ? "" : msg) });
  setTimeout(() => {
    const i = state.items.findIndex((x) => x.id === id);
    if (i >= 0) state.items.splice(i, 1);
  }, ms);
}
const useChatStore = /* @__PURE__ */ defineStore("chat", {
  state: () => ({
    convs: [],
    // 后端返回的会话（有消息才有会话，顺序由后端给）
    friends: [],
    // 好友列表：用来把「还没聊过」的好友补进消息列表
    unread: 0,
    // 总未读（侧栏角标）
    convId: null,
    // 当前打开的会话
    peer: null,
    // 当前会话的对端
    pendingPeer: null,
    // 还没有会话时（第一次聊天）先记住对方
    items: [],
    // 当前会话的消息
    pending: [],
    // 发送中/失败的占位气泡
    hasMore: false,
    loadingMore: false,
    error: "",
    stick: true,
    // 是否贴着底部（翻历史时不能自动滚）
    scrollTop: 0,
    ignoreScrollUntil: 0,
    peerRead: {},
    // convId → 对方读到的最后一条 id
    mode: "connecting",
    // live | polling | connecting
    lastSeen: {},
    // convId → 最后一条消息 id（补拉用）
    onChatPage: false,
    // 是否停在消息页（判断「正在看」用，见文件头注释 2）
    inited: false
  }),
  getters: {
    currentConv: (s) => (s.convs || []).find((c) => Number(c.convId) === Number(s.convId)) || null,
    /**
     * 会话列表 = 真会话（有消息的，按后端顺序） + 还没聊过的好友（合成行）。
     *
     * 为什么要合成：后端只在「第一条消息」时才建会话，所以刚加好友的人在「消息」里根本看不见，
     * 用户以为功能坏了（实际要去好友页点发消息）。后端不能改，就在前端把好友补进来，
     * 点开即进入 pendingPeer 状态，发第一条时由后端建会话。
     */
    listItems: (s) => {
      const real = (s.convs || []).map((c) => ({ ...c, synthetic: false }));
      const hasConvWith = new Set(real.map((c) => String((c.peer || {}).id || "")));
      const fake = (s.friends || []).filter((f) => !hasConvWith.has(String(f.id))).map((f) => ({
        convId: null,
        peer: { id: f.id, name: f.name },
        last: null,
        lastMsgAt: 0,
        unread: 0,
        synthetic: true
      }));
      return real.concat(fake);
    },
    myId: () => {
      const auth = useAuthStore();
      return auth.user && auth.user.id || "";
    },
    isMine: (s) => (m) => String(m.fromId) === String((useAuthStore().user || {}).id || "")
  },
  actions: {
    /** 只做一次的初始化（注入 WS 环境 + 回调）。由 App.vue 在启动时调用。 */
    init() {
      if (this.inited) return;
      this.inited = true;
      setChatWsEnv({ API_BASE, getToken });
      configureChatWs({
        onEvent: (m) => this.onEvent(m),
        onModeChange: (mo) => {
          this.mode = mo;
        },
        onPollTick: () => this.pollTick(),
        onResync: () => this.resync()
      });
    },
    /** 登录后调用：拉会话列表 + 建 WS（幂等） */
    async connect() {
      const auth = useAuthStore();
      if (!auth.user) return;
      this.init();
      await this.load();
      start();
      this.mode = mode();
    },
    async load() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.convs = [];
        this.unread = 0;
        return;
      }
      try {
        const [r, fr] = await Promise.all([
          chatApi.conversations(),
          socialApi.friends().catch(() => null)
        ]);
        this.convs = r && r.items || [];
        this.unread = Number(r && r.unreadTotal) || 0;
        this.friends = fr && fr.items || [];
        if (this.convId && !this.convs.some((x) => Number(x.convId) === Number(this.convId))) {
          this.convId = null;
          this.peer = null;
          this.items = [];
          this.error = "";
        }
      } catch (e) {
        this.error = errText$1(e);
      }
    },
    /** 只刷角标（轮询用） */
    async refreshUnread() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.unread = 0;
        return 0;
      }
      try {
        const r = await chatApi.unreadCount();
        this.unread = Number(r && r.unread) || 0;
        return this.unread;
      } catch (e) {
        return this.unread;
      }
    },
    /** 进入消息页（侧栏点「消息」） */
    async enter() {
      await this.load();
      if (this.convId) await this.open(this.convId);
    },
    /** 打开已有会话 */
    async open(convId) {
      this.convId = Number(convId);
      this.pendingPeer = null;
      this.stick = true;
      this.error = "";
      const hit = (this.convs || []).find((x) => Number(x.convId) === Number(convId));
      this.peer = hit ? hit.peer : null;
      this.items = [];
      await this.loadMessages();
      if (this.error) return;
      await this.markRead();
    },
    /** 还没有会话时先记住对方（从好友页「发消息」进来） */
    openWith(userId, name) {
      this.convId = null;
      this.peer = { id: userId, name: name || userId };
      this.pendingPeer = { id: userId, name: name || userId };
      this.items = [];
      this.hasMore = false;
      this.stick = true;
    },
    async loadMessages(beforeId) {
      if (!this.convId) {
        this.items = [];
        return;
      }
      try {
        const r = await chatApi.messages(this.convId, beforeId);
        if (beforeId) {
          this.items = (r && r.items || []).concat(this.items || []);
        } else {
          this.items = r && r.items || [];
          if (r && r.peer) this.peer = r.peer;
        }
        this.hasMore = !!(r && r.hasMore);
        const last = this.items[this.items.length - 1];
        if (last) this.markSeen(this.convId, last.id);
        this.error = "";
        if (!beforeId && !this.items.length) {
          const row = (this.convs || []).find((x) => Number(x.convId) === Number(this.convId));
          if (row && row.last) await this.load();
        }
      } catch (e) {
        if (!beforeId) this.items = [];
        this.error = errText$1(e);
        toast(this.error);
      }
    },
    async loadMore() {
      const first = (this.items || [])[0];
      if (!first || this.loadingMore) return;
      this.loadingMore = true;
      this.stick = false;
      await this.loadMessages(Number(first.id));
      this.loadingMore = false;
    },
    markSeen(convId, msgId) {
      const id = Number(msgId) || 0;
      if (!convId) return;
      if (!this.lastSeen[convId] || id > this.lastSeen[convId]) this.lastSeen[convId] = id;
    },
    async markRead() {
      if (!this.convId) return;
      const last = (this.items || [])[this.items.length - 1];
      try {
        const viaWs = sendRead(this.convId, last ? last.id : null);
        if (!viaWs) await chatApi.markRead(this.convId, last ? last.id : null);
        const conv = (this.convs || []).find((c) => Number(c.convId) === Number(this.convId));
        if (conv && conv.unread) {
          this.unread = Math.max(0, (this.unread || 0) - Number(conv.unread));
          conv.unread = 0;
        }
      } catch (e) {
      }
    },
    /** 发消息：先 WS，失败回落 HTTP */
    async send(body) {
      const text = String(body || "").trim();
      if (!text) return false;
      if (text.length > 2e3) {
        toast("单条消息最多 2000 字");
        return false;
      }
      const toId = (this.peer || {}).id;
      if (!toId || String(toId) === String(this.myId)) {
        toast("会话信息异常，正在重新加载…");
        await this.load();
        if (this.convId) await this.open(this.convId);
        return false;
      }
      const clientMsgId = "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
      if (sendMessage(toId, text, clientMsgId)) {
        this.pending.push({ clientMsgId, body: text, state: "sending", at: Date.now() });
        this.stick = true;
        return true;
      }
      try {
        const r = await chatApi.send(toId, text);
        if (r && r.convId && !this.convId) {
          this.convId = Number(r.convId);
          this.pendingPeer = null;
          await this.load();
          await this.loadMessages();
        } else {
          this.items.push({
            id: r.messageId,
            convId: r.convId,
            fromId: r.fromId,
            body: r.body,
            type: r.type,
            createdAt: r.createdAt
          });
          this.convs = this.convs.map(
            (c) => Number(c.convId) === Number(r.convId) ? { ...c, last: { id: r.messageId, fromMe: true, preview: r.body, type: r.type }, lastMsgAt: r.createdAt, unread: 0 } : c
          );
        }
        this.stick = true;
        return true;
      } catch (e) {
        toast(errText$1(e));
        return false;
      }
    },
    // ==================== WS / 轮询事件 ====================
    /** 收到一帧 */
    onEvent(m) {
      if (!m || !m.type) return;
      switch (m.type) {
        case "msg":
          if (m.message) this.incoming(m.message);
          break;
        case "ack":
          this.onAck(m);
          break;
        case "read":
          this.peerRead[Number(m.convId)] = Number(m.lastMsgId) || 0;
          break;
        case "error":
          if (m.clientMsgId) this.onSendFailed(m.clientMsgId, m.code);
          else toast("消息发送失败：" + (m.code || "未知错误"));
          break;
        case "friend_request":
        case "friend_accepted":
          this.refreshUnread();
          if (m.type === "friend_accepted") toast("你们已经成为好友");
          break;
      }
    },
    /** 收到新消息 */
    incoming(m) {
      if (!m || !m.convId) return;
      const convId = Number(m.convId);
      this.markSeen(convId, m.id || m.messageId);
      const mine = String(m.fromId) === String(this.myId);
      const viewing = this.onChatPage && Number(this.convId) === convId;
      if (viewing) {
        const id = m.id || m.messageId;
        if (!(this.items || []).some((x) => Number(x.id) === Number(id))) {
          this.items.push({
            id,
            convId,
            fromId: m.fromId,
            type: m.type || "TEXT",
            body: m.body,
            payload: m.payload,
            createdAt: m.createdAt
          });
        }
        if (!mine) this.markRead();
      }
      const conv = (this.convs || []).find((x) => Number(x.convId) === convId);
      if (conv) {
        conv.last = { id: m.id || m.messageId, fromMe: mine, preview: m.body, type: m.type || "TEXT" };
        conv.lastMsgAt = m.createdAt;
        if (!mine && !viewing) conv.unread = (Number(conv.unread) || 0) + 1;
        this.convs = [conv].concat(this.convs.filter((x) => Number(x.convId) !== convId));
      } else {
        this.load();
      }
      this.unread = this.convs.reduce((s, x) => s + (Number(x.unread) || 0), 0);
    },
    /** 发送回执：把「发送中」换成真消息 */
    async onAck(m) {
      const p2 = this.pending.find((x) => x.clientMsgId === m.clientMsgId);
      if (!this.convId && m.convId) {
        this.convId = Number(m.convId);
        this.pendingPeer = null;
        this.markSeen(this.convId, m.messageId);
        this.pending = this.pending.filter((x) => x.clientMsgId !== m.clientMsgId);
        await this.load();
        await this.loadMessages();
        this.stick = true;
        return;
      }
      this.markSeen(m.convId, m.messageId);
      if (Number(this.convId) === Number(m.convId)) {
        if (!(this.items || []).some((x) => Number(x.id) === Number(m.messageId))) {
          this.items.push({
            id: m.messageId,
            convId: m.convId,
            fromId: this.myId,
            type: "TEXT",
            body: p2 && p2.body || "",
            createdAt: m.createdAt
          });
        }
      }
      this.pending = this.pending.filter((x) => x.clientMsgId !== m.clientMsgId);
      this.stick = true;
    },
    /** 发送失败：保留气泡标红，不自动重试（避免用户不知情地发两遍） */
    onSendFailed(clientMsgId, code) {
      const p2 = this.pending.find((x) => x.clientMsgId === clientMsgId);
      if (!p2) return;
      this.pending = this.pending.filter((x) => x.clientMsgId !== clientMsgId);
      this.pending.push({ clientMsgId, body: p2.body, state: "failed", at: Date.now() });
      toast(errText$1({ message: JSON.stringify({ code }) }));
    },
    /** 降级轮询：只拉当前会话的新消息 + 角标 */
    async pollTick() {
      this.refreshUnread();
      if (!this.convId) return;
      try {
        const after = this.lastSeen[this.convId] || 0;
        const r = await chatApi.messagesAfter(this.convId, after);
        const items = r && r.items || [];
        for (const m of items) this.incoming(m);
      } catch (e) {
      }
    },
    /** 重连成功：补拉当前会话 + 刷新列表 */
    async resync() {
      if (this.convId) {
        try {
          const after = this.lastSeen[this.convId] || 0;
          const r = await chatApi.messagesAfter(this.convId, after);
          for (const m of r && r.items || []) this.incoming(m);
        } catch (e) {
        }
      }
      await this.load();
    },
    stop() {
      stop();
    },
    /** 换账号 / 退出：一切归零（由 auth.resetAll 调用） */
    reset() {
      stop();
      this.convs = [];
      this.friends = [];
      this.unread = 0;
      this.convId = null;
      this.peer = null;
      this.pendingPeer = null;
      this.items = [];
      this.pending = [];
      this.hasMore = false;
      this.error = "";
      this.peerRead = {};
      this.lastSeen = {};
      this.mode = "connecting";
    }
  }
});
function errText$1(e) {
  const code = e instanceof ApiError ? e.code : "";
  const raw = String(e && e.message || "");
  let parsed = "";
  try {
    parsed = JSON.parse(raw).code || "";
  } catch (ignore) {
    parsed = "";
  }
  const key = code || parsed;
  const map = {
    NOT_FRIEND: "你们不是好友，不能发消息",
    INVALID_BODY: "消息不能为空",
    BODY_TOO_LONG: "单条消息最多 2000 字",
    NOT_MEMBER: "你不在这个会话里",
    CONV_NOT_FOUND: "会话不存在",
    USER_NOT_FOUND: "这个人不存在"
  };
  if (map[key]) return map[key];
  if (raw.indexOf("NOT_FRIEND") >= 0) return "你们不是好友，不能发消息";
  return "操作失败：" + (key || raw);
}
const SEAT_OF = { 1: "A1", 2: "B1", 3: "A2", 4: "B2", 5: "A3", 6: "B3", 7: "A2", 8: "B2", 9: "A3", 10: "B3", 11: "B4", 12: "A4" };
const SEG_OF = { 1: "立论", 2: "立论", 3: "驳立论", 4: "驳立论", 5: "质询", 6: "质询", 7: "自由辩", 8: "自由辩", 9: "自由辩", 10: "自由辩", 11: "总结", 12: "总结" };
const SEATS = [
  { k: "A1", side: "A", role: "一辩" },
  { k: "A2", side: "A", role: "二辩" },
  { k: "A3", side: "A", role: "三辩" },
  { k: "A4", side: "A", role: "四辩" },
  { k: "B1", side: "B", role: "一辩" },
  { k: "B2", side: "B", role: "二辩" },
  { k: "B3", side: "B", role: "三辩" },
  { k: "B4", side: "B", role: "四辩" }
];
const LS = {
  seats: "sy_seats",
  mode: "sy_mode",
  pace: "sy_pace",
  diff: "sy_diff",
  tier: "sy_tier"
};
function readSeats() {
  try {
    const raw = localStorage.getItem(LS.seats);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : ["A1"];
  } catch (e) {
    return ["A1"];
  }
}
function keyOf(t) {
  return t.step + "|" + t.seat + "|" + ((t.content || "").trim() || "（这一轮没有说出内容）").length;
}
const useDebateStore = /* @__PURE__ */ defineStore("debate", {
  state: () => ({
    // 单人配置（持久化，刷新后还在）
    mySeats: readSeats(),
    mode: typeof localStorage !== "undefined" && localStorage.getItem(LS.mode) || "FULL",
    pace: typeof localStorage !== "undefined" && localStorage.getItem(LS.pace) || "normal",
    difficulty: typeof localStorage !== "undefined" && localStorage.getItem(LS.diff) || "pro",
    /** AI 档位：BASIC(本地免费) / PRO(平台) / BYOK(自带 Key)，默认 PRO；后端会兜底降级 */
    tier: typeof localStorage !== "undefined" && localStorage.getItem(LS.tier) || "PRO",
    pendingTopicId: null,
    pendingTitle: null,
    // 对局
    matchId: null,
    match: null,
    turns: [],
    remaining: 0,
    extendUsed: 0,
    lastKeep: 0,
    phase: "STEP",
    kind: "solo",
    unlimited: false,
    waiting: false,
    cards: [],
    cardsTopic: null,
    brief: null,
    showBrief: false,
    flawOffer: null,
    err: "",
    // 打字机
    shown: {},
    typed: {},
    stickBottom: true,
    /** 用户最后一次手动滚动的时间戳：打字机 600ms 内不自动滚（旧版同款防拽） */
    lastUserScroll: 0,
    /** 离开对局页时的滚动位置：切回来接着看，不跳顶也不跳底 */
    chatScrollTop: 0,
    // 复盘
    review: null,
    panel: null,
    panelBusy: false,
    pollTimer: null,
    es: null,
    typeTimer: null,
    clockTimer: null
  }),
  getters: {
    steps: (s) => s.mode === "SPRINT" ? [1, 2, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    stepNo: (s) => Number(s.match && s.match.step || 0) + 1,
    /** 本场我要发言几次 */
    myTurnCount: (s) => s.steps.filter((n) => s.mySeats.includes(SEAT_OF[n])).length,
    /** 条状席位：谁是当前发言人 */
    stripSeats: (s) => {
      const curSeat = SEAT_OF[s.stepNo];
      return SEATS.map((x) => ({ ...x, me: s.mySeats.includes(x.k), cur: curSeat === x.k }));
    },
    /**
     * 聊天区要显示的回合（含打字进度）。
     * 规则见文件头：串行打字、我发言之前的 AI 直接全文、还没轮到的不显示。
     */
    turnsView: (s) => {
      let lastMine = -1;
      s.turns.forEach((t, i) => {
        if (s.mySeats.includes(t.seat)) lastMine = i;
      });
      const forceFull = /* @__PURE__ */ new Set();
      s.turns.forEach((t, i) => {
        if (i < lastMine && !s.mySeats.includes(t.seat)) forceFull.add(keyOf(t));
      });
      let firstUntyped = -1;
      s.turns.forEach((t, i) => {
        if (s.mySeats.includes(t.seat) || t.status === "TIMEOUT") return;
        if (i < lastMine) return;
        if (!s.typed[keyOf(t)] && firstUntyped < 0) firstUntyped = i;
      });
      const list = s.turns.filter(
        (t, idx) => s.mySeats.includes(t.seat) || t.status === "TIMEOUT" || firstUntyped === -1 || idx <= firstUntyped
      );
      return list.map((t) => {
        const me = s.mySeats.includes(t.seat);
        const timeout = t.status === "TIMEOUT";
        const text = (t.content || "").trim() || "（这一轮没有说出内容）";
        const key = keyOf(t);
        const typing = !me && !timeout && !s.typed[key] && !forceFull.has(key);
        const shown = typing ? s.shown[key] || 0 : text.length;
        return {
          key,
          seat: t.seat,
          seg: t.seg,
          timeout,
          me,
          side: String(t.seat).startsWith("A") ? "a" : "b",
          text,
          typing,
          shown
        };
      });
    }
  },
  actions: {
    // ==================== 单人配置 ====================
    setSeats(list) {
      this.mySeats = list.slice();
      try {
        localStorage.setItem(LS.seats, JSON.stringify(this.mySeats));
      } catch (e) {
      }
    },
    toggleSeat(k) {
      const i = this.mySeats.indexOf(k);
      if (i >= 0) {
        if (this.mySeats.length === 1) {
          toast("至少保留一个席位");
          return;
        }
        this.mySeats = this.mySeats.filter((x) => x !== k);
      } else {
        this.mySeats = this.mySeats.concat(k);
      }
      this.setSeats(this.mySeats);
    },
    setDifficulty(d) {
      this.difficulty = d;
      try {
        localStorage.setItem(LS.diff, d);
      } catch (e) {
      }
    },
    setPace(p2) {
      this.pace = p2;
      try {
        localStorage.setItem(LS.pace, p2);
      } catch (e) {
      }
    },
    setTier(t) {
      this.tier = t;
      try {
        localStorage.setItem(LS.tier, t);
      } catch (e) {
      }
    },
    setMode(m) {
      this.mode = m;
      try {
        localStorage.setItem(LS.mode, m);
      } catch (e) {
      }
    },
    // ==================== 开局 ====================
    async createMatch(extra) {
      const auth = useAuthStore();
      if (!auth.user) {
        toast("登录后才能开始辩论");
        return null;
      }
      const payload = {
        seats: this.mySeats,
        mode: this.mode,
        pace: this.pace,
        difficulty: this.difficulty,
        tier: this.tier || "PRO",
        ...extra || {}
      };
      if (!payload.topicId && this.pendingTitle) payload.title = this.pendingTitle;
      try {
        const r = await debateApi.createMatch(payload);
        this.matchId = r.matchId;
        this.pendingTitle = null;
        return r.matchId;
      } catch (e) {
        toast("开局失败：" + (e && e.message || ""));
        return null;
      }
    },
    /** 进入对局页时调用：拉一次 + 起轮询 + 连 SSE */
    async start(matchId) {
      this.matchId = String(matchId);
      this.turns = [];
      this.match = null;
      this.typed = {};
      this.shown = {};
      this.flawOffer = null;
      this.review = null;
      this.panel = null;
      await this.load(true);
      this.startPoll();
      this.startClock();
    },
    async load(first) {
      if (!this.matchId) return;
      try {
        const d = await debateApi.match(this.matchId);
        const prevCount = this.turns.length;
        const prevWaiting = this.waiting;
        const prevPhase = this.phase;
        this.match = d.match;
        this.turns = d.turns || [];
        this.remaining = d.remainingSec || 0;
        this.extendUsed = d.extendUsed || 0;
        this.phase = d.phase || "STEP";
        this.kind = d.kind || "solo";
        this.unlimited = !!d.unlimited;
        this.waiting = !!d.waitingForMe;
        this.err = "";
        if (d.match && d.match.topic_id && this.cardsTopic !== d.match.topic_id) {
          try {
            const ev = await debateApi.evidence(d.match.topic_id);
            this.cards = ev.cards || [];
            this.cardsTopic = d.match.topic_id;
          } catch (e) {
            this.cards = [];
          }
        }
        if (d.match && d.match.status !== "RUNNING") {
          this.stopPoll();
          this.stopClock();
          this.flawOffer = null;
          await this.loadReview();
          return;
        }
        if (first || prevCount !== this.turns.length || prevWaiting !== this.waiting || prevPhase !== this.phase) {
          this.stickBottom = true;
        }
      } catch (e) {
        this.err = e && e.message || String(e);
      }
    },
    startPoll() {
      this.stopPoll();
      this.pollTimer = setInterval(() => this.load(false), 400);
      this.openStream();
    },
    stopPoll() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.closeStream();
    },
    /**
     * SSE：AI 一说完立刻推过来，不用等下一次轮询。
     * 令牌只能走查询参数（EventSource 不支持请求头），后端只对 /events 接受 ?token=。
     */
    openStream() {
      this.closeStream();
      if (!this.matchId || typeof EventSource === "undefined") return;
      const auth = useAuthStore();
      if (!auth.user) return;
      const token = getToken();
      if (!token) return;
      try {
        this.es = new EventSource(debateApi.eventsUrl(this.matchId, token));
        this.es.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.type === "flaw") {
              this.flawOffer = { step: d.step, options: d.options || [] };
              toast("对方这轮发言埋了一处漏洞，指出来");
              return;
            }
          } catch (err) {
          }
          this.load(false);
        };
        this.es.onerror = () => {
          if (!auth.user) this.closeStream();
        };
      } catch (e) {
      }
    },
    closeStream() {
      if (this.es) {
        try {
          this.es.close();
        } catch (e) {
        }
        this.es = null;
      }
    },
    // ==================== 打字机 ====================
    startTyping() {
      if (this.typeTimer) return;
      const pauses = {};
      this.typeTimer = setInterval(() => {
        const next = this.turnsView.find((x) => x.typing);
        if (!next) return;
        const now = Date.now();
        if (now < (pauses[next.key] || 0)) return;
        const idx = next.shown + 1;
        this.shown[next.key] = idx;
        if (this.stickBottom && Date.now() - (this.lastUserScroll || 0) > 600 && idx % 3 === 0) {
          if (this.scrollToBottom) this.scrollToBottom();
        }
        if (idx >= next.text.length) {
          this.typed[next.key] = true;
          return;
        }
        const ch = next.text.charAt(idx - 1);
        const per = Math.min(150, Math.max(18, Math.round(6500 / Math.max(1, next.text.length))));
        let d = per;
        if (ch === "。" || ch === "！" || ch === "？") d = Math.min(520, per * 8);
        else if (ch === "，" || ch === "；" || ch === "：") d = Math.min(240, per * 3);
        else if (ch === "「" || ch === "」") d = Math.round(per * 1.5);
        pauses[next.key] = now + d;
      }, 40);
    },
    stopTyping() {
      if (this.typeTimer) {
        clearInterval(this.typeTimer);
        this.typeTimer = null;
      }
    },
    // ==================== 计时 ====================
    startClock() {
      this.stopClock();
      this.clockTimer = setInterval(() => {
        if (!this.waiting) return;
        if (this.remaining > 0) this.remaining -= 1;
      }, 1e3);
    },
    stopClock() {
      if (this.clockTimer) {
        clearInterval(this.clockTimer);
        this.clockTimer = null;
      }
    },
    /** 打字太慢会自动续时（单人模式不限时，不该续） */
    async keepalive() {
      if (!this.matchId || !this.waiting || this.unlimited) return;
      const now = Date.now();
      if (this.remaining > 120) return;
      if (this.extendUsed >= 3) return;
      if (now - this.lastKeep < 15e3) return;
      this.lastKeep = now;
      try {
        const r = await debateApi.keepalive(this.matchId);
        if (r && r.extended) {
          this.extendUsed = r.used;
          this.remaining += r.addSec;
          toast("已自动续时 " + r.addSec + " 秒（" + r.used + "/" + r.max + "）");
        }
      } catch (e) {
      }
    },
    // ==================== 动作 ====================
    async submitTurn(text) {
      const body = String(text || "").trim();
      if (!body) {
        toast("说点什么再发");
        return false;
      }
      try {
        await debateApi.submitTurn(this.matchId, body);
        await this.load(false);
        return true;
      } catch (e) {
        toast("提交失败，内容已保留：" + (e && e.message || ""));
        await this.load(false);
        return false;
      }
    },
    async buzz() {
      if (!this.matchId) return;
      try {
        const r = await debateApi.buzz(this.matchId);
        if (r && r.ok) {
          this.phase = "STEP";
          this.waiting = true;
          this.remaining = r.seconds || 90;
          this.extendUsed = 0;
          toast("抢到了，你有 " + r.seconds + " 秒");
          await this.load(false);
        } else {
          toast(r && r.reason || "没抢到");
        }
      } catch (e) {
        toast("抢拍失败：" + (e && e.message || ""));
      }
    },
    async skipAi() {
      if (!this.matchId) return;
      try {
        const r = await debateApi.skip(this.matchId);
        if (r && r.ok) {
          toast("已催，对方开始回应");
          await this.load(false);
        } else {
          toast(r && r.reason || "现在不能催");
        }
      } catch (e) {
        toast("催失败：" + (e && e.message || ""));
      }
    },
    async toggleBrief() {
      this.showBrief = !this.showBrief;
      if (!this.showBrief || this.brief) return;
      const m = this.match;
      if (!m || !m.topic_id) return;
      const side = String(m.my_seats || "A1").charAt(0);
      toast("正在生成作战卡…");
      try {
        this.brief = await debateApi.brief(m.topic_id, side);
      } catch (e) {
        this.brief = null;
        toast("作战卡生成失败");
      }
    },
    // ==================== 复盘 ====================
    async loadReview() {
      if (!this.matchId) return;
      try {
        this.review = await debateApi.review(this.matchId);
      } catch (e) {
        this.review = null;
      }
      useWalletStore().refresh();
    },
    async runPanel() {
      if (!this.matchId || this.panelBusy) return;
      this.panelBusy = true;
      this.panel = null;
      try {
        const d = await debateApi.panel(this.matchId);
        this.panel = d && d.ok ? d.panel : { failed: true, reason: d && d.reason || "评审团暂时不可用" };
      } catch (e) {
        this.panel = { failed: true, reason: e && e.message || "评审失败" };
      } finally {
        this.panelBusy = false;
      }
    },
    /** 离开对局页 / 换账号：把所有计时器和缓冲清干净 */
    reset() {
      this.stopPoll();
      this.stopTyping();
      this.stopClock();
      this.matchId = null;
      this.match = null;
      this.turns = [];
      this.remaining = 0;
      this.extendUsed = 0;
      this.phase = "STEP";
      this.waiting = false;
      this.cards = [];
      this.cardsTopic = null;
      this.brief = null;
      this.showBrief = false;
      this.flawOffer = null;
      this.shown = {};
      this.typed = {};
      this.review = null;
      this.panel = null;
      this.tier = "PRO";
      this.lastUserScroll = 0;
      this.chatScrollTop = 0;
      this.err = "";
    }
  }
});
const useAuthStore = /* @__PURE__ */ defineStore("auth", {
  state: () => ({
    user: null,
    /** 上次登录后要回到的页面（等价旧版 S.lastVisitedView） */
    nextPath: null
  }),
  getters: {
    hasToken: () => !!getToken(),
    isLogged: (s) => !!s.user,
    displayName: (s) => s.user && (s.user.name || s.user.account) || "未登录"
  },
  actions: {
    /** 启动时用已有 token 恢复身份；失败（401/过期）就当作未登录。 */
    async restore() {
      if (!getToken()) {
        this.user = null;
        return null;
      }
      try {
        this.user = await authApi.me();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === "UNAUTHORIZED")) {
          this.user = null;
          setToken("");
        }
      }
      return this.user;
    },
    async login(account, password) {
      const res = await authApi.login(account, password);
      this.resetAll();
      if (res && res.token) setToken(res.token);
      this.user = res && res.user || null;
      return this.user;
    },
    async register(account, password) {
      const res = await authApi.register(account, password);
      this.resetAll();
      if (res && res.token) setToken(res.token);
      this.user = res && res.user || null;
      return this.user;
    },
    async logout() {
      try {
        await authApi.logout();
      } catch (e) {
      }
      setToken("");
      this.user = null;
      this.resetAll();
    },
    async rename(name) {
      this.user = await authApi.rename(name);
      return this.user;
    },
    /**
     * 改密码：成功后服务端会把旧令牌判为 TOKEN_STALE，
     * 所以本地立刻清空回登录页——不做"静默换 token"，否则用户会以为旧密码还能用。
     */
    async changePassword(oldPassword, newPassword) {
      await authApi.changePassword(oldPassword, newPassword);
      setToken("");
      this.user = null;
      this.resetAll();
    },
    /** 清空所有与"当前账号"绑定的状态（后续批次在这里追加新的 store）。 */
    resetAll() {
      useUnreadStore().reset();
      useWalletStore().reset();
      useChatStore().reset();
      useDebateStore().reset();
    }
  }
});
const _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};
const _hoisted_1$p = { class: "app" };
const _hoisted_2$o = { class: "sb" };
const _hoisted_3$o = {
  class: "nav",
  id: "nav"
};
const _hoisted_4$o = {
  key: 0,
  class: "g"
};
const _hoisted_5$o = {
  key: 0,
  class: "nav-badge"
};
const _hoisted_6$o = { class: "av" };
const _hoisted_7$n = { style: { "min-width": "0" } };
const _hoisted_8$m = { style: { "font-size": "11px", "color": "#a8adb8" } };
const _hoisted_9$k = { id: "main" };
const _hoisted_10$k = {
  key: 0,
  class: "card gate-card"
};
const _hoisted_11$i = {
  class: "sub",
  style: { "margin": "0 0 20px" }
};
const _sfc_main$q = {
  __name: "AppShell",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const auth = useAuthStore();
    const unread = useUnreadStore();
    const wallet = useWalletStore();
    const chat = useChatStore();
    const current = computed(() => route.name);
    const gated = computed(() => !!route.meta.requiresAuth && !auth.user);
    const GATE_TEXT = {
      solo: "开始一场单人辩论",
      room: "和朋友开一局多人辩论",
      match: "查看正在进行的对局",
      review: "查看复盘",
      diag: "查看能力分析",
      records: "查看辩论记录",
      notify: "查看通知",
      friends: "查看好友",
      chat: "和好友聊天",
      wallet: "查看钱包"
    };
    const gateWhat = computed(() => GATE_TEXT[route.name] || "继续");
    function badgeOf(name) {
      if (name === "notify") return unread.notifyCount > 0 ? unread.notifyCount > 99 ? "99+" : String(unread.notifyCount) : "";
      if (name === "chat") return chat.unread > 0 ? chat.unread > 99 ? "99+" : String(chat.unread) : "";
      return "";
    }
    function goLogin() {
      router2.push({ name: "login", query: { next: route.fullPath } });
    }
    function goMe() {
      router2.push({ name: "me" });
    }
    function goWallet() {
      router2.push({ name: "wallet" });
    }
    const balanceText = computed(() => wallet.balanceCents === null ? "—" : (wallet.balanceCents / 100).toFixed(2));
    watch(
      () => auth.user ? auth.user.id : null,
      (id, old) => {
        if (id && id !== old) {
          wallet.refresh();
          chat.connect();
        }
      },
      { immediate: true }
    );
    const avatarText = computed(() => {
      const n = auth.user && (auth.user.name || auth.user.account);
      return n ? String(n).slice(0, 1) : "登";
    });
    return (_ctx, _cache) => {
      const _component_RouterLink = resolveComponent("RouterLink");
      return openBlock(), createElementBlock("div", _hoisted_1$p, [
        createBaseVNode("aside", _hoisted_2$o, [
          _cache[0] || (_cache[0] = createBaseVNode("div", { class: "logo" }, [
            createBaseVNode("div", { class: "m" }, "思"),
            createBaseVNode("div", null, [
              createBaseVNode("b", null, "思弈阁"),
              createBaseVNode("span", null, "AI 辩论训练")
            ])
          ], -1)),
          createBaseVNode("nav", _hoisted_3$o, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(NAV), (item, i) => {
              return openBlock(), createElementBlock(Fragment, { key: i }, [
                item.g ? (openBlock(), createElementBlock("div", _hoisted_4$o, toDisplayString(item.g), 1)) : (openBlock(), createBlock(_component_RouterLink, {
                  key: 1,
                  to: { name: item.k },
                  class: normalizeClass({ on: current.value === item.k })
                }, {
                  default: withCtx(() => [
                    createTextVNode(toDisplayString(item.n), 1),
                    badgeOf(item.k) ? (openBlock(), createElementBlock("span", _hoisted_5$o, toDisplayString(badgeOf(item.k)), 1)) : createCommentVNode("", true)
                  ]),
                  _: 2
                }, 1032, ["to", "class"]))
              ], 64);
            }), 128))
          ]),
          createBaseVNode("div", {
            class: "me",
            onClick: goMe
          }, [
            createBaseVNode("div", _hoisted_6$o, toDisplayString(avatarText.value), 1),
            createBaseVNode("div", _hoisted_7$n, [
              createBaseVNode("div", null, toDisplayString(unref(auth).displayName), 1),
              createBaseVNode("div", _hoisted_8$m, toDisplayString(unref(auth).user ? "@" + unref(auth).user.account : "点击登录"), 1)
            ]),
            unref(auth).user ? (openBlock(), createElementBlock("span", {
              key: 0,
              class: "wchip",
              title: "点击查看钱包",
              onClick: withModifiers(goWallet, ["stop"])
            }, "¥" + toDisplayString(balanceText.value), 1)) : createCommentVNode("", true)
          ])
        ]),
        createBaseVNode("main", _hoisted_9$k, [
          gated.value ? (openBlock(), createElementBlock("div", _hoisted_10$k, [
            _cache[1] || (_cache[1] = createBaseVNode("div", { class: "gate-icon" }, "🔒", -1)),
            _cache[2] || (_cache[2] = createBaseVNode("div", { class: "gate-title" }, "登录后可见", -1)),
            createBaseVNode("p", _hoisted_11$i, "登录后就能" + toDisplayString(gateWhat.value) + "。现在未登录，先注册或登录吧。", 1),
            createBaseVNode("button", {
              class: "btn primary",
              onClick: goLogin
            }, "去登录 / 注册")
          ])) : renderSlot(_ctx.$slots, "default", {}, void 0, true, 1)
        ])
      ]);
    };
  }
};
const AppShell = /* @__PURE__ */ _export_sfc(_sfc_main$q, [["__scopeId", "data-v-c09b0165"]]);
const _hoisted_1$o = { id: "toast" };
const _sfc_main$p = {
  __name: "ToastHost",
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$o, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(toastState).items, (t) => {
          return openBlock(), createElementBlock("div", {
            key: t.id,
            class: "tst"
          }, toDisplayString(t.msg), 1);
        }), 128))
      ]);
    };
  }
};
const _sfc_main$o = {
  __name: "App",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const auth = useAuthStore();
    const unread = useUnreadStore();
    const bare = computed(() => !!route.meta.bare);
    function onUnauthorized() {
      auth.user = null;
      unread.reset();
      if (router2.currentRoute.value.name !== "login") {
        router2.push({ name: "login", query: { next: router2.currentRoute.value.fullPath } });
      }
    }
    onMounted(async () => {
      window.addEventListener("sy:unauthorized", onUnauthorized);
      await auth.restore();
      if (auth.user) unread.start();
    });
    onBeforeUnmount(() => {
      window.removeEventListener("sy:unauthorized", onUnauthorized);
      unread.stop();
    });
    return (_ctx, _cache) => {
      const _component_RouterView = resolveComponent("RouterView");
      return openBlock(), createElementBlock(Fragment, null, [
        bare.value ? (openBlock(), createBlock(_component_RouterView, { key: 0 })) : (openBlock(), createBlock(AppShell, { key: 1 }, {
          default: withCtx(() => [
            createVNode(_component_RouterView)
          ]),
          _: 1
        })),
        createVNode(_sfc_main$p)
      ], 64);
    };
  }
};
const scriptRel = "modulepreload";
const assetsURL = function(dep, importerUrl) {
  return new URL(dep, importerUrl).href;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    let allSettled2 = function(promises) {
      return Promise.all(
        promises.map(
          (p2) => Promise.resolve(p2).then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
        )
      );
    };
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = allSettled2(
      deps.map((dep) => {
        dep = assetsURL(dep, importerUrl);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        const isBaseRelative = !!importerUrl;
        if (isBaseRelative) {
          for (let i = links.length - 1; i >= 0; i--) {
            const link2 = links[i];
            if (link2.href === dep && (!isCss || link2.rel === "stylesheet")) {
              return;
            }
          }
        } else if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
const MODULE_OF = [
  [/^\/community/, "community"],
  [/^\/post\//, "community"],
  [/^\/chat\//, "chat"],
  [/^\/match\//, "match"],
  [/^\/room\//, "match"],
  [/^\/solo/, "solo"],
  [/^\/video/, "video"],
  [/^\/hot/, "hot"],
  [/^\/diag/, "diag"],
  [/^\/records/, "records"],
  [/^\/wallet/, "wallet"],
  [/^\/friends/, "friends"],
  [/^\/admin/, "admin"]
];
function moduleOf(path) {
  if (!path) return null;
  for (const [re, m] of MODULE_OF) if (re.test(path)) return m;
  return null;
}
let lastModule = null;
function trackView(path) {
  try {
    const module = moduleOf(path);
    if (!module || module === lastModule) return;
    lastModule = module;
    http.post("/api/track/pv", { module }).catch(() => {
    });
  } catch (e) {
  }
}
const _hoisted_1$n = { class: "card auth-card" };
const _hoisted_2$n = { class: "auth-tabs" };
const _hoisted_3$n = { class: "sub" };
const _hoisted_4$n = { class: "auth-field" };
const _hoisted_5$n = { class: "auth-field" };
const _hoisted_6$n = ["autocomplete"];
const _hoisted_7$m = { class: "auth-actions" };
const _hoisted_8$l = ["disabled"];
const _sfc_main$n = {
  __name: "LoginView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const auth = useAuthStore();
    const unread = useUnreadStore();
    const tab = /* @__PURE__ */ ref("login");
    const account = /* @__PURE__ */ ref("");
    const password = /* @__PURE__ */ ref("");
    const busy = /* @__PURE__ */ ref(false);
    const accountEl = /* @__PURE__ */ ref(null);
    const isReg = computed(() => tab.value === "register");
    onMounted(async () => {
      if (!auth.user) await auth.restore();
      if (auth.user) router2.replace(route.query.next || { name: "me" });
      await nextTick();
      if (accountEl.value) accountEl.value.focus();
    });
    function switchTab(which) {
      tab.value = which === "register" ? "register" : "login";
    }
    function validate() {
      const acc = account.value.trim();
      if (!acc) return "请输入账号";
      if (isReg.value && !/^[A-Za-z0-9_]{3,32}$/.test(acc)) return "账号 3–32 位，只能用字母、数字、下划线";
      if (!password.value) return "请输入密码";
      if (isReg.value && (password.value.length < 8 || password.value.length > 64)) return "密码需 8–64 位";
      if (isReg.value && (!/[0-9]/.test(password.value) || !/[A-Za-z]/.test(password.value))) {
        return "密码必须同时包含数字和字母";
      }
      return "";
    }
    async function submit() {
      if (busy.value) return;
      const bad = validate();
      if (bad) return toast(bad);
      busy.value = true;
      try {
        if (isReg.value) await auth.register(account.value.trim(), password.value);
        else await auth.login(account.value.trim(), password.value);
        unread.start();
        toast((isReg.value ? "注册成功，" : "欢迎回来，") + (auth.user ? auth.user.name : ""));
        router2.replace(route.query.next || { name: "me" });
      } catch (e) {
        toast(authErrText(e));
      } finally {
        busy.value = false;
      }
    }
    function authErrText(e) {
      const code = e instanceof ApiError ? e.code : "";
      const map = {
        ACCOUNT_EXISTS: "这个账号已经有人用了",
        BAD_CREDENTIALS: "账号或密码不对",
        ACCOUNT_DISABLED: "这个账号已被封禁",
        TOKEN_STALE: "密码已更新，请重新登录",
        NETWORK: "后端未连接，确认服务在跑"
      };
      if (map[code]) return map[code];
      return e && e.message || "操作失败";
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$n, [
        createBaseVNode("div", _hoisted_2$n, [
          createBaseVNode("a", {
            class: normalizeClass({ on: !isReg.value }),
            onClick: _cache[0] || (_cache[0] = ($event) => switchTab("login"))
          }, "登录", 2),
          createBaseVNode("a", {
            class: normalizeClass({ on: isReg.value }),
            onClick: _cache[1] || (_cache[1] = ($event) => switchTab("register"))
          }, "注册", 2)
        ]),
        createBaseVNode("p", _hoisted_3$n, toDisplayString(isReg.value ? "账号 3–32 位字母 / 数字 / 下划线；密码至少 8 位，且同时含数字和字母。" : "登录后即可发帖、评论、点赞；不登录也能浏览社区。"), 1),
        createBaseVNode("div", _hoisted_4$n, [
          _cache[4] || (_cache[4] = createBaseVNode("label", { for: "authAccount" }, "账号", -1)),
          withDirectives(createBaseVNode("input", {
            id: "authAccount",
            ref_key: "accountEl",
            ref: accountEl,
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => account.value = $event),
            autocomplete: "username",
            placeholder: "例如 zhang",
            maxlength: "32"
          }, null, 512), [
            [vModelText, account.value]
          ])
        ]),
        createBaseVNode("div", _hoisted_5$n, [
          _cache[5] || (_cache[5] = createBaseVNode("label", { for: "authPassword" }, "密码", -1)),
          withDirectives(createBaseVNode("input", {
            id: "authPassword",
            "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => password.value = $event),
            type: "password",
            maxlength: "64",
            autocomplete: isReg.value ? "new-password" : "current-password",
            placeholder: "至少 8 位，含数字和字母",
            onKeydown: withKeys(submit, ["enter"])
          }, null, 40, _hoisted_6$n), [
            [vModelText, password.value]
          ])
        ]),
        createBaseVNode("div", _hoisted_7$m, [
          createBaseVNode("button", {
            class: "btn primary",
            disabled: busy.value,
            onClick: submit
          }, toDisplayString(busy.value ? "请稍候…" : isReg.value ? "注册并登录" : "登录"), 9, _hoisted_8$l)
        ])
      ]);
    };
  }
};
const _hoisted_1$m = {
  key: 0,
  class: "card auth-card"
};
const _hoisted_2$m = { class: "sub" };
const _hoisted_3$m = {
  key: 1,
  class: "card auth-card"
};
const _hoisted_4$m = { class: "sub" };
const _hoisted_5$m = { class: "auth-account" };
const _hoisted_6$m = { class: "auth-field" };
const _hoisted_7$l = { class: "auth-actions" };
const _hoisted_8$k = ["disabled"];
const _hoisted_9$j = ["disabled"];
const _hoisted_10$j = { class: "pwd-block" };
const _hoisted_11$h = { class: "auth-field" };
const _hoisted_12$g = { class: "auth-field" };
const _hoisted_13$g = { class: "auth-field" };
const _hoisted_14$g = { class: "auth-actions" };
const _hoisted_15$e = ["disabled"];
const _sfc_main$m = {
  __name: "MeView",
  setup(__props) {
    const router2 = useRouter();
    const auth = useAuthStore();
    const unread = useUnreadStore();
    const name = /* @__PURE__ */ ref("");
    const oldPwd = /* @__PURE__ */ ref("");
    const newPwd = /* @__PURE__ */ ref("");
    const newPwd2 = /* @__PURE__ */ ref("");
    const busy = /* @__PURE__ */ ref(false);
    const restoring = /* @__PURE__ */ ref(false);
    onMounted(async () => {
      if (!auth.user) {
        restoring.value = true;
        await auth.restore();
        restoring.value = false;
      }
      if (!auth.user) {
        router2.replace({ name: "login", query: { next: "/me" } });
        return;
      }
      name.value = auth.user.name || "";
    });
    function errText2(e) {
      const code = e instanceof ApiError ? e.code : "";
      const map = {
        BAD_CREDENTIALS: "当前密码不对",
        PASSWORD_TOO_WEAK: "新密码太弱：至少 8 位且含数字和字母",
        TOKEN_STALE: "登录已失效，请重新登录",
        NETWORK: "后端未连接"
      };
      return map[code] || e && e.message || "操作失败";
    }
    async function saveName() {
      if (!name.value.trim()) return toast("昵称不能为空");
      busy.value = true;
      try {
        await auth.rename(name.value.trim());
        toast("昵称已更新");
      } catch (e) {
        toast(errText2(e));
      } finally {
        busy.value = false;
      }
    }
    async function changePassword() {
      if (!oldPwd.value) return toast("请输入当前密码");
      if (newPwd.value.length < 8 || newPwd.value.length > 64) return toast("新密码需 8–64 位");
      if (!/[0-9]/.test(newPwd.value) || !/[A-Za-z]/.test(newPwd.value)) return toast("新密码必须同时包含数字和字母");
      if (newPwd.value !== newPwd2.value) return toast("两次输入的新密码不一致");
      if (newPwd.value === oldPwd.value) return toast("新密码不能与旧密码相同");
      busy.value = true;
      try {
        await auth.changePassword(oldPwd.value, newPwd.value);
        unread.reset();
        toast("密码已更新，请重新登录");
        router2.replace({ name: "login" });
      } catch (e) {
        toast(errText2(e));
      } finally {
        busy.value = false;
      }
    }
    async function logout() {
      busy.value = true;
      try {
        await auth.logout();
        unread.reset();
        toast("已退出登录");
        router2.replace({ name: "community" });
      } finally {
        busy.value = false;
      }
    }
    return (_ctx, _cache) => {
      return !unref(auth).user ? (openBlock(), createElementBlock("div", _hoisted_1$m, [
        createBaseVNode("p", _hoisted_2$m, toDisplayString(restoring.value ? "正在恢复登录状态…" : "正在前往登录页…"), 1)
      ])) : (openBlock(), createElementBlock("div", _hoisted_3$m, [
        _cache[11] || (_cache[11] = createBaseVNode("div", { class: "auth-tabs" }, [
          createBaseVNode("a", { class: "on" }, "我的")
        ], -1)),
        createBaseVNode("p", _hoisted_4$m, [
          _cache[4] || (_cache[4] = createTextVNode("账号：", -1)),
          createBaseVNode("b", _hoisted_5$m, toDisplayString(unref(auth).user.account), 1)
        ]),
        createBaseVNode("div", _hoisted_6$m, [
          _cache[5] || (_cache[5] = createBaseVNode("label", { for: "authName" }, "昵称", -1)),
          withDirectives(createBaseVNode("input", {
            id: "authName",
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => name.value = $event),
            maxlength: "64",
            placeholder: "显示在社区帖子与评论上"
          }, null, 512), [
            [vModelText, name.value]
          ])
        ]),
        _cache[12] || (_cache[12] = createBaseVNode("p", { class: "sub" }, "昵称会显示在社区的所有帖子和评论上，保存后立刻生效。", -1)),
        createBaseVNode("div", _hoisted_7$l, [
          createBaseVNode("button", {
            class: "btn primary",
            disabled: busy.value,
            onClick: saveName
          }, "保存昵称", 8, _hoisted_8$k),
          createBaseVNode("button", {
            class: "btn ghost",
            disabled: busy.value,
            onClick: logout
          }, "退出登录", 8, _hoisted_9$j)
        ]),
        createBaseVNode("div", _hoisted_10$j, [
          _cache[9] || (_cache[9] = createBaseVNode("div", { class: "pwd-title" }, "修改密码", -1)),
          _cache[10] || (_cache[10] = createBaseVNode("p", { class: "sub" }, "改完密码后，其它设备上的登录会全部失效，需要用新密码重新登录。", -1)),
          createBaseVNode("div", _hoisted_11$h, [
            _cache[6] || (_cache[6] = createBaseVNode("label", { for: "authOldPwd" }, "当前密码", -1)),
            withDirectives(createBaseVNode("input", {
              id: "authOldPwd",
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => oldPwd.value = $event),
              type: "password",
              autocomplete: "current-password",
              placeholder: "输入现在的密码",
              maxlength: "64"
            }, null, 512), [
              [vModelText, oldPwd.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_12$g, [
            _cache[7] || (_cache[7] = createBaseVNode("label", { for: "authNewPwd" }, "新密码", -1)),
            withDirectives(createBaseVNode("input", {
              id: "authNewPwd",
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => newPwd.value = $event),
              type: "password",
              autocomplete: "new-password",
              placeholder: "至少 8 位，含数字和字母",
              maxlength: "64"
            }, null, 512), [
              [vModelText, newPwd.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_13$g, [
            _cache[8] || (_cache[8] = createBaseVNode("label", { for: "authNewPwd2" }, "确认新密码", -1)),
            withDirectives(createBaseVNode("input", {
              id: "authNewPwd2",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => newPwd2.value = $event),
              type: "password",
              autocomplete: "new-password",
              placeholder: "再输入一次",
              maxlength: "64",
              onKeydown: withKeys(changePassword, ["enter"])
            }, null, 544), [
              [vModelText, newPwd2.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_14$g, [
            createBaseVNode("button", {
              class: "btn primary",
              disabled: busy.value,
              onClick: changePassword
            }, "修改密码", 8, _hoisted_15$e)
          ])
        ])
      ]));
    };
  }
};
const MeView = /* @__PURE__ */ _export_sfc(_sfc_main$m, [["__scopeId", "data-v-549725b3"]]);
function money(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}
function relTime(ms) {
  if (!ms) return "";
  const diff = Date.now() - Number(ms);
  if (diff < 60 * 1e3) return "刚刚";
  if (diff < 60 * 60 * 1e3) return Math.floor(diff / 6e4) + " 分钟前";
  if (diff < 24 * 60 * 60 * 1e3) return Math.floor(diff / 36e5) + " 小时前";
  if (diff < 7 * 24 * 60 * 60 * 1e3) return Math.floor(diff / 864e5) + " 天前";
  const d = new Date(Number(ms));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const _hoisted_1$l = { class: "sub" };
const _hoisted_2$l = { key: 0 };
const _hoisted_3$l = { style: { "color": "#4c9aff" } };
const _hoisted_4$l = {
  key: 0,
  class: "card"
};
const _hoisted_5$l = { class: "empty" };
const _hoisted_6$l = {
  key: 0,
  class: "card",
  style: { "padding": "0", "overflow": "hidden" }
};
const _hoisted_7$k = ["onClick"];
const _hoisted_8$j = { style: { "flex": "1", "min-width": "0" } };
const _hoisted_9$i = { class: "notify-text" };
const _hoisted_10$i = { class: "notify-time" };
const _hoisted_11$g = {
  key: 1,
  class: "card"
};
const _hoisted_12$f = { class: "empty" };
const _hoisted_13$f = {
  key: 2,
  class: "notify-pager"
};
const _hoisted_14$f = ["disabled"];
const _hoisted_15$d = {
  class: "sub",
  style: { "align-self": "center" }
};
const _hoisted_16$d = ["disabled"];
const size = 20;
const _sfc_main$l = {
  __name: "NotifyView",
  setup(__props) {
    const router2 = useRouter();
    const unread = useUnreadStore();
    const auth = useAuthStore();
    const items = /* @__PURE__ */ ref([]);
    const total = /* @__PURE__ */ ref(0);
    const page = /* @__PURE__ */ ref(1);
    const error = /* @__PURE__ */ ref("");
    const loading = /* @__PURE__ */ ref(false);
    const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));
    async function load(p2) {
      const target = Math.max(1, p2 || 1);
      loading.value = true;
      error.value = "";
      try {
        const r = await notifyApi.list(target, size);
        items.value = r && r.items || [];
        total.value = r && r.total || 0;
        page.value = r && r.page || target;
        await unread.refresh();
      } catch (e) {
        items.value = [];
        total.value = 0;
        error.value = e && e.message || "加载失败";
      } finally {
        loading.value = false;
      }
    }
    onMounted(() => {
      if (!auth.user) return;
      load(1);
    });
    function open(item) {
      const link = item.link || {};
      if (link.view === "friends") {
        router2.push({ name: "friends" });
        return;
      }
      if (link.view === "me" || !link.postId) {
        router2.push({ name: "me" });
        return;
      }
      router2.push({
        name: "community-post",
        params: { postId: String(link.postId) },
        query: link.commentId ? { around: String(link.commentId) } : {}
      });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[4] || (_cache[4] = createBaseVNode("h1", { class: "pg" }, "通知", -1)),
        createBaseVNode("p", _hoisted_1$l, [
          createTextVNode(" 评论、回复、点赞、@ 提及都会出现在这里 · 共 " + toDisplayString(total.value) + " 条", 1),
          unref(unread).notifyCount > 0 ? (openBlock(), createElementBlock("span", _hoisted_2$l, [
            _cache[2] || (_cache[2] = createTextVNode(" · ", -1)),
            createBaseVNode("b", _hoisted_3$l, toDisplayString(unref(unread).notifyCount) + " 条未读", 1)
          ])) : createCommentVNode("", true)
        ]),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_4$l, [
          createBaseVNode("div", _hoisted_5$l, toDisplayString(error.value), 1)
        ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          items.value.length ? (openBlock(), createElementBlock("div", _hoisted_6$l, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (it) => {
              return openBlock(), createElementBlock("div", {
                key: it.id,
                class: normalizeClass(["notify-row", { unread: it.read === false }]),
                onClick: ($event) => open(it)
              }, [
                _cache[3] || (_cache[3] = createBaseVNode("span", { class: "notify-dot" }, null, -1)),
                createBaseVNode("div", _hoisted_8$j, [
                  createBaseVNode("div", _hoisted_9$i, toDisplayString(it.text), 1),
                  createBaseVNode("div", _hoisted_10$i, toDisplayString(unref(relTime)(it.createdAt)), 1)
                ])
              ], 10, _hoisted_7$k);
            }), 128))
          ])) : (openBlock(), createElementBlock("div", _hoisted_11$g, [
            createBaseVNode("div", _hoisted_12$f, toDisplayString(loading.value ? "加载中…" : "还没有通知"), 1)
          ])),
          pages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_13$f, [
            createBaseVNode("button", {
              class: "btn ghost",
              disabled: page.value <= 1,
              onClick: _cache[0] || (_cache[0] = ($event) => load(page.value - 1))
            }, "上一页", 8, _hoisted_14$f),
            createBaseVNode("span", _hoisted_15$d, "第 " + toDisplayString(page.value) + " / " + toDisplayString(pages.value) + " 页", 1),
            createBaseVNode("button", {
              class: "btn ghost",
              disabled: page.value >= pages.value,
              onClick: _cache[1] || (_cache[1] = ($event) => load(page.value + 1))
            }, "下一页", 8, _hoisted_16$d)
          ])) : createCommentVNode("", true)
        ], 64))
      ], 64);
    };
  }
};
const _hoisted_1$k = {
  key: 0,
  class: "card"
};
const _hoisted_2$k = { class: "empty" };
const _hoisted_3$k = { class: "card" };
const _hoisted_4$k = { class: "fr-search" };
const _hoisted_5$k = {
  key: 0,
  style: { "margin-top": "10px" }
};
const _hoisted_6$k = { class: "fr-row" };
const _hoisted_7$j = { class: "fr-av" };
const _hoisted_8$i = { class: "fr-main" };
const _hoisted_9$h = { class: "fr-name" };
const _hoisted_10$h = { class: "fr-id" };
const _hoisted_11$f = { class: "fr-act" };
const _hoisted_12$e = {
  key: 0,
  class: "sub"
};
const _hoisted_13$e = {
  key: 1,
  class: "btn ghost",
  disabled: ""
};
const _hoisted_14$e = ["onClick"];
const _hoisted_15$c = {
  key: 3,
  class: "btn ghost",
  disabled: ""
};
const _hoisted_16$c = ["onClick"];
const _hoisted_17$c = {
  key: 0,
  class: "fr-note"
};
const _hoisted_18$c = ["onKeydown"];
const _hoisted_19$b = ["disabled", "onClick"];
const _hoisted_20$b = {
  key: 1,
  class: "sub"
};
const _hoisted_21$b = {
  key: 0,
  class: "card",
  style: { "margin-top": "14px" }
};
const _hoisted_22$b = { class: "card-h" };
const _hoisted_23$b = { class: "sub" };
const _hoisted_24$9 = { class: "fr-av" };
const _hoisted_25$9 = { class: "fr-main" };
const _hoisted_26$9 = { class: "fr-name" };
const _hoisted_27$9 = { class: "fr-id" };
const _hoisted_28$9 = {
  key: 0,
  class: "fr-note-text"
};
const _hoisted_29$8 = { class: "fr-act" };
const _hoisted_30$8 = ["onClick"];
const _hoisted_31$8 = ["onClick"];
const _hoisted_32$8 = {
  class: "card-h",
  style: { "margin": "18px 0 8px" }
};
const _hoisted_33$8 = { class: "sub" };
const _hoisted_34$8 = {
  key: 1,
  class: "card",
  style: { "padding": "0", "overflow": "hidden" }
};
const _hoisted_35$7 = { class: "fr-av" };
const _hoisted_36$7 = { class: "fr-main" };
const _hoisted_37$7 = { class: "fr-name" };
const _hoisted_38$6 = { class: "fr-id" };
const _hoisted_39$6 = { class: "fr-act" };
const _hoisted_40$6 = ["onClick"];
const _hoisted_41$5 = ["onClick"];
const _hoisted_42$5 = {
  key: 2,
  class: "card"
};
const _sfc_main$k = {
  __name: "FriendsView",
  setup(__props) {
    const router2 = useRouter();
    const auth = useAuthStore();
    const friends = /* @__PURE__ */ ref([]);
    const requests = /* @__PURE__ */ ref([]);
    const search = /* @__PURE__ */ ref([]);
    const q = /* @__PURE__ */ ref("");
    const searched = /* @__PURE__ */ ref(false);
    const noteFor = /* @__PURE__ */ ref(null);
    const note = /* @__PURE__ */ ref("");
    const error = /* @__PURE__ */ ref("");
    const busy = /* @__PURE__ */ ref(false);
    async function loadAll() {
      if (!auth.user) {
        friends.value = [];
        requests.value = [];
        return;
      }
      error.value = "";
      try {
        const [f, r] = await Promise.all([socialApi.friends(), socialApi.requests()]);
        friends.value = f && f.items || [];
        requests.value = r && r.items || [];
      } catch (e) {
        error.value = e && e.message || "加载失败";
      }
    }
    onMounted(loadAll);
    async function doSearch() {
      searched.value = true;
      const term = q.value.trim();
      if (!term) {
        search.value = [];
        return;
      }
      try {
        const r = await socialApi.search(term);
        search.value = r && r.items || [];
      } catch (e) {
        search.value = [];
        toast("搜索失败：" + (e && e.message || ""));
      }
    }
    function ask(u) {
      noteFor.value = u.id;
      note.value = "";
    }
    function cancelNote() {
      noteFor.value = null;
      note.value = "";
    }
    async function sendRequest(u) {
      if (busy.value) return;
      busy.value = true;
      const keep = note.value;
      noteFor.value = null;
      try {
        const r = await socialApi.request(u.id, keep.trim());
        toast(r && r.status === "ACCEPTED" ? "你们已经成为好友" : "请求已发送");
        await loadAll();
        if (search.value.length) await doSearch();
      } catch (e) {
        toast(errText2(e));
        note.value = keep;
      } finally {
        busy.value = false;
      }
    }
    async function accept(requestId) {
      try {
        await socialApi.accept(requestId);
        toast("已加为好友");
        await loadAll();
        if (searched.value) await doSearch();
      } catch (e) {
        toast(errText2(e));
      }
    }
    async function reject(requestId) {
      try {
        await socialApi.reject(requestId);
        toast("已拒绝");
        await loadAll();
      } catch (e) {
        toast(errText2(e));
      }
    }
    async function acceptByUser(userId) {
      try {
        const r = await socialApi.requests();
        const hit = (r && r.items || []).find((x) => x.fromId === userId);
        if (!hit) {
          toast("这条请求可能已被处理");
          await loadAll();
          return;
        }
        await accept(hit.requestId);
      } catch (e) {
        toast(errText2(e));
      }
    }
    async function remove2(userId) {
      try {
        await socialApi.unfriend(userId);
        toast("已删除好友");
        await loadAll();
      } catch (e) {
        toast(errText2(e));
      }
    }
    function openChat(f) {
      router2.push({ name: "chat", query: { to: f.id, name: f.name } });
    }
    function errText2(e) {
      const code = e instanceof ApiError ? e.code : "";
      const map = {
        CANT_ADD_SELF: "不能加自己为好友",
        USER_NOT_FOUND: "这个人不存在",
        ALREADY_FRIEND: "你们已经是好友了",
        PENDING_EXISTS: "已经发过请求，等对方处理",
        TARGET_IS_BOT: "AI 账号不能加好友",
        NOT_FRIEND: "你们不是好友",
        REQUEST_NOT_PENDING: "这条请求已经处理过了",
        NOT_REQUEST_TARGET: "这条请求不是发给你的"
      };
      return map[code] || "操作失败：" + (code || e && e.message || "");
    }
    function initial2(name) {
      return String(name || "?").slice(0, 1);
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[6] || (_cache[6] = createBaseVNode("h1", { class: "pg" }, "好友", -1)),
        _cache[7] || (_cache[7] = createBaseVNode("p", { class: "sub" }, "好友之间才能私聊 · 对方会收到一条好友请求通知", -1)),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_1$k, [
          createBaseVNode("div", _hoisted_2$k, toDisplayString(error.value), 1)
        ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("div", _hoisted_3$k, [
            _cache[2] || (_cache[2] = createBaseVNode("div", { class: "card-h" }, "加好友", -1)),
            createBaseVNode("div", _hoisted_4$k, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => q.value = $event),
                class: "inp",
                placeholder: "输入账号或昵称，如 wandou",
                onKeydown: withKeys(doSearch, ["enter"])
              }, null, 544), [
                [vModelText, q.value]
              ]),
              createBaseVNode("button", {
                class: "btn primary",
                onClick: doSearch
              }, "搜索")
            ]),
            searched.value ? (openBlock(), createElementBlock("div", _hoisted_5$k, [
              search.value.length ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(search.value, (u) => {
                return openBlock(), createElementBlock("div", {
                  key: u.id
                }, [
                  createBaseVNode("div", _hoisted_6$k, [
                    createBaseVNode("div", _hoisted_7$j, toDisplayString(initial2(u.name)), 1),
                    createBaseVNode("div", _hoisted_8$i, [
                      createBaseVNode("div", _hoisted_9$h, toDisplayString(u.name), 1),
                      createBaseVNode("div", _hoisted_10$h, "@" + toDisplayString(u.id), 1)
                    ]),
                    createBaseVNode("div", _hoisted_11$f, [
                      u.isSelf ? (openBlock(), createElementBlock("span", _hoisted_12$e, "这是你自己")) : u.isFriend ? (openBlock(), createElementBlock("button", _hoisted_13$e, "已是好友")) : u.pendingIn ? (openBlock(), createElementBlock("button", {
                        key: 2,
                        class: "btn primary",
                        onClick: ($event) => acceptByUser(u.id)
                      }, "接受对方请求", 8, _hoisted_14$e)) : u.hasPendingRequest ? (openBlock(), createElementBlock("button", _hoisted_15$c, "已发送")) : (openBlock(), createElementBlock("button", {
                        key: 4,
                        class: "btn primary",
                        onClick: ($event) => ask(u)
                      }, "加好友", 8, _hoisted_16$c))
                    ])
                  ]),
                  noteFor.value === u.id ? (openBlock(), createElementBlock("div", _hoisted_17$c, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => note.value = $event),
                      class: "inp",
                      maxlength: "100",
                      placeholder: "附言（可选，最多 100 字）",
                      onKeydown: withKeys(($event) => sendRequest(u), ["enter"])
                    }, null, 40, _hoisted_18$c), [
                      [vModelText, note.value]
                    ]),
                    createBaseVNode("button", {
                      class: "btn primary",
                      disabled: busy.value,
                      onClick: ($event) => sendRequest(u)
                    }, "发送", 8, _hoisted_19$b),
                    createBaseVNode("button", {
                      class: "btn ghost",
                      onClick: cancelNote
                    }, "取消")
                  ])) : createCommentVNode("", true)
                ]);
              }), 128)) : (openBlock(), createElementBlock("div", _hoisted_20$b, "没找到这个人（账号要完全一致，昵称可以是片段）"))
            ])) : createCommentVNode("", true)
          ]),
          requests.value.length ? (openBlock(), createElementBlock("div", _hoisted_21$b, [
            createBaseVNode("div", _hoisted_22$b, [
              _cache[3] || (_cache[3] = createTextVNode("待处理请求 ", -1)),
              createBaseVNode("span", _hoisted_23$b, toDisplayString(requests.value.length), 1)
            ]),
            (openBlock(true), createElementBlock(Fragment, null, renderList(requests.value, (r) => {
              return openBlock(), createElementBlock("div", {
                key: r.requestId,
                class: "fr-row"
              }, [
                createBaseVNode("div", _hoisted_24$9, toDisplayString(initial2(r.fromName)), 1),
                createBaseVNode("div", _hoisted_25$9, [
                  createBaseVNode("div", _hoisted_26$9, [
                    createTextVNode(toDisplayString(r.fromName) + " ", 1),
                    createBaseVNode("span", _hoisted_27$9, "@" + toDisplayString(r.fromId), 1)
                  ]),
                  r.note ? (openBlock(), createElementBlock("div", _hoisted_28$9, "「" + toDisplayString(r.note) + "」", 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_29$8, [
                  createBaseVNode("button", {
                    class: "btn primary",
                    onClick: ($event) => accept(r.requestId)
                  }, "接受", 8, _hoisted_30$8),
                  createBaseVNode("button", {
                    class: "btn ghost",
                    onClick: ($event) => reject(r.requestId)
                  }, "拒绝", 8, _hoisted_31$8)
                ])
              ]);
            }), 128))
          ])) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_32$8, [
            _cache[4] || (_cache[4] = createTextVNode("我的好友 ", -1)),
            createBaseVNode("span", _hoisted_33$8, toDisplayString(friends.value.length), 1)
          ]),
          friends.value.length ? (openBlock(), createElementBlock("div", _hoisted_34$8, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(friends.value, (f) => {
              return openBlock(), createElementBlock("div", {
                key: f.id,
                class: "fr-row"
              }, [
                createBaseVNode("div", _hoisted_35$7, toDisplayString(initial2(f.name)), 1),
                createBaseVNode("div", _hoisted_36$7, [
                  createBaseVNode("div", _hoisted_37$7, [
                    createTextVNode(toDisplayString(f.name) + " ", 1),
                    createBaseVNode("span", _hoisted_38$6, "@" + toDisplayString(f.id), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_39$6, [
                  createBaseVNode("button", {
                    class: "btn primary",
                    onClick: ($event) => openChat(f)
                  }, "发消息", 8, _hoisted_40$6),
                  createBaseVNode("button", {
                    class: "btn ghost",
                    onClick: ($event) => remove2(f.id)
                  }, "删除", 8, _hoisted_41$5)
                ])
              ]);
            }), 128))
          ])) : (openBlock(), createElementBlock("div", _hoisted_42$5, [..._cache[5] || (_cache[5] = [
            createBaseVNode("div", { class: "empty" }, "还没有好友，先在上面搜一个人加吧", -1)
          ])]))
        ], 64))
      ], 64);
    };
  }
};
const _hoisted_1$j = {
  key: 0,
  class: "card"
};
const _hoisted_2$j = { class: "empty" };
const _hoisted_3$j = {
  key: 1,
  class: "grid g2"
};
const _hoisted_4$j = { class: "card" };
const _hoisted_5$j = { class: "t" };
const _hoisted_6$j = { style: { "font-size": "13px" } };
const _hoisted_7$i = { style: { "font-size": "11px", "color": "#8a909c" } };
const _hoisted_8$h = { class: "heatbar" };
const _hoisted_9$g = {
  class: "mono",
  style: { "color": "#2f5bea", "font-weight": "600" }
};
const _hoisted_10$g = ["onClick"];
const _hoisted_11$e = { key: 0 };
const _hoisted_12$d = { class: "card" };
const _hoisted_13$d = {
  class: "codebox",
  style: { "margin-top": "8px" }
};
const _hoisted_14$d = { style: { "font-size": "11.5px", "color": "#8a909c", "margin-top": "10px" } };
const _sfc_main$j = {
  __name: "HotView",
  setup(__props) {
    const router2 = useRouter();
    const hot = /* @__PURE__ */ ref(null);
    const error = /* @__PURE__ */ ref("");
    const list = computed(() => hot.value && hot.value.list || []);
    const maxScore = computed(() => list.value.length ? list.value[0].score : 1);
    const key = computed(() => hot.value && hot.value.key || "hot:debate:today");
    const cardCount = computed(() => hot.value && hot.value.card || 0);
    function pct(score) {
      return Math.round(score / (maxScore.value || 1) * 100);
    }
    async function load() {
      try {
        hot.value = await baseApi.hot(12);
      } catch (e) {
        error.value = e && e.message || "加载失败";
      }
    }
    onMounted(load);
    function openDebate(topicId) {
      router2.push({ name: "solo", query: topicId ? { topic: topicId } : {} });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[12] || (_cache[12] = createBaseVNode("h1", { class: "pg" }, "热辩榜", -1)),
        _cache[13] || (_cache[13] = createBaseVNode("p", { class: "sub" }, "按热度实时排序，数据存在 Redis ZSET；热度随时间衰减，避免旧题霸榜。", -1)),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_1$j, [
          createBaseVNode("div", _hoisted_2$j, toDisplayString(error.value), 1)
        ])) : (openBlock(), createElementBlock("div", _hoisted_3$j, [
          createBaseVNode("div", _hoisted_4$j, [
            createBaseVNode("table", _hoisted_5$j, [
              _cache[1] || (_cache[1] = createBaseVNode("thead", null, [
                createBaseVNode("tr", null, [
                  createBaseVNode("th", { style: { "width": "44px" } }, "排名"),
                  createBaseVNode("th", null, "辩题"),
                  createBaseVNode("th", { style: { "width": "110px" } }, "热度"),
                  createBaseVNode("th", { style: { "width": "64px" } }, "分数"),
                  createBaseVNode("th", { style: { "width": "56px" } })
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(list.value, (x) => {
                  return openBlock(), createElementBlock("tr", {
                    key: x.topicId
                  }, [
                    createBaseVNode("td", null, [
                      createBaseVNode("b", {
                        style: normalizeStyle({ color: x.rank <= 3 ? "#B7791F" : "#6B7280" })
                      }, toDisplayString(x.rank), 5)
                    ]),
                    createBaseVNode("td", null, [
                      createBaseVNode("div", _hoisted_6$j, toDisplayString(x.title), 1),
                      createBaseVNode("div", _hoisted_7$i, toDisplayString(x.source === "custom" ? "自定义" : "官方") + " · " + toDisplayString(x.topicId), 1)
                    ]),
                    createBaseVNode("td", null, [
                      createBaseVNode("div", _hoisted_8$h, [
                        createBaseVNode("i", {
                          style: normalizeStyle({ width: pct(x.score) + "%" })
                        }, null, 4)
                      ])
                    ]),
                    createBaseVNode("td", _hoisted_9$g, toDisplayString(x.score), 1),
                    createBaseVNode("td", null, [
                      createBaseVNode("button", {
                        class: "btn sm ghost",
                        onClick: ($event) => openDebate(x.topicId)
                      }, "开辩", 8, _hoisted_10$g)
                    ])
                  ]);
                }), 128)),
                !list.value.length ? (openBlock(), createElementBlock("tr", _hoisted_11$e, [..._cache[0] || (_cache[0] = [
                  createBaseVNode("td", {
                    colspan: "5",
                    class: "empty"
                  }, "暂无数据", -1)
                ])])) : createCommentVNode("", true)
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_12$d, [
            _cache[11] || (_cache[11] = createBaseVNode("b", { style: { "font-size": "13px" } }, "Redis 里的真实写法", -1)),
            createBaseVNode("div", _hoisted_13$d, [
              _cache[2] || (_cache[2] = createBaseVNode("span", { class: "c" }, "# 开辩 / 发言 / 打完，写入当日榜单", -1)),
              _cache[3] || (_cache[3] = createBaseVNode("span", { class: "k" }, "ZINCRBY", -1)),
              createTextVNode(" " + toDisplayString(key.value) + " 2 topic:t3 ", 1),
              _cache[4] || (_cache[4] = createBaseVNode("span", { class: "c" }, "# 取前 10 名（带分数）", -1)),
              _cache[5] || (_cache[5] = createBaseVNode("span", { class: "k" }, "ZREVRANGE", -1)),
              createTextVNode(" " + toDisplayString(key.value) + " 0 9 ", 1),
              _cache[6] || (_cache[6] = createBaseVNode("span", { class: "k" }, "WITHSCORES", -1)),
              _cache[7] || (_cache[7] = createBaseVNode("span", { class: "c" }, "# 查名次 / 衰减 / 过期", -1)),
              _cache[8] || (_cache[8] = createBaseVNode("span", { class: "k" }, "ZREVRANK", -1)),
              createTextVNode(" " + toDisplayString(key.value) + " topic:t3 ", 1),
              _cache[9] || (_cache[9] = createBaseVNode("span", { class: "k" }, "ZINCRBY", -1)),
              createTextVNode(" " + toDisplayString(key.value) + " -0.5 topic:t3 ", 1),
              _cache[10] || (_cache[10] = createBaseVNode("span", { class: "k" }, "EXPIRE", -1)),
              createTextVNode(" " + toDisplayString(key.value) + " 172800 ", 1)
            ]),
            createBaseVNode("div", _hoisted_14$d, " 当前榜单成员 " + toDisplayString(cardCount.value) + " 个。后端默认用内存实现，接真 Redis 只需换 HotRank 实现类。 ", 1)
          ])
        ]))
      ], 64);
    };
  }
};
const _hoisted_1$i = {
  key: 0,
  class: "card"
};
const _hoisted_2$i = { class: "empty" };
const _hoisted_3$i = {
  class: "grid g3",
  style: { "margin-bottom": "14px" }
};
const _hoisted_4$i = { class: "card" };
const _hoisted_5$i = {
  class: "big",
  style: { "font-size": "30px" }
};
const _hoisted_6$i = { class: "card" };
const _hoisted_7$h = {
  class: "big",
  style: { "font-size": "30px" }
};
const _hoisted_8$g = { class: "card" };
const _hoisted_9$f = {
  class: "big",
  style: { "font-size": "30px" }
};
const _hoisted_10$f = { class: "card" };
const _hoisted_11$d = {
  key: 0,
  class: "t"
};
const _hoisted_12$c = { class: "mono" };
const _hoisted_13$c = { class: "mono" };
const _hoisted_14$c = {
  key: 1,
  class: "empty"
};
const _sfc_main$i = {
  __name: "RecordsView",
  setup(__props) {
    const records = /* @__PURE__ */ ref([]);
    const error = /* @__PURE__ */ ref("");
    const avg = computed(
      () => records.value.length ? Math.round(records.value.reduce((a, b) => a + b.total, 0) / records.value.length) : "—"
    );
    const totalTurns = computed(() => records.value.reduce((a, b) => a + b.turns, 0));
    onMounted(async () => {
      try {
        records.value = await baseApi.records() || [];
      } catch (e) {
        error.value = e && e.message || "加载失败";
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[4] || (_cache[4] = createBaseVNode("h1", { class: "pg" }, "辩论记录", -1)),
        _cache[5] || (_cache[5] = createBaseVNode("p", { class: "sub" }, "没有段位、没有排名，只记录你打过什么。", -1)),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_1$i, [
          createBaseVNode("div", _hoisted_2$i, toDisplayString(error.value), 1)
        ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("div", _hoisted_3$i, [
            createBaseVNode("div", _hoisted_4$i, [
              _cache[0] || (_cache[0] = createBaseVNode("div", { style: { "font-size": "12px", "color": "#8a909c" } }, "总场次", -1)),
              createBaseVNode("div", _hoisted_5$i, toDisplayString(records.value.length), 1)
            ]),
            createBaseVNode("div", _hoisted_6$i, [
              _cache[1] || (_cache[1] = createBaseVNode("div", { style: { "font-size": "12px", "color": "#8a909c" } }, "平均分", -1)),
              createBaseVNode("div", _hoisted_7$h, toDisplayString(avg.value), 1)
            ]),
            createBaseVNode("div", _hoisted_8$g, [
              _cache[2] || (_cache[2] = createBaseVNode("div", { style: { "font-size": "12px", "color": "#8a909c" } }, "总发言回合", -1)),
              createBaseVNode("div", _hoisted_9$f, toDisplayString(totalTurns.value), 1)
            ])
          ]),
          createBaseVNode("div", _hoisted_10$f, [
            records.value.length ? (openBlock(), createElementBlock("table", _hoisted_11$d, [
              _cache[3] || (_cache[3] = createBaseVNode("thead", null, [
                createBaseVNode("tr", null, [
                  createBaseVNode("th", null, "辩题"),
                  createBaseVNode("th", null, "席位"),
                  createBaseVNode("th", null, "发言"),
                  createBaseVNode("th", null, "得分")
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(records.value, (r, i) => {
                  return openBlock(), createElementBlock("tr", { key: i }, [
                    createBaseVNode("td", null, toDisplayString(r.topic_title), 1),
                    createBaseVNode("td", _hoisted_12$c, toDisplayString(r.seats), 1),
                    createBaseVNode("td", _hoisted_13$c, toDisplayString(r.turns), 1),
                    createBaseVNode("td", null, [
                      createBaseVNode("b", null, toDisplayString(r.total), 1)
                    ])
                  ]);
                }), 128))
              ])
            ])) : (openBlock(), createElementBlock("div", _hoisted_14$c, "还没有记录，去单人辩论打一场"))
          ])
        ], 64))
      ], 64);
    };
  }
};
const _hoisted_1$h = ["points"];
const _hoisted_2$h = ["x2", "y2"];
const _hoisted_3$h = ["points"];
const _hoisted_4$h = ["cx", "cy"];
const _hoisted_5$h = ["x", "y"];
const _hoisted_6$h = ["x", "y"];
const R = 84;
const CX = 120;
const CY = 120;
const _sfc_main$h = {
  __name: "RadarChart",
  props: {
    dims: { type: Object, default: () => ({}) },
    /** 关掉动画（自检/打印时用） */
    animate: { type: Boolean, default: true },
    maxWidth: { type: Number, default: 340 }
  },
  setup(__props) {
    const props = __props;
    const keys = computed(() => Object.keys(props.dims || {}));
    const values = computed(
      () => keys.value.map((k) => Math.max(0, Math.min(100, Number(props.dims[k]) || 0)))
    );
    const grown = /* @__PURE__ */ ref(!props.animate);
    function pt(i, f) {
      const n = keys.value.length || 1;
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      const r = R * f;
      return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    }
    const outer = computed(() => keys.value.map((_, i) => pt(i, 1)));
    const rings = computed(
      () => [0.25, 0.5, 0.75, 1].map(
        (f) => outer.value.map(([x, y]) => [CX + (x - CX) * f, CY + (y - CY) * f].join(",")).join(" ")
      )
    );
    const points = computed(
      () => values.value.map((v, i) => {
        const [x, y] = pt(i, v / 100);
        return { x, y };
      })
    );
    const shape = computed(() => points.value.map((p2) => p2.x + "," + p2.y).join(" "));
    const labels = computed(
      () => keys.value.map((k, i) => {
        const [x, y] = pt(i, 1.2);
        return { k, v: values.value[i], x, y };
      })
    );
    function grow() {
      if (!props.animate) {
        grown.value = true;
        return;
      }
      grown.value = false;
      nextTick(() => {
        requestAnimationFrame(
          () => requestAnimationFrame(() => {
            grown.value = true;
          })
        );
      });
    }
    onMounted(grow);
    watch(() => JSON.stringify(props.dims || {}), grow);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        viewBox: "0 0 240 240",
        style: normalizeStyle({ width: "100%", maxWidth: __props.maxWidth + "px", overflow: "visible" })
      }, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(rings.value, (r, i) => {
          return openBlock(), createElementBlock("polygon", {
            key: "ring" + i,
            points: r,
            fill: "none",
            stroke: "#EDEAE3"
          }, null, 8, _hoisted_1$h);
        }), 128)),
        (openBlock(true), createElementBlock(Fragment, null, renderList(outer.value, (o, i) => {
          return openBlock(), createElementBlock("line", {
            key: "axis" + i,
            x1: CX,
            y1: CY,
            x2: o[0],
            y2: o[1],
            stroke: "#EDEAE3"
          }, null, 8, _hoisted_2$h);
        }), 128)),
        createBaseVNode("g", {
          class: "radar-grow",
          style: normalizeStyle({
            transformOrigin: CX + "px " + CY + "px",
            transform: grown.value ? "scale(1)" : "scale(.02)",
            opacity: grown.value ? 1 : 0,
            transition: __props.animate ? "transform .9s cubic-bezier(.22,.9,.3,1), opacity .5s ease" : "none"
          })
        }, [
          createBaseVNode("polygon", {
            points: shape.value,
            fill: "rgba(47,91,234,.18)",
            stroke: "#2F5BEA",
            "stroke-width": "2",
            "stroke-linejoin": "round"
          }, null, 8, _hoisted_3$h),
          (openBlock(true), createElementBlock(Fragment, null, renderList(points.value, (p2, i) => {
            return openBlock(), createElementBlock("circle", {
              key: "dot" + i,
              cx: p2.x,
              cy: p2.y,
              r: "2.6",
              fill: "#2F5BEA"
            }, null, 8, _hoisted_4$h);
          }), 128))
        ], 4),
        (openBlock(true), createElementBlock(Fragment, null, renderList(labels.value, (l) => {
          return openBlock(), createElementBlock(Fragment, {
            key: "lb" + l.k
          }, [
            createBaseVNode("text", {
              x: l.x,
              y: l.y,
              "font-size": "10.5",
              fill: "#6B7280",
              "text-anchor": "middle",
              "dominant-baseline": "middle"
            }, toDisplayString(l.k), 9, _hoisted_5$h),
            createBaseVNode("text", {
              x: l.x,
              y: l.y + 12,
              class: "radar-val",
              "font-size": "9.5",
              fill: "#A8ADB8",
              "text-anchor": "middle",
              "dominant-baseline": "middle"
            }, toDisplayString(l.v), 9, _hoisted_6$h)
          ], 64);
        }), 128))
      ], 4);
    };
  }
};
const _hoisted_1$g = { class: "sub" };
const _hoisted_2$g = {
  key: 0,
  class: "card"
};
const _hoisted_3$g = { class: "empty" };
const _hoisted_4$g = {
  key: 1,
  class: "card",
  style: { "text-align": "center", "padding": "44px 24px" }
};
const _hoisted_5$g = {
  key: 2,
  class: "card",
  style: { "text-align": "center", "padding": "40px", "color": "#86909c" }
};
const _hoisted_6$g = {
  key: 3,
  class: "grid g2"
};
const _hoisted_7$g = { class: "card" };
const _hoisted_8$f = {
  class: "row",
  style: { "justify-content": "space-between", "align-items": "center", "gap": "10px", "flex-wrap": "wrap" }
};
const _hoisted_9$e = { style: { "font-size": "13px" } };
const _hoisted_10$e = {
  class: "row",
  style: { "gap": "6px", "flex-wrap": "wrap" }
};
const _hoisted_11$c = ["onClick"];
const _hoisted_12$b = {
  class: "row",
  style: { "align-items": "center", "margin-top": "6px" }
};
const _hoisted_13$b = { style: { "flex": "1", "min-width": "250px" } };
const _hoisted_14$b = { style: { "flex": "1", "min-width": "220px" } };
const _hoisted_15$b = { class: "lb" };
const _hoisted_16$b = { class: "dbar" };
const _hoisted_17$b = { class: "dim-num" };
const _hoisted_18$b = {
  key: 0,
  style: { "color": "#0e9f6e", "font-size": "11.5px" }
};
const _hoisted_19$a = {
  key: 1,
  style: { "color": "#c0392b", "font-size": "11.5px" }
};
const _hoisted_20$a = {
  key: 2,
  style: { "color": "#a8adb8", "font-size": "11.5px" }
};
const _hoisted_21$a = {
  key: 0,
  class: "empty"
};
const _hoisted_22$a = { class: "card" };
const _hoisted_23$a = {
  class: "row",
  style: { "justify-content": "space-between" }
};
const _hoisted_24$8 = { class: "tag g" };
const _hoisted_25$8 = {
  class: "card",
  style: { "margin-top": "12px" }
};
const _hoisted_26$8 = {
  class: "t",
  style: { "margin-top": "6px" }
};
const _hoisted_27$8 = {
  class: "mono",
  style: { "text-align": "right" }
};
const _hoisted_28$8 = { key: 0 };
const _sfc_main$g = {
  __name: "DiagView",
  setup(__props) {
    const router2 = useRouter();
    const auth = useAuthStore();
    const WINDOWS = [
      { v: 3, label: "最近 3 场" },
      { v: 5, label: "最近 5 场" },
      { v: 10, label: "最近 10 场" }
    ];
    const diag = /* @__PURE__ */ ref(null);
    const loading = /* @__PURE__ */ ref(false);
    const error = /* @__PURE__ */ ref("");
    const win = /* @__PURE__ */ ref(0);
    const shown = /* @__PURE__ */ ref({});
    const barsOn = /* @__PURE__ */ ref(false);
    let rafId = 0;
    const dims = computed(() => diag.value && diag.value.dims || {});
    const delta = computed(() => diag.value && diag.value.delta || {});
    const flaws = computed(() => diag.value && diag.value.flaws || {});
    const streak = computed(() => diag.value && diag.value.streak || 0);
    const samples = computed(() => diag.value && diag.value.samples || 0);
    const total = computed(() => diag.value && diag.value.total || 0);
    const curWindow = computed(() => diag.value && diag.value.window || 0);
    const isEmpty = computed(() => {
      if (!diag.value) return false;
      if (diag.value.empty === true) return true;
      return Object.keys(dims.value).length === 0;
    });
    const dimList = computed(
      () => Object.entries(dims.value).map(([k, v]) => ({ k, v, d: Number(delta.value[k]) || 0 }))
    );
    const flawList = computed(() => Object.entries(flaws.value));
    const subtitle = computed(() => {
      if (curWindow.value > 0) return `最近 ${curWindow.value} 场的平均 · 只和你自己比，没有段位也没有排名。`;
      return `全部 ${total.value || samples.value || 0} 场的平均 · 只和你自己比，没有段位也没有排名。`;
    });
    async function load(n) {
      loading.value = true;
      error.value = "";
      try {
        diag.value = await baseApi.diag(n);
        win.value = diag.value && diag.value.window || 0;
        animateAll();
      } catch (e) {
        error.value = e && e.message || "加载失败";
      } finally {
        loading.value = false;
      }
    }
    function animateAll() {
      cancelAnimationFrame(rafId);
      const targets = {};
      Object.entries(dims.value).forEach(([k, v]) => {
        targets[k] = Math.max(0, Math.min(100, Number(v) || 0));
      });
      if (!Object.keys(targets).length) return;
      shown.value = Object.fromEntries(Object.keys(targets).map((k) => [k, 0]));
      barsOn.value = false;
      nextTick(() => {
        barsOn.value = true;
        const t0 = performance.now();
        const dur = 900;
        const tick = (now) => {
          const p2 = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - p2, 3);
          const next = {};
          Object.entries(targets).forEach(([k, v]) => {
            next[k] = Math.round(v * eased);
          });
          shown.value = next;
          if (p2 < 1) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      });
    }
    function pickWindow(v) {
      if (win.value === v && diag.value) return;
      load(v);
    }
    function goSolo() {
      router2.push({ name: "solo" });
    }
    onMounted(() => {
      if (!auth.user) {
        router2.push({ name: "login", query: { next: "/diag" } });
        return;
      }
      load(0);
    });
    watch(() => auth.user && auth.user.id, (id) => {
      if (id) load(win.value);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[10] || (_cache[10] = createBaseVNode("h1", { class: "pg" }, "能力分析", -1)),
        createBaseVNode("p", _hoisted_1$g, toDisplayString(subtitle.value), 1),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_2$g, [
          createBaseVNode("div", _hoisted_3$g, toDisplayString(error.value), 1)
        ])) : isEmpty.value ? (openBlock(), createElementBlock("div", _hoisted_4$g, [
          _cache[1] || (_cache[1] = createBaseVNode("div", { style: { "font-size": "34px", "margin-bottom": "8px" } }, "📊", -1)),
          _cache[2] || (_cache[2] = createBaseVNode("b", { style: { "font-size": "14px" } }, "还没有数据", -1)),
          _cache[3] || (_cache[3] = createBaseVNode("div", { style: { "font-size": "12.5px", "color": "#8a909c", "margin": "8px 0 16px", "line-height": "1.8" } }, [
            createTextVNode(" 打满 1 场就能看到六维雷达；"),
            createBaseVNode("br"),
            createTextVNode("打满 3 场后曲线才有参考价值。 ")
          ], -1)),
          createBaseVNode("button", {
            class: "btn primary",
            onClick: goSolo
          }, "去打第一场")
        ])) : loading.value && !diag.value ? (openBlock(), createElementBlock("div", _hoisted_5$g, " 正在分析… ")) : (openBlock(), createElementBlock("div", _hoisted_6$g, [
          createBaseVNode("div", _hoisted_7$g, [
            createBaseVNode("div", _hoisted_8$f, [
              createBaseVNode("b", _hoisted_9$e, toDisplayString(dimList.value.length || 6) + " 维画像", 1),
              createBaseVNode("div", _hoisted_10$e, [
                (openBlock(), createElementBlock(Fragment, null, renderList(WINDOWS, (w) => {
                  return createBaseVNode("button", {
                    key: w.v,
                    class: normalizeClass(["btn sm", { ghost: curWindow.value !== w.v }]),
                    onClick: ($event) => pickWindow(w.v)
                  }, toDisplayString(w.label), 11, _hoisted_11$c);
                }), 64)),
                createBaseVNode("button", {
                  class: normalizeClass(["btn sm", { ghost: curWindow.value !== 0 }]),
                  onClick: _cache[0] || (_cache[0] = ($event) => pickWindow(0))
                }, " 全部 " + toDisplayString(total.value || ""), 3)
              ])
            ]),
            createBaseVNode("div", _hoisted_12$b, [
              createBaseVNode("div", _hoisted_13$b, [
                createVNode(_sfc_main$h, { dims: dims.value }, null, 8, ["dims"])
              ]),
              createBaseVNode("div", _hoisted_14$b, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(dimList.value, (d, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: d.k,
                    class: "dim"
                  }, [
                    createBaseVNode("span", _hoisted_15$b, toDisplayString(d.k), 1),
                    createBaseVNode("div", _hoisted_16$b, [
                      createBaseVNode("i", {
                        class: "dim-fill",
                        style: normalizeStyle({
                          width: (barsOn.value ? d.v : 0) + "%",
                          transition: "width .9s cubic-bezier(.22,.9,.3,1) " + i * 90 + "ms"
                        })
                      }, null, 4)
                    ]),
                    createBaseVNode("b", _hoisted_17$b, toDisplayString(shown.value[d.k] == null ? 0 : shown.value[d.k]), 1),
                    d.d > 0 ? (openBlock(), createElementBlock("span", _hoisted_18$b, "↑" + toDisplayString(d.d), 1)) : d.d < 0 ? (openBlock(), createElementBlock("span", _hoisted_19$a, "↓" + toDisplayString(-d.d), 1)) : (openBlock(), createElementBlock("span", _hoisted_20$a, "—"))
                  ]);
                }), 128)),
                !dimList.value.length ? (openBlock(), createElementBlock("div", _hoisted_21$a, "还没有数据，打一场就有了")) : createCommentVNode("", true)
              ])
            ]),
            _cache[4] || (_cache[4] = createBaseVNode("div", { style: { "font-size": "11.5px", "color": "#8a909c", "margin-top": "8px", "line-height": "1.7" } }, [
              createTextVNode(" 箭头 = 本场 vs 当前窗口均值。样本少于 3 场时曲线波动大，别急着下结论。"),
              createBaseVNode("br"),
              createTextVNode(" 协同维度只在和真人队友配合时计分；没有真人队友时按中性 60 记。 ")
            ], -1))
          ]),
          createBaseVNode("div", null, [
            createBaseVNode("div", _hoisted_22$a, [
              createBaseVNode("div", _hoisted_23$a, [
                _cache[5] || (_cache[5] = createBaseVNode("b", { style: { "font-size": "13px" } }, "练习连续性", -1)),
                createBaseVNode("span", _hoisted_24$8, "连续 " + toDisplayString(streak.value) + " 天", 1)
              ]),
              _cache[6] || (_cache[6] = createBaseVNode("div", { style: { "font-size": "12px", "color": "#8a909c", "margin-top": "8px" } }, "中断即归零，不和别人比。", -1))
            ]),
            createBaseVNode("div", _hoisted_25$8, [
              _cache[8] || (_cache[8] = createBaseVNode("b", { style: { "font-size": "13px" } }, "漏洞统计（错题本）", -1)),
              _cache[9] || (_cache[9] = createBaseVNode("div", { style: { "font-size": "11.5px", "color": "#8a909c", "margin": "4px 0 6px" } }, "命中即记一次，不是写死的示例数据。", -1)),
              createBaseVNode("table", _hoisted_26$8, [
                createBaseVNode("tbody", null, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(flawList.value, ([k, v]) => {
                    return openBlock(), createElementBlock("tr", { key: k }, [
                      createBaseVNode("td", null, toDisplayString(k), 1),
                      createBaseVNode("td", _hoisted_27$8, toDisplayString(v) + " 次", 1)
                    ]);
                  }), 128)),
                  !flawList.value.length ? (openBlock(), createElementBlock("tr", _hoisted_28$8, [..._cache[7] || (_cache[7] = [
                    createBaseVNode("td", { class: "empty" }, "暂无", -1)
                  ])])) : createCommentVNode("", true)
                ])
              ])
            ])
          ])
        ]))
      ], 64);
    };
  }
};
const _hoisted_1$f = {
  class: "panel",
  style: { "width": "min(420px, 100%)" }
};
const _hoisted_2$f = {
  class: "row",
  style: { "justify-content": "space-between", "align-items": "center" }
};
const _hoisted_3$f = ["disabled"];
const _hoisted_4$f = { style: { "margin": "18px 0 6px" } };
const _hoisted_5$f = {
  class: "big",
  style: { "font-size": "32px" }
};
const _hoisted_6$f = { style: { "font-size": "12px", "color": "#8a909c" } };
const _hoisted_7$f = {
  key: 0,
  style: { "font-size": "12.5px", "color": "#c0392b" }
};
const _hoisted_8$e = {
  class: "row",
  style: { "margin-top": "16px", "gap": "8px" }
};
const _hoisted_9$d = ["disabled"];
const _hoisted_10$d = ["disabled"];
const _sfc_main$f = {
  __name: "PayModal",
  props: {
    order: { type: Object, required: true }
    // { orderId, amountCents, sign }
  },
  emits: ["paid", "cancel"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const busy = /* @__PURE__ */ ref(false);
    const err = /* @__PURE__ */ ref("");
    async function confirmPay() {
      if (busy.value) return;
      busy.value = true;
      err.value = "";
      try {
        const r = await walletApi.payCallback(
          props.order.orderId,
          props.order.amountCents,
          props.order.sign,
          "MOCK-" + Date.now()
        );
        emit2("paid", r);
      } catch (e) {
        err.value = e && e.message || "支付失败";
      } finally {
        busy.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "mask",
        onClick: _cache[2] || (_cache[2] = withModifiers(($event) => emit2("cancel"), ["self"]))
      }, [
        createBaseVNode("div", _hoisted_1$f, [
          createBaseVNode("div", _hoisted_2$f, [
            _cache[3] || (_cache[3] = createBaseVNode("h2", { style: { "margin": "0", "font-size": "17px" } }, "模拟收银台", -1)),
            createBaseVNode("button", {
              class: "btn sm ghost",
              disabled: busy.value,
              onClick: _cache[0] || (_cache[0] = ($event) => emit2("cancel"))
            }, "关闭", 8, _hoisted_3$f)
          ]),
          createBaseVNode("div", _hoisted_4$f, [
            createBaseVNode("div", _hoisted_5$f, "¥" + toDisplayString(unref(money)(__props.order.amountCents)), 1),
            createBaseVNode("div", _hoisted_6$f, "订单 " + toDisplayString(__props.order.orderId), 1)
          ]),
          _cache[4] || (_cache[4] = createBaseVNode("p", {
            class: "sub",
            style: { "margin-bottom": "0" }
          }, " 这是本地模拟支付，不会真实扣款。真实环境这里会跳转微信 / 支付宝。 ", -1)),
          err.value ? (openBlock(), createElementBlock("p", _hoisted_7$f, toDisplayString(err.value), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_8$e, [
            createBaseVNode("button", {
              class: "btn primary",
              disabled: busy.value,
              onClick: confirmPay
            }, toDisplayString(busy.value ? "处理中…" : "确认已付款"), 9, _hoisted_9$d),
            createBaseVNode("button", {
              class: "btn ghost",
              disabled: busy.value,
              onClick: _cache[1] || (_cache[1] = ($event) => emit2("cancel"))
            }, "取消", 8, _hoisted_10$d)
          ])
        ])
      ]);
    };
  }
};
const _hoisted_1$e = { class: "grid g2" };
const _hoisted_2$e = { class: "card" };
const _hoisted_3$e = { style: { "margin": "4px 0 6px" } };
const _hoisted_4$e = {
  class: "big",
  style: { "font-size": "34px" }
};
const _hoisted_5$e = {
  class: "card",
  style: { "margin-top": "10px", "padding": "12px", "background": "#fbfcf8" }
};
const _hoisted_6$e = { class: "kv" };
const _hoisted_7$e = { class: "kv" };
const _hoisted_8$d = { class: "kv" };
const _hoisted_9$c = { style: { "margin-top": "14px" } };
const _hoisted_10$c = {
  class: "row",
  style: { "gap": "8px", "flex-wrap": "wrap" }
};
const _hoisted_11$b = ["disabled", "onClick"];
const _hoisted_12$a = {
  class: "card",
  style: { "margin-top": "14px" }
};
const _hoisted_13$a = { style: { "margin-top": "6px" } };
const _hoisted_14$a = {
  key: 0,
  class: "empty",
  style: { "padding": "12px 0" }
};
const _hoisted_15$a = {
  key: 2,
  class: "empty",
  style: { "padding": "12px 0" }
};
const _hoisted_16$a = {
  class: "card",
  style: { "align-self": "start" }
};
const _hoisted_17$a = {
  class: "row",
  style: { "justify-content": "space-between", "align-items": "center" }
};
const _hoisted_18$a = { style: { "font-size": "11.5px", "color": "#8a909c" } };
const _hoisted_19$9 = { class: "auth-field" };
const _hoisted_20$9 = { class: "auth-field" };
const _hoisted_21$9 = { class: "auth-field" };
const _hoisted_22$9 = {
  class: "row",
  style: { "gap": "8px" }
};
const _hoisted_23$9 = {
  key: 0,
  style: { "font-size": "11.5px", "margin-top": "8px", "color": "#8a909c" }
};
const _sfc_main$e = {
  __name: "WalletView",
  setup(__props) {
    const auth = useAuthStore();
    const wallet = useWalletStore();
    const tx = /* @__PURE__ */ ref([]);
    const txError = /* @__PURE__ */ ref("");
    const order = /* @__PURE__ */ ref(null);
    const busy = /* @__PURE__ */ ref(false);
    const info = computed(() => wallet.info || {});
    const llm = /* @__PURE__ */ ref({ baseUrl: "", model: "", apiKey: "", state: "读取中…", msg: "" });
    const RECHARGE = [100, 500, 1e3, 2e3];
    onMounted(async () => {
      if (!auth.user) return;
      await wallet.refresh();
      loadTx();
      loadLlm();
    });
    async function loadTx() {
      txError.value = "";
      try {
        const d = await walletApi.history(10);
        tx.value = d && d.list || [];
      } catch (e) {
        txError.value = e && e.message || "加载失败";
      }
    }
    async function loadLlm() {
      try {
        const d = await walletApi.llmProfile();
        llm.value.state = d.enabled ? "已启用 · " + (d.keyMask || "") : d.configured ? "已保存（未启用）" : "未配置";
        if (d.baseUrl) llm.value.baseUrl = d.baseUrl;
        if (d.model) llm.value.model = d.model;
      } catch (e) {
        llm.value.state = "读取失败";
      }
    }
    async function recharge(cents) {
      if (busy.value) return;
      busy.value = true;
      try {
        const o = await walletApi.createOrder(cents);
        order.value = o;
      } catch (e) {
        toast("下单失败：" + (e && e.message || ""));
      } finally {
        busy.value = false;
      }
    }
    async function onPaid(r) {
      order.value = null;
      await wallet.refresh();
      await loadTx();
      toast(r && r.already ? "这笔订单已入账过" : "支付成功，余额 ¥" + money(r && r.balanceCents));
    }
    async function saveLlm(enabled) {
      llm.value.msg = "";
      try {
        const d = await walletApi.saveLlmProfile({
          baseUrl: llm.value.baseUrl || "",
          model: llm.value.model || "",
          apiKey: llm.value.apiKey || "",
          enabled: !!enabled
        });
        llm.value.msg = enabled ? "已启用 · " + (d.keyMask || "") : "已停用（改用平台额度）";
        llm.value.apiKey = "";
        loadLlm();
      } catch (e) {
        llm.value.msg = "保存失败：" + (e && e.message || "");
      }
    }
    async function testLlm() {
      llm.value.msg = "测试中…";
      try {
        const d = await walletApi.testLlm();
        llm.value.msg = d.ok ? "连通正常 · " + d.latencyMs + "ms · 模型回「" + (d.reply || "") + "」" : "失败：" + (d.reason || "未知原因");
      } catch (e) {
        llm.value.msg = "测试失败：" + (e instanceof ApiError ? e.code || e.message : e && e.message);
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[16] || (_cache[16] = createBaseVNode("h1", { class: "pg" }, "钱包", -1)),
        _cache[17] || (_cache[17] = createBaseVNode("p", { class: "sub" }, "余额、充值、最近的流水都在这里 · 开局预扣预估费用，打完按实际 token 用量多退少补。", -1)),
        createBaseVNode("div", _hoisted_1$e, [
          createBaseVNode("div", null, [
            createBaseVNode("div", _hoisted_2$e, [
              createBaseVNode("div", _hoisted_3$e, [
                createBaseVNode("div", _hoisted_4$e, "¥" + toDisplayString(unref(money)(info.value.balanceCents)), 1),
                _cache[6] || (_cache[6] = createBaseVNode("div", { style: { "font-size": "12px", "color": "#8a909c" } }, "当前余额", -1))
              ]),
              createBaseVNode("div", _hoisted_5$e, [
                createBaseVNode("div", _hoisted_6$e, [
                  _cache[7] || (_cache[7] = createBaseVNode("span", null, "一场费用", -1)),
                  createBaseVNode("b", null, "约 ¥" + toDisplayString(unref(money)(info.value.estimateCents)), 1)
                ]),
                createBaseVNode("div", _hoisted_7$e, [
                  _cache[8] || (_cache[8] = createBaseVNode("span", null, "模型成本", -1)),
                  createBaseVNode("b", null, toDisplayString(info.value.centsPer1kTokens || 0) + " 分 / 千 token（按实际用量）", 1)
                ]),
                createBaseVNode("div", _hoisted_8$d, [
                  _cache[9] || (_cache[9] = createBaseVNode("span", null, "服务费", -1)),
                  createBaseVNode("b", null, toDisplayString(info.value.serviceFeeCents || 0) + " 分 / 场", 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_9$c, [
                createBaseVNode("div", _hoisted_10$c, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(RECHARGE, (c) => {
                    return createBaseVNode("button", {
                      key: c,
                      class: "btn sm ghost",
                      disabled: busy.value,
                      onClick: ($event) => recharge(c)
                    }, " 充 ¥" + toDisplayString(unref(money)(c)), 9, _hoisted_11$b);
                  }), 64))
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_12$a, [
              _cache[10] || (_cache[10] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "最近流水", -1)),
              createBaseVNode("div", _hoisted_13$a, [
                txError.value ? (openBlock(), createElementBlock("div", _hoisted_14$a, toDisplayString(txError.value), 1)) : tx.value.length ? (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(tx.value, (x, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    class: "kv",
                    style: { "font-size": "12px" }
                  }, [
                    createBaseVNode("span", null, toDisplayString(x.note || x.kind), 1),
                    createBaseVNode("b", {
                      style: normalizeStyle({ color: x.amount_cents >= 0 ? "#0E9F6E" : "#C0392B" })
                    }, toDisplayString(x.amount_cents >= 0 ? "+" : "") + toDisplayString(unref(money)(x.amount_cents)) + " 元 ", 5)
                  ]);
                }), 128)) : (openBlock(), createElementBlock("div", _hoisted_15$a, "还没有流水"))
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_16$a, [
            createBaseVNode("div", _hoisted_17$a, [
              _cache[11] || (_cache[11] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "用自己的 API", -1)),
              createBaseVNode("span", _hoisted_18$a, toDisplayString(llm.value.state), 1)
            ]),
            _cache[15] || (_cache[15] = createBaseVNode("div", { style: { "font-size": "11.5px", "color": "#a8adb8", "margin": "4px 0 10px" } }, " 填自己的 key 或本地模型地址跑对局：完全免费，平台一分不收。 ", -1)),
            createBaseVNode("div", _hoisted_19$9, [
              _cache[12] || (_cache[12] = createBaseVNode("label", null, "Base URL", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => llm.value.baseUrl = $event),
                placeholder: "https://api.deepseek.com/v1"
              }, null, 512), [
                [vModelText, llm.value.baseUrl]
              ])
            ]),
            createBaseVNode("div", _hoisted_20$9, [
              _cache[13] || (_cache[13] = createBaseVNode("label", null, "模型", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => llm.value.model = $event),
                placeholder: "deepseek-chat"
              }, null, 512), [
                [vModelText, llm.value.model]
              ])
            ]),
            createBaseVNode("div", _hoisted_21$9, [
              _cache[14] || (_cache[14] = createBaseVNode("label", null, "API Key（留空表示不改）", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => llm.value.apiKey = $event),
                type: "password",
                placeholder: "sk-…"
              }, null, 512), [
                [vModelText, llm.value.apiKey]
              ])
            ]),
            createBaseVNode("div", _hoisted_22$9, [
              createBaseVNode("button", {
                class: "btn sm ghost",
                onClick: _cache[3] || (_cache[3] = ($event) => saveLlm(true))
              }, "保存并启用"),
              createBaseVNode("button", {
                class: "btn sm ghost",
                onClick: _cache[4] || (_cache[4] = ($event) => saveLlm(false))
              }, "停用"),
              createBaseVNode("button", {
                class: "btn sm ghost",
                onClick: testLlm
              }, "测试连通")
            ]),
            llm.value.msg ? (openBlock(), createElementBlock("div", _hoisted_23$9, toDisplayString(llm.value.msg), 1)) : createCommentVNode("", true)
          ])
        ]),
        order.value ? (openBlock(), createBlock(_sfc_main$f, {
          key: 0,
          order: order.value,
          onPaid,
          onCancel: _cache[5] || (_cache[5] = ($event) => order.value = null)
        }, null, 8, ["order"])) : createCommentVNode("", true)
      ], 64);
    };
  }
};
const _hoisted_1$d = {
  key: 0,
  class: "card"
};
const _hoisted_2$d = { class: "empty" };
const _hoisted_3$d = ["data-mode"];
const _hoisted_4$d = { class: "chat-side" };
const _hoisted_5$d = ["onClick"];
const _hoisted_6$d = { class: "fr-av" };
const _hoisted_7$d = { class: "chat-conv-main" };
const _hoisted_8$c = { class: "chat-conv-top" };
const _hoisted_9$b = { class: "chat-conv-name" };
const _hoisted_10$b = { class: "chat-conv-time" };
const _hoisted_11$a = { class: "chat-conv-sub" };
const _hoisted_12$9 = { key: 1 };
const _hoisted_13$9 = {
  key: 0,
  class: "nav-badge",
  style: { "margin-left": "6px" }
};
const _hoisted_14$9 = {
  key: 1,
  class: "empty",
  style: { "padding": "24px 12px" }
};
const _hoisted_15$9 = {
  key: 0,
  class: "chat-main"
};
const _hoisted_16$9 = { class: "chat-head" };
const _hoisted_17$9 = { class: "fr-id" };
const _hoisted_18$9 = {
  key: 0,
  class: "chat-warn"
};
const _hoisted_19$8 = {
  key: 0,
  class: "chat-more"
};
const _hoisted_20$8 = { class: "chat-invite" };
const _hoisted_21$8 = { class: "chat-invite-h" };
const _hoisted_22$8 = { class: "chat-invite-code mono" };
const _hoisted_23$8 = {
  key: 0,
  class: "chat-invite-topic"
};
const _hoisted_24$7 = ["onClick"];
const _hoisted_25$7 = {
  key: 2,
  class: "chat-time"
};
const _hoisted_26$7 = { class: "chat-time" };
const _hoisted_27$7 = ["data-mid"];
const _hoisted_28$7 = { class: "chat-bubble" };
const _hoisted_29$7 = { class: "chat-time" };
const _hoisted_30$7 = { class: "chat-bubble" };
const _hoisted_31$7 = { class: "chat-time" };
const _hoisted_32$7 = {
  key: 1,
  class: "empty",
  style: { "padding": "30px" }
};
const _hoisted_33$7 = { class: "chat-input" };
const _hoisted_34$7 = {
  key: 1,
  class: "chat-main chat-blank"
};
const _sfc_main$d = {
  __name: "ChatView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const chat = useChatStore();
    const auth = useAuthStore();
    const draft = /* @__PURE__ */ ref("");
    const msgsEl = /* @__PURE__ */ ref(null);
    const open = computed(() => !!(chat.convId || chat.pendingPeer));
    const peer = computed(() => chat.peer || {});
    const peerBroken = computed(
      () => !peer.value.id || String(peer.value.id) === String(auth.user && auth.user.id || "")
    );
    onMounted(async () => {
      chat.onChatPage = true;
      await chat.enter();
      if (route.query.to) {
        chat.openWith(String(route.query.to), String(route.query.name || route.query.to));
      }
      await nextTick();
      scrollToBottom();
    });
    onBeforeUnmount(() => {
      chat.onChatPage = false;
    });
    watch(
      () => [chat.items.length, chat.pending.length, chat.convId],
      async () => {
        await nextTick();
        if (chat.stick === false) return;
        scrollToBottom();
      }
    );
    function scrollToBottom() {
      const box = msgsEl.value;
      if (!box) return;
      box.scrollTop = box.scrollHeight;
      chat.scrollTop = box.scrollTop;
      chat.ignoreScrollUntil = Date.now() + 150;
    }
    function onScroll(e) {
      const box = e.target;
      chat.scrollTop = box.scrollTop;
      chat.stick = box.scrollHeight - box.clientHeight - box.scrollTop < 48;
      if (Date.now() < (chat.ignoreScrollUntil || 0)) return;
      if (box.scrollTop < 40 && chat.hasMore) chat.loadMore();
    }
    async function openConv(convId) {
      await chat.open(convId);
      await nextTick();
      scrollToBottom();
    }
    async function openItem(it) {
      if (it.synthetic) {
        chat.openWith(it.peer.id, it.peer.name);
        await nextTick();
        return;
      }
      await openConv(it.convId);
    }
    function back() {
      chat.convId = null;
      chat.pendingPeer = null;
      chat.items = [];
    }
    async function send() {
      const body = draft.value;
      if (!String(body || "").trim()) return;
      draft.value = "";
      const ok = await chat.send(body);
      if (!ok) draft.value = body;
      await nextTick();
      scrollToBottom();
    }
    function onKey(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }
    async function retry() {
      if (!chat.convId) {
        await chat.load();
        return;
      }
      await chat.open(chat.convId);
    }
    function shortTime(ms) {
      if (!ms) return "";
      const d = new Date(Number(ms));
      const now = /* @__PURE__ */ new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      if (d.toDateString() === now.toDateString()) return p2(d.getHours()) + ":" + p2(d.getMinutes());
      if (d.getFullYear() === now.getFullYear()) return d.getMonth() + 1 + "-" + d.getDate();
      return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    }
    function invitePayload(m) {
      const raw = m && m.payload;
      if (!raw) return {};
      if (typeof raw === "object") return raw;
      try {
        return JSON.parse(String(raw)) || {};
      } catch (e) {
        return {};
      }
    }
    function joinInvite(code) {
      if (!code) return;
      router2.push({ name: "room", query: { join: code } });
    }
    function goFriends() {
      router2.push({ name: "friends" });
    }
    return (_ctx, _cache) => {
      return unref(chat).error && !unref(chat).convId ? (openBlock(), createElementBlock("div", _hoisted_1$d, [
        createBaseVNode("div", _hoisted_2$d, toDisplayString(unref(chat).error), 1)
      ])) : (openBlock(), createElementBlock("div", {
        key: 1,
        class: normalizeClass(["soc-chat", { "has-open": open.value }]),
        "data-mode": unref(chat).mode
      }, [
        createBaseVNode("div", _hoisted_4$d, [
          createBaseVNode("div", { class: "chat-side-h" }, [
            _cache[2] || (_cache[2] = createBaseVNode("b", null, "消息", -1)),
            createBaseVNode("button", {
              class: "btn ghost sm",
              onClick: goFriends
            }, "+ 好友")
          ]),
          unref(chat).listItems.length ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(unref(chat).listItems, (it) => {
            return openBlock(), createElementBlock("div", {
              key: it.synthetic ? "f-" + it.peer.id : it.convId,
              class: normalizeClass(["chat-conv", { on: Number(unref(chat).convId) === Number(it.convId), "chat-conv-new": it.synthetic }]),
              onClick: ($event) => openItem(it)
            }, [
              createBaseVNode("div", _hoisted_6$d, toDisplayString(String((it.peer || {}).name || "?").slice(0, 1)), 1),
              createBaseVNode("div", _hoisted_7$d, [
                createBaseVNode("div", _hoisted_8$c, [
                  createBaseVNode("span", _hoisted_9$b, toDisplayString((it.peer || {}).name), 1),
                  createBaseVNode("span", _hoisted_10$b, toDisplayString(shortTime(it.lastMsgAt)), 1)
                ]),
                createBaseVNode("div", _hoisted_11$a, [
                  it.last ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createTextVNode(toDisplayString(it.last.fromMe ? "我：" : "") + toDisplayString(it.last.preview), 1)
                  ], 64)) : (openBlock(), createElementBlock("i", _hoisted_12$9, "还没有消息，点这里开始"))
                ])
              ]),
              Number(it.unread) > 0 ? (openBlock(), createElementBlock("span", _hoisted_13$9, toDisplayString(Number(it.unread) > 99 ? "99+" : it.unread), 1)) : createCommentVNode("", true)
            ], 10, _hoisted_5$d);
          }), 128)) : (openBlock(), createElementBlock("div", _hoisted_14$9, [..._cache[3] || (_cache[3] = [
            createTextVNode(" 还没有会话", -1),
            createBaseVNode("br", null, null, -1),
            createBaseVNode("span", { class: "sub" }, "先加好友，然后在「好友」里点发消息", -1)
          ])]))
        ]),
        open.value ? (openBlock(), createElementBlock("div", _hoisted_15$9, [
          createBaseVNode("div", _hoisted_16$9, [
            createBaseVNode("button", {
              class: "btn ghost sm chat-back",
              onClick: back
            }, "‹"),
            createBaseVNode("b", null, toDisplayString(peer.value.name || peer.value.id || "会话"), 1),
            createBaseVNode("span", _hoisted_17$9, "@" + toDisplayString(peer.value.id || ""), 1)
          ]),
          peerBroken.value ? (openBlock(), createElementBlock("div", _hoisted_18$9, [
            _cache[4] || (_cache[4] = createTextVNode(" 对方信息异常（可能刚切换过账号）， ", -1)),
            createBaseVNode("a", {
              style: { "color": "#2f5bea", "cursor": "pointer" },
              onClick: retry
            }, "点此重新加载会话")
          ])) : createCommentVNode("", true),
          createBaseVNode("div", {
            ref_key: "msgsEl",
            ref: msgsEl,
            class: "chat-msgs",
            onScroll
          }, [
            unref(chat).hasMore ? (openBlock(), createElementBlock("div", _hoisted_19$8, [
              createBaseVNode("button", {
                class: "btn ghost sm",
                onClick: _cache[0] || (_cache[0] = ($event) => unref(chat).loadMore())
              }, "加载更早的消息")
            ])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(chat).items, (m) => {
              return openBlock(), createElementBlock(Fragment, {
                key: m.id
              }, [
                String(m.type) === "INVITE" ? (openBlock(), createElementBlock("div", {
                  key: 0,
                  class: normalizeClass(["chat-row", { mine: unref(chat).isMine(m) }])
                }, [
                  createBaseVNode("div", _hoisted_20$8, [
                    createBaseVNode("div", _hoisted_21$8, toDisplayString(unref(chat).isMine(m) ? "你发出了组队邀请" : "邀请你加入辩论房间"), 1),
                    createBaseVNode("div", _hoisted_22$8, toDisplayString(invitePayload(m).roomCode), 1),
                    invitePayload(m).topicTitle ? (openBlock(), createElementBlock("div", _hoisted_23$8, toDisplayString(invitePayload(m).topicTitle), 1)) : createCommentVNode("", true),
                    invitePayload(m).roomCode ? (openBlock(), createElementBlock("button", {
                      key: 1,
                      class: "btn primary sm",
                      onClick: ($event) => joinInvite(invitePayload(m).roomCode)
                    }, " 加入房间 ", 8, _hoisted_24$7)) : (openBlock(), createElementBlock("div", _hoisted_25$7, "这张邀请已失效"))
                  ]),
                  createBaseVNode("div", _hoisted_26$7, toDisplayString(shortTime(m.createdAt)), 1)
                ], 2)) : (openBlock(), createElementBlock("div", {
                  key: 1,
                  class: normalizeClass(["chat-row", { mine: unref(chat).isMine(m) }]),
                  "data-mid": m.id
                }, [
                  createBaseVNode("div", _hoisted_28$7, toDisplayString(m.body), 1),
                  createBaseVNode("div", _hoisted_29$7, toDisplayString(shortTime(m.createdAt)), 1)
                ], 10, _hoisted_27$7))
              ], 64);
            }), 128)),
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(chat).pending, (p2) => {
              return openBlock(), createElementBlock("div", {
                key: p2.clientMsgId,
                class: normalizeClass(["chat-row mine pending", { failed: p2.state === "failed" }])
              }, [
                createBaseVNode("div", _hoisted_30$7, toDisplayString(p2.body), 1),
                createBaseVNode("div", _hoisted_31$7, toDisplayString(p2.state === "failed" ? "发送失败，请重试" : "发送中…"), 1)
              ], 2);
            }), 128)),
            !unref(chat).items.length && !unref(chat).pending.length ? (openBlock(), createElementBlock("div", _hoisted_32$7, " 还没有消息，说点什么吧 ")) : createCommentVNode("", true)
          ], 544),
          createBaseVNode("div", _hoisted_33$7, [
            withDirectives(createBaseVNode("textarea", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => draft.value = $event),
              maxlength: "2000",
              placeholder: "输入消息，Enter 发送，Shift+Enter 换行",
              onKeydown: onKey
            }, null, 544), [
              [vModelText, draft.value]
            ]),
            createBaseVNode("button", {
              class: "btn primary",
              onClick: send
            }, "发送")
          ])
        ])) : (openBlock(), createElementBlock("div", _hoisted_34$7, [..._cache[5] || (_cache[5] = [
          createBaseVNode("div", { class: "empty" }, [
            createTextVNode(" 选一个会话开始聊天"),
            createBaseVNode("br"),
            createBaseVNode("span", { class: "sub" }, "只有好友之间才能发消息")
          ], -1)
        ])]))
      ], 10, _hoisted_3$d));
    };
  }
};
const useMetaStore = /* @__PURE__ */ defineStore("meta", {
  state: () => ({
    topics: [],
    topicsAt: 0,
    hot: null,
    hotAt: 0,
    /** AI 档位：{ basic, pro, byok } 各含 key/label/available/model/note */
    aiTiers: null,
    aiTiersAt: 0
  }),
  getters: {
    /** 可选的档位（基础版没启用时后端 available=false，这里直接过滤掉，不给用户看见） */
    availableTiers(state2) {
      const d = state2.aiTiers || {};
      return ["basic", "pro", "byok"].map((k) => d[k]).filter((x) => x && x.available !== false);
    }
  },
  actions: {
    async ensureTopics(force) {
      const fresh = Date.now() - this.topicsAt < 5 * 60 * 1e3;
      if (!force && fresh && this.topics.length) return this.topics;
      try {
        this.topics = await debateApi.topics() || [];
        this.topicsAt = Date.now();
      } catch (e) {
      }
      return this.topics;
    },
    async ensureHot(force) {
      const fresh = Date.now() - this.hotAt < 60 * 1e3;
      if (!force && fresh && this.hot) return this.hot;
      try {
        this.hot = await baseApi.hot(12);
        this.hotAt = Date.now();
      } catch (e) {
      }
      return this.hot;
    },
    /**
     * AI 档位（基础版 / 高级版 / 自带 Key）。
     *
     * 缓存 5 分钟：开局面板每次打开都拉一次没必要，而且档位是「部署环境有什么」的静态信息。
     * 拉不到时返回 null，调用方退化到「只显示高级版」。
     */
    async ensureAiTiers(force) {
      const fresh = Date.now() - this.aiTiersAt < 5 * 60 * 1e3;
      if (!force && fresh && this.aiTiers) return this.aiTiers;
      try {
        this.aiTiers = await debateApi.aiTiers();
        this.aiTiersAt = Date.now();
      } catch (e) {
      }
      return this.aiTiers;
    },
    resetAiTiers() {
      this.aiTiers = null;
      this.aiTiersAt = 0;
    }
  }
});
const _hoisted_1$c = {
  key: 0,
  class: "card",
  style: { "margin-bottom": "14px", "border-color": "#d6e0ff", "background": "#fbfcfe", "display": "flex", "align-items": "center", "gap": "14px", "flex-wrap": "wrap" }
};
const _hoisted_2$c = { style: { "flex": "1", "min-width": "220px" } };
const _hoisted_3$c = { style: { "font-size": "11.5px", "color": "#8a909c", "margin-top": "3px" } };
const _hoisted_4$c = {
  key: 1,
  class: "card"
};
const _hoisted_5$c = { class: "empty" };
const _hoisted_6$c = {
  class: "grid g2",
  style: { "margin-bottom": "16px" }
};
const _hoisted_7$c = {
  class: "card",
  style: { "display": "flex", "gap": "16px", "align-items": "flex-end", "flex-wrap": "wrap" }
};
const _hoisted_8$b = { style: { "flex": "1", "min-width": "240px" } };
const _hoisted_9$a = { class: "card" };
const _hoisted_10$a = { style: { "font-size": "12.5px", "color": "#4a5568", "margin-top": "6px", "line-height": "1.8" } };
const _hoisted_11$9 = { style: { "color": "#2f5bea" } };
const _hoisted_12$8 = { style: { "color": "#2f5bea" } };
const _hoisted_13$8 = {
  class: "row",
  style: { "margin-top": "8px" }
};
const _hoisted_14$8 = { class: "grid g2" };
const _hoisted_15$8 = {
  class: "grid gauto",
  style: { "margin-top": "10px" }
};
const _hoisted_16$8 = ["onClick"];
const _hoisted_17$8 = { class: "row" };
const _hoisted_18$8 = { class: "tag" };
const _hoisted_19$7 = { class: "tag" };
const _hoisted_20$7 = { class: "meta" };
const _hoisted_21$7 = {
  key: 0,
  class: "empty"
};
const _hoisted_22$7 = { class: "card" };
const _hoisted_23$7 = {
  class: "row",
  style: { "justify-content": "space-between", "margin-bottom": "10px" }
};
const _hoisted_24$6 = { class: "hot" };
const _hoisted_25$6 = ["onClick"];
const _hoisted_26$6 = { class: "rk" };
const _hoisted_27$6 = { style: { "flex": "1", "min-width": "0" } };
const _hoisted_28$6 = { class: "tt" };
const _hoisted_29$6 = { class: "heatbar" };
const _hoisted_30$6 = { class: "sc" };
const _hoisted_31$6 = { style: { "font-size": "11px", "color": "#a8adb8", "margin-top": "10px" } };
const _hoisted_32$6 = { class: "mono" };
const _hoisted_33$6 = { class: "panel" };
const _hoisted_34$6 = { class: "seats" };
const _hoisted_35$6 = { class: "seat-grid" };
const _hoisted_36$6 = ["onClick"];
const _hoisted_37$6 = { class: "k" };
const _hoisted_38$5 = { class: "r" };
const _hoisted_39$5 = { class: "seat-grid" };
const _hoisted_40$5 = ["onClick"];
const _hoisted_41$4 = { class: "k" };
const _hoisted_42$4 = { class: "r" };
const _hoisted_43$4 = { class: "presets" };
const _hoisted_44$4 = {
  class: "row",
  style: { "margin-top": "14px", "gap": "8px" }
};
const _hoisted_45$4 = ["title", "onClick"];
const _hoisted_46$3 = { style: { "font-size": "11.5px", "color": "#8a909c" } };
const _hoisted_47$3 = {
  class: "row",
  style: { "margin-top": "10px", "gap": "8px" }
};
const _hoisted_48$3 = ["title", "onClick"];
const _hoisted_49$3 = { style: { "margin-top": "10px", "padding-top": "10px", "border-top": "1px solid #f3f1eb" } };
const _hoisted_50$3 = {
  class: "row",
  style: { "gap": "8px", "align-items": "center", "flex-wrap": "wrap" }
};
const _hoisted_51$3 = ["title", "onClick"];
const _hoisted_52$3 = { style: { "font-size": "11.5px", "color": "#a8adb8", "margin-top": "6px", "line-height": "1.6" } };
const _hoisted_53$3 = { class: "sum" };
const _hoisted_54$2 = {
  class: "row",
  style: { "justify-content": "flex-end", "margin-top": "16px" }
};
const _hoisted_55$2 = {
  class: "panel",
  style: { "width": "min(560px, 100%)" }
};
const _hoisted_56$2 = {
  class: "row",
  style: { "gap": "10px", "margin-bottom": "6px" }
};
const _hoisted_57$2 = { style: { "font-size": "22px" } };
const _hoisted_58$2 = {
  key: 0,
  class: "tag"
};
const _hoisted_59$2 = { class: "desc" };
const _hoisted_60$2 = {
  key: 0,
  class: "sum"
};
const _hoisted_61$2 = { class: "sum" };
const _hoisted_62$2 = {
  key: 0,
  style: { "margin-top": "12px", "font-size": "12.5px", "color": "#6b7280" }
};
const _hoisted_63$2 = { style: { "flex": "1", "font-size": "13px" } };
const _hoisted_64$1 = ["onClick"];
const _hoisted_65$1 = {
  class: "row",
  style: { "justify-content": "flex-end", "margin-top": "16px" }
};
const _sfc_main$c = {
  __name: "SoloView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const debate = useDebateStore();
    const auth = useAuthStore();
    const meta = useMetaStore();
    const topics = /* @__PURE__ */ ref([]);
    const hot = /* @__PURE__ */ ref(null);
    const err = /* @__PURE__ */ ref("");
    const customTopic = /* @__PURE__ */ ref("");
    const audit = /* @__PURE__ */ ref(null);
    const seatOpen = /* @__PURE__ */ ref(false);
    const hotList = computed(() => (hot.value && hot.value.list || []).slice(0, 5));
    const hotKey = computed(() => hot.value && hot.value.key || "");
    const paceHintText = computed(
      () => debate.pace === "tight" ? "较短" : debate.pace === "loose" ? "较长" : "标准"
    );
    const paceName = computed(() => debate.pace === "tight" ? "紧凑" : debate.pace === "loose" ? "宽松" : "标准");
    onMounted(async () => {
      try {
        const [t, h2] = await Promise.all([debateApi.topics(), baseApi.hot(12)]);
        topics.value = t || [];
        hot.value = h2;
      } catch (e) {
        err.value = e && e.message || "加载失败";
      }
      if (route.query.topic) openSeat(String(route.query.topic));
    });
    function diffClass(d) {
      return d === "竞赛" ? "o" : d === "进阶" ? "b" : "g";
    }
    function openSeat(topicId) {
      debate.pendingTopicId = topicId == null ? null : String(topicId);
      seatOpen.value = true;
      meta.ensureAiTiers();
    }
    const tierList = computed(() => {
      const all = meta.aiTiers ? ["basic", "pro", "byok"].map((k) => meta.aiTiers[k]).filter((x) => x && x.available !== false) : [];
      return all.length ? all : [{ key: "PRO", label: "高级版", note: "平台模型，按 token 计费 + 服务费" }];
    });
    const curTier = computed(() => tierList.value.find((x) => x.key === debate.tier) || tierList.value[0]);
    const tierName = computed(() => curTier.value && curTier.value.label || "高级版");
    function pickTier(t) {
      debate.setTier(t.key);
      toast(
        t.key === "BASIC" ? "已切到基础版（本地免费模型）" : t.key === "BYOK" ? "已切到自带 Key（钱包里可填本地模型地址，完全免费）" : "已切到高级版（平台模型）"
      );
    }
    const running = computed(() => {
      const m = debate.match;
      return debate.matchId && m && m.status === "RUNNING" ? m : null;
    });
    function resumeMatch() {
      router2.push({ name: "match" });
    }
    function abandonMatch() {
      debate.reset();
      toast("已放弃这一场");
    }
    async function startFromPanel() {
      seatOpen.value = false;
      if (!auth.user) {
        toast("登录后才能开始辩论");
        router2.push({ name: "login", query: { next: "/solo" } });
        return;
      }
      const id = debate.pendingTopicId;
      const matchId = await debate.createMatch(id ? { topicId: id } : {});
      if (matchId) router2.push({ name: "match" });
    }
    async function useCustomTopic(titleOverride) {
      const title = String(titleOverride != null ? titleOverride : customTopic.value).trim();
      if (!title) return toast("先写一个辩题");
      if (!auth.user) {
        toast("登录后才能提交自定义辩题");
        router2.push({ name: "login", query: { next: "/solo" } });
        return;
      }
      audit.value = { loading: true, title };
      try {
        const r = await debateApi.auditTopic(title);
        audit.value = { loading: false, title, ...r || {} };
        if (r && r.result === "PASS") {
          audit.value = null;
          toast("审核通过，开始选位置");
          debate.pendingTitle = title;
          openSeat(null);
        }
      } catch (e) {
        audit.value = { loading: false, title, result: "ERROR", reason: errText2(e) };
      }
    }
    function adopt(s) {
      customTopic.value = s;
      useCustomTopic(s);
    }
    function errText2(e) {
      if (e instanceof ApiError) return e.code || e.message;
      return e && e.message || "审核失败";
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        _cache[40] || (_cache[40] = createBaseVNode("h1", { class: "pg" }, "单人辩论", -1)),
        _cache[41] || (_cache[41] = createBaseVNode("p", { class: "sub" }, "选一道题（或自己填）→ 选位置 → 直接开打。不建房、不等人，缺的席位由 AI 补齐。", -1)),
        running.value ? (openBlock(), createElementBlock("div", _hoisted_1$c, [
          createBaseVNode("div", _hoisted_2$c, [
            _cache[16] || (_cache[16] = createBaseVNode("b", { style: { "font-size": "13px" } }, "有一场还没打完", -1)),
            createBaseVNode("div", _hoisted_3$c, toDisplayString(running.value.topic_title || "（未命名辩题）") + " · 你占 " + toDisplayString(running.value.my_seats || ""), 1)
          ]),
          createBaseVNode("div", {
            class: "row",
            style: { "gap": "8px" }
          }, [
            createBaseVNode("button", {
              class: "btn primary sm",
              onClick: resumeMatch
            }, "继续这一场"),
            createBaseVNode("button", {
              class: "btn ghost sm",
              onClick: abandonMatch
            }, "放弃")
          ])
        ])) : createCommentVNode("", true),
        err.value ? (openBlock(), createElementBlock("div", _hoisted_4$c, [
          createBaseVNode("div", _hoisted_5$c, toDisplayString(err.value), 1)
        ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          createBaseVNode("div", _hoisted_6$c, [
            createBaseVNode("div", _hoisted_7$c, [
              createBaseVNode("div", _hoisted_8$b, [
                _cache[17] || (_cache[17] = createBaseVNode("b", { style: { "font-size": "13px" } }, [
                  createTextVNode("自己出一个辩题 "),
                  createBaseVNode("span", { class: "tag b" }, "AI 审核")
                ], -1)),
                _cache[18] || (_cache[18] = createBaseVNode("div", { style: { "font-size": "11.5px", "color": "#8a909c", "margin": "4px 0 8px" } }, " 写一句你关心的问题，会先过可辩性审核 ", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => customTopic.value = $event),
                  class: "btn ghost",
                  style: { "width": "100%", "text-align": "left", "padding": "8px 12px" },
                  placeholder: "例如：该不该把 AI 生成内容算作学术不端",
                  onKeydown: _cache[1] || (_cache[1] = withKeys(($event) => useCustomTopic(), ["enter"]))
                }, null, 544), [
                  [vModelText, customTopic.value]
                ])
              ]),
              createBaseVNode("button", {
                class: "btn primary",
                onClick: _cache[2] || (_cache[2] = ($event) => useCustomTopic())
              }, "用这个题开练")
            ]),
            createBaseVNode("div", _hoisted_9$a, [
              _cache[22] || (_cache[22] = createBaseVNode("b", { style: { "font-size": "13px" } }, "当前席位", -1)),
              createBaseVNode("div", _hoisted_10$a, [
                createBaseVNode("b", _hoisted_11$9, toDisplayString(unref(debate).mySeats.join("、")), 1),
                _cache[19] || (_cache[19] = createTextVNode(" · 本场发言 ", -1)),
                createBaseVNode("b", _hoisted_12$8, toDisplayString(unref(debate).myTurnCount), 1),
                _cache[20] || (_cache[20] = createTextVNode(" 次 ", -1))
              ]),
              createBaseVNode("div", _hoisted_13$8, [
                createBaseVNode("button", {
                  class: "btn sm ghost",
                  onClick: _cache[3] || (_cache[3] = ($event) => openSeat(null))
                }, "改席位"),
                withDirectives(createBaseVNode("select", {
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => unref(debate).mode = $event),
                  class: "btn sm ghost",
                  onChange: _cache[5] || (_cache[5] = ($event) => unref(debate).setMode(unref(debate).mode))
                }, [..._cache[21] || (_cache[21] = [
                  createBaseVNode("option", { value: "FULL" }, "全流程 12 步", -1),
                  createBaseVNode("option", { value: "SPRINT" }, "快速 8 步", -1)
                ])], 544), [
                  [vModelSelect, unref(debate).mode]
                ])
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_14$8, [
            createBaseVNode("div", null, [
              _cache[24] || (_cache[24] = createBaseVNode("b", { style: { "font-size": "13px" } }, "题库", -1)),
              createBaseVNode("div", _hoisted_15$8, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(topics.value, (t) => {
                  return openBlock(), createElementBlock("div", {
                    key: t.id,
                    class: "topic",
                    onClick: ($event) => openSeat(t.id)
                  }, [
                    createBaseVNode("h3", null, toDisplayString(t.title), 1),
                    createBaseVNode("div", _hoisted_17$8, [
                      createBaseVNode("span", _hoisted_18$8, toDisplayString(t.cat), 1),
                      createBaseVNode("span", {
                        class: normalizeClass(["tag", diffClass(t.diff)])
                      }, toDisplayString(t.diff), 3),
                      createBaseVNode("span", _hoisted_19$7, "🔥 " + toDisplayString(t.hot), 1)
                    ]),
                    createBaseVNode("div", _hoisted_20$7, [
                      createBaseVNode("span", null, "已辩 " + toDisplayString(t.plays) + " 场" + toDisplayString(t.source === "custom" ? " · 自定义" : ""), 1),
                      _cache[23] || (_cache[23] = createBaseVNode("span", { class: "go" }, "开练 →", -1))
                    ])
                  ], 8, _hoisted_16$8);
                }), 128)),
                !topics.value.length ? (openBlock(), createElementBlock("div", _hoisted_21$7, "题库加载中…")) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("div", null, [
              createBaseVNode("div", _hoisted_22$7, [
                createBaseVNode("div", _hoisted_23$7, [
                  _cache[25] || (_cache[25] = createBaseVNode("b", { style: { "font-size": "13px" } }, "🔥 热辩榜", -1)),
                  createBaseVNode("a", {
                    style: { "font-size": "12px", "color": "#2f5bea", "cursor": "pointer" },
                    onClick: _cache[6] || (_cache[6] = ($event) => unref(router2).push({ name: "hot" }))
                  }, " 完整榜单 → ")
                ]),
                createBaseVNode("div", _hoisted_24$6, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(hotList.value, (x, i) => {
                    return openBlock(), createElementBlock("div", {
                      key: x.topicId,
                      class: normalizeClass(["hitem", { top1: i === 0 }]),
                      onClick: ($event) => openSeat(x.topicId)
                    }, [
                      createBaseVNode("div", _hoisted_26$6, toDisplayString(x.rank), 1),
                      createBaseVNode("div", _hoisted_27$6, [
                        createBaseVNode("div", _hoisted_28$6, toDisplayString(x.title), 1),
                        createBaseVNode("div", _hoisted_29$6, [
                          createBaseVNode("i", {
                            style: normalizeStyle({ width: Math.min(100, x.score / 2) + "%" })
                          }, null, 4)
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_30$6, toDisplayString(x.score), 1)
                    ], 10, _hoisted_25$6);
                  }), 128))
                ]),
                createBaseVNode("div", _hoisted_31$6, [
                  _cache[26] || (_cache[26] = createTextVNode(" Redis ", -1)),
                  createBaseVNode("span", _hoisted_32$6, "ZSET · " + toDisplayString(hotKey.value), 1)
                ])
              ])
            ])
          ])
        ], 64)),
        seatOpen.value ? (openBlock(), createElementBlock("div", {
          key: 3,
          class: "mask",
          onClick: _cache[13] || (_cache[13] = withModifiers(($event) => seatOpen.value = false, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_33$6, [
            _cache[37] || (_cache[37] = createBaseVNode("h2", null, "你要坐哪几个位置？", -1)),
            _cache[38] || (_cache[38] = createBaseVNode("div", { class: "desc" }, "选中的席位由你发言，其余自动由 AI 占满。多个位置 = 一个人分饰多角。", -1)),
            createBaseVNode("div", _hoisted_34$6, [
              createBaseVNode("div", null, [
                _cache[27] || (_cache[27] = createBaseVNode("div", {
                  class: "row",
                  style: { "margin-bottom": "7px" }
                }, [
                  createBaseVNode("span", { class: "tag b" }, "正方")
                ], -1)),
                createBaseVNode("div", _hoisted_35$6, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(SEATS).filter((x) => x.side === "A"), (s) => {
                    return openBlock(), createElementBlock("div", {
                      key: s.k,
                      class: normalizeClass(["seat", { on: unref(debate).mySeats.includes(s.k) }]),
                      onClick: ($event) => unref(debate).toggleSeat(s.k)
                    }, [
                      createBaseVNode("div", _hoisted_37$6, toDisplayString(s.k), 1),
                      createBaseVNode("div", _hoisted_38$5, toDisplayString(s.role), 1)
                    ], 10, _hoisted_36$6);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", null, [
                _cache[28] || (_cache[28] = createBaseVNode("div", {
                  class: "row",
                  style: { "margin-bottom": "7px" }
                }, [
                  createBaseVNode("span", { class: "tag o" }, "反方")
                ], -1)),
                createBaseVNode("div", _hoisted_39$5, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(SEATS).filter((x) => x.side === "B"), (s) => {
                    return openBlock(), createElementBlock("div", {
                      key: s.k,
                      class: normalizeClass(["seat", { on: unref(debate).mySeats.includes(s.k) }]),
                      onClick: ($event) => unref(debate).toggleSeat(s.k)
                    }, [
                      createBaseVNode("div", _hoisted_41$4, toDisplayString(s.k), 1),
                      createBaseVNode("div", _hoisted_42$4, toDisplayString(s.role), 1)
                    ], 10, _hoisted_40$5);
                  }), 128))
                ])
              ])
            ]),
            createBaseVNode("div", _hoisted_43$4, [
              createBaseVNode("button", {
                class: normalizeClass(["preset", { on: unref(debate).mySeats.join() === "A1" }]),
                onClick: _cache[7] || (_cache[7] = ($event) => unref(debate).setSeats(["A1"]))
              }, "只练一辩", 2),
              createBaseVNode("button", {
                class: normalizeClass(["preset", { on: unref(debate).mySeats.join() === "A2" }]),
                onClick: _cache[8] || (_cache[8] = ($event) => unref(debate).setSeats(["A2"]))
              }, "只练二辩", 2),
              createBaseVNode("button", {
                class: normalizeClass(["preset", { on: unref(debate).mySeats.join() === "A1,A2" }]),
                onClick: _cache[9] || (_cache[9] = ($event) => unref(debate).setSeats(["A1", "A2"]))
              }, "一辩 + 二辩", 2),
              createBaseVNode("button", {
                class: normalizeClass(["preset", { on: unref(debate).mySeats.join() === "A1,A2,A3,A4" }]),
                onClick: _cache[10] || (_cache[10] = ($event) => unref(debate).setSeats(["A1", "A2", "A3", "A4"]))
              }, "己方四人", 2),
              createBaseVNode("button", {
                class: normalizeClass(["preset", { on: unref(debate).mySeats.length === 8 }]),
                onClick: _cache[11] || (_cache[11] = ($event) => unref(debate).setSeats(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]))
              }, "正反全占", 2)
            ]),
            createBaseVNode("div", _hoisted_44$4, [
              _cache[29] || (_cache[29] = createBaseVNode("span", { style: { "font-size": "12.5px", "color": "#4a5568" } }, "节奏", -1)),
              (openBlock(), createElementBlock(Fragment, null, renderList([["tight", "紧凑", "赶时间，练单点"], ["normal", "标准", "一次完整论证"], ["loose", "宽松", "慢慢想、写足"]], (p2) => {
                return createBaseVNode("button", {
                  key: p2[0],
                  class: normalizeClass(["preset", { on: unref(debate).pace === p2[0] }]),
                  title: p2[2],
                  onClick: ($event) => unref(debate).setPace(p2[0])
                }, toDisplayString(p2[1]), 11, _hoisted_45$4);
              }), 64)),
              createBaseVNode("span", _hoisted_46$3, "各环节时长不同：立论 " + toDisplayString(paceHintText.value), 1)
            ]),
            createBaseVNode("div", _hoisted_47$3, [
              _cache[30] || (_cache[30] = createBaseVNode("span", { style: { "font-size": "12.5px", "color": "#4a5568" } }, "陪练强度", -1)),
              (openBlock(), createElementBlock(Fragment, null, renderList([["novice", "新手", "给你台阶，不抓漏洞"], ["pro", "进阶", "正常对抗"], ["contest", "竞赛", "专抓你的漏洞，会埋雷"]], (p2) => {
                return createBaseVNode("button", {
                  key: p2[0],
                  class: normalizeClass(["preset", { on: unref(debate).difficulty === p2[0] }]),
                  title: p2[2],
                  onClick: ($event) => unref(debate).setDifficulty(p2[0])
                }, toDisplayString(p2[1]), 11, _hoisted_48$3);
              }), 64)),
              _cache[31] || (_cache[31] = createBaseVNode("span", { style: { "font-size": "11.5px", "color": "#8a909c" } }, "竞赛难度会故意犯逻辑错误，等你抓", -1))
            ]),
            createBaseVNode("div", _hoisted_49$3, [
              createBaseVNode("div", _hoisted_50$3, [
                _cache[32] || (_cache[32] = createBaseVNode("span", { style: { "font-size": "12.5px", "color": "#4a5568" } }, "AI 档位", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(tierList.value, (t) => {
                  return openBlock(), createElementBlock("button", {
                    key: t.key,
                    class: normalizeClass(["preset", { on: unref(debate).tier === t.key }]),
                    title: t.note || "",
                    onClick: ($event) => pickTier(t)
                  }, toDisplayString(t.label), 11, _hoisted_51$3);
                }), 128))
              ]),
              createBaseVNode("div", _hoisted_52$3, toDisplayString(curTier.value && curTier.value.note || ""), 1)
            ]),
            createBaseVNode("div", _hoisted_53$3, [
              _cache[33] || (_cache[33] = createTextVNode(" 已选：", -1)),
              createBaseVNode("b", null, toDisplayString([...unref(debate).mySeats].sort().join(" ")), 1),
              _cache[34] || (_cache[34] = createTextVNode(" · 本场你将发言 ", -1)),
              createBaseVNode("b", null, toDisplayString(unref(debate).myTurnCount), 1),
              _cache[35] || (_cache[35] = createTextVNode(" 次 · 节奏 ", -1)),
              createBaseVNode("b", null, toDisplayString(paceName.value), 1),
              _cache[36] || (_cache[36] = createTextVNode(" · 档位 ", -1)),
              createBaseVNode("b", null, toDisplayString(tierName.value), 1)
            ]),
            createBaseVNode("div", _hoisted_54$2, [
              createBaseVNode("button", {
                class: "btn ghost",
                onClick: _cache[12] || (_cache[12] = ($event) => seatOpen.value = false)
              }, "取消"),
              createBaseVNode("button", {
                class: "btn primary",
                onClick: startFromPanel
              }, "进入对局")
            ])
          ])
        ])) : createCommentVNode("", true),
        audit.value ? (openBlock(), createElementBlock("div", {
          key: 4,
          class: "mask",
          onClick: _cache[15] || (_cache[15] = withModifiers(($event) => audit.value = null, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_55$2, [
            createBaseVNode("div", _hoisted_56$2, [
              createBaseVNode("span", _hoisted_57$2, toDisplayString(audit.value.loading ? "⏳" : audit.value.result === "REJECT" ? "⛔" : "✏️"), 1),
              createBaseVNode("h2", {
                style: normalizeStyle({ margin: 0, color: audit.value.loading ? "#8A909C" : audit.value.result === "REJECT" ? "#C0392B" : "#C2671E" })
              }, toDisplayString(audit.value.loading ? "AI 审核中…" : "需要修改"), 5),
              audit.value.cached ? (openBlock(), createElementBlock("span", _hoisted_58$2, "命中缓存")) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_59$2, "「" + toDisplayString(audit.value.title) + "」", 1),
            audit.value.loading ? (openBlock(), createElementBlock("div", _hoisted_60$2, "正在判断：是否可辩 · 正反是否平衡 · 是否合规")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createBaseVNode("div", _hoisted_61$2, [
                _cache[39] || (_cache[39] = createBaseVNode("b", null, "结论：", -1)),
                createTextVNode(toDisplayString(audit.value.reason), 1)
              ]),
              (audit.value.suggestions || []).length ? (openBlock(), createElementBlock("div", _hoisted_62$2, " 试试这些改写： ")) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList(audit.value.suggestions || [], (s, i) => {
                return openBlock(), createElementBlock("div", {
                  key: i,
                  class: "row",
                  style: { "margin-top": "6px" }
                }, [
                  createBaseVNode("span", _hoisted_63$2, toDisplayString(s), 1),
                  createBaseVNode("button", {
                    class: "btn sm ghost",
                    onClick: ($event) => adopt(s)
                  }, "用这个", 8, _hoisted_64$1)
                ]);
              }), 128))
            ], 64)),
            createBaseVNode("div", _hoisted_65$1, [
              createBaseVNode("button", {
                class: "btn ghost",
                onClick: _cache[14] || (_cache[14] = ($event) => audit.value = null)
              }, "关闭")
            ])
          ])
        ])) : createCommentVNode("", true)
      ], 64);
    };
  }
};
const _hoisted_1$b = {
  key: 0,
  class: "card"
};
const _hoisted_2$b = { class: "empty" };
const _hoisted_3$b = {
  class: "row",
  style: { "justify-content": "space-between", "margin-bottom": "10px" }
};
const _hoisted_4$b = { class: "pg" };
const _hoisted_5$b = {
  class: "sub",
  style: { "margin": "0" }
};
const _hoisted_6$b = { class: "row" };
const _hoisted_7$b = { class: "tag mono" };
const _hoisted_8$a = {
  class: "panel",
  style: { "width": "min(720px, 100%)" }
};
const _hoisted_9$9 = {
  class: "row",
  style: { "justify-content": "space-between" }
};
const _hoisted_10$9 = { style: { "margin": "0" } };
const _hoisted_11$8 = { class: "desc" };
const _hoisted_12$7 = { style: { "margin": "6px 0 12px" } };
const _hoisted_13$7 = {
  key: 0,
  class: "empty"
};
const _hoisted_14$7 = { style: { "margin": "6px 0 12px" } };
const _hoisted_15$7 = { style: { "margin": "6px 0 12px" } };
const _hoisted_16$7 = { style: { "margin": "6px 0 12px" } };
const _hoisted_17$7 = { style: { "margin-top": "6px" } };
const _hoisted_18$7 = ["onClick"];
const _hoisted_19$6 = { style: { "font-size": "11.5px", "line-height": "1.6" } };
const _hoisted_20$6 = { style: { "font-size": "10.5px", "color": "#a8adb8", "margin-top": "2px" } };
const _hoisted_21$6 = {
  key: 0,
  class: "empty"
};
const _hoisted_22$6 = { class: "strip" };
const _hoisted_23$6 = { class: "nm" };
const _hoisted_24$5 = { class: "rl" };
const _hoisted_25$5 = { class: "stage" };
const _hoisted_26$5 = { style: { "position": "relative" } };
const _hoisted_27$5 = {
  key: 0,
  class: "sys"
};
const _hoisted_28$5 = { class: "bd" };
const _hoisted_29$5 = { class: "hd" };
const _hoisted_30$5 = {
  key: 0,
  class: "tag r"
};
const _hoisted_31$5 = { class: "bub" };
const _hoisted_32$5 = {
  key: 0,
  class: "pending"
};
const _hoisted_33$5 = {
  key: 0,
  class: "card",
  style: { "margin-top": "12px", "border-color": "#2f5bea", "background": "#f2f5ff", "text-align": "center" }
};
const _hoisted_34$5 = { style: { "font-size": "11.5px", "color": "#6b7280", "margin": "4px 0 10px" } };
const _hoisted_35$5 = {
  key: 1,
  class: "card",
  style: { "margin-top": "12px", "border-color": "#e3c08a", "background": "#fff9f0" }
};
const _hoisted_36$5 = {
  class: "row",
  style: { "gap": "8px", "margin-top": "10px", "flex-wrap": "wrap" }
};
const _hoisted_37$5 = ["onClick"];
const _hoisted_38$4 = { class: "composer" };
const _hoisted_39$4 = { class: "hint" };
const _hoisted_40$4 = {
  class: "row",
  style: { "margin-top": "8px" }
};
const _hoisted_41$3 = { style: { "font-size": "11.5px", "color": "#a8adb8" } };
const _hoisted_42$3 = {
  key: 1,
  class: "waiting"
};
const _hoisted_43$3 = { class: "card" };
const _hoisted_44$3 = {
  class: "row",
  style: { "justify-content": "space-between", "margin-bottom": "8px" }
};
const _hoisted_45$3 = { style: { "font-size": "11.5px", "color": "#8a909c" } };
const _hoisted_46$2 = { class: "steps" };
const _hoisted_47$2 = { class: "no" };
const _hoisted_48$2 = {
  class: "card",
  style: { "margin-top": "12px" }
};
const _hoisted_49$2 = {
  class: "row",
  style: { "justify-content": "space-between" }
};
const _hoisted_50$2 = { class: "tag" };
const _hoisted_51$2 = { style: { "max-height": "230px", "overflow": "auto" } };
const _hoisted_52$2 = ["onClick"];
const _hoisted_53$2 = { style: { "font-size": "11.5px", "line-height": "1.6" } };
const _hoisted_54$1 = { style: { "font-size": "10.5px", "color": "#a8adb8", "margin-top": "3px" } };
const _hoisted_55$1 = {
  key: 0,
  class: "tag g",
  style: { "font-size": "9.5px" }
};
const _hoisted_56$1 = {
  key: 1,
  class: "tag o",
  style: { "font-size": "9.5px" }
};
const _hoisted_57$1 = {
  key: 0,
  class: "empty"
};
const _hoisted_58$1 = {
  class: "card",
  style: { "margin-top": "12px" }
};
const _hoisted_59$1 = { style: { "margin-top": "8px" } };
const _hoisted_60$1 = { class: "kv" };
const _hoisted_61$1 = { class: "kv" };
const _hoisted_62$1 = { class: "kv" };
const _hoisted_63$1 = {
  key: 0,
  class: "kv"
};
const _sfc_main$b = {
  __name: "MatchView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const debate = useDebateStore();
    const auth = useAuthStore();
    const draft = /* @__PURE__ */ ref("");
    const chatEl = /* @__PURE__ */ ref(null);
    const showTip = /* @__PURE__ */ ref(false);
    const m = computed(() => debate.match || {});
    const tierLabel = computed(() => {
      const t = String(m.value.tier || "PRO").toUpperCase();
      return t === "BYOK" ? "自带 Key（免费）" : t === "BASIC" ? "基础版（免费）" : "高级版";
    });
    const payerLabel = computed(() => {
      const payer = m.value.payer_user_id || "";
      const me = auth.user && auth.user.id || "";
      if (!payer || !me) return "";
      return String(payer) === String(me) ? "" : "房主";
    });
    const cdText = computed(() => {
      if (debate.unlimited) return debate.waiting ? "不限时" : "";
      if (!debate.waiting) return "";
      const s = Math.max(0, debate.remaining);
      return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    });
    const cdColor = computed(() => {
      if (debate.unlimited) return "#0E9F6E";
      if (debate.remaining <= 30) return "#C0392B";
      if (debate.remaining <= 60) return "#C2671E";
      return "#6B7280";
    });
    onMounted(async () => {
      if (!debate.matchId && route.query.match) debate.matchId = String(route.query.match);
      if (!debate.matchId) {
        router2.replace({ name: "solo" });
        return;
      }
      if (!debate.match) await debate.load(true);
      debate.startPoll();
      debate.startClock();
      debate.startTyping();
      debate.scrollToBottom = scrollBottom;
      await nextTick();
      bindScrollGuards();
      if (debate.stickBottom === false && debate.chatScrollTop > 0 && chatEl.value) {
        chatEl.value.scrollTop = debate.chatScrollTop;
        showTip.value = true;
      } else {
        scrollBottom();
      }
    });
    onBeforeUnmount(() => {
      if (chatEl.value) debate.chatScrollTop = chatEl.value.scrollTop;
      debate.scrollToBottom = null;
      debate.stopPoll();
      debate.stopClock();
      debate.stopTyping();
    });
    watch(
      () => debate.match && debate.match.status || "",
      (st) => {
        if (st && st !== "RUNNING") router2.replace({ name: "review", query: { match: debate.matchId } });
      }
    );
    watch(
      () => debate.turns.length,
      async () => {
        await nextTick();
        if (debate.stickBottom) scrollBottom();
      }
    );
    function scrollBottom() {
      const el = chatEl.value;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      debate.stickBottom = true;
      showTip.value = false;
    }
    function onScroll() {
      const el = chatEl.value;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      debate.stickBottom = nearBottom;
      showTip.value = !nearBottom;
      if (!nearBottom) debate.lastUserScroll = Date.now();
    }
    function bindScrollGuards() {
      const el = chatEl.value;
      if (!el || el.dataset.guards === "1") return;
      el.dataset.guards = "1";
      const stopFollow = () => {
        debate.stickBottom = false;
        debate.lastUserScroll = Date.now();
        showTip.value = true;
      };
      el.addEventListener("wheel", stopFollow, { passive: true });
      el.addEventListener("touchstart", () => {
        debate.lastUserScroll = Date.now();
      }, { passive: true });
      el.addEventListener("touchmove", stopFollow, { passive: true });
      el.addEventListener("keydown", (e) => {
        if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) stopFollow();
      });
    }
    watch(chatEl, (el) => {
      if (el) bindScrollGuards();
    });
    async function submit() {
      const text = draft.value;
      if (!String(text || "").trim()) return toast("说点什么再发");
      const ok = await debate.submitTurn(text);
      if (ok) draft.value = "";
      await nextTick();
      scrollBottom();
    }
    function onType() {
      debate.keepalive();
    }
    function insertCard(c) {
      if (!debate.waiting) return toast("还没轮到你发言，先把卡片记下来");
      const text = c.claim + "（据" + c.source + "）";
      draft.value = (draft.value.trim() ? draft.value.trim() + " " : "") + text + "。";
      toast(c.verified ? "已插入（可信来源）" : "已插入，注意这条标了「需核实」");
    }
    async function answerFlaw(opt) {
      toast("已记录你的判断：「" + opt + "」");
      debate.flawOffer = null;
    }
    async function exitMatch() {
      debate.stopPoll();
      debate.stopClock();
      router2.push({ name: "solo" });
    }
    return (_ctx, _cache) => {
      return !unref(debate).match ? (openBlock(), createElementBlock("div", _hoisted_1$b, [
        createBaseVNode("div", _hoisted_2$b, toDisplayString(unref(debate).err || "加载中…"), 1)
      ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
        createBaseVNode("div", _hoisted_3$b, [
          createBaseVNode("div", null, [
            createBaseVNode("h1", _hoisted_4$b, toDisplayString(m.value.topic_title), 1),
            createBaseVNode("p", _hoisted_5$b, [
              createTextVNode(toDisplayString(m.value.mode === "SPRINT" ? "快速 8 步" : "标准版 12 步") + " · 你占 " + toDisplayString(m.value.my_seats) + " · ", 1),
              _cache[7] || (_cache[7] = createBaseVNode("span", { class: "dot" }, null, -1)),
              createTextVNode(toDisplayString(m.value.status === "RUNNING" ? "进行中" : m.value.status), 1)
            ])
          ]),
          createBaseVNode("div", _hoisted_6$b, [
            createBaseVNode("span", _hoisted_7$b, "第 " + toDisplayString(unref(debate).stepNo) + " 步", 1),
            createBaseVNode("button", {
              class: "btn sm ghost",
              onClick: exitMatch
            }, "退出")
          ])
        ]),
        m.value.topic_id ? (openBlock(), createElementBlock("button", {
          key: 0,
          class: "btn sm ghost",
          style: { "position": "fixed", "right": "22px", "bottom": "22px", "z-index": "70", "box-shadow": "0 6px 18px rgba(0,0,0,.14)" },
          onClick: _cache[0] || (_cache[0] = ($event) => unref(debate).toggleBrief())
        }, " 📋 材料 ")) : createCommentVNode("", true),
        unref(debate).showBrief ? (openBlock(), createElementBlock("div", {
          key: 1,
          class: "mask",
          onClick: _cache[2] || (_cache[2] = withModifiers(($event) => unref(debate).toggleBrief(), ["self"]))
        }, [
          createBaseVNode("div", _hoisted_8$a, [
            createBaseVNode("div", _hoisted_9$9, [
              createBaseVNode("h2", _hoisted_10$9, "作战卡 · " + toDisplayString(unref(debate).brief && unref(debate).brief.side || ""), 1),
              createBaseVNode("button", {
                class: "btn sm ghost",
                onClick: _cache[1] || (_cache[1] = ($event) => unref(debate).toggleBrief())
              }, "收起")
            ]),
            createBaseVNode("div", _hoisted_11$8, toDisplayString(unref(debate).brief && unref(debate).brief.topic || "正在生成…"), 1),
            unref(debate).brief ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              _cache[8] || (_cache[8] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "① 先把词定清楚", -1)),
              createBaseVNode("div", _hoisted_12$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).brief.definitions || [], (d, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    style: { "font-size": "12.5px", "margin": "4px 0" }
                  }, [
                    createBaseVNode("b", null, toDisplayString(d.term), 1),
                    createTextVNode("：" + toDisplayString(d.def), 1)
                  ]);
                }), 128)),
                !(unref(debate).brief.definitions || []).length ? (openBlock(), createElementBlock("div", _hoisted_13$7, "暂无")) : createCommentVNode("", true)
              ]),
              _cache[9] || (_cache[9] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "② 立论骨架（按这个顺序说）", -1)),
              createBaseVNode("div", _hoisted_14$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).brief.case || [], (c, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    style: { "font-size": "12.5px", "margin": "4px 0", "padding-left": "10px", "border-left": "2px solid #E6E3DC" }
                  }, toDisplayString(c), 1);
                }), 128))
              ]),
              _cache[10] || (_cache[10] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "③ 对方最可能怎么打，你怎么接", -1)),
              createBaseVNode("div", _hoisted_15$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).brief.attacks || [], (a, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    style: { "font-size": "12.5px", "margin": "4px 0" }
                  }, toDisplayString(a), 1);
                }), 128))
              ]),
              _cache[11] || (_cache[11] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "④ 回应句式", -1)),
              createBaseVNode("div", _hoisted_16$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).brief.rebuttals || [], (r, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    style: { "font-size": "12.5px", "margin": "4px 0" }
                  }, toDisplayString(r), 1);
                }), 128))
              ]),
              _cache[12] || (_cache[12] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "⑤ 可引用论据（点一下插入发言框）", -1)),
              createBaseVNode("div", _hoisted_17$7, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).brief.evidence || [], (c, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    style: { "border": "1px solid #efede6", "border-radius": "8px", "padding": "7px 9px", "margin-bottom": "6px", "cursor": "pointer" },
                    onClick: ($event) => insertCard(c)
                  }, [
                    createBaseVNode("div", _hoisted_19$6, toDisplayString(c.claim), 1),
                    createBaseVNode("div", _hoisted_20$6, toDisplayString(c.source) + " " + toDisplayString(c.year || ""), 1)
                  ], 8, _hoisted_18$7);
                }), 128)),
                !(unref(debate).brief.evidence || []).length ? (openBlock(), createElementBlock("div", _hoisted_21$6, "这道题暂无卡片")) : createCommentVNode("", true)
              ]),
              _cache[13] || (_cache[13] = createBaseVNode("div", { style: { "font-size": "11.5px", "color": "#a8adb8", "margin-top": "10px" } }, " 材料只给结构，句子还是你自己组织——照抄会被抓漏洞。 ", -1))
            ], 64)) : createCommentVNode("", true)
          ])
        ])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_22$6, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).stripSeats, (s) => {
            return openBlock(), createElementBlock("div", {
              key: s.k,
              class: normalizeClass(["sp", { me: s.me, cur: s.cur }])
            }, [
              createBaseVNode("div", {
                class: normalizeClass(["av", s.side.toLowerCase()])
              }, toDisplayString(s.me ? "我" : "AI"), 3),
              createBaseVNode("div", null, [
                createBaseVNode("div", _hoisted_23$6, toDisplayString(s.me ? "你" : "AI"), 1),
                createBaseVNode("div", _hoisted_24$5, toDisplayString(s.side === "A" ? "正方" : "反方") + toDisplayString(s.role), 1)
              ])
            ], 2);
          }), 128))
        ]),
        createBaseVNode("div", _hoisted_25$5, [
          createBaseVNode("div", null, [
            createBaseVNode("div", _hoisted_26$5, [
              createBaseVNode("div", {
                ref_key: "chatEl",
                ref: chatEl,
                class: "chat",
                onScroll
              }, [
                !unref(debate).turnsView.length ? (openBlock(), createElementBlock("div", _hoisted_27$5, [..._cache[14] || (_cache[14] = [
                  createBaseVNode("span", null, "对局开始，等待第一条发言…", -1)
                ])])) : createCommentVNode("", true),
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).turnsView, (t) => {
                  return openBlock(), createElementBlock("div", {
                    key: t.key,
                    class: normalizeClass(["msg", [t.side, { me: t.me }]])
                  }, [
                    createBaseVNode("div", {
                      class: normalizeClass(["ava", t.me ? "me" : t.side])
                    }, toDisplayString(t.me ? "我" : t.side === "a" ? "正" : "反"), 3),
                    createBaseVNode("div", _hoisted_28$5, [
                      createBaseVNode("div", _hoisted_29$5, [
                        createBaseVNode("b", null, toDisplayString(t.me ? "你" : "AI 辩手"), 1),
                        createBaseVNode("span", null, toDisplayString(t.seat), 1),
                        _cache[15] || (_cache[15] = createBaseVNode("span", null, "·", -1)),
                        createBaseVNode("span", null, toDisplayString(t.seg), 1),
                        t.timeout ? (openBlock(), createElementBlock("span", _hoisted_30$5, "超时")) : createCommentVNode("", true)
                      ]),
                      createBaseVNode("div", _hoisted_31$5, [
                        t.typing && !t.shown ? (openBlock(), createElementBlock("span", _hoisted_32$5, "…")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                          createTextVNode(toDisplayString(t.typing ? t.text.slice(0, t.shown) : t.text), 1)
                        ], 64))
                      ])
                    ])
                  ], 2);
                }), 128))
              ], 544),
              showTip.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "btn sm primary",
                style: { "position": "absolute", "right": "14px", "bottom": "12px", "box-shadow": "0 6px 16px rgba(0,0,0,.16)" },
                onClick: scrollBottom
              }, " ↓ 回到底部 ")) : createCommentVNode("", true)
            ]),
            unref(debate).phase === "BUZZ" ? (openBlock(), createElementBlock("div", _hoisted_33$5, [
              _cache[16] || (_cache[16] = createBaseVNode("div", { style: { "font-size": "13px", "font-weight": "600", "color": "#2f5bea" } }, "自由辩 · 抢话中", -1)),
              createBaseVNode("div", _hoisted_34$5, " 谁说都行，抢到话筒就归你。窗口 " + toDisplayString(Math.max(0, unref(debate).remaining)) + " 秒 ", 1),
              createBaseVNode("button", {
                class: "btn primary",
                style: { "width": "100%", "padding": "12px", "font-size": "15px" },
                onClick: _cache[3] || (_cache[3] = ($event) => unref(debate).buzz())
              }, " 抢 ！ ")
            ])) : createCommentVNode("", true),
            unref(debate).flawOffer ? (openBlock(), createElementBlock("div", _hoisted_35$5, [
              _cache[17] || (_cache[17] = createBaseVNode("div", {
                class: "row",
                style: { "justify-content": "space-between" }
              }, [
                createBaseVNode("b", { style: { "font-size": "12.5px" } }, "这一轮对方发言有逻辑问题 —— 你抓到了吗？"),
                createBaseVNode("span", { class: "tag o" }, "抓对 +3")
              ], -1)),
              createBaseVNode("div", _hoisted_36$5, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).flawOffer.options || [], (o) => {
                  return openBlock(), createElementBlock("button", {
                    key: o,
                    class: "btn sm ghost",
                    onClick: ($event) => answerFlaw(o)
                  }, toDisplayString(o), 9, _hoisted_37$5);
                }), 128)),
                createBaseVNode("button", {
                  class: "btn sm ghost",
                  style: { "color": "#a8adb8" },
                  onClick: _cache[4] || (_cache[4] = ($event) => unref(debate).flawOffer = null)
                }, "跳过")
              ])
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_38$4, [
              createBaseVNode("div", _hoisted_39$4, [
                createBaseVNode("span", null, toDisplayString(unref(debate).waiting ? "轮到你发言" : "等待对方发言…"), 1),
                createBaseVNode("span", {
                  style: normalizeStyle({ fontFamily: "ui-monospace,monospace", color: cdColor.value, fontWeight: unref(debate).remaining <= 30 && !unref(debate).unlimited ? 700 : 400 })
                }, toDisplayString(cdText.value), 5)
              ]),
              unref(debate).waiting ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                withDirectives(createBaseVNode("textarea", {
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => draft.value = $event),
                  placeholder: "写下你的发言…",
                  onInput: onType
                }, null, 544), [
                  [vModelText, draft.value]
                ]),
                createBaseVNode("div", _hoisted_40$4, [
                  createBaseVNode("span", _hoisted_41$3, toDisplayString(unref(debate).extendUsed ? "已自动续命 " + unref(debate).extendUsed + " 次" : "打字时会自动续时"), 1),
                  _cache[18] || (_cache[18] = createBaseVNode("span", { style: { "flex": "1" } }, null, -1)),
                  createBaseVNode("button", {
                    class: "btn sm primary",
                    onClick: submit
                  }, "发送")
                ])
              ], 64)) : (openBlock(), createElementBlock("div", _hoisted_42$3, [
                _cache[19] || (_cache[19] = createTextVNode(" 对方正在思考… ", -1)),
                unref(debate).kind === "solo" ? (openBlock(), createElementBlock("button", {
                  key: 0,
                  class: "btn sm ghost",
                  style: { "margin-left": "10px" },
                  onClick: _cache[6] || (_cache[6] = ($event) => unref(debate).skipAi())
                }, " 催一下 ")) : createCommentVNode("", true)
              ]))
            ])
          ]),
          createBaseVNode("div", null, [
            createBaseVNode("div", _hoisted_43$3, [
              createBaseVNode("div", _hoisted_44$3, [
                _cache[20] || (_cache[20] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "赛制进度", -1)),
                createBaseVNode("span", _hoisted_45$3, toDisplayString(unref(debate).stepNo) + "/" + toDisplayString(unref(debate).steps.length), 1)
              ]),
              createBaseVNode("div", _hoisted_46$2, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).steps, (n, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: n,
                    class: normalizeClass(["st", { done: i + 1 < unref(debate).stepNo, cur: i + 1 === unref(debate).stepNo }])
                  }, [
                    createBaseVNode("span", _hoisted_47$2, toDisplayString(i + 1), 1),
                    createBaseVNode("span", null, toDisplayString(unref(SEG_OF)[n]) + " · " + toDisplayString(unref(SEAT_OF)[n]) + toDisplayString(unref(debate).mySeats.includes(unref(SEAT_OF)[n]) ? " · 你" : ""), 1)
                  ], 2);
                }), 128))
              ])
            ]),
            createBaseVNode("div", _hoisted_48$2, [
              createBaseVNode("div", _hoisted_49$2, [
                _cache[21] || (_cache[21] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "论据卡", -1)),
                createBaseVNode("span", _hoisted_50$2, toDisplayString((unref(debate).cards || []).length) + " 张", 1)
              ]),
              _cache[22] || (_cache[22] = createBaseVNode("div", { style: { "font-size": "11.5px", "color": "#8a909c", "margin": "6px 0 8px" } }, " 点一下插入到发言框。标「需核实」的自己查证过再用。 ", -1)),
              createBaseVNode("div", _hoisted_51$2, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).cards || [], (c, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    style: { "border": "1px solid #efede6", "border-radius": "8px", "padding": "7px 9px", "margin-bottom": "6px", "cursor": "pointer" },
                    onClick: ($event) => insertCard(c)
                  }, [
                    createBaseVNode("div", _hoisted_53$2, toDisplayString(c.claim), 1),
                    createBaseVNode("div", _hoisted_54$1, [
                      createTextVNode(toDisplayString(c.source) + " " + toDisplayString(c.year || "") + " ", 1),
                      c.verified ? (openBlock(), createElementBlock("span", _hoisted_55$1, "已核实")) : (openBlock(), createElementBlock("span", _hoisted_56$1, "需核实"))
                    ])
                  ], 8, _hoisted_52$2);
                }), 128)),
                !(unref(debate).cards || []).length ? (openBlock(), createElementBlock("div", _hoisted_57$1, "这道题暂无论据卡")) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("div", _hoisted_58$1, [
              _cache[27] || (_cache[27] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "本场", -1)),
              createBaseVNode("div", _hoisted_59$1, [
                createBaseVNode("div", _hoisted_60$1, [
                  _cache[23] || (_cache[23] = createBaseVNode("span", null, "你的席位", -1)),
                  createBaseVNode("b", null, toDisplayString(m.value.my_seats), 1)
                ]),
                createBaseVNode("div", _hoisted_61$1, [
                  _cache[24] || (_cache[24] = createBaseVNode("span", null, "已记录发言", -1)),
                  createBaseVNode("b", null, toDisplayString(unref(debate).turns.length), 1)
                ]),
                createBaseVNode("div", _hoisted_62$1, [
                  _cache[25] || (_cache[25] = createBaseVNode("span", null, "AI 档位", -1)),
                  createBaseVNode("b", null, toDisplayString(tierLabel.value), 1)
                ]),
                payerLabel.value ? (openBlock(), createElementBlock("div", _hoisted_63$1, [
                  _cache[26] || (_cache[26] = createBaseVNode("span", null, "费用", -1)),
                  createBaseVNode("b", null, "由" + toDisplayString(payerLabel.value) + "承担", 1)
                ])) : createCommentVNode("", true)
              ])
            ])
          ])
        ])
      ], 64));
    };
  }
};
const _hoisted_1$a = {
  key: 0,
  class: "bill-strip"
};
const _hoisted_2$a = {
  class: "row",
  style: { "justify-content": "space-between", "align-items": "center" }
};
const _hoisted_3$a = { style: { "font-size": "14px" } };
const _hoisted_4$a = { class: "kv" };
const _hoisted_5$a = { class: "kv" };
const _hoisted_6$a = { class: "kv" };
const _hoisted_7$a = {
  key: 0,
  class: "kv"
};
const _hoisted_8$9 = { style: { "font-size": "11.5px", "color": "#a8adb8", "margin-top": "4px" } };
const _sfc_main$a = {
  __name: "BillStrip",
  props: {
    billTokens: { type: Number, default: 0 },
    /** 本场 AI 档位：BASIC / PRO / BYOK（'' = 未知，按 PRO 展示） */
    tier: { type: String, default: "" },
    /** 付款人标签，例如「房主」；空 = 自己付 */
    payer: { type: String, default: "" }
  },
  setup(__props) {
    const props = __props;
    const wallet = useWalletStore();
    const info = computed(() => wallet.info || {});
    const per1k = computed(() => Number(info.value.centsPer1kTokens) || 3);
    const fee = computed(() => Number(info.value.serviceFeeCents) || 30);
    const tierKey = computed(() => String(props.tier || "PRO").toUpperCase());
    const tierLabel = computed(
      () => tierKey.value === "BYOK" ? "自带 Key" : tierKey.value === "BASIC" ? "基础版" : "高级版"
    );
    const isFree = computed(() => tierKey.value === "BYOK" || tierKey.value === "BASIC");
    const modelCents = computed(() => isFree.value ? 0 : Math.ceil(props.billTokens / 1e3 * per1k.value));
    const feeCents = computed(() => isFree.value ? 0 : fee.value);
    const totalCents = computed(() => modelCents.value + feeCents.value);
    const show = computed(() => props.billTokens > 0 || !!props.tier);
    return (_ctx, _cache) => {
      return show.value ? (openBlock(), createElementBlock("div", _hoisted_1$a, [
        createBaseVNode("div", _hoisted_2$a, [
          _cache[0] || (_cache[0] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "本场费用", -1)),
          createBaseVNode("b", _hoisted_3$a, toDisplayString(isFree.value ? "免费" : "¥" + unref(money)(totalCents.value)), 1)
        ]),
        createBaseVNode("div", _hoisted_4$a, [
          _cache[1] || (_cache[1] = createBaseVNode("span", null, "档位", -1)),
          createBaseVNode("b", null, toDisplayString(tierLabel.value), 1)
        ]),
        createBaseVNode("div", _hoisted_5$a, [
          _cache[2] || (_cache[2] = createBaseVNode("span", null, "模型成本", -1)),
          createBaseVNode("b", null, toDisplayString(__props.billTokens) + " token → " + toDisplayString(isFree.value ? "免费" : "¥" + unref(money)(modelCents.value)), 1)
        ]),
        createBaseVNode("div", _hoisted_6$a, [
          _cache[3] || (_cache[3] = createBaseVNode("span", null, "服务费", -1)),
          createBaseVNode("b", null, toDisplayString(isFree.value ? "免费" : "¥" + unref(money)(feeCents.value)), 1)
        ]),
        __props.payer ? (openBlock(), createElementBlock("div", _hoisted_7$a, [
          _cache[4] || (_cache[4] = createBaseVNode("span", null, "付款人", -1)),
          createBaseVNode("b", null, toDisplayString(__props.payer), 1)
        ])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_8$9, toDisplayString(isFree.value ? "平台零成本，本场不扣费" : "已从钱包扣除") + "；余额 ¥" + toDisplayString(unref(money)(info.value.balanceCents)), 1)
      ])) : createCommentVNode("", true);
    };
  }
};
const BillStrip = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["__scopeId", "data-v-0f26f55a"]]);
const _hoisted_1$9 = {
  key: 0,
  class: "card"
};
const _hoisted_2$9 = { class: "sub" };
const _hoisted_3$9 = { class: "card" };
const _hoisted_4$9 = {
  class: "row",
  style: { "align-items": "flex-end", "gap": "30px", "flex-wrap": "wrap" }
};
const _hoisted_5$9 = { class: "big" };
const _hoisted_6$9 = { style: { "flex": "1", "min-width": "240px" } };
const _hoisted_7$9 = ["title"];
const _hoisted_8$8 = { class: "dbar" };
const _hoisted_9$8 = {
  key: 0,
  class: "dim"
};
const _hoisted_10$8 = { class: "dbar" };
const _hoisted_11$7 = {
  key: 0,
  style: { "margin-top": "14px" }
};
const _hoisted_12$6 = { style: { "font-size": "11.5px", "color": "#8a909c", "margin-left": "6px" } };
const _hoisted_13$6 = {
  class: "row",
  style: { "justify-content": "space-between", "align-items": "center" }
};
const _hoisted_14$6 = { style: { "font-size": "12.5px" } };
const _hoisted_15$6 = { style: { "font-size": "13px" } };
const _hoisted_16$6 = {
  class: "row",
  style: { "gap": "14px", "margin-top": "6px", "font-size": "11.5px", "color": "#6b7280", "flex-wrap": "wrap" }
};
const _hoisted_17$6 = {
  key: 1,
  class: "row",
  style: { "gap": "8px", "margin-top": "10px", "flex-wrap": "wrap" }
};
const _hoisted_18$6 = {
  key: 2,
  class: "row",
  style: { "gap": "8px", "margin-top": "10px" }
};
const _hoisted_19$5 = {
  key: 3,
  style: { "margin-top": "14px" }
};
const _hoisted_20$5 = {
  class: "t",
  style: { "margin-top": "6px" }
};
const _hoisted_21$5 = { class: "mono" };
const _hoisted_22$5 = { class: "mono" };
const _hoisted_23$5 = { style: { "font-size": "12px", "color": "#4a5568" } };
const _hoisted_24$4 = { class: "ev" };
const _hoisted_25$4 = {
  class: "row",
  style: { "gap": "20px", "margin-top": "10px", "font-size": "12.5px" }
};
const _hoisted_26$4 = {
  key: 0,
  style: { "color": "#c0392b" }
};
const _hoisted_27$4 = { style: { "color": "#c0392b" } };
const _hoisted_28$4 = { style: { "color": "#0e9f6e" } };
const _hoisted_29$4 = {
  class: "card",
  style: { "margin-top": "14px", "border-color": "#dce3f5", "background": "#fbfcfe" }
};
const _hoisted_30$4 = {
  class: "row",
  style: { "justify-content": "space-between", "align-items": "center" }
};
const _hoisted_31$4 = {
  key: 0,
  style: { "font-size": "12px", "color": "#a8adb8" }
};
const _hoisted_32$4 = {
  key: 0,
  class: "empty",
  style: { "padding": "16px 0" }
};
const _hoisted_33$4 = {
  key: 1,
  class: "empty",
  style: { "padding": "14px 0" }
};
const _hoisted_34$4 = { style: { "display": "flex", "align-items": "flex-end", "gap": "18px", "flex-wrap": "wrap", "margin-top": "14px" } };
const _hoisted_35$4 = {
  class: "big",
  style: { "font-size": "38px" }
};
const _hoisted_36$4 = { style: { "font-size": "11.5px", "color": "#8a909c" } };
const _hoisted_37$4 = { style: { "flex": "1", "min-width": "220px" } };
const _hoisted_38$3 = ["title"];
const _hoisted_39$3 = { class: "dbar" };
const _hoisted_40$3 = { style: { "font-size": "12.5px", "color": "#4a5568", "margin-top": "8px" } };
const _hoisted_41$2 = {
  key: 0,
  style: { "color": "#c2671e" }
};
const _hoisted_42$2 = {
  key: 0,
  style: { "margin-top": "14px" }
};
const _hoisted_43$2 = { style: { "font-size": "11.5px", "color": "#8a909c" } };
const _hoisted_44$2 = {
  key: 0,
  style: { "font-size": "12.5px", "color": "#4a5568", "margin": "3px 0" }
};
const _hoisted_45$2 = { style: { "font-size": "12.5px", "color": "#c0392b" } };
const _hoisted_46$1 = { style: { "font-size": "12.5px", "color": "#0e9f6e", "margin-top": "4px" } };
const _hoisted_47$1 = { style: { "margin-top": "14px" } };
const _hoisted_48$1 = {
  class: "row",
  style: { "justify-content": "space-between" }
};
const _hoisted_49$1 = { style: { "font-size": "12px", "color": "#8a909c" } };
const _hoisted_50$1 = {
  key: 0,
  style: { "margin-top": "6px" }
};
const _hoisted_51$1 = { style: { "color": "#0e9f6e" } };
const _hoisted_52$1 = {
  key: 1,
  style: { "font-size": "11.5px", "color": "#a8adb8", "margin-top": "6px" }
};
const _hoisted_53$1 = {
  class: "row",
  style: { "margin-top": "16px" }
};
const _sfc_main$9 = {
  __name: "ReviewView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const debate = useDebateStore();
    const auth = useAuthStore();
    const r = computed(() => debate.review && debate.review.score || null);
    const seatScores = computed(() => debate.review && debate.review.seatScores || {});
    const seatKeys = computed(() => Object.keys(seatScores.value));
    const match = computed(() => debate.match || {});
    const billTokens = computed(() => debate.review && debate.review.billTokens || 0);
    const billTier = computed(() => debate.match && debate.match.tier || "");
    const billPayer = computed(() => {
      const payer = debate.match && debate.match.payer_user_id || "";
      const me = auth.user && auth.user.id || "";
      if (!payer || !me || String(payer) === String(me)) return "";
      return "房主";
    });
    const DIMS = [
      ["立论", "matter", "25%"],
      ["论证", "method", "30%"],
      ["表达", "manner", "15%"],
      ["应变", "adapt", "20%"],
      ["论据", "evidence", "10%"]
    ];
    const PANEL_COLORS = { 结构裁判: "#3A63FF", 交锋裁判: "#C0392B", 表达裁判: "#0E9F6E", 论据裁判: "#C2671E" };
    const panelJudges = computed(() => {
      const p2 = debate.panel;
      if (!p2 || p2.failed) return [];
      return (p2.judges || []).filter((j) => !j.failed);
    });
    onMounted(async () => {
      if (!debate.matchId && route.query.match) debate.matchId = String(route.query.match);
      if (!debate.review) await debate.loadReview();
      if (!debate.match && debate.matchId) {
        try {
          const d = await (await __vitePreload(async () => {
            const { debateApi: debateApi2 } = await Promise.resolve().then(() => api);
            return { debateApi: debateApi2 };
          }, true ? void 0 : void 0, import.meta.url)).debateApi.match(debate.matchId);
          debate.match = d.match;
        } catch (e) {
        }
      }
    });
    function verdictClass(v) {
      return v === "有交锋" ? "g" : v === "脱靶" ? "o" : "r";
    }
    return (_ctx, _cache) => {
      return !r.value ? (openBlock(), createElementBlock("div", _hoisted_1$9, [..._cache[4] || (_cache[4] = [
        createBaseVNode("div", { class: "empty" }, "没有复盘数据", -1)
      ])])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
        _cache[24] || (_cache[24] = createBaseVNode("h1", { class: "pg" }, "本场复盘", -1)),
        createBaseVNode("p", _hoisted_2$9, toDisplayString(match.value.topic_title || "") + " · 你占 " + toDisplayString(match.value.my_seats || "") + " · 发言 " + toDisplayString(r.value.turns) + " 次" + toDisplayString(r.value.timeout ? " · 超时 " + r.value.timeout + " 次" : ""), 1),
        createBaseVNode("div", _hoisted_3$9, [
          createBaseVNode("div", _hoisted_4$9, [
            createBaseVNode("div", null, [
              createBaseVNode("div", _hoisted_5$9, [
                createTextVNode(toDisplayString(r.value.total), 1),
                _cache[5] || (_cache[5] = createBaseVNode("small", null, "分", -1))
              ]),
              _cache[6] || (_cache[6] = createBaseVNode("div", { style: { "font-size": "12px", "color": "#8a909c", "margin-top": "4px" } }, "三维加权 · 已写入记录", -1))
            ]),
            createBaseVNode("div", _hoisted_6$9, [
              (openBlock(), createElementBlock(Fragment, null, renderList(DIMS, (d) => {
                return createBaseVNode("div", {
                  key: d[1],
                  class: "dim"
                }, [
                  createBaseVNode("span", {
                    class: "lb",
                    title: "权重 " + d[2]
                  }, toDisplayString(d[0]), 9, _hoisted_7$9),
                  createBaseVNode("div", _hoisted_8$8, [
                    createBaseVNode("i", {
                      style: normalizeStyle({ width: r.value[d[1]] + "%" })
                    }, null, 4)
                  ]),
                  createBaseVNode("b", null, toDisplayString(r.value[d[1]]), 1)
                ]);
              }), 64)),
              r.value.collab ? (openBlock(), createElementBlock("div", _hoisted_9$8, [
                _cache[7] || (_cache[7] = createBaseVNode("span", { class: "lb" }, "协同", -1)),
                createBaseVNode("div", _hoisted_10$8, [
                  createBaseVNode("i", {
                    style: normalizeStyle({ width: r.value.collab * 8 + "%", background: "#0E9F6E" })
                  }, null, 4)
                ]),
                createBaseVNode("b", null, "+" + toDisplayString(r.value.collab), 1)
              ])) : createCommentVNode("", true)
            ])
          ]),
          seatKeys.value.length > 1 ? (openBlock(), createElementBlock("div", _hoisted_11$7, [
            _cache[8] || (_cache[8] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "按席位看", -1)),
            createBaseVNode("span", _hoisted_12$6, " 你占了 " + toDisplayString(seatKeys.value.length) + " 个位置，分开算 ", 1),
            (openBlock(true), createElementBlock(Fragment, null, renderList(seatKeys.value, (k) => {
              return openBlock(), createElementBlock("div", {
                key: k,
                class: "card",
                style: { "margin-top": "8px", "padding": "10px 12px" }
              }, [
                createBaseVNode("div", _hoisted_13$6, [
                  createBaseVNode("b", _hoisted_14$6, toDisplayString(k) + " 席位", 1),
                  createBaseVNode("span", _hoisted_15$6, [
                    createBaseVNode("b", null, toDisplayString(seatScores.value[k].total), 1),
                    createTextVNode(" 分 · 发言 " + toDisplayString(seatScores.value[k].turns) + " 次", 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_16$6, [
                  createBaseVNode("span", null, "立论 " + toDisplayString(seatScores.value[k].matter), 1),
                  createBaseVNode("span", null, "论证 " + toDisplayString(seatScores.value[k].method), 1),
                  createBaseVNode("span", null, "表达 " + toDisplayString(seatScores.value[k].manner), 1),
                  createBaseVNode("span", null, "应变 " + toDisplayString(seatScores.value[k].adapt), 1),
                  createBaseVNode("span", null, "论据 " + toDisplayString(seatScores.value[k].evidence), 1)
                ])
              ]);
            }), 128))
          ])) : createCommentVNode("", true),
          Object.keys(r.value.flaws || {}).length ? (openBlock(), createElementBlock("div", _hoisted_17$6, [
            _cache[9] || (_cache[9] = createBaseVNode("span", { style: { "font-size": "12.5px", "color": "#6b7280" } }, "本场检出：", -1)),
            (openBlock(true), createElementBlock(Fragment, null, renderList(Object.entries(r.value.flaws), ([k, v]) => {
              return openBlock(), createElementBlock("span", {
                key: k,
                class: "tag o"
              }, toDisplayString(k) + " × " + toDisplayString(v), 1);
            }), 128))
          ])) : createCommentVNode("", true),
          r.value.flawTries ? (openBlock(), createElementBlock("div", _hoisted_18$6, [
            _cache[10] || (_cache[10] = createBaseVNode("span", { style: { "font-size": "12.5px", "color": "#6b7280" } }, "抓漏：", -1)),
            createBaseVNode("b", {
              style: normalizeStyle({ color: r.value.flawHits > 0 ? "#0E9F6E" : "#C0392B" })
            }, toDisplayString(r.value.flawHits) + "/" + toDisplayString(r.value.flawTries), 5),
            _cache[11] || (_cache[11] = createBaseVNode("span", { style: { "font-size": "11.5px", "color": "#8a909c" } }, "对方故意埋的逻辑漏洞，你抓对了几处", -1))
          ])) : createCommentVNode("", true),
          (r.value.perTurn || []).length ? (openBlock(), createElementBlock("div", _hoisted_19$5, [
            _cache[13] || (_cache[13] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "逐回合点评", -1)),
            createBaseVNode("table", _hoisted_20$5, [
              _cache[12] || (_cache[12] = createBaseVNode("thead", null, [
                createBaseVNode("tr", null, [
                  createBaseVNode("th", { style: { "width": "46px" } }, "步"),
                  createBaseVNode("th", { style: { "width": "64px" } }, "环节"),
                  createBaseVNode("th", { style: { "width": "56px" } }, "字数"),
                  createBaseVNode("th", { style: { "width": "64px" } }, "判定"),
                  createBaseVNode("th", null, "说明")
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(r.value.perTurn || [], (p2, i) => {
                  return openBlock(), createElementBlock("tr", { key: i }, [
                    createBaseVNode("td", _hoisted_21$5, toDisplayString(p2.step), 1),
                    createBaseVNode("td", null, toDisplayString(p2.seg), 1),
                    createBaseVNode("td", _hoisted_22$5, toDisplayString(p2.chars), 1),
                    createBaseVNode("td", null, [
                      createBaseVNode("span", {
                        class: normalizeClass(["tag", verdictClass(p2.verdict)])
                      }, toDisplayString(p2.verdict), 3)
                    ]),
                    createBaseVNode("td", _hoisted_23$5, toDisplayString(p2.note), 1)
                  ]);
                }), 128))
              ])
            ])
          ])) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_24$4, [
            _cache[16] || (_cache[16] = createBaseVNode("div", { class: "k" }, "证据（你的原句）", -1)),
            createBaseVNode("div", null, toDisplayString(r.value.quote || "（本轮未发言）"), 1),
            createBaseVNode("div", _hoisted_25$4, [
              createBaseVNode("div", null, [
                _cache[14] || (_cache[14] = createTextVNode("引用论据：", -1)),
                createBaseVNode("b", {
                  style: normalizeStyle({ color: r.value.cited > 0 ? "#0E9F6E" : "#C0392B" })
                }, toDisplayString(r.value.cited) + " 条", 5)
              ]),
              createBaseVNode("div", null, [
                _cache[15] || (_cache[15] = createTextVNode(" 编造数字：", -1)),
                createBaseVNode("b", {
                  style: normalizeStyle({ color: (r.value.fabricated || []).length ? "#C0392B" : "#0E9F6E" })
                }, toDisplayString((r.value.fabricated || []).length) + " 处 ", 5),
                (r.value.fabricated || []).length ? (openBlock(), createElementBlock("span", _hoisted_26$4, "（" + toDisplayString((r.value.fabricated || []).join("、")) + "）", 1)) : createCommentVNode("", true)
              ])
            ]),
            _cache[17] || (_cache[17] = createBaseVNode("div", {
              class: "k",
              style: { "margin-top": "10px" }
            }, "问题", -1)),
            createBaseVNode("div", _hoisted_27$4, toDisplayString(r.value.problem), 1),
            _cache[18] || (_cache[18] = createBaseVNode("div", {
              class: "k",
              style: { "margin-top": "10px" }
            }, "改成这样", -1)),
            createBaseVNode("div", _hoisted_28$4, toDisplayString(r.value.improve), 1)
          ]),
          createBaseVNode("div", _hoisted_29$4, [
            createBaseVNode("div", _hoisted_30$4, [
              _cache[19] || (_cache[19] = createBaseVNode("div", null, [
                createBaseVNode("b", { style: { "font-size": "13.5px" } }, "AI 评审团"),
                createBaseVNode("span", { style: { "font-size": "11.5px", "color": "#8a909c", "margin-left": "8px" } }, "4 位裁判独立打分 · 取平均")
              ], -1)),
              createBaseVNode("div", null, [
                unref(debate).panelBusy ? (openBlock(), createElementBlock("span", _hoisted_31$4, "评审中…")) : (openBlock(), createElementBlock("button", {
                  key: 1,
                  class: "btn sm ghost",
                  onClick: _cache[0] || (_cache[0] = ($event) => unref(debate).runPanel())
                }, toDisplayString(unref(debate).panel ? "重新评一次" : "让裁判点评"), 1))
              ])
            ]),
            _cache[23] || (_cache[23] = createBaseVNode("div", { style: { "font-size": "11.5px", "color": "#a8adb8", "margin-top": "6px" } }, " 结构 / 交锋 / 表达 / 论据 四个视角各评一次，找出「多位裁判都提到」的问题——那才是真问题。约 5–8 秒，一次约 0.02 元。 ", -1)),
            unref(debate).panelBusy ? (openBlock(), createElementBlock("div", _hoisted_32$4, "四位裁判正在看你的发言…")) : unref(debate).panel && unref(debate).panel.failed ? (openBlock(), createElementBlock("div", _hoisted_33$4, toDisplayString(unref(debate).panel.reason), 1)) : unref(debate).panel ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_34$4, [
                createBaseVNode("div", null, [
                  createBaseVNode("div", _hoisted_35$4, [
                    createTextVNode(toDisplayString(unref(debate).panel.average), 1),
                    _cache[20] || (_cache[20] = createBaseVNode("small", null, "分", -1))
                  ]),
                  createBaseVNode("div", _hoisted_36$4, " 裁判平均 · 区间 " + toDisplayString(unref(debate).panel.min) + "–" + toDisplayString(unref(debate).panel.max), 1)
                ]),
                createBaseVNode("div", _hoisted_37$4, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(panelJudges.value, (j) => {
                    return openBlock(), createElementBlock("div", {
                      key: j.name,
                      class: "dim"
                    }, [
                      createBaseVNode("span", {
                        class: "lb",
                        title: j.lens || ""
                      }, toDisplayString(j.name), 9, _hoisted_38$3),
                      createBaseVNode("div", _hoisted_39$3, [
                        createBaseVNode("i", {
                          style: normalizeStyle({ width: j.score + "%", background: PANEL_COLORS[j.name] || "#3A63FF" })
                        }, null, 4)
                      ]),
                      createBaseVNode("b", null, toDisplayString(j.score), 1)
                    ]);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_40$3, [
                createTextVNode(toDisplayString(unref(debate).panel.summary) + " ", 1),
                unref(debate).panel.max - unref(debate).panel.min >= 20 ? (openBlock(), createElementBlock("b", _hoisted_41$2, "（分歧大 = 有争议点，见下）")) : createCommentVNode("", true)
              ]),
              (unref(debate).panel.consensus || []).length ? (openBlock(), createElementBlock("div", _hoisted_42$2, [
                _cache[21] || (_cache[21] = createBaseVNode("b", { style: { "font-size": "12.5px", "color": "#c0392b" } }, "多位裁判都提到的问题", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(debate).panel.consensus, (c, i) => {
                  return openBlock(), createElementBlock("div", {
                    key: i,
                    style: { "background": "#fff", "border": "1px solid #edeff5", "border-radius": "10px", "padding": "10px 12px", "margin-top": "8px" }
                  }, [
                    createBaseVNode("div", _hoisted_43$2, toDisplayString(c.category) + " · " + toDisplayString(c.agreed), 1),
                    c.quote ? (openBlock(), createElementBlock("div", _hoisted_44$2, "你写的「" + toDisplayString(c.quote) + "」", 1)) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_45$2, toDisplayString(c.why), 1),
                    createBaseVNode("div", _hoisted_46$1, "改成：" + toDisplayString(c.fix), 1)
                  ]);
                }), 128))
              ])) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_47$1, [
                _cache[22] || (_cache[22] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "各裁判的加/扣分点", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(panelJudges.value, (j) => {
                  return openBlock(), createElementBlock("div", {
                    key: j.name,
                    style: { "background": "#fff", "border": "1px solid #edeff5", "border-radius": "10px", "padding": "10px 12px", "margin-top": "8px" }
                  }, [
                    createBaseVNode("div", _hoisted_48$1, [
                      createBaseVNode("b", {
                        style: normalizeStyle([{ "font-size": "12.5px" }, { color: PANEL_COLORS[j.name] || "#3A63FF" }])
                      }, toDisplayString(j.name), 5),
                      createBaseVNode("span", _hoisted_49$1, toDisplayString(j.score) + " 分 · " + toDisplayString(j.lens), 1)
                    ]),
                    (j.scoringPoints || []).length ? (openBlock(), createElementBlock("div", _hoisted_50$1, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(j.scoringPoints, (s, i) => {
                        return openBlock(), createElementBlock("div", {
                          key: i,
                          style: { "font-size": "12px", "color": "#0e9f6e" }
                        }, "＋ " + toDisplayString(s), 1);
                      }), 128))
                    ])) : createCommentVNode("", true),
                    (openBlock(true), createElementBlock(Fragment, null, renderList((j.weaknesses || []).slice(0, 2), (w, i) => {
                      return openBlock(), createElementBlock("div", {
                        key: "w" + i,
                        style: { "margin-top": "6px", "font-size": "12px", "color": "#4a5568" }
                      }, [
                        createTextVNode(" － " + toDisplayString(w.why) + " ", 1),
                        createBaseVNode("span", _hoisted_51$1, "（" + toDisplayString((w.fix || "").slice(0, 40)) + "）", 1)
                      ]);
                    }), 128)),
                    j.comment ? (openBlock(), createElementBlock("div", _hoisted_52$1, toDisplayString(j.comment), 1)) : createCommentVNode("", true)
                  ]);
                }), 128))
              ])
            ], 64)) : createCommentVNode("", true)
          ]),
          createVNode(BillStrip, {
            "bill-tokens": billTokens.value,
            tier: billTier.value,
            payer: billPayer.value
          }, null, 8, ["bill-tokens", "tier", "payer"]),
          createBaseVNode("div", _hoisted_53$1, [
            createBaseVNode("button", {
              class: "btn primary",
              onClick: _cache[1] || (_cache[1] = ($event) => unref(router2).push({ name: "solo" }))
            }, "再来一场"),
            createBaseVNode("button", {
              class: "btn ghost",
              onClick: _cache[2] || (_cache[2] = ($event) => unref(router2).push({ name: "diag" }))
            }, "看能力画像"),
            createBaseVNode("button", {
              class: "btn ghost",
              onClick: _cache[3] || (_cache[3] = ($event) => unref(router2).push({ name: "records" }))
            }, "辩论记录")
          ])
        ])
      ], 64));
    };
  }
};
const _hoisted_1$8 = {
  class: "grid g3",
  style: { "max-width": "1000px" }
};
const _hoisted_2$8 = { class: "card" };
const _hoisted_3$8 = { class: "card" };
const _hoisted_4$8 = { style: { "font-size": "12.5px", "color": "#4a5568", "line-height": "2", "margin-top": "8px" } };
const _hoisted_5$8 = { class: "mono" };
const _hoisted_6$8 = { style: { "flex": "1", "margin": "0 8px", "overflow": "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" } };
const _hoisted_7$8 = ["onClick"];
const _hoisted_8$7 = {
  key: 0,
  class: "empty"
};
const _hoisted_9$7 = {
  class: "row",
  style: { "justify-content": "space-between", "margin-bottom": "12px" }
};
const _hoisted_10$7 = { class: "pg" };
const _hoisted_11$6 = {
  class: "sub",
  style: { "margin": "0" }
};
const _hoisted_12$5 = { class: "mono" };
const _hoisted_13$5 = { class: "row" };
const _hoisted_14$5 = ["disabled"];
const _hoisted_15$5 = {
  class: "card",
  style: { "margin-bottom": "12px" }
};
const _hoisted_16$5 = {
  class: "mono",
  style: { "margin-left": "10px", "font-size": "16px", "letter-spacing": "2px", "color": "#2f5bea", "background": "#edf1fe", "border-radius": "7px", "padding": "3px 10px" }
};
const _hoisted_17$5 = {
  class: "card",
  style: { "margin-bottom": "12px", "display": "flex", "align-items": "center", "gap": "10px", "flex-wrap": "wrap" }
};
const _hoisted_18$5 = { style: { "font-size": "12.5px", "color": "#4a5568" } };
const _hoisted_19$4 = { style: { "font-size": "11.5px", "color": "#8a909c" } };
const _hoisted_20$4 = { class: "strip" };
const _hoisted_21$4 = { class: "nm" };
const _hoisted_22$4 = { class: "rl" };
const _hoisted_23$4 = { class: "card" };
const _hoisted_24$3 = {
  class: "t",
  style: { "margin-top": "8px" }
};
const _hoisted_25$3 = { class: "mono" };
const _hoisted_26$3 = {
  key: 1,
  class: "tag"
};
const _hoisted_27$3 = {
  key: 2,
  style: { "color": "#a8adb8" }
};
const _hoisted_28$3 = {
  key: 0,
  class: "tag g"
};
const _hoisted_29$3 = {
  key: 1,
  class: "tag g"
};
const _hoisted_30$3 = {
  key: 2,
  class: "tag"
};
const _hoisted_31$3 = { class: "iv-box" };
const _hoisted_32$3 = { class: "iv-head" };
const _hoisted_33$3 = {
  class: "sub",
  style: { "margin": "0 0 10px" }
};
const _hoisted_34$3 = { class: "mono" };
const _hoisted_35$3 = { class: "iv-list" };
const _hoisted_36$3 = {
  key: 0,
  class: "empty",
  style: { "padding": "24px" }
};
const _hoisted_37$3 = {
  key: 1,
  class: "empty",
  style: { "padding": "24px" }
};
const _hoisted_38$2 = { class: "fr-av" };
const _hoisted_39$2 = { class: "fr-main" };
const _hoisted_40$2 = { class: "fr-name" };
const _hoisted_41$1 = { class: "fr-id" };
const _hoisted_42$1 = { class: "fr-act" };
const _hoisted_43$1 = {
  key: 0,
  class: "btn ghost",
  disabled: ""
};
const _hoisted_44$1 = ["onClick"];
const _hoisted_45$1 = {
  key: 3,
  class: "empty",
  style: { "padding": "24px" }
};
const _sfc_main$8 = {
  __name: "RoomView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const auth = useAuthStore();
    const debate = useDebateStore();
    const rooms = /* @__PURE__ */ ref([]);
    const roomCode = /* @__PURE__ */ ref("");
    const room = /* @__PURE__ */ ref(null);
    const mySeat = /* @__PURE__ */ ref("");
    const joinCode = /* @__PURE__ */ ref("");
    const pollTimer = /* @__PURE__ */ ref(null);
    const invite = /* @__PURE__ */ ref({ open: false, loading: false, friends: [], sent: {}, error: "" });
    const r = computed(() => room.value && room.value.room || {});
    const seats = computed(() => room.value && room.value.seats || []);
    const hostId = computed(() => room.value && room.value.host || r.value.host_user || "");
    const roomTier = computed(() => String(r.value.tier || "PRO").toUpperCase());
    const myReady = computed(() => {
      const mine = seats.value.find((s) => s.seat_key === mySeat.value);
      return !!(mine && mine.ready);
    });
    onMounted(async () => {
      if (!auth.user) {
        router2.push({ name: "login", query: { next: "/room" } });
        return;
      }
      const code = String(route.query.join || "");
      if (code) {
        await doJoin(code);
        router2.replace({ name: "room" });
        return;
      }
      await loadRooms();
    });
    onBeforeUnmount(stopPoll);
    watch(roomCode, (v) => {
      if (v) startPoll();
      else stopPoll();
    });
    async function loadRooms() {
      try {
        rooms.value = await roomApi.list() || [];
      } catch (e) {
        rooms.value = [];
      }
    }
    function startPoll() {
      stopPoll();
      pollTimer.value = setInterval(async () => {
        if (!roomCode.value || !auth.user) return;
        try {
          const d = await roomApi.detail(roomCode.value);
          room.value = d;
          if (d && d.room && d.room.status === "RUNNING" && d.room.match_id) {
            stopPoll();
            await enterMatch(d.room.match_id);
          }
        } catch (e) {
        }
      }, 1200);
    }
    function stopPoll() {
      if (pollTimer.value) {
        clearInterval(pollTimer.value);
        pollTimer.value = null;
      }
    }
    async function enterMatch(matchId) {
      debate.matchId = String(matchId);
      await debate.load(true);
      debate.startPoll();
      router2.push({ name: "match" });
    }
    async function createRoom() {
      try {
        const res = await roomApi.create(null);
        roomCode.value = res.code;
        room.value = res.detail;
        mySeat.value = res.detail.mySeat;
        toast("房间已创建：" + res.code);
      } catch (e) {
        toast("建房失败：" + errText2(e));
      }
    }
    async function doJoin(code) {
      const c = String(code || "").trim().toUpperCase();
      if (!c) return toast("填房间号");
      try {
        const d = await roomApi.join(c);
        room.value = d;
        roomCode.value = c;
        mySeat.value = d.mySeat;
        toast("已加入 " + c + " · 你坐 " + d.mySeat);
      } catch (e) {
        toast("加入失败：" + errText2(e));
      }
    }
    async function leaveRoom() {
      try {
        await roomApi.leave(roomCode.value);
      } catch (e) {
      }
      stopPoll();
      roomCode.value = "";
      room.value = null;
      mySeat.value = "";
      await loadRooms();
    }
    async function toggleReady() {
      try {
        room.value = await roomApi.ready(roomCode.value, !myReady.value);
      } catch (e) {
        toast("操作失败：" + errText2(e));
      }
    }
    async function startRoom() {
      try {
        const res = await roomApi.start(roomCode.value);
        stopPoll();
        await enterMatch(res.matchId);
      } catch (e) {
        toast("开局失败：" + errText2(e));
      }
    }
    function copyRoom() {
      var _a, _b;
      try {
        (_b = (_a = navigator.clipboard) == null ? void 0 : _a.writeText(roomCode.value)) == null ? void 0 : _b.catch(() => {
        });
      } catch (e) {
      }
      toast("已复制：" + roomCode.value);
    }
    async function openInvite() {
      invite.value = { open: true, loading: true, friends: [], sent: {}, error: "" };
      try {
        const res = await socialApi.friends();
        invite.value.friends = res && res.items || [];
      } catch (e) {
        invite.value.error = errText2(e) || "好友列表加载失败";
      }
      invite.value.loading = false;
    }
    async function sendInvite(f) {
      try {
        await roomApi.invite(f.id, roomCode.value, r.value.topic_title || "");
        invite.value.sent[f.id] = true;
        toast("邀请已发出");
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "";
        const map = {
          NOT_FRIEND: "你们不是好友，不能邀请",
          INVALID_ROOM_CODE: "房间号格式不对",
          INVALID_TARGET: "邀请对象不对"
        };
        toast(map[code] || "邀请失败：" + errText2(e).slice(0, 40));
      }
    }
    function errText2(e) {
      if (e instanceof ApiError) return e.code || e.message;
      return e && e.message || "";
    }
    function roleTag(s) {
      if (s.occupant !== "USER") return "";
      return String(s.user_id) === String(hostId.value) ? { cls: "tag", text: "房主" } : { cls: "tag g", text: "玩家" };
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        !roomCode.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          _cache[9] || (_cache[9] = createBaseVNode("h1", { class: "pg" }, "多人辩论", -1)),
          _cache[10] || (_cache[10] = createBaseVNode("p", { class: "sub" }, "8 席房间：建房 → 把房间号发给队友 → 全员准备 → 房主开局。空位自动补 AI。", -1)),
          createBaseVNode("div", _hoisted_1$8, [
            createBaseVNode("div", { class: "card" }, [
              _cache[5] || (_cache[5] = createBaseVNode("b", { style: { "font-size": "13px" } }, "① 创建房间", -1)),
              _cache[6] || (_cache[6] = createBaseVNode("p", { style: { "font-size": "12px", "color": "#8a909c", "margin": "8px 0 12px" } }, "随机抽一道题，你坐 A1，房主免准备。", -1)),
              createBaseVNode("button", {
                class: "btn primary",
                style: { "width": "100%" },
                onClick: createRoom
              }, "＋ 建房")
            ]),
            createBaseVNode("div", _hoisted_2$8, [
              _cache[7] || (_cache[7] = createBaseVNode("b", { style: { "font-size": "13px" } }, "② 房间号加入", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => joinCode.value = $event),
                class: "btn ghost",
                style: { "width": "100%", "margin": "10px 0", "text-align": "left", "padding": "8px 12px" },
                placeholder: "SY-XXXX",
                onKeydown: _cache[1] || (_cache[1] = withKeys(($event) => doJoin(joinCode.value), ["enter"]))
              }, null, 544), [
                [vModelText, joinCode.value]
              ]),
              createBaseVNode("button", {
                class: "btn ghost",
                style: { "width": "100%" },
                onClick: _cache[2] || (_cache[2] = ($event) => doJoin(joinCode.value))
              }, "加入")
            ]),
            createBaseVNode("div", _hoisted_3$8, [
              _cache[8] || (_cache[8] = createBaseVNode("b", { style: { "font-size": "13px" } }, "③ 公开房间", -1)),
              createBaseVNode("div", _hoisted_4$8, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(rooms.value, (x) => {
                  return openBlock(), createElementBlock("div", {
                    key: x.code,
                    class: "row",
                    style: { "justify-content": "space-between" }
                  }, [
                    createBaseVNode("span", _hoisted_5$8, toDisplayString(x.code), 1),
                    createBaseVNode("span", _hoisted_6$8, toDisplayString(x.topic_title), 1),
                    createBaseVNode("a", {
                      style: { "color": "#2f5bea", "cursor": "pointer" },
                      onClick: ($event) => doJoin(x.code)
                    }, "加入", 8, _hoisted_7$8)
                  ]);
                }), 128)),
                !rooms.value.length ? (openBlock(), createElementBlock("div", _hoisted_8$7, "现在没有公开房间")) : createCommentVNode("", true)
              ])
            ])
          ])
        ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("div", _hoisted_9$7, [
            createBaseVNode("div", null, [
              createBaseVNode("h1", _hoisted_10$7, toDisplayString(r.value.topic_title || "房间"), 1),
              createBaseVNode("p", _hoisted_11$6, [
                _cache[11] || (_cache[11] = createTextVNode(" 房间 ", -1)),
                createBaseVNode("span", _hoisted_12$5, toDisplayString(roomCode.value), 1),
                createTextVNode(" · " + toDisplayString(r.value.status || "") + " · 真人 " + toDisplayString(room.value && room.value.humans || 0) + "/8 " + toDisplayString(room.value && room.value.isHost ? "· 你是房主" : ""), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_13$5, [
              createBaseVNode("button", {
                class: "btn ghost",
                onClick: copyRoom
              }, "复制房间号"),
              room.value && room.value.isHost ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "btn ghost",
                onClick: openInvite
              }, "邀请好友")) : createCommentVNode("", true),
              createBaseVNode("button", {
                class: "btn ghost",
                onClick: leaveRoom
              }, "退出"),
              room.value && room.value.isHost ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "btn primary",
                disabled: !room.value.canStart,
                onClick: startRoom
              }, " 开始辩论" + toDisplayString(room.value.canStart ? "" : "（" + (room.value.unready || []).length + " 人未准备）"), 9, _hoisted_14$5)) : (openBlock(), createElementBlock("button", {
                key: 2,
                class: "btn primary",
                onClick: toggleReady
              }, toDisplayString(myReady.value ? "取消准备" : "准备"), 1))
            ])
          ]),
          createBaseVNode("div", _hoisted_15$5, [
            _cache[12] || (_cache[12] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "房间号", -1)),
            createBaseVNode("span", _hoisted_16$5, toDisplayString(roomCode.value), 1),
            _cache[13] || (_cache[13] = createBaseVNode("span", { style: { "margin-left": "12px", "font-size": "11.5px", "color": "#8a909c" } }, " 队友在「多人辩论 → 房间号加入」里输入这一串 ", -1))
          ]),
          createBaseVNode("div", _hoisted_17$5, [
            _cache[14] || (_cache[14] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "费用", -1)),
            createBaseVNode("span", _hoisted_18$5, "本场费用由房主承担 · 档位 高级版(" + toDisplayString(roomTier.value) + ")", 1),
            createBaseVNode("span", _hoisted_19$4, " 其余席位不扣费；账单记在房主名下" + toDisplayString(room.value && room.value.isHost ? "（你是房主）" : ""), 1)
          ]),
          createBaseVNode("div", _hoisted_20$4, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(seats.value, (s) => {
              return openBlock(), createElementBlock("div", {
                key: s.seat_key,
                class: normalizeClass(["sp", { me: s.seat_key === mySeat.value }])
              }, [
                createBaseVNode("div", {
                  class: normalizeClass(["av", s.side === "A" ? "a" : "b"])
                }, toDisplayString(s.seat_key === mySeat.value ? "我" : String(s.occupant === "USER" ? s.user_name || "?" : s.occupant === "AI" ? "AI" : "空").slice(0, 1)), 3),
                createBaseVNode("div", null, [
                  createBaseVNode("div", _hoisted_21$4, [
                    createTextVNode(toDisplayString(s.occupant === "USER" ? s.user_name || "未知" : s.occupant === "AI" ? s.user_name || "AI" : "空位") + " ", 1),
                    roleTag(s) ? (openBlock(), createElementBlock("span", {
                      key: 0,
                      class: normalizeClass(roleTag(s).cls)
                    }, toDisplayString(roleTag(s).text), 3)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_22$4, toDisplayString(s.side === "A" ? "正方" : "反方") + toDisplayString(s.role) + toDisplayString(s.ready ? " · 已准备" : ""), 1)
                ])
              ], 2);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_23$4, [
            _cache[16] || (_cache[16] = createBaseVNode("b", { style: { "font-size": "12.5px" } }, "席位", -1)),
            createBaseVNode("table", _hoisted_24$3, [
              _cache[15] || (_cache[15] = createBaseVNode("thead", null, [
                createBaseVNode("tr", null, [
                  createBaseVNode("th", null, "席位"),
                  createBaseVNode("th", null, "辩位"),
                  createBaseVNode("th", null, "占位"),
                  createBaseVNode("th", null, "准备")
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(seats.value, (s) => {
                  return openBlock(), createElementBlock("tr", {
                    key: s.seat_key
                  }, [
                    createBaseVNode("td", _hoisted_25$3, toDisplayString(s.seat_key), 1),
                    createBaseVNode("td", null, toDisplayString(s.role), 1),
                    createBaseVNode("td", null, [
                      s.occupant === "USER" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                        createTextVNode(toDisplayString(s.user_name || "未知") + " ", 1),
                        roleTag(s) ? (openBlock(), createElementBlock("span", {
                          key: 0,
                          class: normalizeClass(roleTag(s).cls)
                        }, toDisplayString(roleTag(s).text), 3)) : createCommentVNode("", true),
                        s.seat_key === mySeat.value ? (openBlock(), createElementBlock("span", _hoisted_26$3, "你")) : createCommentVNode("", true)
                      ], 64)) : s.occupant === "AI" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode("AI")
                      ], 64)) : (openBlock(), createElementBlock("span", _hoisted_27$3, "空位（开局补 AI）"))
                    ]),
                    createBaseVNode("td", null, [
                      s.occupant === "AI" ? (openBlock(), createElementBlock("span", _hoisted_28$3, "就绪")) : s.ready ? (openBlock(), createElementBlock("span", _hoisted_29$3, "已准备")) : (openBlock(), createElementBlock("span", _hoisted_30$3, "未准备"))
                    ])
                  ]);
                }), 128))
              ])
            ])
          ])
        ], 64)),
        invite.value.open ? (openBlock(), createElementBlock("div", {
          key: 2,
          class: "mask",
          onClick: _cache[4] || (_cache[4] = withModifiers(($event) => invite.value.open = false, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_31$3, [
            createBaseVNode("div", _hoisted_32$3, [
              _cache[17] || (_cache[17] = createBaseVNode("b", null, "邀请好友加入", -1)),
              createBaseVNode("button", {
                class: "btn ghost sm",
                onClick: _cache[3] || (_cache[3] = ($event) => invite.value.open = false)
              }, "关闭")
            ]),
            createBaseVNode("p", _hoisted_33$3, [
              _cache[18] || (_cache[18] = createTextVNode(" 房间 ", -1)),
              createBaseVNode("span", _hoisted_34$3, toDisplayString(roomCode.value), 1),
              _cache[19] || (_cache[19] = createTextVNode(" · 对方会收到一张卡片，点一下就能进 ", -1))
            ]),
            createBaseVNode("div", _hoisted_35$3, [
              invite.value.loading ? (openBlock(), createElementBlock("div", _hoisted_36$3, "加载好友…")) : invite.value.error ? (openBlock(), createElementBlock("div", _hoisted_37$3, toDisplayString(invite.value.error), 1)) : invite.value.friends.length ? (openBlock(true), createElementBlock(Fragment, { key: 2 }, renderList(invite.value.friends, (f) => {
                return openBlock(), createElementBlock("div", {
                  key: f.id,
                  class: "fr-row"
                }, [
                  createBaseVNode("div", _hoisted_38$2, toDisplayString(String(f.name || "?").slice(0, 1)), 1),
                  createBaseVNode("div", _hoisted_39$2, [
                    createBaseVNode("div", _hoisted_40$2, toDisplayString(f.name), 1),
                    createBaseVNode("div", _hoisted_41$1, "@" + toDisplayString(f.id), 1)
                  ]),
                  createBaseVNode("div", _hoisted_42$1, [
                    invite.value.sent[f.id] ? (openBlock(), createElementBlock("button", _hoisted_43$1, "已邀请")) : (openBlock(), createElementBlock("button", {
                      key: 1,
                      class: "btn primary",
                      onClick: ($event) => sendInvite(f)
                    }, "邀请", 8, _hoisted_44$1))
                  ])
                ]);
              }), 128)) : (openBlock(), createElementBlock("div", _hoisted_45$1, [..._cache[20] || (_cache[20] = [
                createTextVNode(" 还没有好友", -1),
                createBaseVNode("br", null, null, -1),
                createBaseVNode("span", { class: "sub" }, "先去「好友」页搜人加好友，再回来邀请", -1)
              ])]))
            ])
          ])
        ])) : createCommentVNode("", true)
      ], 64);
    };
  }
};
const CM_TYPES = [
  { k: "ALL", n: "全部" },
  { k: "CHAT", n: "闲聊" },
  { k: "GUIDE", n: "教程" },
  { k: "HELP", n: "求助" }
];
const CM_SORTS = [
  { k: "NEW", n: "最新发布" },
  { k: "COMMENTS", n: "最多评论" },
  { k: "LIKES", n: "最多点赞" },
  { k: "HOT", n: "最热门" }
];
const CM_RANGES = [
  { k: "ALL", n: "全部时间" },
  { k: "3D", n: "3 天内" },
  { k: "7D", n: "7 天内" },
  { k: "OLDER", n: "更早" }
];
const CM_REASONS = [
  ["SPAM", "垃圾广告"],
  ["ABUSE", "人身攻击"],
  ["ILLEGAL", "违法违规"],
  ["OTHER", "其他"]
];
const pad = (n) => String(n).padStart(2, "0");
function typeName(k) {
  const t = CM_TYPES.find((x) => x.k === k);
  return t ? t.n : "闲聊";
}
function rangeName(k) {
  const r = CM_RANGES.find((x) => x.k === k);
  return r ? r.n : "全部时间";
}
function reasonName(k) {
  const r = CM_REASONS.find((x) => x[0] === k);
  return r ? r[1] : k || "";
}
function actionName(a) {
  const m = { IGNORE: "忽略", DELETE: "删除内容", BAN: "禁言", DELETE_AND_BAN: "删除并禁言" };
  return m[a] || a || "";
}
function initial(name) {
  const s = String(name == null ? "" : name).trim();
  return s ? s.slice(0, 1) : "?";
}
function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function typeClass(t) {
  const safe = ["CHAT", "GUIDE", "HELP"].indexOf(t) >= 0 ? t : "CHAT";
  return "ptype ptype-" + safe;
}
function errText(e) {
  const code = String(e && e.code || "");
  const msg = String(e && e.message || "");
  const map = {
    INVALID_PARAM: "参数不合法",
    UNAUTHORIZED: "请先登录",
    SERVICE_UNAVAILABLE: "服务暂时不可用，请稍后再试",
    POST_NOT_FOUND: "帖子已删除或不存在",
    COMMENT_NOT_FOUND: "评论已删除",
    NOT_AUTHOR: "只能操作自己的内容",
    MUTED: "你已被禁言，暂时不能发内容",
    ALREADY_REPORTED: "你已经举报过这条内容",
    ACCOUNT_DISABLED: "账号已被封禁",
    NOT_ADMIN: "没有管理员权限",
    INTERNAL_ERROR: "服务异常，请重试",
    TIMEOUT: "请求超时，请重试",
    NETWORK: "后端未连接"
  };
  const detail = msg.replace(/^[A-Z][A-Z0-9_]*:\s*/, "").trim();
  const base = map[code];
  if (base) return detail && detail !== msg ? base + "（" + detail + "）" : base;
  if (/^HTTP_\d+$/.test(code)) return "后端接口异常（" + code + "）";
  return detail || msg || "操作失败";
}
function normalizeList(res) {
  const r = res || {};
  const items = Array.isArray(r.items) ? r.items : [];
  return { items, total: Number(r.total) || 0, page: Number(r.page) || 1, size: Number(r.size) || items.length };
}
const num = (v) => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};
function timeOf(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return isNaN(t) ? 0 : t;
}
function normalizePost(raw) {
  const r = raw || {};
  return {
    id: r.id,
    type: r.type || "CHAT",
    title: r.title || "",
    body: r.body != null ? r.body : "",
    excerpt: r.excerpt != null ? r.excerpt : "",
    topicId: r.topicId != null ? r.topicId : null,
    topicTitle: r.topicTitle || "",
    authorId: r.authorId,
    authorName: r.authorName || "匿名",
    commentCount: num(r.commentCount),
    likeCount: num(r.likeCount),
    viewCount: num(r.viewCount),
    lastCommentAt: timeOf(r.lastCommentAt),
    createdAt: timeOf(r.createdAt),
    updatedAt: timeOf(r.updatedAt),
    liked: !!r.liked,
    status: r.status
  };
}
function normalizeComment(raw) {
  const r = raw || {};
  const kids = Array.isArray(r.replies) ? r.replies : [];
  return {
    id: r.id,
    postId: r.postId,
    authorId: r.authorId,
    authorName: r.authorName || "匿名",
    isBot: !!r.isBot,
    rootId: r.rootId != null ? r.rootId : null,
    replyObjectType: r.replyObjectType || "POST",
    replyObjectCommentId: r.replyObjectCommentId != null ? r.replyObjectCommentId : null,
    replyObjectUserName: r.replyObjectUserName || "",
    body: r.body != null ? r.body : "",
    likeCount: num(r.likeCount),
    liked: !!r.liked,
    createdAt: timeOf(r.createdAt),
    replies: kids.map(normalizeComment),
    replyCount: num(r.replyCount),
    expanded: false
  };
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function mentionify(html) {
  return String(html == null ? "" : html).replace(
    /@([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g,
    '<span class="mention">@$1</span>'
  );
}
function inline(s) {
  let t = mentionify(esc(s));
  t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2">');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  t = t.replace(/\*([^*]+)\*/g, "<i>$1</i>");
  return t;
}
function markdown(text) {
  const src = String(text == null ? "" : text).replace(/\r/g, "");
  return src.split(/\n{2,}/).map((b) => {
    const lines = b.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return "";
    const h2 = lines[0].match(/^(#{1,3})\s+(.*)$/);
    if (h2 && lines.length === 1) {
      const lv = Math.min(h2[1].length + 1, 3);
      return "<h" + lv + ">" + inline(h2[2]) + "</h" + lv + ">";
    }
    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^[-*]\s+/, "")) + "</li>").join("") + "</ul>";
    }
    if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      return "<ol>" + lines.map((l) => "<li>" + inline(l.replace(/^\d+\.\s+/, "")) + "</li>").join("") + "</ol>";
    }
    return "<p>" + lines.map((l) => inline(l)).join("<br>") + "</p>";
  }).join("");
}
function highlight(text, q) {
  const s = esc(text);
  const qq = String(q || "").trim();
  if (!qq) return s;
  const qe = esc(qq);
  const i = s.toLowerCase().indexOf(qe.toLowerCase());
  if (i < 0) return s;
  return s.slice(0, i) + "<mark>" + s.slice(i, i + qe.length) + "</mark>" + s.slice(i + qe.length);
}
const _hoisted_1$7 = { class: "post-main" };
const _hoisted_2$7 = { class: "post-title" };
const _hoisted_3$7 = ["innerHTML"];
const _hoisted_4$7 = ["innerHTML"];
const _hoisted_5$7 = { class: "post-meta" };
const _hoisted_6$7 = { class: "au" };
const _hoisted_7$7 = { class: "mini-av" };
const _hoisted_8$6 = {
  key: 0,
  class: "mini-tag"
};
const _hoisted_9$6 = { style: { "margin-left": "auto" } };
const _hoisted_10$6 = { class: "post-reply" };
const _sfc_main$7 = {
  __name: "CommunityPostCard",
  props: {
    post: { type: Object, required: true },
    q: { type: String, default: "" }
  },
  emits: ["open"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const topic = computed(() => props.post.topicTitle || props.post.topicId || "");
    const titleHtml = computed(() => highlight(props.post.title, props.q));
    const excerptHtml = computed(() => highlight(props.post.excerpt || "", props.q));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "post",
        onClick: _cache[0] || (_cache[0] = ($event) => emit2("open", __props.post.id))
      }, [
        createBaseVNode("div", _hoisted_1$7, [
          createBaseVNode("div", _hoisted_2$7, [
            createBaseVNode("span", {
              class: normalizeClass(unref(typeClass)(__props.post.type))
            }, toDisplayString(unref(typeName)(__props.post.type)), 3),
            createBaseVNode("em", { innerHTML: titleHtml.value }, null, 8, _hoisted_3$7)
          ]),
          createBaseVNode("div", {
            class: "post-excerpt",
            innerHTML: excerptHtml.value
          }, null, 8, _hoisted_4$7),
          createBaseVNode("div", _hoisted_5$7, [
            createBaseVNode("span", _hoisted_6$7, [
              createBaseVNode("i", _hoisted_7$7, toDisplayString(unref(initial)(__props.post.authorName)), 1),
              createTextVNode(toDisplayString(__props.post.authorName), 1)
            ]),
            topic.value ? (openBlock(), createElementBlock("span", _hoisted_8$6, "辩题 · " + toDisplayString(topic.value), 1)) : createCommentVNode("", true),
            createBaseVNode("span", null, "👁 " + toDisplayString(__props.post.viewCount), 1),
            createBaseVNode("span", null, "👍 " + toDisplayString(__props.post.likeCount), 1),
            createBaseVNode("span", null, "发布 " + toDisplayString(unref(fmt)(__props.post.createdAt)), 1),
            createBaseVNode("span", _hoisted_9$6, "最后回复 · " + toDisplayString(__props.post.lastCommentAt ? unref(fmt)(__props.post.lastCommentAt) : "暂无"), 1)
          ])
        ]),
        createBaseVNode("div", _hoisted_10$6, [
          createBaseVNode("b", null, toDisplayString(__props.post.commentCount), 1),
          _cache[1] || (_cache[1] = createBaseVNode("small", null, "回复", -1))
        ])
      ]);
    };
  }
};
function useMention() {
  const state2 = /* @__PURE__ */ reactive({ open: false, items: [], active: 0, query: "", start: 0, left: 0, top: 0 });
  const picked = /* @__PURE__ */ ref([]);
  let timer = null;
  let el = null;
  function close() {
    state2.open = false;
    state2.items = [];
  }
  async function fetchCandidates(q) {
    try {
      const r = await communityApi.users(q);
      if (state2.query !== q) return;
      state2.items = r && r.items || [];
      state2.active = 0;
      state2.open = state2.items.length > 0;
      if (state2.open && el) {
        const rect = el.getBoundingClientRect();
        state2.left = Math.round(rect.left + 12);
        state2.top = Math.round(rect.bottom + 6);
      }
    } catch (e) {
      close();
    }
  }
  function onInput(e) {
    const target = e.target;
    el = target;
    const v = String(target.value || "");
    const caret = target.selectionStart == null ? v.length : target.selectionStart;
    const upTo = v.slice(0, caret);
    const m = upTo.match(/@([^\s@]{0,20})$/);
    if (!m) return close();
    state2.start = caret - m[0].length;
    state2.query = m[1];
    if (!m[1]) return close();
    clearTimeout(timer);
    timer = setTimeout(() => fetchCandidates(m[1]), 150);
  }
  function onKey(e) {
    if (!state2.open || !state2.items.length) return false;
    const n = state2.items.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state2.active = (state2.active + 1) % n;
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      state2.active = (state2.active - 1 + n) % n;
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      pick(state2.active);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return true;
    }
    return false;
  }
  function pick(i) {
    const it = state2.items[i];
    if (!it || !el) return;
    const v = String(el.value || "");
    const caret = el.selectionStart == null ? v.length : el.selectionStart;
    const before = v.slice(0, state2.start);
    const after = v.slice(caret);
    const insert = "@" + it.name + " ";
    el.value = before + insert + after;
    const pos = (before + insert).length;
    try {
      el.setSelectionRange(pos, pos);
    } catch (e) {
    }
    el.focus();
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (!picked.value.some((x) => x.id === it.id)) picked.value.push({ id: it.id, name: it.name });
    close();
  }
  function ids(text) {
    const body = String(text || "");
    const out = [];
    picked.value.forEach((x) => {
      if (out.length < 10 && body.indexOf("@" + x.name) >= 0 && out.indexOf(x.id) < 0) out.push(x.id);
    });
    return out;
  }
  function reset() {
    picked.value = [];
    close();
  }
  return { state: state2, picked, onInput, onKey, pick, ids, reset, close };
}
const _hoisted_1$6 = { class: "cm-modal" };
const _hoisted_2$6 = {
  class: "cm-field",
  style: { "margin-top": "16px" }
};
const _hoisted_3$6 = { class: "cm-opts three" };
const _hoisted_4$6 = ["onClick"];
const _hoisted_5$6 = { class: "cm-field" };
const _hoisted_6$6 = { class: "cm-field" };
const _hoisted_7$6 = ["value"];
const _hoisted_8$5 = {
  class: "cm-field",
  style: { "margin-bottom": "0" }
};
const _hoisted_9$5 = { class: "cm-modal-foot" };
const _hoisted_10$5 = ["disabled"];
const _hoisted_11$5 = ["onMousedown"];
const _sfc_main$6 = {
  __name: "PostEditorModal",
  props: {
    post: { type: Object, default: null }
    // 有值=编辑，null=新建
  },
  emits: ["close", "saved"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const meta = useMetaStore();
    const mention = useMention();
    const editing = computed(() => !!props.post);
    const type = /* @__PURE__ */ ref(props.post ? props.post.type : "CHAT");
    const title = /* @__PURE__ */ ref(props.post ? props.post.title : "");
    const topicId = /* @__PURE__ */ ref(props.post && props.post.topicId ? String(props.post.topicId) : "");
    const body = /* @__PURE__ */ ref(props.post ? props.post.body : "");
    const busy = /* @__PURE__ */ ref(false);
    const TYPES = [
      ["CHAT", "闲聊", "随便聊聊"],
      ["GUIDE", "教程", "分享经验方法"],
      ["HELP", "求助", "卡住了求指点"]
    ];
    onMounted(() => meta.ensureTopics());
    async function submit() {
      if (busy.value) return;
      const t = title.value.trim();
      const b = body.value.trim();
      if (!t) return toast("先写标题");
      if (!b) return toast("正文还没写");
      busy.value = true;
      try {
        const payload = { type: type.value, title: t, body: b };
        if (editing.value) {
          payload.topicId = topicId.value || null;
          await communityApi.updatePost(props.post.id, payload);
          toast("已保存");
        } else {
          const mentions = mention.ids(b);
          if (mentions.length) payload.mentions = mentions;
          if (topicId.value) payload.topicId = topicId.value;
          const res = await communityApi.createPost(payload);
          toast(String(b).indexOf("＊") >= 0 ? "发布成功，含敏感词已自动打码" : "发布成功");
          emit2("saved", { id: res && res.postId, created: true });
          return;
        }
        emit2("saved", { id: props.post.id, created: false });
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "mask",
        onClick: _cache[7] || (_cache[7] = withModifiers(($event) => emit2("close"), ["self"]))
      }, [
        createBaseVNode("div", _hoisted_1$6, [
          createBaseVNode("h3", null, toDisplayString(editing.value ? "编辑帖子" : "发布帖子"), 1),
          _cache[13] || (_cache[13] = createBaseVNode("div", { class: "page-desc" }, "先选类型，再写标题和正文 · 正文支持 Markdown，图片只能用外链", -1)),
          createBaseVNode("div", _hoisted_2$6, [
            _cache[8] || (_cache[8] = createBaseVNode("div", { class: "cm-field-label" }, "帖子类型", -1)),
            createBaseVNode("div", _hoisted_3$6, [
              (openBlock(), createElementBlock(Fragment, null, renderList(TYPES, (t) => {
                return createBaseVNode("button", {
                  key: t[0],
                  class: normalizeClass(["cm-opt", { on: type.value === t[0] }]),
                  onClick: ($event) => type.value = t[0]
                }, [
                  createBaseVNode("b", null, toDisplayString(t[1]), 1),
                  createBaseVNode("small", null, toDisplayString(t[2]), 1)
                ], 10, _hoisted_4$6);
              }), 64))
            ])
          ]),
          createBaseVNode("div", _hoisted_5$6, [
            _cache[9] || (_cache[9] = createBaseVNode("div", { class: "cm-field-label" }, [
              createTextVNode("标题 "),
              createBaseVNode("span", null, "40 字以内")
            ], -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => title.value = $event),
              class: "cm-input",
              maxlength: "40",
              placeholder: "一句话说清楚你要聊什么"
            }, null, 512), [
              [vModelText, title.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_6$6, [
            _cache[11] || (_cache[11] = createBaseVNode("div", { class: "cm-field-label" }, [
              createTextVNode("关联辩题 "),
              createBaseVNode("span", null, "可选")
            ], -1)),
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => topicId.value = $event),
              class: "cm-input"
            }, [
              _cache[10] || (_cache[10] = createBaseVNode("option", { value: "" }, "不关联辩题", -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(meta).topics, (t) => {
                return openBlock(), createElementBlock("option", {
                  key: t.id,
                  value: String(t.id)
                }, toDisplayString(t.title), 9, _hoisted_7$6);
              }), 128))
            ], 512), [
              [vModelSelect, topicId.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_8$5, [
            _cache[12] || (_cache[12] = createBaseVNode("div", { class: "cm-field-label" }, [
              createTextVNode("正文 "),
              createBaseVNode("span", null, "输入 @ 可以 @ 人")
            ], -1)),
            withDirectives(createBaseVNode("textarea", {
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => body.value = $event),
              class: "cm-textarea",
              placeholder: "展开说说…",
              onInput: _cache[3] || (_cache[3] = (...args) => unref(mention).onInput && unref(mention).onInput(...args)),
              onKeydown: _cache[4] || (_cache[4] = (...args) => unref(mention).onKey && unref(mention).onKey(...args)),
              onBlur: _cache[5] || (_cache[5] = ($event) => _ctx.setTimeout(unref(mention).close, 120))
            }, null, 544), [
              [vModelText, body.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_9$5, [
            createBaseVNode("button", {
              class: "btn",
              onClick: _cache[6] || (_cache[6] = ($event) => emit2("close"))
            }, "取消"),
            createBaseVNode("button", {
              class: "btn btn-primary",
              disabled: busy.value,
              onClick: submit
            }, toDisplayString(busy.value ? "提交中…" : editing.value ? "保存" : "发布"), 9, _hoisted_10$5)
          ])
        ]),
        unref(mention).state.open ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "mention-box",
          style: normalizeStyle({ left: unref(mention).state.left + "px", top: unref(mention).state.top + "px" })
        }, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(unref(mention).state.items, (u, i) => {
            return openBlock(), createElementBlock("div", {
              key: u.id,
              class: normalizeClass(["mention-item", { on: i === unref(mention).state.active }]),
              onMousedown: withModifiers(($event) => unref(mention).pick(i), ["prevent"])
            }, [
              createBaseVNode("b", null, toDisplayString(u.name), 1),
              createBaseVNode("span", null, "@" + toDisplayString(u.name), 1)
            ], 42, _hoisted_11$5);
          }), 128))
        ], 4)) : createCommentVNode("", true)
      ]);
    };
  }
};
const _hoisted_1$5 = { class: "cm-modal" };
const _hoisted_2$5 = { class: "page-desc" };
const _hoisted_3$5 = { style: { "max-height": "52vh", "overflow": "auto", "margin-top": "12px" } };
const _hoisted_4$5 = {
  key: 0,
  style: { "padding": "28px 0", "text-align": "center", "color": "#86909c", "font-size": "13px" }
};
const _hoisted_5$5 = {
  key: 1,
  style: { "padding": "28px 0", "text-align": "center", "color": "#86909c", "font-size": "13px" }
};
const _hoisted_6$5 = { style: { "display": "flex", "align-items": "center", "gap": "8px", "font-size": "12.5px", "color": "#86909c" } };
const _hoisted_7$5 = { class: "mini-tag" };
const _hoisted_8$4 = { style: { "margin-left": "auto" } };
const _hoisted_9$4 = { style: { "margin-top": "6px", "font-size": "13.5px", "color": "#1d2129" } };
const _hoisted_10$4 = {
  key: 0,
  style: { "margin-top": "4px", "font-size": "12.5px", "color": "#86909c" }
};
const _hoisted_11$4 = { style: { "margin-top": "6px", "font-size": "12.5px" } };
const _hoisted_12$4 = {
  key: 0,
  style: { "color": "#b8740a" }
};
const _hoisted_13$4 = {
  key: 1,
  style: { "color": "#86909c" }
};
const _hoisted_14$4 = {
  key: 2,
  style: { "color": "#00b42a" }
};
const _hoisted_15$4 = {
  key: 3,
  style: { "color": "#a9aeb8" }
};
const _hoisted_16$4 = { class: "cm-modal-foot" };
const _hoisted_17$4 = ["disabled"];
const _hoisted_18$4 = ["disabled"];
const _sfc_main$5 = {
  __name: "MyReportsModal",
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const emit2 = __emit;
    const data = /* @__PURE__ */ ref(null);
    const busy = /* @__PURE__ */ ref(false);
    async function load(page = 1) {
      busy.value = true;
      try {
        data.value = await communityApi.myReports(page, 10);
      } catch (e) {
        toast("加载失败：" + errText(e));
        data.value = { items: [], total: 0, page: 1, size: 10 };
      } finally {
        busy.value = false;
      }
    }
    onMounted(() => load(1));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "mask",
        onClick: _cache[3] || (_cache[3] = withModifiers(($event) => emit2("close"), ["self"]))
      }, [
        createBaseVNode("div", _hoisted_1$5, [
          _cache[4] || (_cache[4] = createBaseVNode("h3", null, "我的举报", -1)),
          createBaseVNode("div", _hoisted_2$5, "共 " + toDisplayString(data.value && data.value.total || 0) + " 条 · 处理结果由管理员决定", 1),
          createBaseVNode("div", _hoisted_3$5, [
            !data.value ? (openBlock(), createElementBlock("div", _hoisted_4$5, " 加载中… ")) : !(data.value.items || []).length ? (openBlock(), createElementBlock("div", _hoisted_5$5, " 还没有举报记录 ")) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(data.value && data.value.items || [], (r) => {
              return openBlock(), createElementBlock("div", {
                key: r.id,
                style: { "padding": "12px 0", "border-bottom": "1px solid #f2f3f5" }
              }, [
                createBaseVNode("div", _hoisted_6$5, [
                  createBaseVNode("span", _hoisted_7$5, toDisplayString(r.targetType === "POST" ? "帖子" : "评论"), 1),
                  createBaseVNode("span", null, toDisplayString(unref(reasonName)(r.reason)), 1),
                  createBaseVNode("span", _hoisted_8$4, toDisplayString(unref(fmt)(r.createdAt)), 1)
                ]),
                createBaseVNode("div", _hoisted_9$4, toDisplayString(r.targetSummary || "（内容已删除）"), 1),
                r.detail ? (openBlock(), createElementBlock("div", _hoisted_10$4, " 补充：" + toDisplayString(r.detail), 1)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_11$4, [
                  r.status === "PENDING" ? (openBlock(), createElementBlock("b", _hoisted_12$4, "待处理")) : r.status === "REJECTED" ? (openBlock(), createElementBlock("b", _hoisted_13$4, "已驳回")) : (openBlock(), createElementBlock("b", _hoisted_14$4, "已处理" + toDisplayString(r.action ? "（" + unref(actionName)(r.action) + "）" : ""), 1)),
                  r.handledAt ? (openBlock(), createElementBlock("span", _hoisted_15$4, " · " + toDisplayString(unref(fmt)(r.handledAt)), 1)) : createCommentVNode("", true)
                ])
              ]);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_16$4, [
            data.value && data.value.total > data.value.size ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "btn",
              disabled: (data.value.page || 1) <= 1 || busy.value,
              onClick: _cache[0] || (_cache[0] = ($event) => load((data.value.page || 1) - 1))
            }, " 上一页 ", 8, _hoisted_17$4)) : createCommentVNode("", true),
            data.value && data.value.total > data.value.size ? (openBlock(), createElementBlock("button", {
              key: 1,
              class: "btn",
              disabled: (data.value.page || 1) >= Math.ceil(data.value.total / data.value.size) || busy.value,
              onClick: _cache[1] || (_cache[1] = ($event) => load((data.value.page || 1) + 1))
            }, " 下一页 ", 8, _hoisted_18$4)) : createCommentVNode("", true),
            createBaseVNode("button", {
              class: "btn btn-primary",
              onClick: _cache[2] || (_cache[2] = ($event) => emit2("close"))
            }, "关闭")
          ])
        ])
      ]);
    };
  }
};
const _hoisted_1$4 = { class: "cm" };
const _hoisted_2$4 = { class: "page-head" };
const _hoisted_3$4 = { class: "page-desc" };
const _hoisted_4$4 = { style: { "display": "flex", "gap": "8px", "align-items": "center" } };
const _hoisted_5$4 = {
  key: 0,
  style: { "display": "flex", "align-items": "center", "gap": "10px", "background": "#fff7e8", "border": "1px solid #ffe4ba", "color": "#b8740a", "border-radius": "10px", "padding": "10px 14px", "margin-bottom": "14px", "font-size": "13px" }
};
const _hoisted_6$4 = { class: "comm" };
const _hoisted_7$4 = { class: "comm-main" };
const _hoisted_8$3 = {
  class: "ccard",
  style: { "padding": "14px 16px", "margin-bottom": "14px" }
};
const _hoisted_9$3 = { style: { "display": "flex", "gap": "12px", "flex-wrap": "wrap", "align-items": "center" } };
const _hoisted_10$3 = { class: "sbox" };
const _hoisted_11$3 = { class: "tabs" };
const _hoisted_12$3 = ["onClick"];
const _hoisted_13$3 = { style: { "display": "flex", "gap": "12px", "flex-wrap": "wrap", "align-items": "center", "margin-top": "12px", "padding-top": "12px", "border-top": "1px dashed #f2f3f5" } };
const _hoisted_14$3 = { class: "tabs" };
const _hoisted_15$3 = ["onClick"];
const _hoisted_16$3 = ["value"];
const _hoisted_17$3 = ["value"];
const _hoisted_18$3 = ["value"];
const _hoisted_19$3 = ["value"];
const _hoisted_20$3 = { style: { "font-size": "12.5px", "color": "#86909c" } };
const _hoisted_21$3 = { style: { "display": "flex", "gap": "7px", "flex-wrap": "wrap", "align-items": "center" } };
const _hoisted_22$3 = ["onClick"];
const _hoisted_23$3 = {
  key: 0,
  class: "ccard",
  style: { "padding": "48px", "text-align": "center", "color": "#86909c" }
};
const _hoisted_24$2 = {
  key: 2,
  class: "empty-box"
};
const _hoisted_25$2 = {
  key: 3,
  class: "pager"
};
const _hoisted_26$2 = ["disabled"];
const _hoisted_27$2 = ["disabled"];
const _hoisted_28$2 = { class: "comm-side" };
const _hoisted_29$2 = {
  class: "ccard",
  style: { "padding": "16px 18px", "margin-bottom": "14px" }
};
const _hoisted_30$2 = { class: "cm-stat" };
const _hoisted_31$2 = { class: "cm-stat" };
const _hoisted_32$2 = { style: { "color": "#00b42a" } };
const _hoisted_33$2 = { class: "cm-stat" };
const _hoisted_34$2 = { style: { "color": "#165dff" } };
const _hoisted_35$2 = {
  class: "ccard",
  style: { "padding": "16px 18px", "margin-bottom": "14px" }
};
const _hoisted_36$2 = ["onClick"];
const _hoisted_37$2 = {
  key: 1,
  style: { "font-size": "12.5px", "color": "#a9aeb8" }
};
const _sfc_main$4 = {
  __name: "CommunityView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const auth = useAuthStore();
    const meta = useMetaStore();
    const posts = /* @__PURE__ */ ref([]);
    const total = /* @__PURE__ */ ref(0);
    const loading = /* @__PURE__ */ ref(false);
    const q = /* @__PURE__ */ ref("");
    const type = /* @__PURE__ */ ref("ALL");
    const sort = /* @__PURE__ */ ref("NEW");
    const range = /* @__PURE__ */ ref("ALL");
    const topicId = /* @__PURE__ */ ref("");
    const page = /* @__PURE__ */ ref(1);
    const size2 = /* @__PURE__ */ ref(10);
    const ban = /* @__PURE__ */ ref(null);
    const editorOpen = /* @__PURE__ */ ref(false);
    const myReportsOpen = /* @__PURE__ */ ref(false);
    let searchTimer = null;
    const pages = computed(() => Math.max(1, Math.ceil(total.value / size2.value)));
    const viewsSum = computed(() => posts.value.reduce((a, p2) => a + p2.viewCount, 0));
    const todayNew = computed(() => {
      const d = /* @__PURE__ */ new Date();
      const start2 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return posts.value.filter((p2) => p2.createdAt >= start2).length;
    });
    const hotTopicIds = computed(() => {
      const cnt = {};
      posts.value.forEach((p2) => {
        if (p2.topicId) cnt[p2.topicId] = (cnt[p2.topicId] || 0) + 1;
      });
      return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 8);
    });
    const chips = computed(() => {
      const out = [];
      if (type.value !== "ALL") out.push(["type", "类型：" + typeName(type.value)]);
      if (topicId.value) out.push(["topicId", "辩题：" + topicName(topicId.value)]);
      if (range.value !== "ALL") out.push(["range", "时间：" + rangeName(range.value)]);
      if (q.value.trim()) out.push(["q", "关键词：" + q.value.trim()]);
      return out;
    });
    function topicName(id) {
      const t = (meta.topics || []).find((x) => String(x.id) === String(id));
      return t ? t.title : id;
    }
    async function loadPosts() {
      loading.value = true;
      try {
        const res = await communityApi.posts({
          type: type.value === "ALL" ? "" : type.value,
          title: q.value.trim(),
          topicId: topicId.value,
          range: range.value,
          sort: sort.value,
          page: page.value,
          size: size2.value
        });
        const norm = normalizeList(res);
        posts.value = norm.items.map(normalizePost);
        total.value = norm.total;
      } catch (e) {
        posts.value = [];
        total.value = 0;
        toast("社区列表加载失败：" + errText(e));
      } finally {
        loading.value = false;
      }
    }
    async function loadBan() {
      if (!auth.user) {
        ban.value = null;
        return;
      }
      try {
        ban.value = await communityApi.myBan();
      } catch (e) {
        ban.value = null;
      }
    }
    onMounted(async () => {
      if (route.query.topicId) topicId.value = String(route.query.topicId);
      await Promise.all([meta.ensureTopics(), loadBan()]);
      await loadPosts();
    });
    watch(q, () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        page.value = 1;
        loadPosts();
      }, 280);
    });
    function setFilter(k, v) {
      if (k === "type") type.value = v;
      else if (k === "sort") sort.value = v;
      else if (k === "range") range.value = v;
      else if (k === "topicId") topicId.value = v;
      page.value = 1;
      loadPosts();
    }
    function removeFilter(k) {
      if (k === "type") type.value = "ALL";
      else if (k === "topicId") topicId.value = "";
      else if (k === "range") range.value = "ALL";
      else if (k === "q") q.value = "";
      page.value = 1;
      loadPosts();
    }
    function clearFilters() {
      q.value = "";
      type.value = "ALL";
      topicId.value = "";
      range.value = "ALL";
      page.value = 1;
      loadPosts();
    }
    function goPage(p2) {
      page.value = p2;
      loadPosts();
    }
    function openPost(id) {
      router2.push({ name: "community-post", params: { postId: String(id) } });
    }
    function openEditor() {
      if (!auth.user) {
        toast("请先登录");
        router2.push({ name: "login", query: { next: "/community" } });
        return;
      }
      editorOpen.value = true;
    }
    function onSaved(info) {
      editorOpen.value = false;
      if (info && info.id) {
        router2.push({ name: "community-post", params: { postId: String(info.id) } });
      } else {
        loadPosts();
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        createBaseVNode("div", _hoisted_2$4, [
          createBaseVNode("div", null, [
            _cache[10] || (_cache[10] = createBaseVNode("div", { class: "page-title" }, "社区", -1)),
            createBaseVNode("div", _hoisted_3$4, [
              createTextVNode(toDisplayString(total.value) + " 篇帖子 · 闲聊 / 教程 / 求助，辩完之后来这聊聊 ", 1),
              _cache[9] || (_cache[9] = createBaseVNode("span", {
                class: "mini-tag",
                style: { "margin-left": "6px" }
              }, "接口已接通", -1))
            ])
          ]),
          createBaseVNode("div", _hoisted_4$4, [
            createBaseVNode("button", {
              class: "btn",
              onClick: _cache[0] || (_cache[0] = ($event) => myReportsOpen.value = true)
            }, "我的举报"),
            createBaseVNode("button", {
              class: "btn btn-primary",
              onClick: openEditor
            }, "＋ 发布帖子")
          ])
        ]),
        ban.value && ban.value.banned ? (openBlock(), createElementBlock("div", _hoisted_5$4, [
          _cache[11] || (_cache[11] = createBaseVNode("b", null, "你已被禁言", -1)),
          createBaseVNode("span", null, "至 " + toDisplayString(ban.value.until ? new Date(ban.value.until).toLocaleString() : "") + toDisplayString(ban.value.reason ? " · 原因：" + ban.value.reason : ""), 1),
          _cache[12] || (_cache[12] = createBaseVNode("span", { style: { "opacity": "0.75", "margin-left": "auto" } }, "不能发帖 / 评论 / 编辑 / 点赞，浏览正常", -1))
        ])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_6$4, [
          createBaseVNode("div", _hoisted_7$4, [
            createBaseVNode("div", _hoisted_8$3, [
              createBaseVNode("div", _hoisted_9$3, [
                createBaseVNode("div", _hoisted_10$3, [
                  _cache[13] || (_cache[13] = createBaseVNode("svg", {
                    viewBox: "0 0 24 24",
                    width: "15",
                    height: "15",
                    fill: "none",
                    stroke: "#86909C",
                    "stroke-width": "2",
                    "stroke-linecap": "round"
                  }, [
                    createBaseVNode("circle", {
                      cx: "11",
                      cy: "11",
                      r: "7"
                    }),
                    createBaseVNode("path", { d: "M20 20l-3.6-3.6" })
                  ], -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => q.value = $event),
                    placeholder: "搜索帖子标题…"
                  }, null, 512), [
                    [vModelText, q.value]
                  ]),
                  q.value ? (openBlock(), createElementBlock("button", {
                    key: 0,
                    class: "clr",
                    onClick: _cache[2] || (_cache[2] = ($event) => q.value = "")
                  }, "✕")) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_11$3, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(CM_TYPES), (t) => {
                    return openBlock(), createElementBlock("button", {
                      key: t.k,
                      class: normalizeClass(["tab", { active: type.value === t.k }]),
                      onClick: ($event) => setFilter("type", t.k)
                    }, toDisplayString(t.n), 11, _hoisted_12$3);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_13$3, [
                createBaseVNode("div", _hoisted_14$3, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(CM_SORTS), (s) => {
                    return openBlock(), createElementBlock("button", {
                      key: s.k,
                      class: normalizeClass(["tab", { active: sort.value === s.k }]),
                      onClick: ($event) => setFilter("sort", s.k)
                    }, toDisplayString(s.n), 11, _hoisted_15$3);
                  }), 128))
                ]),
                createBaseVNode("select", {
                  class: "sel",
                  value: range.value,
                  onChange: _cache[3] || (_cache[3] = ($event) => setFilter("range", $event.target.value))
                }, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(CM_RANGES), (r) => {
                    return openBlock(), createElementBlock("option", {
                      key: r.k,
                      value: r.k
                    }, toDisplayString(r.n), 9, _hoisted_17$3);
                  }), 128))
                ], 40, _hoisted_16$3),
                createBaseVNode("select", {
                  class: "sel",
                  value: topicId.value,
                  onChange: _cache[4] || (_cache[4] = ($event) => setFilter("topicId", $event.target.value))
                }, [
                  _cache[14] || (_cache[14] = createBaseVNode("option", { value: "" }, "全部辩题", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(meta).topics, (t) => {
                    return openBlock(), createElementBlock("option", {
                      key: t.id,
                      value: String(t.id)
                    }, toDisplayString(t.title), 9, _hoisted_19$3);
                  }), 128))
                ], 40, _hoisted_18$3),
                createBaseVNode("span", _hoisted_20$3, "共 " + toDisplayString(total.value) + " 篇", 1),
                createBaseVNode("div", _hoisted_21$3, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(chips.value, (c) => {
                    return openBlock(), createElementBlock("span", {
                      key: c[0],
                      class: "fchip"
                    }, [
                      createBaseVNode("b", null, toDisplayString(c[1]), 1),
                      createBaseVNode("i", {
                        onClick: ($event) => removeFilter(c[0])
                      }, "✕", 8, _hoisted_22$3)
                    ]);
                  }), 128))
                ]),
                createBaseVNode("button", {
                  class: "btn btn-sm btn-ghost",
                  style: { "margin-left": "auto" },
                  onClick: clearFilters
                }, "清除全部")
              ])
            ]),
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_23$3, "正在加载…")) : posts.value.length ? (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(posts.value, (p2) => {
              return openBlock(), createBlock(_sfc_main$7, {
                key: p2.id,
                post: p2,
                q: q.value,
                onOpen: openPost
              }, null, 8, ["post", "q"]);
            }), 128)) : (openBlock(), createElementBlock("div", _hoisted_24$2, [
              createTextVNode(" 没有匹配的帖子" + toDisplayString(q.value ? "：搜索「" + q.value + "」" : "") + " ", 1),
              _cache[15] || (_cache[15] = createBaseVNode("br", null, null, -1)),
              createBaseVNode("button", {
                class: "btn btn-sm",
                style: { "margin-top": "14px" },
                onClick: clearFilters
              }, "清除筛选条件")
            ])),
            pages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_25$2, [
              createBaseVNode("button", {
                class: "btn btn-sm",
                disabled: page.value <= 1,
                onClick: _cache[5] || (_cache[5] = ($event) => goPage(page.value - 1))
              }, "上一页", 8, _hoisted_26$2),
              createBaseVNode("span", null, "第 " + toDisplayString(page.value) + " / " + toDisplayString(pages.value) + " 页", 1),
              createBaseVNode("button", {
                class: "btn btn-sm",
                disabled: page.value >= pages.value,
                onClick: _cache[6] || (_cache[6] = ($event) => goPage(page.value + 1))
              }, "下一页", 8, _hoisted_27$2)
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_28$2, [
            createBaseVNode("div", _hoisted_29$2, [
              _cache[19] || (_cache[19] = createBaseVNode("div", { style: { "font-size": "13px", "font-weight": "600", "margin-bottom": "12px" } }, "社区概览", -1)),
              createBaseVNode("div", _hoisted_30$2, [
                _cache[16] || (_cache[16] = createBaseVNode("span", null, "帖子总数", -1)),
                createBaseVNode("b", null, toDisplayString(total.value), 1)
              ]),
              createBaseVNode("div", _hoisted_31$2, [
                _cache[17] || (_cache[17] = createBaseVNode("span", null, "本页今日新增", -1)),
                createBaseVNode("b", _hoisted_32$2, "＋" + toDisplayString(todayNew.value), 1)
              ]),
              createBaseVNode("div", _hoisted_33$2, [
                _cache[18] || (_cache[18] = createBaseVNode("span", null, "本页浏览合计", -1)),
                createBaseVNode("b", _hoisted_34$2, toDisplayString(viewsSum.value), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_35$2, [
              _cache[20] || (_cache[20] = createBaseVNode("div", { style: { "font-size": "13px", "font-weight": "600", "margin-bottom": "11px" } }, [
                createTextVNode(" 热门辩题 "),
                createBaseVNode("span", { style: { "font-size": "11.5px", "color": "#a9aeb8", "font-weight": "400" } }, "点击筛选")
              ], -1)),
              createBaseVNode("div", null, [
                hotTopicIds.value.length ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(hotTopicIds.value, (id) => {
                  return openBlock(), createElementBlock("span", {
                    key: id,
                    class: normalizeClass(["htag", { on: String(topicId.value) === String(id) }]),
                    onClick: ($event) => setFilter("topicId", String(id))
                  }, toDisplayString(topicName(id) || id), 11, _hoisted_36$2);
                }), 128)) : (openBlock(), createElementBlock("span", _hoisted_37$2, "当前列表没有关联辩题的帖子"))
              ])
            ]),
            _cache[21] || (_cache[21] = createBaseVNode("div", {
              class: "ccard",
              style: { "padding": "16px 18px" }
            }, [
              createBaseVNode("div", { style: { "font-size": "13px", "font-weight": "600", "margin-bottom": "10px" } }, "发帖须知"),
              createBaseVNode("div", { style: { "font-size": "12.5px", "color": "#86909c", "line-height": "1.85" } }, [
                createTextVNode(" 只显示昵称，不显示段位 / 积分 / 场次。"),
                createBaseVNode("br"),
                createTextVNode(" 搜索只匹配标题。"),
                createBaseVNode("br"),
                createTextVNode(" 正文支持 Markdown，图片只能用外链。"),
                createBaseVNode("br"),
                createTextVNode(" 点赞只影响热度，不进入任何评分。 ")
              ])
            ], -1))
          ])
        ]),
        editorOpen.value ? (openBlock(), createBlock(_sfc_main$6, {
          key: 1,
          onClose: _cache[7] || (_cache[7] = ($event) => editorOpen.value = false),
          onSaved
        })) : createCommentVNode("", true),
        myReportsOpen.value ? (openBlock(), createBlock(_sfc_main$5, {
          key: 2,
          onClose: _cache[8] || (_cache[8] = ($event) => myReportsOpen.value = false)
        })) : createCommentVNode("", true)
      ]);
    };
  }
};
const _hoisted_1$3 = ["data-cid"];
const _hoisted_2$3 = { class: "reply-av" };
const _hoisted_3$3 = { class: "reply-body" };
const _hoisted_4$3 = { class: "reply-head" };
const _hoisted_5$3 = { style: { "color": "#1d2129", "font-weight": "600" } };
const _hoisted_6$3 = {
  key: 0,
  class: "ai-badge"
};
const _hoisted_7$3 = { class: "reply-time" };
const _hoisted_8$2 = ["innerHTML"];
const _hoisted_9$2 = { class: "reply-like" };
const _hoisted_10$2 = ["data-cid"];
const _hoisted_11$2 = { class: "reply-av" };
const _hoisted_12$2 = { class: "reply-body" };
const _hoisted_13$2 = { class: "reply-head" };
const _hoisted_14$2 = { style: { "color": "#1d2129", "font-weight": "600" } };
const _hoisted_15$2 = {
  key: 0,
  class: "ai-badge"
};
const _hoisted_16$2 = { style: { "color": "#4e5969", "font-weight": "600" } };
const _hoisted_17$2 = { class: "reply-time" };
const _hoisted_18$2 = ["innerHTML"];
const _hoisted_19$2 = { class: "reply-like" };
const _hoisted_20$2 = ["onClick"];
const _hoisted_21$2 = ["onClick"];
const _hoisted_22$2 = ["onClick"];
const _hoisted_23$2 = ["onClick"];
const _sfc_main$3 = {
  __name: "CommentNode",
  props: {
    comment: { type: Object, required: true },
    meId: { type: String, default: "" },
    focusId: { type: [String, Number], default: null }
  },
  emits: ["like", "reply", "remove", "report", "expand"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const isMine = (c) => !!props.meId && String(c.authorId) === String(props.meId);
    const preview = computed(() => {
      const all = props.comment.replies || [];
      return props.comment.expanded ? all : all.slice(0, 3);
    });
    const total = computed(() => props.comment.replyCount || (props.comment.replies || []).length);
    const moreCount = computed(() => total.value - preview.value.length);
    const bodyHtml = (c) => mentionify(esc(c.body));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["reply-item", { "cm-focus": String(__props.focusId) === String(__props.comment.id) }]),
        "data-cid": __props.comment.id
      }, [
        createBaseVNode("div", _hoisted_2$3, toDisplayString(unref(initial)(__props.comment.authorName)), 1),
        createBaseVNode("div", _hoisted_3$3, [
          createBaseVNode("div", _hoisted_4$3, [
            createBaseVNode("b", _hoisted_5$3, toDisplayString(__props.comment.authorName), 1),
            __props.comment.isBot ? (openBlock(), createElementBlock("span", _hoisted_6$3, "AI")) : createCommentVNode("", true),
            createBaseVNode("span", _hoisted_7$3, toDisplayString(unref(fmt)(__props.comment.createdAt)), 1)
          ]),
          createBaseVNode("div", {
            class: "reply-text",
            innerHTML: bodyHtml(__props.comment)
          }, null, 8, _hoisted_8$2),
          createBaseVNode("div", _hoisted_9$2, [
            createBaseVNode("span", {
              onClick: _cache[0] || (_cache[0] = ($event) => emit2("like", __props.comment))
            }, "👍 " + toDisplayString(__props.comment.likeCount) + toDisplayString(__props.comment.liked ? " · 已赞" : ""), 1),
            createBaseVNode("span", {
              onClick: _cache[1] || (_cache[1] = ($event) => emit2("reply", __props.comment))
            }, "回复"),
            isMine(__props.comment) ? (openBlock(), createElementBlock("span", {
              key: 0,
              onClick: _cache[2] || (_cache[2] = ($event) => emit2("remove", __props.comment))
            }, "删除")) : (openBlock(), createElementBlock("span", {
              key: 1,
              onClick: _cache[3] || (_cache[3] = ($event) => emit2("report", "COMMENT", __props.comment.id))
            }, "举报"))
          ]),
          (openBlock(true), createElementBlock(Fragment, null, renderList(preview.value, (r) => {
            return openBlock(), createElementBlock("div", {
              key: r.id,
              class: normalizeClass(["reply-sub", { "cm-focus": String(__props.focusId) === String(r.id) }]),
              "data-cid": r.id
            }, [
              createBaseVNode("div", _hoisted_11$2, toDisplayString(unref(initial)(r.authorName)), 1),
              createBaseVNode("div", _hoisted_12$2, [
                createBaseVNode("div", _hoisted_13$2, [
                  createBaseVNode("b", _hoisted_14$2, toDisplayString(r.authorName), 1),
                  r.isBot ? (openBlock(), createElementBlock("span", _hoisted_15$2, "AI")) : createCommentVNode("", true),
                  _cache[5] || (_cache[5] = createBaseVNode("span", { style: { "color": "#86909c" } }, "回复了", -1)),
                  createBaseVNode("b", _hoisted_16$2, toDisplayString(r.replyObjectUserName || ""), 1),
                  createBaseVNode("span", _hoisted_17$2, toDisplayString(unref(fmt)(r.createdAt)), 1)
                ]),
                createBaseVNode("div", {
                  class: "reply-text",
                  innerHTML: bodyHtml(r)
                }, null, 8, _hoisted_18$2),
                createBaseVNode("div", _hoisted_19$2, [
                  createBaseVNode("span", {
                    onClick: ($event) => emit2("like", r)
                  }, "👍 " + toDisplayString(r.likeCount) + toDisplayString(r.liked ? " · 已赞" : ""), 9, _hoisted_20$2),
                  createBaseVNode("span", {
                    onClick: ($event) => emit2("reply", r)
                  }, "回复", 8, _hoisted_21$2),
                  isMine(r) ? (openBlock(), createElementBlock("span", {
                    key: 0,
                    onClick: ($event) => emit2("remove", r)
                  }, "删除", 8, _hoisted_22$2)) : (openBlock(), createElementBlock("span", {
                    key: 1,
                    onClick: ($event) => emit2("report", "COMMENT", r.id)
                  }, "举报", 8, _hoisted_23$2))
                ])
              ])
            ], 10, _hoisted_10$2);
          }), 128)),
          !__props.comment.expanded && moreCount.value > 0 ? (openBlock(), createElementBlock("div", {
            key: 0,
            style: { "margin-top": "9px", "font-size": "12px", "color": "#165dff", "cursor": "pointer" },
            onClick: _cache[4] || (_cache[4] = ($event) => emit2("expand", __props.comment.id))
          }, " 展开全部 " + toDisplayString(total.value) + " 条回复 ", 1)) : createCommentVNode("", true)
        ])
      ], 10, _hoisted_1$3);
    };
  }
};
const _hoisted_1$2 = { class: "cm-modal" };
const _hoisted_2$2 = {
  class: "cm-field",
  style: { "margin-top": "16px" }
};
const _hoisted_3$2 = { class: "cm-opts" };
const _hoisted_4$2 = ["onClick"];
const _hoisted_5$2 = {
  class: "cm-field",
  style: { "margin-bottom": "0" }
};
const _hoisted_6$2 = { class: "cm-modal-foot" };
const _hoisted_7$2 = ["disabled"];
const _sfc_main$2 = {
  __name: "ReportModal",
  props: {
    targetType: { type: String, required: true },
    // POST | COMMENT
    targetId: { type: [String, Number], required: true }
  },
  emits: ["close", "done"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const reason = /* @__PURE__ */ ref("SPAM");
    const detail = /* @__PURE__ */ ref("");
    const busy = /* @__PURE__ */ ref(false);
    async function submit() {
      if (busy.value) return;
      busy.value = true;
      try {
        const res = await communityApi.report({
          targetType: props.targetType,
          targetId: props.targetId,
          reason: reason.value,
          detail: detail.value.trim() || null
        });
        toast("举报已提交（编号 " + (res && res.reportId) + "）");
        emit2("done");
        emit2("close");
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "mask",
        onClick: _cache[2] || (_cache[2] = withModifiers(($event) => emit2("close"), ["self"]))
      }, [
        createBaseVNode("div", _hoisted_1$2, [
          createBaseVNode("h3", null, "举报" + toDisplayString(__props.targetType === "COMMENT" ? "这条评论" : "这篇帖子"), 1),
          _cache[5] || (_cache[5] = createBaseVNode("div", { class: "page-desc" }, "举报会提交给管理员人工处理，被举报内容不会自动隐藏。", -1)),
          createBaseVNode("div", _hoisted_2$2, [
            _cache[3] || (_cache[3] = createBaseVNode("div", { class: "cm-field-label" }, "举报原因", -1)),
            createBaseVNode("div", _hoisted_3$2, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(CM_REASONS), (r) => {
                return openBlock(), createElementBlock("button", {
                  key: r[0],
                  class: normalizeClass(["cm-opt", { on: reason.value === r[0] }]),
                  onClick: ($event) => reason.value = r[0]
                }, [
                  createBaseVNode("b", null, toDisplayString(r[1]), 1)
                ], 10, _hoisted_4$2);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_5$2, [
            _cache[4] || (_cache[4] = createBaseVNode("div", { class: "cm-field-label" }, [
              createTextVNode("补充说明 "),
              createBaseVNode("span", null, "可选，最多 500 字")
            ], -1)),
            withDirectives(createBaseVNode("textarea", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => detail.value = $event),
              class: "cm-textarea",
              maxlength: "500",
              placeholder: "具体哪里有问题？"
            }, null, 512), [
              [vModelText, detail.value]
            ])
          ]),
          createBaseVNode("div", _hoisted_6$2, [
            createBaseVNode("button", {
              class: "btn",
              onClick: _cache[1] || (_cache[1] = ($event) => emit2("close"))
            }, "取消"),
            createBaseVNode("button", {
              class: "btn btn-primary",
              disabled: busy.value,
              onClick: submit
            }, toDisplayString(busy.value ? "提交中…" : "提交举报"), 9, _hoisted_7$2)
          ])
        ])
      ]);
    };
  }
};
const _hoisted_1$1 = { class: "cm" };
const _hoisted_2$1 = {
  class: "page-head",
  style: { "margin-bottom": "16px" }
};
const _hoisted_3$1 = { style: { "display": "flex", "align-items": "center", "gap": "12px" } };
const _hoisted_4$1 = {
  key: 0,
  style: { "display": "flex", "align-items": "center", "gap": "10px" }
};
const _hoisted_5$1 = { style: { "font-size": "12.5px", "color": "#86909c" } };
const _hoisted_6$1 = {
  key: 0,
  style: { "display": "flex", "align-items": "center", "gap": "10px", "background": "#fff7e8", "border": "1px solid #ffe4ba", "color": "#b8740a", "border-radius": "10px", "padding": "10px 14px", "margin-bottom": "14px", "font-size": "13px" }
};
const _hoisted_7$1 = {
  key: 1,
  class: "ccard",
  style: { "padding": "48px", "text-align": "center", "color": "#86909c" }
};
const _hoisted_8$1 = {
  key: 2,
  class: "comm"
};
const _hoisted_9$1 = { class: "comm-main" };
const _hoisted_10$1 = {
  class: "ccard",
  style: { "padding": "24px 26px" }
};
const _hoisted_11$1 = { style: { "font-size": "20px", "font-weight": "700", "line-height": "1.5", "margin-bottom": "16px" } };
const _hoisted_12$1 = { style: { "display": "flex", "align-items": "center", "gap": "10px", "padding-bottom": "16px", "border-bottom": "1px solid #f2f3f5", "margin-bottom": "18px" } };
const _hoisted_13$1 = {
  class: "reply-av",
  style: { "width": "34px", "height": "34px", "border-radius": "9px" }
};
const _hoisted_14$1 = { style: { "font-size": "13px", "font-weight": "600" } };
const _hoisted_15$1 = { style: { "font-size": "11.5px", "color": "#a9aeb8", "margin-top": "1px" } };
const _hoisted_16$1 = {
  key: 0,
  style: { "margin-left": "auto", "display": "flex", "gap": "8px" }
};
const _hoisted_17$1 = ["innerHTML"];
const _hoisted_18$1 = { style: { "display": "flex", "gap": "10px", "margin-top": "22px", "padding-top": "18px", "border-top": "1px solid #f2f3f5" } };
const _hoisted_19$1 = {
  class: "ccard",
  style: { "padding": "20px 24px", "margin-top": "16px" }
};
const _hoisted_20$1 = { style: { "font-size": "14px", "font-weight": "600", "margin-bottom": "6px" } };
const _hoisted_21$1 = { style: { "color": "#86909c", "font-size": "12.5px", "font-weight": "400" } };
const _hoisted_22$1 = {
  key: 1,
  style: { "padding": "26px 0", "text-align": "center", "color": "#86909c", "font-size": "13px" }
};
const _hoisted_23$1 = {
  key: 2,
  class: "pager"
};
const _hoisted_24$1 = ["disabled"];
const _hoisted_25$1 = ["disabled"];
const _hoisted_26$1 = {
  class: "ccard",
  style: { "padding": "20px 24px", "margin-top": "16px" }
};
const _hoisted_27$1 = {
  key: 0,
  style: { "display": "flex", "align-items": "center", "gap": "8px", "margin-bottom": "10px" }
};
const _hoisted_28$1 = { class: "fchip" };
const _hoisted_29$1 = { style: { "display": "flex", "align-items": "center", "justify-content": "space-between", "margin-top": "12px" } };
const _hoisted_30$1 = { style: { "font-size": "11.5px", "color": "#a9aeb8" } };
const _hoisted_31$1 = { class: "comm-side" };
const _hoisted_32$1 = {
  class: "ccard",
  style: { "padding": "16px 18px", "margin-bottom": "14px" }
};
const _hoisted_33$1 = { class: "cm-stat" };
const _hoisted_34$1 = { class: "cm-stat" };
const _hoisted_35$1 = { class: "cm-stat" };
const _hoisted_36$1 = {
  class: "ccard",
  style: { "padding": "16px 18px" }
};
const _hoisted_37$1 = ["onClick"];
const _hoisted_38$1 = { style: { "flex": "1" } };
const _hoisted_39$1 = {
  key: 1,
  style: { "font-size": "12.5px", "color": "#a9aeb8" }
};
const _hoisted_40$1 = ["onMousedown"];
const _sfc_main$1 = {
  __name: "PostDetailView",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const auth = useAuthStore();
    const meta = useMetaStore();
    const mention = useMention();
    const post = /* @__PURE__ */ ref(null);
    const comments = /* @__PURE__ */ ref([]);
    const commentTotal = /* @__PURE__ */ ref(0);
    const commentPage = /* @__PURE__ */ ref(1);
    const related = /* @__PURE__ */ ref([]);
    const draft = /* @__PURE__ */ ref("");
    const replyTarget = /* @__PURE__ */ ref(null);
    const focus = /* @__PURE__ */ ref(null);
    const editorOpen = /* @__PURE__ */ ref(false);
    const report = /* @__PURE__ */ ref(null);
    const ban = /* @__PURE__ */ ref(null);
    const loading = /* @__PURE__ */ ref(true);
    const meId = computed(() => auth.user && auth.user.id || "");
    const isMine = computed(() => !!post.value && !!meId.value && String(post.value.authorId) === String(meId.value));
    const topic = computed(() => post.value ? post.value.topicTitle || topicName(post.value.topicId) : "");
    const bodyHtml = computed(() => post.value ? markdown(post.value.body) : "");
    const commentPages = computed(() => Math.max(1, Math.ceil(commentTotal.value / 10)));
    function topicName(id) {
      if (!id) return "";
      const t = (meta.topics || []).find((x) => String(x.id) === String(id));
      return t ? t.title : "";
    }
    async function loadPost(id, aroundCommentId) {
      loading.value = true;
      try {
        try {
          await communityApi.markView(id);
        } catch (e) {
        }
        const res = await communityApi.post(id);
        post.value = normalizePost(res && res.post ? res.post : res);
      } catch (e) {
        toast(errText(e));
        router2.replace({ name: "community" });
        return;
      } finally {
        loading.value = false;
      }
      await Promise.all([loadComments(id, 1, aroundCommentId), loadRelated(post.value.type, id)]);
    }
    async function loadComments(postId, page, aroundCommentId) {
      commentPage.value = page || 1;
      try {
        const res = await communityApi.comments(postId, aroundCommentId ? { page: commentPage.value, size: 10, aroundCommentId } : { page: commentPage.value, size: 10 });
        const norm = normalizeList(res);
        comments.value = norm.items.map(normalizeComment);
        commentTotal.value = norm.total;
        if (res && res.page) commentPage.value = Number(res.page) || commentPage.value;
        focus.value = aroundCommentId ? res && res.focus || { commentId: aroundCommentId, rootId: null } : null;
        if (aroundCommentId && !(res && res.focus)) toast("该评论可能已被删除，已跳到第一页");
      } catch (e) {
        comments.value = [];
        commentTotal.value = 0;
        toast("评论加载失败：" + errText(e));
      }
      if (aroundCommentId) nextTick(() => focusJump());
    }
    async function loadRelated(type, exceptId) {
      try {
        const res = await communityApi.posts({ type, sort: "HOT", page: 1, size: 6 });
        related.value = normalizeList(res).items.map(normalizePost).filter((p2) => String(p2.id) !== String(exceptId)).slice(0, 3);
      } catch (e) {
        related.value = [];
      }
    }
    async function loadBan() {
      if (!auth.user) return;
      try {
        ban.value = await communityApi.myBan();
      } catch (e) {
        ban.value = null;
      }
    }
    onMounted(async () => {
      await meta.ensureTopics();
      loadBan();
      const id = route.params.postId;
      const around = route.query.around ? String(route.query.around) : void 0;
      await loadPost(id, around);
    });
    watch(
      () => route.params.postId,
      async (id, old) => {
        if (!id || id === old) return;
        await loadPost(id, void 0);
      }
    );
    async function focusJump() {
      const f = focus.value;
      if (!f) return;
      const rootId = f.rootId;
      const cid = f.commentId;
      if (String(cid) !== String(rootId)) {
        const root = (comments.value || []).find((c) => String(c.id) === String(rootId));
        if (root && !root.expanded) await expandReplies(rootId);
      }
      setTimeout(() => {
        const el = document.querySelector('[data-cid="' + cid + '"]') || document.querySelector('[data-cid="' + rootId + '"]');
        if (!el) return;
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch (e) {
          el.scrollIntoView();
        }
        el.classList.add("cm-focus");
        setTimeout(() => el.classList.remove("cm-focus"), 2e3);
      }, 80);
    }
    async function expandReplies(rootId) {
      try {
        const res = await communityApi.replies(rootId, 1, 50);
        const norm = normalizeList(res);
        const root = comments.value.find((c) => String(c.id) === String(rootId));
        if (root) {
          root.replies = norm.items.map(normalizeComment);
          root.replyCount = norm.total;
          root.expanded = true;
        }
      } catch (e) {
        toast("展开失败：" + errText(e));
      }
    }
    async function toggleLike() {
      const p2 = post.value;
      if (!p2) return;
      const on = !p2.liked;
      p2.liked = on;
      p2.likeCount = Math.max(0, p2.likeCount + (on ? 1 : -1));
      try {
        await communityApi.likePost(p2.id, on);
        const res = await communityApi.post(p2.id);
        post.value = normalizePost(res && res.post ? res.post : res);
        toast(on ? "已点赞" : "已取消点赞");
      } catch (e) {
        p2.liked = !on;
        p2.likeCount = Math.max(0, p2.likeCount + (on ? -1 : 1));
        toast(errText(e));
      }
    }
    async function likeComment(c) {
      const on = !c.liked;
      c.liked = on;
      c.likeCount = Math.max(0, c.likeCount + (on ? 1 : -1));
      try {
        await communityApi.likeComment(c.id, on);
        await loadComments(post.value.id, commentPage.value);
      } catch (e) {
        c.liked = !on;
        c.likeCount = Math.max(0, c.likeCount + (on ? -1 : 1));
        toast(errText(e));
      }
    }
    function startReply(c) {
      replyTarget.value = { commentId: c.id, name: c.authorName };
      nextTick(() => {
        const el = document.querySelector("#replyInput");
        if (el) el.focus();
      });
    }
    async function removeComment(c) {
      if (!window.confirm("删除这条评论？")) return;
      try {
        await communityApi.deleteComment(c.id);
        await loadPost(post.value.id, void 0);
        toast("已删除");
      } catch (e) {
        toast(errText(e));
      }
    }
    async function removePost() {
      if (!window.confirm("删除这篇帖子？删除后其下评论一并不可见")) return;
      try {
        await communityApi.deletePost(post.value.id);
        toast("已删除");
        router2.replace({ name: "community" });
      } catch (e) {
        toast(errText(e));
      }
    }
    async function submitReply() {
      const text = String(draft.value || "").trim();
      if (!text) return toast("写点什么吧");
      if (text.length > 1e3) return toast("评论最多 1000 字");
      const payload = { body: text, replyObjectType: replyTarget.value ? "COMMENT" : "POST" };
      if (replyTarget.value) payload.replyObjectCommentId = replyTarget.value.commentId;
      const mentions = mention.ids(text);
      if (mentions.length) payload.mentions = mentions;
      try {
        const res = await communityApi.addComment(post.value.id, payload);
        draft.value = "";
        replyTarget.value = null;
        mention.reset();
        await loadPost(post.value.id, void 0);
        const newId = res && res.commentId;
        const created = newId ? findComment(newId) : null;
        if (created && String(created.body).indexOf("＊") >= 0) toast("回复已发布，含敏感词已自动打码");
        else toast("回复已发布");
      } catch (e) {
        toast(errText(e));
      }
    }
    function findComment(id) {
      let found = null;
      (comments.value || []).forEach((c) => {
        if (String(c.id) === String(id)) found = c;
        (c.replies || []).forEach((r) => {
          if (String(r.id) === String(id)) found = r;
        });
      });
      return found;
    }
    function openEditor() {
      if (!auth.user) return toast("请先登录");
      editorOpen.value = true;
    }
    function onSaved() {
      editorOpen.value = false;
      if (post.value) loadPost(post.value.id, void 0);
    }
    function openReport(type, id) {
      if (!auth.user) {
        toast("请先登录再举报");
        return;
      }
      report.value = { type, id };
    }
    function back() {
      router2.push({ name: "community" });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("div", _hoisted_3$1, [
            createBaseVNode("button", {
              class: "btn btn-sm",
              onClick: back
            }, "← 返回社区"),
            post.value ? (openBlock(), createElementBlock("span", {
              key: 0,
              class: normalizeClass(unref(typeClass)(post.value.type))
            }, toDisplayString(unref(typeName)(post.value.type)), 3)) : createCommentVNode("", true)
          ]),
          post.value ? (openBlock(), createElementBlock("div", _hoisted_4$1, [
            createBaseVNode("div", _hoisted_5$1, toDisplayString(post.value.viewCount) + " 次浏览 · 最后回复 " + toDisplayString(post.value.lastCommentAt ? unref(fmt)(post.value.lastCommentAt) : "暂无"), 1),
            !isMine.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "btn btn-sm",
              onClick: _cache[0] || (_cache[0] = ($event) => openReport("POST", post.value.id))
            }, "⋯ 举报")) : createCommentVNode("", true)
          ])) : createCommentVNode("", true)
        ]),
        ban.value && ban.value.banned ? (openBlock(), createElementBlock("div", _hoisted_6$1, [
          _cache[11] || (_cache[11] = createBaseVNode("b", null, "你已被禁言", -1)),
          createBaseVNode("span", null, "至 " + toDisplayString(ban.value.until ? new Date(ban.value.until).toLocaleString() : "") + toDisplayString(ban.value.reason ? " · 原因：" + ban.value.reason : ""), 1),
          _cache[12] || (_cache[12] = createBaseVNode("span", { style: { "opacity": "0.75", "margin-left": "auto" } }, "不能发帖 / 评论 / 编辑 / 点赞，浏览正常", -1))
        ])) : createCommentVNode("", true),
        loading.value && !post.value ? (openBlock(), createElementBlock("div", _hoisted_7$1, " 正在加载帖子… ")) : post.value ? (openBlock(), createElementBlock("div", _hoisted_8$1, [
          createBaseVNode("div", _hoisted_9$1, [
            createBaseVNode("div", _hoisted_10$1, [
              createBaseVNode("h2", _hoisted_11$1, toDisplayString(post.value.title), 1),
              createBaseVNode("div", _hoisted_12$1, [
                createBaseVNode("div", _hoisted_13$1, toDisplayString(unref(initial)(post.value.authorName)), 1),
                createBaseVNode("div", null, [
                  createBaseVNode("div", _hoisted_14$1, toDisplayString(post.value.authorName), 1),
                  createBaseVNode("div", _hoisted_15$1, " 发布于 " + toDisplayString(unref(fmt)(post.value.createdAt)) + toDisplayString(topic.value ? " · 辩题「" + topic.value + "」" : ""), 1)
                ]),
                isMine.value ? (openBlock(), createElementBlock("div", _hoisted_16$1, [
                  createBaseVNode("button", {
                    class: "btn btn-sm",
                    onClick: openEditor
                  }, "编辑"),
                  createBaseVNode("button", {
                    class: "btn btn-sm",
                    onClick: removePost
                  }, "删除")
                ])) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", {
                class: "post-body",
                innerHTML: bodyHtml.value
              }, null, 8, _hoisted_17$1),
              createBaseVNode("div", _hoisted_18$1, [
                createBaseVNode("button", {
                  class: normalizeClass(["btn", { "btn-primary": post.value.liked }]),
                  onClick: toggleLike
                }, " 👍 " + toDisplayString(post.value.liked ? "已赞" : "点赞") + " " + toDisplayString(post.value.likeCount), 3)
              ])
            ]),
            createBaseVNode("div", _hoisted_19$1, [
              createBaseVNode("div", _hoisted_20$1, [
                _cache[13] || (_cache[13] = createTextVNode(" 全部回复 ", -1)),
                createBaseVNode("span", _hoisted_21$1, "（" + toDisplayString(post.value.commentCount) + "）", 1)
              ]),
              comments.value.length ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(comments.value, (c) => {
                return openBlock(), createBlock(_sfc_main$3, {
                  key: c.id,
                  comment: c,
                  "me-id": meId.value,
                  "focus-id": focus.value ? focus.value.commentId : null,
                  onLike: likeComment,
                  onReply: startReply,
                  onRemove: removeComment,
                  onReport: openReport,
                  onExpand: expandReplies
                }, null, 8, ["comment", "me-id", "focus-id"]);
              }), 128)) : (openBlock(), createElementBlock("div", _hoisted_22$1, " 还没有回复，来抢沙发 ")),
              commentPages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_23$1, [
                createBaseVNode("button", {
                  class: "btn btn-sm",
                  disabled: commentPage.value <= 1,
                  onClick: _cache[1] || (_cache[1] = ($event) => loadComments(post.value.id, commentPage.value - 1))
                }, "上一页", 8, _hoisted_24$1),
                createBaseVNode("span", null, "第 " + toDisplayString(commentPage.value) + " / " + toDisplayString(commentPages.value) + " 页", 1),
                createBaseVNode("button", {
                  class: "btn btn-sm",
                  disabled: commentPage.value >= commentPages.value,
                  onClick: _cache[2] || (_cache[2] = ($event) => loadComments(post.value.id, commentPage.value + 1))
                }, "下一页", 8, _hoisted_25$1)
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_26$1, [
              _cache[14] || (_cache[14] = createBaseVNode("div", { style: { "font-size": "14px", "font-weight": "600", "margin-bottom": "12px" } }, "写回复", -1)),
              replyTarget.value ? (openBlock(), createElementBlock("div", _hoisted_27$1, [
                createBaseVNode("span", _hoisted_28$1, [
                  createBaseVNode("b", null, "回复 " + toDisplayString(replyTarget.value.name), 1),
                  createBaseVNode("i", {
                    onClick: _cache[3] || (_cache[3] = ($event) => replyTarget.value = null)
                  }, "✕")
                ])
              ])) : createCommentVNode("", true),
              withDirectives(createBaseVNode("textarea", {
                id: "replyInput",
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => draft.value = $event),
                maxlength: "1000",
                placeholder: "说说你的看法…（输入 @ 可以 @ 人）",
                style: { "width": "100%", "min-height": "96px", "border": "1px solid #e5e6eb", "border-radius": "9px", "padding": "12px 14px", "font-size": "14px", "line-height": "1.7", "outline": "none", "resize": "vertical", "font-family": "inherit" },
                onInput: _cache[5] || (_cache[5] = (...args) => unref(mention).onInput && unref(mention).onInput(...args)),
                onKeydown: _cache[6] || (_cache[6] = (...args) => unref(mention).onKey && unref(mention).onKey(...args)),
                onBlur: _cache[7] || (_cache[7] = ($event) => _ctx.setTimeout(unref(mention).close, 120))
              }, null, 544), [
                [vModelText, draft.value]
              ]),
              createBaseVNode("div", _hoisted_29$1, [
                createBaseVNode("span", _hoisted_30$1, toDisplayString(String(draft.value || "").length) + " / 1000", 1),
                createBaseVNode("button", {
                  class: "btn btn-primary btn-sm",
                  onClick: submitReply
                }, "发布回复")
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_31$1, [
            createBaseVNode("div", _hoisted_32$1, [
              _cache[18] || (_cache[18] = createBaseVNode("div", { style: { "font-size": "13px", "font-weight": "600", "margin-bottom": "12px" } }, "本帖数据", -1)),
              createBaseVNode("div", _hoisted_33$1, [
                _cache[15] || (_cache[15] = createBaseVNode("span", null, "浏览", -1)),
                createBaseVNode("b", null, toDisplayString(post.value.viewCount), 1)
              ]),
              createBaseVNode("div", _hoisted_34$1, [
                _cache[16] || (_cache[16] = createBaseVNode("span", null, "回复", -1)),
                createBaseVNode("b", null, toDisplayString(post.value.commentCount), 1)
              ]),
              createBaseVNode("div", _hoisted_35$1, [
                _cache[17] || (_cache[17] = createBaseVNode("span", null, "点赞", -1)),
                createBaseVNode("b", null, toDisplayString(post.value.likeCount), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_36$1, [
              _cache[19] || (_cache[19] = createBaseVNode("div", { style: { "font-size": "13px", "font-weight": "600", "margin-bottom": "11px" } }, "相关帖子", -1)),
              related.value.length ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(related.value, (x) => {
                return openBlock(), createElementBlock("div", {
                  key: x.id,
                  class: "side-item",
                  style: { "cursor": "pointer", "align-items": "flex-start", "line-height": "1.5" },
                  onClick: ($event) => unref(router2).push({ name: "community-post", params: { postId: String(x.id) } })
                }, [
                  createBaseVNode("span", {
                    class: normalizeClass(unref(typeClass)(x.type)),
                    style: { "transform": "scale(0.9)" }
                  }, toDisplayString(unref(typeName)(x.type)), 3),
                  createBaseVNode("span", _hoisted_38$1, toDisplayString(String(x.title || "").slice(0, 18)) + "…", 1)
                ], 8, _hoisted_37$1);
              }), 128)) : (openBlock(), createElementBlock("div", _hoisted_39$1, "暂无"))
            ])
          ])
        ])) : createCommentVNode("", true),
        unref(mention).state.open ? (openBlock(), createElementBlock("div", {
          key: 3,
          class: "mention-box",
          style: normalizeStyle({ left: unref(mention).state.left + "px", top: unref(mention).state.top + "px" })
        }, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(unref(mention).state.items, (u, i) => {
            return openBlock(), createElementBlock("div", {
              key: u.id,
              class: normalizeClass(["mention-item", { on: i === unref(mention).state.active }]),
              onMousedown: withModifiers(($event) => unref(mention).pick(i), ["prevent"])
            }, [
              createBaseVNode("b", null, toDisplayString(u.name), 1),
              createBaseVNode("span", null, "@" + toDisplayString(u.name), 1)
            ], 42, _hoisted_40$1);
          }), 128))
        ], 4)) : createCommentVNode("", true),
        editorOpen.value && post.value ? (openBlock(), createBlock(_sfc_main$6, {
          key: 4,
          post: post.value,
          onClose: _cache[8] || (_cache[8] = ($event) => editorOpen.value = false),
          onSaved
        }, null, 8, ["post"])) : createCommentVNode("", true),
        report.value ? (openBlock(), createBlock(_sfc_main$2, {
          key: 5,
          "target-type": report.value.type,
          "target-id": report.value.id,
          onClose: _cache[9] || (_cache[9] = ($event) => report.value = null),
          onDone: _cache[10] || (_cache[10] = ($event) => report.value = null)
        }, null, 8, ["target-type", "target-id"])) : createCommentVNode("", true)
      ]);
    };
  }
};
const _hoisted_1 = { class: "vwrap" };
const _hoisted_2 = { class: "vtop" };
const _hoisted_3 = { style: { "font-size": "12.5px", "color": "#9aa0ae" } };
const _hoisted_4 = { class: "vfilter" };
const _hoisted_5 = ["onClick"];
const _hoisted_6 = {
  key: 0,
  class: "vempty"
};
const _hoisted_7 = ["src"];
const _hoisted_8 = { class: "vside" };
const _hoisted_9 = ["onClick"];
const _hoisted_10 = ["onClick"];
const _hoisted_11 = ["onClick"];
const _hoisted_12 = { class: "vinfo" };
const _hoisted_13 = { class: "vtags" };
const _hoisted_14 = {
  key: 0,
  class: "vtag"
};
const _hoisted_15 = {
  key: 1,
  class: "vtag o"
};
const _hoisted_16 = {
  key: 2,
  class: "vtag"
};
const _hoisted_17 = { class: "vby" };
const _hoisted_18 = { class: "vsheet" };
const _hoisted_19 = { class: "vshd" };
const _hoisted_20 = { class: "vsbd" };
const _hoisted_21 = {
  key: 0,
  class: "vempty"
};
const _hoisted_22 = { class: "vcard" };
const _hoisted_23 = { class: "vkv" };
const _hoisted_24 = { class: "vkv" };
const _hoisted_25 = { style: { "display": "flex", "gap": "8px", "margin": "12px 0" } };
const _hoisted_26 = { key: 0 };
const _hoisted_27 = { class: "vwho" };
const _hoisted_28 = {
  key: 1,
  class: "vempty"
};
const _hoisted_29 = { class: "vfield" };
const _hoisted_30 = { class: "vfield" };
const _hoisted_31 = { class: "vfield" };
const _hoisted_32 = { class: "vfield" };
const _hoisted_33 = { class: "vrow" };
const _hoisted_34 = {
  class: "vfield",
  style: { "flex": "1" }
};
const _hoisted_35 = ["value"];
const _hoisted_36 = {
  class: "vfield",
  style: { "flex": "1" }
};
const _hoisted_37 = ["disabled"];
const _hoisted_38 = {
  key: 0,
  style: { "margin-top": "12px" }
};
const _hoisted_39 = {
  key: 0,
  class: "vempty"
};
const _hoisted_40 = {
  key: 1,
  class: "vcard",
  style: { "color": "#e5484d" }
};
const _hoisted_41 = {
  key: 2,
  class: "vcard"
};
const _hoisted_42 = { class: "vkv" };
const _hoisted_43 = { class: "vkv" };
const _hoisted_44 = { style: { "text-align": "right", "max-width": "62%" } };
const _hoisted_45 = { class: "vkv" };
const _hoisted_46 = { class: "vcard" };
const _hoisted_47 = { class: "vkv" };
const _hoisted_48 = { class: "vkv" };
const _hoisted_49 = { class: "vkv" };
const _hoisted_50 = { style: { "color": "#e8b279" } };
const _hoisted_51 = { class: "vkv" };
const _hoisted_52 = {
  class: "vrow",
  style: { "margin-bottom": "12px", "margin-top": "12px" }
};
const _hoisted_53 = ["onClick"];
const _hoisted_54 = {
  key: 0,
  class: "vempty"
};
const _hoisted_55 = ["onClick"];
const _hoisted_56 = { style: { "flex": "1", "min-width": "0" } };
const _hoisted_57 = { style: { "display": "block", "overflow": "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" } };
const _hoisted_58 = { style: { "font-size": "12px", "color": "#9aa0ae", "margin-top": "3px" } };
const _hoisted_59 = { style: { "font-size": "12px", "color": "#9aa0ae" } };
const _hoisted_60 = {
  key: 0,
  class: "vempty"
};
const _hoisted_61 = { class: "vcard" };
const _hoisted_62 = { class: "vkv" };
const _hoisted_63 = { class: "vkv" };
const _hoisted_64 = { class: "vkv" };
const _hoisted_65 = {
  class: "vrow",
  style: { "margin": "12px 0" }
};
const _hoisted_66 = { style: { "margin-top": "8px" } };
const _hoisted_67 = { class: "vwho" };
const _hoisted_68 = {
  key: 0,
  class: "vempty"
};
const _sfc_main = {
  __name: "VideoView",
  setup(__props) {
    const auth = useAuthStore();
    const SEGS = ["", "立论", "驳立论", "质询", "自由辩", "总结", "名场面"];
    const list = /* @__PURE__ */ ref([]);
    const cursor = /* @__PURE__ */ ref(0);
    const stats = /* @__PURE__ */ ref({});
    const seg = /* @__PURE__ */ ref("");
    const loading = /* @__PURE__ */ ref(false);
    const consoleEnabled = /* @__PURE__ */ ref(false);
    const feedEl = /* @__PURE__ */ ref(null);
    const sheet = /* @__PURE__ */ ref(null);
    const sheetTitle = /* @__PURE__ */ ref("视频");
    const detail = /* @__PURE__ */ ref(null);
    const publishResult = /* @__PURE__ */ ref(null);
    const publishing = /* @__PURE__ */ ref(false);
    const commentDraft = /* @__PURE__ */ ref("");
    const auditList = /* @__PURE__ */ ref([]);
    const auditStats = /* @__PURE__ */ ref({});
    const auditStatus = /* @__PURE__ */ ref("REVIEW");
    const auditDetail = /* @__PURE__ */ ref(null);
    const auditReason = /* @__PURE__ */ ref("内容与辩论无关");
    const pTitle = /* @__PURE__ */ ref("");
    const pDesc = /* @__PURE__ */ ref("");
    const pUrl = /* @__PURE__ */ ref("https://www.w3schools.com/html/mov_bbb.mp4");
    const pTopic = /* @__PURE__ */ ref("");
    const pSeg = /* @__PURE__ */ ref("名场面");
    const pSide = /* @__PURE__ */ ref("正");
    const passedCount = computed(() => stats.value.passed || 0);
    let io = null;
    async function loadFeed(reset) {
      if (loading.value) return;
      loading.value = true;
      try {
        if (reset) {
          list.value = [];
          cursor.value = 0;
        }
        const d = await videoApi.feed(cursor.value, seg.value);
        list.value = list.value.concat(d && d.list || []);
        cursor.value = d && d.nextCursor || 0;
        stats.value = d && d.stats || {};
        await nextTick();
        bindPlayers();
      } catch (e) {
        toast("加载失败：" + errText2(e));
      } finally {
        loading.value = false;
      }
    }
    function bindPlayers() {
      const box = feedEl.value;
      if (!box) return;
      if (io) io.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            const v = e.target.querySelector("video");
            if (!v) return;
            if (e.isIntersecting) v.play().catch(() => {
            });
            else v.pause();
          });
        },
        { threshold: 0.6 }
      );
      box.querySelectorAll(".vslide").forEach((s) => io.observe(s));
    }
    function onFeedScroll() {
      const box = feedEl.value;
      if (!box) return;
      if (box.scrollTop + box.clientHeight > box.scrollHeight - 240) loadFeed(false);
    }
    onMounted(async () => {
      await loadFeed(true);
      try {
        const r = await videoApi.rules();
        consoleEnabled.value = !!(r && r.consoleEnabled);
      } catch (e) {
        consoleEnabled.value = false;
      }
    });
    onBeforeUnmount(() => {
      if (io) io.disconnect();
    });
    function switchSeg(s) {
      if (seg.value === s) return;
      seg.value = s;
      loadFeed(true);
    }
    async function toggleLike(v) {
      if (!auth.user) {
        toast("先登录再点赞");
        return;
      }
      try {
        const d = await videoApi.like(v.id, v.liked);
        v.liked = !!d.liked;
        v.likes = d.likes;
      } catch (e) {
        toast(errText2(e));
      }
    }
    function share(v) {
      const url = location.origin + location.pathname + "#v" + v.id;
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {
      });
      toast("链接已复制");
    }
    async function openComments(v) {
      sheet.value = "comments";
      sheetTitle.value = "评论";
      detail.value = null;
      try {
        detail.value = await videoApi.detail(v.id);
      } catch (e) {
        toast(errText2(e));
      }
    }
    async function sendComment() {
      const text = String(commentDraft.value || "").trim();
      if (!text) return;
      try {
        await videoApi.comment(detail.value.video.id, text);
        commentDraft.value = "";
        detail.value = await videoApi.detail(detail.value.video.id);
        loadFeed(true);
      } catch (e) {
        toast(errText2(e));
      }
    }
    function openPublish() {
      if (!auth.user) {
        toast("先登录再发布");
        return;
      }
      publishResult.value = null;
      sheet.value = "publish";
      sheetTitle.value = "发布辩论视频";
    }
    async function publish() {
      const title = String(pTitle.value || "").trim();
      if (!title) return toast("先写标题");
      publishing.value = true;
      publishResult.value = { pending: true };
      try {
        const d = await videoApi.publish({
          title,
          description: pDesc.value,
          url: pUrl.value,
          topic: pTopic.value,
          segment: pSeg.value,
          side: pSide.value,
          durationSec: 30
        });
        publishResult.value = d;
        if (d && d.visible) loadFeed(true);
      } catch (e) {
        publishResult.value = { error: errText2(e) };
      } finally {
        publishing.value = false;
      }
    }
    async function openAudit() {
      sheet.value = "audit";
      sheetTitle.value = "审核台";
      await loadQueue("REVIEW");
    }
    async function loadQueue(status) {
      auditStatus.value = status;
      try {
        const d = await videoApi.queue(status, 50);
        auditList.value = d && d.list || [];
        auditStats.value = d && d.stats || {};
      } catch (e) {
        toast(errText2(e));
      }
    }
    async function openAuditDetail(v) {
      sheet.value = "auditDetail";
      sheetTitle.value = "审核详情";
      auditDetail.value = null;
      try {
        auditDetail.value = await videoApi.logs(v.id);
      } catch (e) {
        toast(errText2(e));
      }
    }
    async function decide(id, decision) {
      try {
        await videoApi.decide(id, decision, decision === "REJECT" ? auditReason.value || "人工驳回" : "");
        toast(decision === "PASS" ? "已通过，已上广场" : "已驳回");
        loadFeed(true);
        await loadQueue(auditStatus.value);
        sheet.value = "audit";
      } catch (e) {
        toast(errText2(e));
      }
    }
    async function restore(id) {
      try {
        const d = await videoApi.restore(id);
        toast("已恢复至 " + (d && d.restoredTo));
        loadFeed(true);
        await loadQueue(auditStatus.value);
        sheet.value = "audit";
      } catch (e) {
        toast(errText2(e));
      }
    }
    const PILL = {
      PASSED: ["ok", "已通过"],
      REVIEW: ["warn", "待复核"],
      PENDING: ["warn", "待初审"],
      REJECTED: ["bad", "已驳回"]
    };
    function pill(st) {
      const m = PILL[st] || ["warn", st || "-"];
      return { cls: m[0], text: m[1] };
    }
    function errText2(e) {
      if (e instanceof ApiError) return e.code && e.code !== "HTTP_400" ? e.code + "：" + e.message : e.message;
      return e && e.message || "操作失败";
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[14] || (_cache[14] = createBaseVNode("b", { style: { "font-size": "16px" } }, "视频", -1)),
          createBaseVNode("span", _hoisted_3, "辩论短视频 · " + toDisplayString(passedCount.value) + " 条在架", 1),
          _cache[15] || (_cache[15] = createBaseVNode("span", { style: { "flex": "1" } }, null, -1)),
          createBaseVNode("button", {
            class: "btn sm ghost",
            onClick: openPublish
          }, "发布"),
          consoleEnabled.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            class: "btn sm ghost",
            onClick: openAudit
          }, "审核台")) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_4, [
          (openBlock(), createElementBlock(Fragment, null, renderList(SEGS, (s) => {
            return createBaseVNode("button", {
              key: s || "all",
              class: normalizeClass(["vseg", { on: seg.value === s }]),
              onClick: ($event) => switchSeg(s)
            }, toDisplayString(s || "全部"), 11, _hoisted_5);
          }), 64))
        ]),
        createBaseVNode("div", {
          ref_key: "feedEl",
          ref: feedEl,
          class: "vfeed",
          onScroll: onFeedScroll
        }, [
          !list.value.length ? (openBlock(), createElementBlock("div", _hoisted_6, toDisplayString(loading.value ? "加载中…" : "这个筛选下还没有过审的视频"), 1)) : createCommentVNode("", true),
          (openBlock(true), createElementBlock(Fragment, null, renderList(list.value, (v) => {
            return openBlock(), createElementBlock("div", {
              key: v.id,
              class: "vslide"
            }, [
              _cache[18] || (_cache[18] = createBaseVNode("div", { class: "vwater" }, "辩", -1)),
              createBaseVNode("video", {
                src: v.url,
                preload: "metadata",
                playsinline: "",
                muted: "",
                loop: ""
              }, null, 8, _hoisted_7),
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("button", {
                  class: normalizeClass({ on: v.liked }),
                  onClick: ($event) => toggleLike(v)
                }, [
                  createBaseVNode("span", null, toDisplayString(v.liked ? "♥" : "♡"), 1),
                  createBaseVNode("i", null, toDisplayString(v.likes || 0), 1)
                ], 10, _hoisted_9),
                createBaseVNode("button", {
                  onClick: ($event) => openComments(v)
                }, [
                  _cache[16] || (_cache[16] = createBaseVNode("span", null, "💬", -1)),
                  createBaseVNode("i", null, toDisplayString(v.comments || 0), 1)
                ], 8, _hoisted_10),
                createBaseVNode("button", {
                  onClick: ($event) => share(v)
                }, [..._cache[17] || (_cache[17] = [
                  createBaseVNode("span", null, "↗", -1),
                  createBaseVNode("i", null, "分享", -1)
                ])], 8, _hoisted_11)
              ]),
              createBaseVNode("div", _hoisted_12, [
                createBaseVNode("div", _hoisted_13, [
                  v.segment ? (openBlock(), createElementBlock("span", _hoisted_14, toDisplayString(v.segment), 1)) : createCommentVNode("", true),
                  v.topic ? (openBlock(), createElementBlock("span", _hoisted_15, toDisplayString(v.topic), 1)) : createCommentVNode("", true),
                  v.side ? (openBlock(), createElementBlock("span", _hoisted_16, toDisplayString(v.side) + "方", 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("h3", null, toDisplayString(v.title), 1),
                createBaseVNode("div", _hoisted_17, toDisplayString(v.author || "匿名辩手") + " · " + toDisplayString(v.views || 0) + " 次播放" + toDisplayString(v.duration_sec ? " · " + v.duration_sec + "s" : ""), 1)
              ])
            ]);
          }), 128))
        ], 544),
        sheet.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "vmask show",
          onClick: _cache[13] || (_cache[13] = withModifiers(($event) => sheet.value = null, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_18, [
            createBaseVNode("div", _hoisted_19, [
              createBaseVNode("b", null, toDisplayString(sheetTitle.value), 1),
              _cache[19] || (_cache[19] = createBaseVNode("span", { style: { "flex": "1" } }, null, -1)),
              createBaseVNode("button", {
                class: "btn sm ghost",
                onClick: _cache[0] || (_cache[0] = ($event) => sheet.value = null)
              }, "关闭")
            ]),
            createBaseVNode("div", _hoisted_20, [
              sheet.value === "comments" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                !detail.value ? (openBlock(), createElementBlock("div", _hoisted_21, "加载中…")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createBaseVNode("div", _hoisted_22, [
                    createBaseVNode("b", null, toDisplayString(detail.value.video.title), 1),
                    createBaseVNode("div", _hoisted_23, [
                      _cache[20] || (_cache[20] = createBaseVNode("span", null, "作者", -1)),
                      createBaseVNode("b", null, toDisplayString(detail.value.video.author || "匿名"), 1)
                    ]),
                    createBaseVNode("div", _hoisted_24, [
                      _cache[21] || (_cache[21] = createBaseVNode("span", null, "审核", -1)),
                      createBaseVNode("b", null, [
                        createBaseVNode("span", {
                          class: normalizeClass(["vpill", pill(detail.value.video.audit_status).cls])
                        }, toDisplayString(pill(detail.value.video.audit_status).text), 3)
                      ])
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_25, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => commentDraft.value = $event),
                      class: "vinput",
                      placeholder: "说点什么…",
                      onKeydown: withKeys(sendComment, ["enter"])
                    }, null, 544), [
                      [vModelText, commentDraft.value]
                    ]),
                    createBaseVNode("button", {
                      class: "btn sm primary",
                      onClick: sendComment
                    }, "发送")
                  ]),
                  (detail.value.comments || []).length ? (openBlock(), createElementBlock("div", _hoisted_26, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(detail.value.comments, (c) => {
                      return openBlock(), createElementBlock("div", {
                        key: c.id,
                        class: "vcmt"
                      }, [
                        createBaseVNode("div", _hoisted_27, toDisplayString(c.author || "匿名"), 1),
                        createTextVNode(" " + toDisplayString(c.content), 1)
                      ]);
                    }), 128))
                  ])) : (openBlock(), createElementBlock("div", _hoisted_28, "还没有评论"))
                ], 64))
              ], 64)) : sheet.value === "publish" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                createBaseVNode("div", _hoisted_29, [
                  _cache[22] || (_cache[22] = createBaseVNode("label", null, "标题", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => pTitle.value = $event),
                    class: "vinput",
                    placeholder: "例如：质询名场面：三句话逼出对方口径矛盾"
                  }, null, 512), [
                    [vModelText, pTitle.value]
                  ])
                ]),
                createBaseVNode("div", _hoisted_30, [
                  _cache[23] || (_cache[23] = createBaseVNode("label", null, "简介（可选）", -1)),
                  withDirectives(createBaseVNode("textarea", {
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => pDesc.value = $event),
                    class: "vinput",
                    placeholder: "这场为什么值得看"
                  }, null, 512), [
                    [vModelText, pDesc.value]
                  ])
                ]),
                createBaseVNode("div", _hoisted_31, [
                  _cache[24] || (_cache[24] = createBaseVNode("label", null, "视频地址", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => pUrl.value = $event),
                    class: "vinput"
                  }, null, 512), [
                    [vModelText, pUrl.value]
                  ])
                ]),
                createBaseVNode("div", _hoisted_32, [
                  _cache[25] || (_cache[25] = createBaseVNode("label", null, "关联辩题（可选）", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => pTopic.value = $event),
                    class: "vinput",
                    placeholder: "例如：取消期末考试"
                  }, null, 512), [
                    [vModelText, pTopic.value]
                  ])
                ]),
                createBaseVNode("div", _hoisted_33, [
                  createBaseVNode("div", _hoisted_34, [
                    _cache[26] || (_cache[26] = createBaseVNode("label", null, "环节", -1)),
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => pSeg.value = $event),
                      class: "vinput"
                    }, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(SEGS.filter(Boolean), (s) => {
                        return openBlock(), createElementBlock("option", {
                          key: s,
                          value: s
                        }, toDisplayString(s), 9, _hoisted_35);
                      }), 128))
                    ], 512), [
                      [vModelSelect, pSeg.value]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_36, [
                    _cache[28] || (_cache[28] = createBaseVNode("label", null, "立场", -1)),
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => pSide.value = $event),
                      class: "vinput"
                    }, [..._cache[27] || (_cache[27] = [
                      createBaseVNode("option", { value: "正" }, "正方", -1),
                      createBaseVNode("option", { value: "反" }, "反方", -1)
                    ])], 512), [
                      [vModelSelect, pSide.value]
                    ])
                  ])
                ]),
                createBaseVNode("button", {
                  class: "btn primary",
                  style: { "width": "100%" },
                  disabled: publishing.value,
                  onClick: publish
                }, toDisplayString(publishing.value ? "提交中…" : "提交审核"), 9, _hoisted_37),
                publishResult.value ? (openBlock(), createElementBlock("div", _hoisted_38, [
                  publishResult.value.pending ? (openBlock(), createElementBlock("div", _hoisted_39, "正在机器初审…")) : publishResult.value.error ? (openBlock(), createElementBlock("div", _hoisted_40, toDisplayString(publishResult.value.error), 1)) : (openBlock(), createElementBlock("div", _hoisted_41, [
                    createBaseVNode("div", _hoisted_42, [
                      _cache[29] || (_cache[29] = createBaseVNode("span", null, "审核结果", -1)),
                      createBaseVNode("b", null, [
                        createBaseVNode("span", {
                          class: normalizeClass(["vpill", pill(publishResult.value.auditStatus).cls])
                        }, toDisplayString(pill(publishResult.value.auditStatus).text), 3)
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_43, [
                      _cache[30] || (_cache[30] = createBaseVNode("span", null, "判定依据", -1)),
                      createBaseVNode("b", _hoisted_44, toDisplayString(publishResult.value.reason), 1)
                    ]),
                    createBaseVNode("div", _hoisted_45, [
                      _cache[31] || (_cache[31] = createBaseVNode("span", null, "是否上广场", -1)),
                      createBaseVNode("b", null, toDisplayString(publishResult.value.visible ? "是" : "否"), 1)
                    ])
                  ]))
                ])) : createCommentVNode("", true)
              ], 64)) : sheet.value === "audit" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                createBaseVNode("div", _hoisted_46, [
                  createBaseVNode("div", _hoisted_47, [
                    _cache[32] || (_cache[32] = createBaseVNode("span", null, "视频总数", -1)),
                    createBaseVNode("b", null, toDisplayString(auditStats.value.videos || 0), 1)
                  ]),
                  createBaseVNode("div", _hoisted_48, [
                    _cache[33] || (_cache[33] = createBaseVNode("span", null, "已通过", -1)),
                    createBaseVNode("b", null, toDisplayString(auditStats.value.passed || 0), 1)
                  ]),
                  createBaseVNode("div", _hoisted_49, [
                    _cache[34] || (_cache[34] = createBaseVNode("span", null, "待处理", -1)),
                    createBaseVNode("b", _hoisted_50, toDisplayString(auditStats.value.pending || 0), 1)
                  ]),
                  createBaseVNode("div", _hoisted_51, [
                    _cache[35] || (_cache[35] = createBaseVNode("span", null, "已驳回", -1)),
                    createBaseVNode("b", null, toDisplayString(auditStats.value.rejected || 0), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_52, [
                  (openBlock(), createElementBlock(Fragment, null, renderList([["REVIEW", "待复核"], ["PENDING", "待初审"], ["REJECTED", "已驳回"], ["PASSED", "已通过"]], (q) => {
                    return createBaseVNode("button", {
                      key: q[0],
                      class: normalizeClass(["btn sm ghost", { primary: auditStatus.value === q[0] }]),
                      onClick: ($event) => loadQueue(q[0])
                    }, toDisplayString(q[1]), 11, _hoisted_53);
                  }), 64))
                ]),
                !auditList.value.length ? (openBlock(), createElementBlock("div", _hoisted_54, "这个队列是空的")) : createCommentVNode("", true),
                (openBlock(true), createElementBlock(Fragment, null, renderList(auditList.value, (v) => {
                  return openBlock(), createElementBlock("div", {
                    key: v.id,
                    class: "vcard vrowitem",
                    style: { "cursor": "pointer" },
                    onClick: ($event) => openAuditDetail(v)
                  }, [
                    _cache[36] || (_cache[36] = createBaseVNode("div", { class: "vthumb" }, "🎬", -1)),
                    createBaseVNode("div", _hoisted_56, [
                      createBaseVNode("b", _hoisted_57, toDisplayString(v.title), 1),
                      createBaseVNode("div", _hoisted_58, [
                        createTextVNode(toDisplayString(v.author || "匿名") + " · ", 1),
                        createBaseVNode("span", {
                          class: normalizeClass(["vpill", pill(v.audit_status).cls])
                        }, toDisplayString(pill(v.audit_status).text), 3)
                      ]),
                      createBaseVNode("div", _hoisted_59, toDisplayString(v.audit_note || ""), 1)
                    ])
                  ], 8, _hoisted_55);
                }), 128))
              ], 64)) : sheet.value === "auditDetail" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                !auditDetail.value ? (openBlock(), createElementBlock("div", _hoisted_60, "加载中…")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createBaseVNode("div", _hoisted_61, [
                    createBaseVNode("b", null, toDisplayString(auditDetail.value.video.title), 1),
                    createBaseVNode("div", _hoisted_62, [
                      _cache[37] || (_cache[37] = createBaseVNode("span", null, "作者", -1)),
                      createBaseVNode("b", null, toDisplayString(auditDetail.value.video.author || "匿名"), 1)
                    ]),
                    createBaseVNode("div", _hoisted_63, [
                      _cache[38] || (_cache[38] = createBaseVNode("span", null, "环节 / 辩题", -1)),
                      createBaseVNode("b", null, toDisplayString(auditDetail.value.video.segment || "-") + " / " + toDisplayString(auditDetail.value.video.topic || "-"), 1)
                    ]),
                    createBaseVNode("div", _hoisted_64, [
                      _cache[39] || (_cache[39] = createBaseVNode("span", null, "当前状态", -1)),
                      createBaseVNode("b", null, [
                        createBaseVNode("span", {
                          class: normalizeClass(["vpill", pill(auditDetail.value.video.audit_status).cls])
                        }, toDisplayString(pill(auditDetail.value.video.audit_status).text), 3)
                      ])
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_65, [
                    createBaseVNode("button", {
                      class: "btn sm",
                      style: { "background": "#0e9f6e", "color": "#fff" },
                      onClick: _cache[8] || (_cache[8] = ($event) => decide(auditDetail.value.video.id, "PASS"))
                    }, "通过"),
                    createBaseVNode("button", {
                      class: "btn sm",
                      style: { "background": "#e5484d", "color": "#fff" },
                      onClick: _cache[9] || (_cache[9] = ($event) => decide(auditDetail.value.video.id, "REJECT"))
                    }, "驳回"),
                    createBaseVNode("button", {
                      class: "btn sm ghost",
                      onClick: _cache[10] || (_cache[10] = ($event) => restore(auditDetail.value.video.id))
                    }, "一键恢复"),
                    createBaseVNode("button", {
                      class: "btn sm ghost",
                      onClick: _cache[11] || (_cache[11] = ($event) => sheet.value = "audit")
                    }, "返回队列")
                  ]),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => auditReason.value = $event),
                    class: "vinput",
                    placeholder: "驳回理由（会记进审核记录）"
                  }, null, 512), [
                    [vModelText, auditReason.value]
                  ]),
                  _cache[40] || (_cache[40] = createBaseVNode("b", { style: { "font-size": "12.5px", "color": "#9aa0ae", "display": "block", "margin-top": "14px" } }, "审核记录（可追溯）", -1)),
                  createBaseVNode("div", _hoisted_66, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(auditDetail.value.list || [], (a, i) => {
                      return openBlock(), createElementBlock("div", {
                        key: i,
                        class: "vcmt"
                      }, [
                        createBaseVNode("div", _hoisted_67, toDisplayString(a.stage === "MACHINE" ? "机器" : a.operator || "人工") + " · " + toDisplayString(a.result) + toDisplayString(a.restored ? " · 已恢复" : ""), 1),
                        createTextVNode(" " + toDisplayString(a.reason || ""), 1)
                      ]);
                    }), 128)),
                    !(auditDetail.value.list || []).length ? (openBlock(), createElementBlock("div", _hoisted_68, "没有记录")) : createCommentVNode("", true)
                  ])
                ], 64))
              ], 64)) : createCommentVNode("", true)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const routes = [
  // 默认落点必须是**已迁移**的页面。
  // 早先这里 redirect 到 /community，而社区要批 3 才迁，结果是从旧页点「试用新版」进来后
  // 用 catch-all 兜住 —— 否则用户会看到"点了没反应"。
  // 现在统一进 /me：未登录时 MeView 自己会再跳 /login，最多一跳。
  { path: "/", redirect: "/me" },
  // ---- 批 0：已经迁移 ----
  { path: "/login", name: "login", component: _sfc_main$n },
  { path: "/me", name: "me", component: MeView },
  // ---- 批 1：已迁移（通知/好友/热辩榜/记录/诊断/钱包）----
  { path: "/notify", name: "notify", component: _sfc_main$l, meta: { requiresAuth: true } },
  { path: "/friends", name: "friends", component: _sfc_main$k, meta: { requiresAuth: true } },
  { path: "/hot", name: "hot", component: _sfc_main$j },
  { path: "/records", name: "records", component: _sfc_main$i, meta: { requiresAuth: true } },
  { path: "/diag", name: "diag", component: _sfc_main$g, meta: { requiresAuth: true } },
  { path: "/wallet", name: "wallet", component: _sfc_main$e, meta: { requiresAuth: true } },
  // ---- 批 2：单人/对局/复盘已迁移，房间待迁 ----
  { path: "/solo", name: "solo", component: _sfc_main$c, meta: { requiresAuth: true } },
  { path: "/room", name: "room", component: _sfc_main$8, meta: { requiresAuth: true } },
  { path: "/chat", name: "chat", component: _sfc_main$d, meta: { requiresAuth: true } },
  { path: "/match", name: "match", component: _sfc_main$b, meta: { requiresAuth: true } },
  { path: "/review", name: "review", component: _sfc_main$9, meta: { requiresAuth: true } },
  // ---- 批 3 ----
  { path: "/community", name: "community", component: _sfc_main$4 },
  // 帖子详情走真实路由：通知点「帖子类」通知可以直接深链过来（?around=<评论id> 定位楼层）
  { path: "/community/:postId", name: "community-post", component: _sfc_main$1 },
  { path: "/video", name: "video", component: _sfc_main },
  // 管理后台是独立 app：裸布局（无主站侧栏）、自己的令牌 sy_admin_jwt、自己的前缀 /api/admin。
  // 结构与设计文档 §4.2 一致：父级只做布局（AdminLayout = 侧栏 + 顶栏 + RouterView），
  // 子页全部懒加载 —— 首屏只加载布局，进哪个子页才拉哪个子页的 chunk。
  //
  // meta 会沿匹配链合并：父级的 bare:true 对子路由同样生效（App.vue 靠它跳过 AppShell），
  // 子级各自的 title 给顶栏用，guest:true 表示"登录页，不需要令牌"。
  {
    path: "/admin",
    meta: { bare: true },
    component: () => __vitePreload(() => import("./AdminLayout-sEv7kvgc.js"), true ? __vite__mapDeps([0,1,2,3]) : void 0, import.meta.url),
    children: [
      { path: "", redirect: "/admin/dashboard" },
      { path: "login", name: "admin-login", component: () => __vitePreload(() => import("./AdminLogin-DqfZXONu.js"), true ? __vite__mapDeps([4,1,2]) : void 0, import.meta.url), meta: { guest: true } },
      { path: "dashboard", name: "admin-dashboard", component: () => __vitePreload(() => import("./DashboardView-D36qMKKi.js"), true ? __vite__mapDeps([5,6,7,2,8]) : void 0, import.meta.url), meta: { title: "概览" } },
      { path: "analytics", name: "admin-analytics", component: () => __vitePreload(() => import("./AnalyticsView-P18GJnWt.js"), true ? __vite__mapDeps([9,6,7,2,10]) : void 0, import.meta.url), meta: { title: "报表分析" } },
      {
        path: "reports",
        name: "admin-reports",
        component: () => __vitePreload(() => import("./ReportsView-CwoNVjQf.js"), true ? __vite__mapDeps([11,1,2]) : void 0, import.meta.url),
        meta: { title: "举报处理", badge: "pendingReports" }
      },
      { path: "users", name: "admin-users", component: () => __vitePreload(() => import("./UsersView-BbkUDTZ-.js"), true ? __vite__mapDeps([12,1,2,13,14]) : void 0, import.meta.url), meta: { title: "用户管理" } },
      { path: "content/posts", name: "admin-content-posts", component: () => __vitePreload(() => import("./ContentPostsView-DKzvPzg3.js"), true ? __vite__mapDeps([15,2,16,17,13,14,18]) : void 0, import.meta.url), meta: { title: "帖子管理" } },
      { path: "content/comments", name: "admin-content-comments", component: () => __vitePreload(() => import("./ContentCommentsView-D5jUv8NY.js"), true ? __vite__mapDeps([19,2,16,17,13,14,20]) : void 0, import.meta.url), meta: { title: "评论管理" } },
      { path: "video-audit", name: "admin-video-audit", component: () => __vitePreload(() => import("./VideoAuditView-5pHRGSw_.js"), true ? __vite__mapDeps([21,2,22]) : void 0, import.meta.url), meta: { title: "视频复核" } },
      { path: "topics", name: "admin-topics", component: () => __vitePreload(() => import("./TopicReviewView-BVYKhcCa.js"), true ? __vite__mapDeps([23,2,24]) : void 0, import.meta.url), meta: { title: "辩题审核" } },
      { path: "audit", name: "admin-audit", component: () => __vitePreload(() => import("./AuditView-DqWlUFjU.js"), true ? __vite__mapDeps([25,1,2]) : void 0, import.meta.url), meta: { title: "处理记录" } },
      { path: "settings", name: "admin-settings", component: () => __vitePreload(() => import("./SettingsView-DkQizUbT.js"), true ? __vite__mapDeps([26,1,2]) : void 0, import.meta.url), meta: { title: "设置" } }
    ]
  },
  // 兜底：未知路径回 /me（同样不能回落到旧页，否则等于把人赶走）
  { path: "/:pathMatch(.*)*", redirect: "/me" }
];
const router = createRouter({
  // hash 模式不传 base：路由只用 # 后面的部分，与资源前缀（vite 的 base）解耦。
  // 传 import.meta.env.BASE_URL 的话，base 改成相对路径 './' 后这里会拿到 './'，容易出怪 URL。
  history: createWebHashHistory(),
  routes
});
const ADMIN_LOGIN_PATH = "/admin/login";
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.user && auth.hasToken) await auth.restore();
  if (to.path === "/admin" || to.path.startsWith("/admin/")) {
    const hasAdmin = !!getAdminToken();
    if (!hasAdmin && to.meta.guest !== true) return { path: ADMIN_LOGIN_PATH, replace: true };
    if (hasAdmin && to.meta.guest === true) return { path: "/admin/dashboard", replace: true };
  }
  return true;
});
router.afterEach((to) => {
  trackView(to.path);
});
const app = createApp(_sfc_main$o);
app.use(createPinia());
app.use(router);
app.mount("#app");
export {
  API_BASE as A,
  ApiError as B,
  normalizeStyle as C,
  withModifiers as D,
  nextTick as E,
  Fragment as F,
  vModelSelect as G,
  adminApi as H,
  contentApi as I,
  videoAuditApi as J,
  topicAdminApi as K,
  defineStore as L,
  setAdminToken as M,
  _export_sfc as _,
  onBeforeUnmount as a,
  createBlock as b,
  createElementBlock as c,
  createBaseVNode as d,
  renderList as e,
  createCommentVNode as f,
  createVNode as g,
  computed as h,
  useRouter as i,
  useRoute as j,
  openBlock as k,
  withCtx as l,
  resolveComponent as m,
  normalizeClass as n,
  onMounted as o,
  withDirectives as p,
  withKeys as q,
  ref as r,
  toast as s,
  toDisplayString as t,
  unref as u,
  vModelText as v,
  watch as w,
  createTextVNode as x,
  analyticsApi as y,
  getAdminToken as z
};
