(function () {
  'use strict';

  var MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  var MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function bytes(text) { return Array.from(new TextEncoder().encode(String(text))); }
  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
  function concat() {
    var out = [];
    for (var a = 0; a < arguments.length; a++) {
      var part = arguments[a];
      for (var i = 0; i < part.length; i++) out.push(part[i]);
    }
    return out;
  }

  var crcTable = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(data) {
    var c = 0xffffffff;
    for (var i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    var locals = [], centrals = [], offset = 0;
    var dosTime = 0, dosDate = 0x5c7a;
    files.forEach(function (file) {
      var name = bytes(file.name), data = file.data, crc = crc32(data), size = data.length;
      var local = concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), name, data
      );
      locals.push(local);
      var central = concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), name
      );
      centrals.push(central);
      offset += local.length;
    });
    var localBytes = concat.apply(null, locals);
    var centralBytes = concat.apply(null, centrals);
    var end = concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(localBytes.length), u16(0));
    return new Uint8Array(concat(localBytes, centralBytes, end));
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function run(text, opt) {
    opt = opt || {};
    var rPr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
    if (opt.bold) rPr += '<w:b/>';
    if (opt.italic) rPr += '<w:i/>';
    if (opt.underline) rPr += '<w:u w:val="single"/>';
    if (opt.color) rPr += '<w:color w:val="' + opt.color + '"/>';
    rPr += '<w:sz w:val="' + (opt.size || 20) + '"/><w:szCs w:val="' + (opt.size || 20) + '"/></w:rPr>';
    var parts = String(text == null ? '' : text).split(/\n/);
    var body = parts.map(function (part, i) {
      return (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + esc(part) + '</w:t>';
    }).join('');
    return '<w:r>' + rPr + body + '</w:r>';
  }

  function paragraph(content, opt) {
    opt = opt || {};
    var pPr = '<w:pPr><w:jc w:val="' + (opt.align || 'left') + '"/><w:spacing w:before="' + (opt.before || 0) + '" w:after="' + (opt.after || 0) + '" w:line="' + (opt.line || 240) + '" w:lineRule="auto"/>';
    if (opt.keepNext) pPr += '<w:keepNext/>';
    if (opt.keepLines) pPr += '<w:keepLines/>';
    pPr += '</w:pPr>';
    return '<w:p>' + pPr + content + '</w:p>';
  }

  function cell(text, width, opt) {
    opt = opt || {};
    var tcPr = '<w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>';
    if (opt.gridSpan && opt.gridSpan > 1) tcPr += '<w:gridSpan w:val="' + opt.gridSpan + '"/>';
    if (opt.vMerge) tcPr += '<w:vMerge' + (opt.vMerge === 'restart' ? ' w:val="restart"' : '') + '/>';
    if (opt.fill) tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="' + opt.fill + '"/>';
    tcPr += '<w:vAlign w:val="center"/>';
    tcPr += '<w:tcMar><w:top w:w="18" w:type="dxa"/><w:left w:w="18" w:type="dxa"/><w:bottom w:w="18" w:type="dxa"/><w:right w:w="18" w:type="dxa"/></w:tcMar></w:tcPr>';
    return '<w:tc>' + tcPr + paragraph(run(text, {bold:!!opt.bold, size:opt.size || 18, color:opt.white ? 'FFFFFF' : undefined}), {align:opt.align || 'center', line:210, before:0, after:0}) + '</w:tc>';
  }

  function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
  function dayOfWeek(year, month, day) { return new Date(year, month - 1, day).getDay(); }
  function reasonShort(reason) {
    if (reason === 'order') return 'Р';
    if (reason === 'sick') return 'бол.';
    if (reason === 'family') return 'сем.';
    return '';
  }
  function pairNumbers(record) {
    var list = Array.isArray(record && record.pairs) ? record.pairs : (Array.isArray(record && record.periods) ? record.periods : []);
    return list.map(Number).filter(function(n){return Number.isFinite(n)&&n>=1;}).filter(function(n,i,a){return a.indexOf(n)===i;}).sort(function(a,b){return a-b;});
  }
  function hoursValue(record) {
    var pairs = pairNumbers(record);
    if (pairs.length) return pairs.length * 2;
    var n = Number(record && record.hours);
    return n >= 2 ? Math.min(40, Math.round(n / 2) * 2) : 0;
  }

  function build(group, students, absences, monthKey) {
    var parts = String(monthKey || '').split('-');
    var year = Number(parts[0]), month = Number(parts[1]);
    if (!year || month < 1 || month > 12) throw new Error('Некорректный месяц');
    var monthName = MONTHS[month - 1];
    var days = daysInMonth(year, month);
    var known = new Set((students || []).map(function (s) { return s.id; }));
    var byStudent = new Map();
    (absences || []).forEach(function (a) {
      if (!known.has(a.studentId) || !String(a.date).startsWith(monthKey + '-')) return;
      var list = byStudent.get(a.studentId) || [];
      list.push(a);
      byStudent.set(a.studentId, list);
    });

    var nW = 420, nameW = 1850, dayW = 300, totalW = 550, reasonW = 500, noteW = 730;
    var tableW = nW + nameW + (dayW * 31) + totalW + (reasonW * 2) + noteW;
    var borders = '<w:tblBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>';
    var tblPr = '<w:tblPr><w:tblW w:w="' + tableW + '" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>' + borders + '</w:tblPr>';
    var widths = [nW, nameW].concat(Array(31).fill(dayW), [totalW, reasonW, reasonW, noteW]);
    var grid = '<w:tblGrid>' + widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';

    var h1 = '<w:tr><w:trPr><w:trHeight w:val="720" w:hRule="exact"/><w:cantSplit/></w:trPr>' +
      cell('№\nп/п', nW, {bold:true, size:18, vMerge:'restart'}) +
      cell('ФИ студента', nameW, {bold:true, size:18, align:'left', vMerge:'restart'}) +
      cell('Числа месяца', dayW * 31, {bold:true, size:18, gridSpan:31}) +
      cell('Итог', totalW, {bold:true, size:18, vMerge:'restart'}) +
      cell('Из них\nпо\nпричинам', reasonW * 2, {bold:true, size:17, gridSpan:2}) +
      cell('примечание', noteW, {bold:true, size:16, vMerge:'restart'}) + '</w:tr>';

    var h2 = '<w:tr><w:trPr><w:trHeight w:val="330" w:hRule="exact"/><w:cantSplit/></w:trPr>' +
      cell('', nW, {vMerge:'continue'}) + cell('', nameW, {vMerge:'continue'}) +
      Array.from({length:31}, function (_, i) {
        var d = i + 1, sun = d <= days && dayOfWeek(year, month, d) === 0;
        return cell(String(d), dayW, {bold:true, size:16, fill:sun?'B91C1C':undefined, white:sun});
      }).join('') +
      cell('', totalW, {vMerge:'continue'}) + cell('ува-\nжит', reasonW, {bold:true, size:14}) + cell('не\nув', reasonW, {bold:true, size:14}) +
      cell('', noteW, {vMerge:'continue'}) + '</w:tr>';

    var rows = [], grand = 0, respectful = 0, disrespectful = 0;
    (students || []).forEach(function (student, index) {
      var list = byStudent.get(student.id) || [];
      var map = new Map(list.map(function (a) { return [Number(String(a.date).slice(-2)), a]; }));
      var total = 0, good = 0, bad = 0, notes = new Set();
      var dayCells = Array.from({length:31}, function (_, idx) {
        var d = idx + 1, sun = d <= days && dayOfWeek(year, month, d) === 0, record = map.get(d);
        if (!record) return cell(d <= days ? '' : '—', dayW, {fill:sun?'FEE2E2':undefined, size:14});
        var h = hoursValue(record); total += h;
        if (record.reason === 'none') bad += h; else good += h;
        var note = reasonShort(record.reason); if (note) notes.add(note); var pairList = pairNumbers(record); if (pairList.length) notes.add('пары: ' + pairList.join(', '));
        return cell(String(h), dayW, {bold:true, size:15, fill:sun?'DC2626':undefined, white:sun});
      }).join('');
      grand += total; respectful += good; disrespectful += bad;
      rows.push('<w:tr><w:trPr><w:trHeight w:val="290" w:hRule="exact"/><w:cantSplit/></w:trPr>' +
        cell(String(index + 1), nW, {size:15}) + cell(student.name, nameW, {size:15, align:'left'}) + dayCells +
        cell(total ? String(total) : '-', totalW, {bold:true, size:15}) + cell(good ? String(good) : '-', reasonW, {bold:true, size:15}) +
        cell(bad ? String(bad) : '-', reasonW, {bold:true, size:15}) + cell(Array.from(notes).join('\n'), noteW, {size:14, align:'left'}) + '</w:tr>');
    });

    rows.push('<w:tr><w:trPr><w:trHeight w:val="330" w:hRule="exact"/><w:cantSplit/></w:trPr>' +
      cell('ИТОГО', nW + nameW, {bold:true, size:16, align:'left', gridSpan:2}) +
      Array(31).fill(0).map(function () { return cell('', dayW, {size:13}); }).join('') +
      cell(grand ? String(grand) : '-', totalW, {bold:true, size:16}) + cell(respectful ? String(respectful) : '-', reasonW, {bold:true, size:16}) +
      cell(disrespectful ? String(disrespectful) : '-', reasonW, {bold:true, size:16}) + cell('', noteW) + '</w:tr>');

    var table = '<w:tbl>' + tblPr + grid + h1 + h2 + rows.join('') + '</w:tbl>';
    var institution = group.institution || '';
    var short = group.institutionShort ? '\n(' + group.institutionShort + ')' : '';
    var details = paragraph(run('Специальность   ', {size:18}) + run(group.specialty || '', {size:18}) + run('   ', {size:18}) + run(group.group || '', {size:18, underline:true}) + run(' группа    месяц  ', {size:18}) + run(monthName + ' ' + year, {size:18, underline:true}) + run(' год', {size:18}), {align:'center', after:210, line:220});
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      paragraph(run(institution + short, {size:20}), {align:'center', after:20, line:220, keepNext:true}) +
      paragraph(run('ВЕДОМОСТЬ', {bold:true, size:24}), {align:'center', after:0, line:220, keepNext:true}) +
      paragraph(run('учета посещаемости занятий', {bold:true, size:20}), {align:'center', after:120, line:220, keepNext:true}) +
      details + table +
      paragraph(run('Классный руководитель __________________  ' + (group.curator || ''), {size:18}), {before:240, after:30, line:220}) +
      paragraph(run('Староста                    __________________  ' + (group.groupLeader || ''), {size:18}), {line:220}) +
      '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="240" w:right="720" w:bottom="270" w:left="720" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:num="1"/><w:docGrid w:linePitch="240"/></w:sectPr>' +
      '</w:body></w:document>';

    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style></w:styles>';
    var settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="80"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/></Relationships>';
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Ведомость учета посещаемости ' + esc(monthKey) + '</dc:title><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">AttendanceJournal</dc:creator><dcterms:created xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created></cp:coreProperties>';

    var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AttendanceJournal</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>5.2</AppVersion></Properties>';
    var fontTable = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Times New Roman"><w:family w:val="roman"/><w:charset w:val="CC"/></w:font></w:fonts>';
    var webSettings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:doNotSaveAsSingleFile/></w:webSettings>';
    var contentTypesFull = contentTypes.replace('</Types>', '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    var packageFiles = [
      {name:'[Content_Types].xml', data:bytes(contentTypesFull)},
      {name:'_rels/.rels', data:bytes(rootRels)},
      {name:'word/document.xml', data:bytes(documentXml)},
      {name:'word/styles.xml', data:bytes(styles)},
      {name:'word/settings.xml', data:bytes(settings)},
      {name:'word/fontTable.xml', data:bytes(fontTable)},
      {name:'word/webSettings.xml', data:bytes(webSettings)},
      {name:'word/_rels/document.xml.rels', data:bytes(docRels)},
      {name:'docProps/core.xml', data:bytes(core)},
      {name:'docProps/app.xml', data:bytes(app)}
    ];
    return zipStore(packageFiles);
  }

  window.AttendanceDocx = { buildAttendanceDocx: build, mimeType: MIME };
})();
