(function () {
  'use strict';

  var DB_NAME = 'AttendanceJournal';
  var DB_VERSION = 3;
  var STORE = 'kv';
  var KEY = 'state';
  var LS_PRIMARY = 'attendance-journal-state-v5';
  var LS_LEGACY = 'attendance-journal-state-v4';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { resolve(null); return; }
      var request;
      try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch (error) { reject(error); return; }
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB error')); };
      request.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }

  function readDb() {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        var finished = false;
        function close() { try { db.close(); } catch (_) {} }
        var tx;
        try { tx = db.transaction(STORE, 'readonly'); } catch (error) { close(); reject(error); return; }
        var req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = function () { if (!finished) { finished = true; resolve(req.result || null); } };
        req.onerror = function () { if (!finished) { finished = true; reject(req.error || new Error('IndexedDB read error')); } };
        tx.oncomplete = function () { close(); };
        tx.onerror = function () { if (!finished) { finished = true; reject(tx.error || new Error('IndexedDB transaction error')); } };
        tx.onabort = function () { if (!finished) { finished = true; reject(tx.error || new Error('IndexedDB transaction aborted')); } };
      });
    });
  }

  function readLocal(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function writeLocal(value) {
    try {
      localStorage.setItem(LS_PRIMARY, JSON.stringify(value));
      return true;
    } catch (_) { return false; }
  }

  function updatedAtValue(value) {
    var ms = Date.parse(value && value.updatedAt ? value.updatedAt : '');
    return Number.isFinite(ms) ? ms : 0;
  }

  async function load() {
    var dbPromise = readDb().catch(function () { return null; });
    var localPromise = Promise.resolve(readLocal(LS_PRIMARY) || readLocal(LS_LEGACY));
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve('__TIMEOUT__'); }, 1800); });
    var dbValue = await Promise.race([dbPromise,timeout]);
    if (dbValue === '__TIMEOUT__') dbValue = null;
    var localValue = await localPromise;
    var chosen = null;
    if (dbValue && localValue) chosen = updatedAtValue(localValue) > updatedAtValue(dbValue) ? localValue : dbValue;
    else chosen = dbValue || localValue;
    return {value:chosen,source:chosen===dbValue?'indexeddb':(chosen?'localstorage':'empty')};
  }

  async function save(value) {
    var localOk = writeLocal(value);
    var dbOk = false;
    try { dbOk = await writeDb(value); } catch (_) { dbOk = false; }
    return {db:!!dbOk,local:!!localOk};
  }

  function writeDb(value) {
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve, reject) {
        var tx;
        try { tx = db.transaction(STORE, 'readwrite'); } catch (error) { try { db.close(); } catch (_) {} reject(error); return; }
        tx.objectStore(STORE).put(value, KEY);
        tx.oncomplete = function () { try { db.close(); } catch (_) {} resolve(true); };
        tx.onerror = function () { try { db.close(); } catch (_) {} reject(tx.error || new Error('IndexedDB write error')); };
        tx.onabort = function () { try { db.close(); } catch (_) {} reject(tx.error || new Error('IndexedDB transaction aborted')); };
      });
    });
  }

  function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
    } catch (_) {}
    return Promise.resolve(false);
  }

  window.AttendanceStorage = {load:load,save:save,requestPersistence:requestPersistence};
})();
