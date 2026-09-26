(function () {
  'use strict';

  function makeFile(bytesOrBlob, filename, mime) {
    var type = mime || (bytesOrBlob && bytesOrBlob.type) || 'application/octet-stream';
    var blob = bytesOrBlob instanceof Blob ? bytesOrBlob : new Blob([bytesOrBlob], {type:type});
    var file = null;
    try {
      if (typeof File !== 'undefined') file = new File([blob], filename, {type:type, lastModified:Date.now()});
    } catch (_) {}
    return {blob:blob,file:file,url:URL.createObjectURL(blob),filename:filename,mime:type};
  }

  function canShare(item) {
    if (!item || !item.file || typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare !== 'function') return true;
    try { return navigator.canShare({files:[item.file]}); } catch (_) { return false; }
  }

  function share(item) {
    if (!item || !item.file || typeof navigator.share !== 'function') return Promise.reject(new Error('File sharing is not supported'));
    try {
      return navigator.share({files:[item.file],title:item.filename});
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function open(item) {
    if (!item || !item.url) return false;
    try {
      var win = window.open(item.url, '_blank', 'noopener');
      if (win) return true;
    } catch (_) {}
    try {
      window.location.href = item.url;
      return true;
    } catch (_) { return false; }
  }

  function download(item) {
    if (!item || !item.url) return false;
    try {
      var a = document.createElement('a');
      a.href = item.url;
      a.download = item.filename;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.position = 'fixed';
      a.style.left = '-9999px';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (_) { return false; }
  }

  function revoke(item) {
    if (item && item.url) {
      try { URL.revokeObjectURL(item.url); } catch (_) {}
    }
  }

  window.AttendanceExporter = {makeFile:makeFile,canShare:canShare,share:share,open:open,download:download,revoke:revoke};
})();
