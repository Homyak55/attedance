(function () {
  'use strict';

  var APP_VERSION = '5.3.4';
  var MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  var REASONS = [
    {key:'family', label:'По семейным', short:'сем.', respected:true},
    {key:'sick', label:'По болезни', short:'бол.', respected:true},
    {key:'order', label:'По распоряжению', short:'Р', respected:true},
    {key:'none', label:'Без причины', short:'без причины', respected:false}
  ];
  var DEFAULT_GROUP = {
    institution:'Государственное бюджетное профессиональное образовательное учреждение Краснодарского края «Армавирский юридический техникум»',
    institutionShort:'ГБПОУ КК АЮТ',
    specialty:'10.02.05 «Обеспечение информационной безопасности автоматизированных систем»',
    group:'11и', curator:'Т.С. Макуха', groupLeader:'Г.А. Попов'
  };
  var TEMPLATE_NAMES = [
    'Алленов Р.А.','Бондаренко А.А.','Брижахин В.С.','Джамаладуинов М.С.','Дубасов С.Ю.','Дядя К.А.','Ерошко АД..','Житникова А.А.','Зенин М.В.','Ищенко М.М.','Колотовкин ВВ..','Крахмалец Р.В.','Курсова А.Р.','Нестерук Я.О.','Петухов А.С.','Попов Г.А.','Сардарлы Р.РР.','Таланов Г.А.','Таперин Н.А.','Тибеев Д.С.','Федотов А.Е.','Фролов С.И.','Шатохин И.С.','Шахназарян СС..','Юрченко Д.Д.'
  ];

  var app = document.getElementById('app');
  var backupFile = document.getElementById('backupFile');
  var saveTimer = null;
  var toastTimer = null;
  var state = {
    loading:true, screen:'home', drawer:false, modal:null, toast:'',
    students:[], absences:[], group:normalizeGroup(DEFAULT_GROUP),
    reports:[], settings:{theme:'light',pairs:defaultPairs()}, schedule:defaultSchedule(), scheduleDate:today(),
    reportMonth:monthKey(new Date()), historyMonth:monthKey(new Date()), historyDay:today(), historyMode:'month', historyStudentId:'all', historySubjectName:'all', historyPair:'all',
    bulkNames:'', pendingExport:null, lastSaveOk:true
  };

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function normalizeName(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function iso(date) { return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0'); }
  function today() { return iso(new Date()); }
  function monthKey(date) { return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0'); }
  function parseMonth(key) { var p=String(key).split('-').map(Number); return new Date(p[0],p[1]-1,1); }
  function daysInMonth(key) { var d=parseMonth(key); return new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); }
  function dayOfWeek(key, day) { var d=parseMonth(key); return new Date(d.getFullYear(),d.getMonth(),day).getDay(); }
  function monthTitle(key) { var d=parseMonth(key); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function shiftMonth(key, delta) { var d=parseMonth(key); d.setMonth(d.getMonth()+delta); return monthKey(d); }
  function formatDate(key) { return new Date(String(key) + 'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}); }
  function shortDate(key) { return new Date(String(key) + 'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}); }
  function safeFilename(value) { return normalizeName(value || 'группа').replace(/[\\/:*?"<>|]/g,'_') || 'группа'; }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9); }
  function compareNames(a,b) { return a.localeCompare(b,'ru',{sensitivity:'base',numeric:false}); }
  function sortStudents(list) { return list.slice().sort(function(a,b){ return compareNames(a.name,b.name) || compareNames(a.id,b.id); }); }
  function reasonInfo(key) { return REASONS.find(function(x){ return x.key === key; }) || REASONS[3]; }
  function defaultPairs() {
    return [1,2,3,4,5,6].map(function(number){
      return {id:'pair-'+number,number:number,start:'',end:'',subject:'',teacher:''};
    });
  }
  function normalizePairs(value) {
    var source=Array.isArray(value)?value:[], byNumber=new Map();
    source.forEach(function(item,index){
      var number=Number(item&&item.number);
      if(!Number.isFinite(number)||number<1) number=index+1;
      number=Math.floor(number);
      if(number<1||number>6||byNumber.has(number)) return;
      byNumber.set(number,item);
    });
    return [1,2,3,4,5,6].map(function(number){
      var item=byNumber.get(number)||{}, id=normalizeName(item.id)||('pair-'+number);
      return {
        id:id,
        number:number,
        start:normalizeName(item.start),
        end:normalizeName(item.end),
        subject:normalizeName(item.subject),
        teacher:normalizeName(item.teacher)
      };
    });
  }
  function activePairs() { return normalizePairs(state.settings.pairs); }
  function weeklyPairs() { return activePairs().filter(function(p){ return p.number>=1 && p.number<=3; }); }
  function scheduledPairNumbers(date) {
    if(state.schedule.nonSchoolDays[date]) return [];
    return activePairs().filter(function(p){ return !!actualSubjectId(date,p.id); }).map(function(p){ return p.number; });
  }
  function attendancePairsForDate(date, record) {
    var list=scheduledPairNumbers(date);
    if(record) list=list.concat(pairNumbersFromRecord(record));
    return list.filter(function(n){return Number.isFinite(Number(n))&&Number(n)>=1&&Number(n)<=6;}).map(Number).filter(function(n,i,a){return a.indexOf(n)===i;}).sort(function(a,b){return a-b;});
  }
  var WEEK_DAYS = [
    {index:1,name:'Понедельник',short:'Пн'},
    {index:2,name:'Вторник',short:'Вт'},
    {index:3,name:'Среда',short:'Ср'},
    {index:4,name:'Четверг',short:'Чт'},
    {index:5,name:'Пятница',short:'Пт'},
    {index:6,name:'Суббота',short:'Сб'}
  ];
  function defaultSchedule() { return {subjects:[],weekly:{1:{},2:{},3:{},4:{},5:{},6:{}},dateOverrides:{},nonSchoolDays:{}}; }
  function normalizeSubjects(value) {
    if(!Array.isArray(value)) return [];
    var seen=new Set(), ids=new Set(), out=[];
    value.forEach(function(item){
      var name=normalizeName(item&&item.name); if(!name) return;
      var teacher=normalizeName(item&&item.teacher);
      var key=name.toLocaleLowerCase()+'|'+teacher.toLocaleLowerCase(); if(seen.has(key)) return; seen.add(key);
      var id=normalizeName(item&&item.id)||uid('subject'); while(ids.has(id)) id=uid('subject'); ids.add(id);
      out.push({id:id,name:name,teacher:teacher});
    });
    return out;
  }
  function cleanScheduleMaps(schedule,pairs) {
    var pairIds=new Set((pairs||[]).map(function(p){return p.id;}));
    var subjectIds=new Set((schedule.subjects||[]).map(function(s){return s.id;}));
    var weekly={1:{},2:{},3:{},4:{},5:{},6:{}};
    for(var d=1;d<=6;d++){
      var src=schedule.weekly&&schedule.weekly[d] ? schedule.weekly[d] : {};
      Object.keys(src).forEach(function(pairId){var subjectId=src[pairId];var pair=(pairs||[]).find(function(p){return p.id===pairId;});if(pair&&pair.number<=3&&pairIds.has(pairId)&&subjectIds.has(subjectId))weekly[d][pairId]=subjectId;});
    }
    var dateOverrides={};
    Object.keys(schedule.dateOverrides||{}).forEach(function(date){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      var src=schedule.dateOverrides[date]||{}, dst={};
      Object.keys(src).forEach(function(pairId){if(!pairIds.has(pairId))return;var value=src[pairId];if(value===null||value==='')dst[pairId]=null;else if(subjectIds.has(value))dst[pairId]=value;});
      if(Object.keys(dst).length)dateOverrides[date]=dst;
    });
    var nonSchoolDays={};
    Object.keys(schedule.nonSchoolDays||{}).forEach(function(date){if(/^\d{4}-\d{2}-\d{2}$/.test(date))nonSchoolDays[date]={label:normalizeName(schedule.nonSchoolDays[date]&&schedule.nonSchoolDays[date].label)||'Выходной'};});
    return {subjects:schedule.subjects||[],weekly:weekly,dateOverrides:dateOverrides,nonSchoolDays:nonSchoolDays};
  }
  function normalizeSchedule(value,pairs) {
    var base=value||{}, hasSubjectsArray=Array.isArray(base.subjects), subjects=normalizeSubjects(base.subjects);
    if(!hasSubjectsArray && !subjects.length) {
      (pairs||[]).forEach(function(p){ if(p.subject){ subjects.push({id:uid('subject'),name:p.subject,teacher:p.teacher||''}); } });
      subjects=normalizeSubjects(subjects);
    }
    var schedule={subjects:subjects,weekly:{},dateOverrides:base.dateOverrides||{},nonSchoolDays:base.nonSchoolDays||{}};
    for(var d=1;d<=6;d++) schedule.weekly[d]=(base.weekly&&base.weekly[d])||{};
    return cleanScheduleMaps(schedule,pairs);
  }
  function subjectById(id) { return state.schedule.subjects.find(function(s){return s.id===id;}) || null; }
  function weekdayOfDate(date) { return new Date(String(date)+'T12:00:00').getDay(); }
  function actualSubjectId(date,pairId) {
    if(state.schedule.nonSchoolDays[date]) return null;
    var overrides=state.schedule.dateOverrides[date];
    if(overrides && Object.prototype.hasOwnProperty.call(overrides,pairId)) return overrides[pairId];
    var pair=activePairs().find(function(p){return p.id===pairId;});
    var wd=weekdayOfDate(date); return pair&&pair.number<=3&&wd>=1&&wd<=6 ? (state.schedule.weekly[wd]||{})[pairId] || null : null;
  }
  function actualSubjectLabel(date,pairId) {
    var id=actualSubjectId(date,pairId), sub=id&&subjectById(id);
    if(!id) return state.schedule.nonSchoolDays[date] ? 'Выходной' : 'Нет занятия';
    return sub ? (sub.teacher ? sub.name+' · '+sub.teacher : sub.name) : 'Занятие';
  }
  function weeklySubjectId(dayIndex,pairId) { return (state.schedule.weekly[dayIndex]||{})[pairId] || ''; }
  function schedulePairLabel(pair) { return pair.number+' пара'+(pair.start&&pair.end?' · '+pair.start+'–'+pair.end:''); }
  function allHistoryPairNumbers() {
    var set=new Set(activePairs().map(function(p){return p.number;}));
    state.absences.forEach(function(a){pairNumbersFromRecord(a).forEach(function(n){set.add(n);});});
    return Array.from(set).sort(function(a,b){return a-b;});
  }
  function allHistorySubjectNames() {
    var map=new Map();
    state.schedule.subjects.forEach(function(s){
      var key=s.name.toLocaleLowerCase();
      if(!map.has(key)) map.set(key,s.name);
    });
    return Array.from(map.values()).sort(compareNames);
  }
  function subjectNameMatches(subjectId, subjectName) {
    var s=subjectById(subjectId);
    return !!(s && subjectName && s.name.toLocaleLowerCase()===String(subjectName).toLocaleLowerCase());
  }
  function subjectPairsOnDate(date, subjectName) {
    return activePairs().filter(function(p){ return subjectNameMatches(actualSubjectId(date,p.id),subjectName); });
  }
  function absencePairsForSubject(record, date, subjectName) {
    var subjectPairNumbers=new Set(subjectPairsOnDate(date,subjectName).map(function(p){return p.number;}));
    return pairNumbersFromRecord(record).filter(function(n){return subjectPairNumbers.has(n);});
  }
  function pairNumbersFromRecord(record) {
    var list=Array.isArray(record&&record.pairs)?record.pairs.map(Number).filter(function(n){return Number.isFinite(n)&&n>=1;}).filter(function(n,i,a){return a.indexOf(n)===i;}).sort(function(a,b){return a-b;}):[];
    if(!list.length && Array.isArray(record&&record.periods)) list=record.periods.map(Number).filter(function(n){return n>=1&&n<=20;}).filter(function(n,i,a){return a.indexOf(n)===i;}).sort(function(a,b){return a-b;});
    if(!list.length && Number(record&&record.hours)>0) list=hoursToPeriods(Number(record.hours));
    return list;
  }
  function hoursToPeriods(hours) { if (hours >= 6) return [1,2,3]; if (hours >= 4) return [1,2]; if (hours >= 2) return [1]; return []; }
  function hoursFromPairs(pairs) { return (Array.isArray(pairs)?pairs.length:0)*2; }
  function pairLabel(number) { var p=activePairs().find(function(x){return x.number===Number(number);}); return p ? (p.start&&p.end ? number+' пара · '+p.start+'–'+p.end : number+' пара') : number+' пара'; }
  function normalizeGroup(value) {
    value = value || {};
    return {
      institution:normalizeName(value.institution) || DEFAULT_GROUP.institution,
      institutionShort:normalizeName(value.institutionShort) || DEFAULT_GROUP.institutionShort,
      specialty:normalizeName(value.specialty) || DEFAULT_GROUP.specialty,
      group:normalizeName(value.group) || DEFAULT_GROUP.group,
      curator:normalizeName(value.curator), groupLeader:normalizeName(value.groupLeader)
    };
  }
  function templateStudents() { return sortStudents(TEMPLATE_NAMES.map(function(name,i){ return {id:'student-'+(i+1),name:name}; })); }
  function normalizeStudents(value) {
    if (!Array.isArray(value)) return [];
    var seen = new Set(), ids = new Set(), result = [];
    value.forEach(function(item, index){
      var name = normalizeName(typeof item === 'string' ? item : item && item.name);
      if (!name) return;
      var nk = name.toLocaleLowerCase(); if (seen.has(nk)) return; seen.add(nk);
      var id = normalizeName(item && item.id) || ('student-' + (index+1));
      while (ids.has(id)) id = uid('student'); ids.add(id);
      result.push({id:id,name:name});
    });
    return sortStudents(result);
  }
  function normalizeAbsences(value, students) {
    if (!Array.isArray(value)) return [];
    var validIds = new Set((students || []).map(function(s){return s.id;}));
    var map = new Map();
    value.forEach(function(item){
      var studentId = typeof (item && item.studentId) === 'string' ? item.studentId.trim() : '';
      var date = typeof (item && item.date) === 'string' ? item.date : '';
      if (!studentId || !validIds.has(studentId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      var pairs = pairNumbersFromRecord(item);
      var hours = Math.min(40, Math.max(0, hoursFromPairs(pairs)));
      if (!hours) return;
      var reason = ['family','sick','order','none'].indexOf(item.reason) >= 0 ? item.reason : 'none';
      var allDay = !!item.allDay || pairs.length === activePairs().length;
      map.set(studentId + '|' + date, {studentId:studentId,date:date,hours:hours,pairs:pairs,periods:pairs.slice(),allDay:allDay,reason:reason});
    });
    return Array.from(map.values()).sort(function(a,b){ return a.date.localeCompare(b.date) || a.studentId.localeCompare(b.studentId); });
  }
  function currentRecord(studentId,date) { return state.absences.find(function(a){return a.studentId===studentId && a.date===date;}) || null; }
  function studentName(id) { var s=state.students.find(function(x){return x.id===id;}); return s ? s.name : 'Студент'; }
  function statsForToday() {
    var rows=state.absences.filter(function(a){return a.date===today();});
    return {students:state.students.length,marked:rows.length,hours:rows.reduce(function(sum,a){return sum+a.hours;},0)};
  }
  function snapshot() {
    return {schemaVersion:4,appVersion:APP_VERSION,students:state.students,absences:state.absences,group:state.group,reports:state.reports,settings:state.settings,schedule:state.schedule,updatedAt:new Date().toISOString()};
  }

  function normalizeLoadedData(data) {
    var students = normalizeStudents(data && data.students);
    if (!students.length) students = templateStudents();
    var absences = normalizeAbsences(data && data.absences, students);
    var reports = Array.isArray(data && data.reports) ? data.reports.filter(function(r){return r && /^\d{4}-\d{2}$/.test(r.monthKey);}) : [];
    var pairs=normalizePairs(data && data.settings && data.settings.pairs);
    state.students=students; state.absences=absences; state.group=normalizeGroup(data && data.group);
    state.reports=reports; state.settings={theme:['light','dark','system'].indexOf(data && data.settings && data.settings.theme)>=0 ? data.settings.theme : 'light',pairs:pairs};
    state.schedule=normalizeSchedule(data && data.schedule,pairs);
  }

  async function loadData() {
    try {
      var loaded = await window.AttendanceStorage.load();
      normalizeLoadedData(loaded && loaded.value);
    } catch (_) {
      normalizeLoadedData(null);
    }
    applyTheme();
    state.loading=false;
    app.dataset.started='1';
    render();
    window.AttendanceStorage.requestPersistence().catch(function(){});
  }

  function persistNow() {
    clearTimeout(saveTimer);
    var data=snapshot();
    saveTimer=setTimeout(function(){
      window.AttendanceStorage.save(data).then(function(result){ state.lastSaveOk=!!(result.db||result.local); }).catch(function(){ state.lastSaveOk=false; });
    }, 0);
  }

  function toast(message) {
    state.toast=String(message || '');
    clearTimeout(toastTimer);
    render();
    toastTimer=setTimeout(function(){ state.toast=''; render(); }, 2200);
  }

  function closePendingExport() {
    if (state.pendingExport) window.AttendanceExporter.revoke(state.pendingExport);
    state.pendingExport=null;
  }

  function prepareExport(bytesOrBlob, filename, mime) {
    closePendingExport();
    var item=window.AttendanceExporter.makeFile(bytesOrBlob,filename,mime);
    state.pendingExport=item;
    render();
    if (window.AttendanceExporter.canShare(item)) {
      try {
        window.AttendanceExporter.share(item).then(function(){ toast('Файл открыт в «Поделиться».'); }).catch(function(error){
          if (error && error.name === 'AbortError') { toast('Файл готов. Его можно открыть или сохранить ниже.'); return; }
          toast('«Поделиться» недоступно. Открой файл кнопкой ниже.');
        });
        return;
      } catch (_) {}
    }
    toast('Файл готов. Нажми «Открыть файл» ниже.');
  }

  function exportBackup() {
    try {
      var json=JSON.stringify({backupFormat:'AttendanceJournal',backupVersion:4,exportedAt:new Date().toISOString(),appVersion:APP_VERSION,data:snapshot()},null,2);
      prepareExport(new Blob([json],{type:'application/json'}),'AttendanceJournal_backup_' + today() + '.json','application/json');
    } catch (error) {
      console.error(error); alert('Не удалось подготовить резервную копию.');
    }
  }

  function importBackup(file) {
    if (!file) return;
    var reader=new FileReader();
    reader.onload=function(){
      try {
        var raw=JSON.parse(String(reader.result || '{}'));
        var data=raw && raw.backupFormat==='AttendanceJournal' ? raw.data : raw;
        var students=normalizeStudents(data && data.students);
        if (!students.length) throw new Error('Нет студентов');
        if (!confirm('Восстановить резервную копию? Текущие данные будут заменены данными из файла.')) return;
        normalizeLoadedData(data);
        persistNow(); applyTheme(); render(); toast('Backup восстановлен: ' + state.students.length + ' студентов, ' + state.absences.length + ' отметок');
      } catch (error) {
        console.error(error); alert('Не удалось восстановить backup. Выбери JSON-файл из AttendanceJournal.');
      } finally { backupFile.value=''; }
    };
    reader.onerror=function(){ backupFile.value=''; alert('Не удалось прочитать файл backup.'); };
    reader.readAsText(file,'utf-8');
  }

  function saveAttendance() {
    var m=state.modal; if (!m || m.type!=='attendance') return;
    var allowed=new Set(attendancePairsForDate(m.date,currentRecord(m.studentId,m.date)));
    var selected=(m.pairs||[]).map(Number).filter(function(n){return allowed.has(n);}).filter(function(n,i,a){return a.indexOf(n)===i;}).sort(function(a,b){return a-b;});
    var scheduled=scheduledPairNumbers(m.date);
    var existing=state.absences.filter(function(a){return !(a.studentId===m.studentId && a.date===m.date);});
    if (selected.length) existing.push({studentId:m.studentId,date:m.date,pairs:selected,periods:selected,hours:hoursFromPairs(selected),allDay:scheduled.length>0&&selected.length===scheduled.length,reason:m.reason});
    state.absences=normalizeAbsences(existing,state.students); state.modal=null; persistNow(); render(); toast(selected.length ? (scheduled.length>0&&selected.length===scheduled.length ? 'НБ сохранена: весь день' : 'НБ сохранена: '+selected.length+' '+(selected.length===1?'пара':'пары')+' · '+hoursFromPairs(selected)+' ч.') : 'НБ снята');
  }
  function removeAttendance() {
    var m=state.modal; if (!m) return;
    state.absences=state.absences.filter(function(a){return !(a.studentId===m.studentId && a.date===m.date);}); state.modal=null; persistNow(); render(); toast('НБ снята');
  }
  function openAttendance(studentId,date) {
    var record=currentRecord(studentId,date); state.modal={type:'attendance',studentId:studentId,date:date,hours:record?record.hours:0,pairs:record?pairNumbersFromRecord(record):[],periods:record?pairNumbersFromRecord(record):[],reason:record?record.reason:'none'}; render();
  }
  function saveStudent() {
    var m=state.modal; if (!m || m.type!=='student') return;
    var name=normalizeName(m.name); if (!name) { toast('Введите ФИО'); return; }
    var duplicate=state.students.some(function(s){return s.id!==m.studentId && s.name.toLocaleLowerCase()===name.toLocaleLowerCase();}); if (duplicate) { toast('Такой студент уже есть'); return; }
    if (m.studentId) state.students=state.students.map(function(s){return s.id===m.studentId ? {id:s.id,name:name} : s;});
    else state.students=state.students.concat([{id:uid('student'),name:name}]);
    state.students=sortStudents(state.students); state.modal=null; persistNow(); render(); toast('Сохранено');
  }
  function deleteStudent(id) {
    var student=state.students.find(function(s){return s.id===id;}); if (!student) return;
    if (!confirm('Удалить «'+student.name+'»? Все его отметки НБ тоже будут удалены.')) return;
    state.students=state.students.filter(function(s){return s.id!==id;}); state.absences=state.absences.filter(function(a){return a.studentId!==id;}); persistNow(); render(); toast('Студент удалён');
  }
  function saveGroup() {
    state.group=normalizeGroup({
      institution:document.getElementById('gInstitution').value,
      institutionShort:document.getElementById('gInstitutionShort').value,
      specialty:document.getElementById('gSpecialty').value,
      group:document.getElementById('gGroup').value,
      curator:document.getElementById('gCurator').value,
      groupLeader:document.getElementById('gLeader').value
    });
    persistNow(); render(); toast('Данные группы сохранены');
  }
  function parseBulk(text) {
    var list=String(text || '').split(/\r?\n/).map(function(x){return normalizeName(x.replace(/^\s*\d+[.)]\s*/,''));}).filter(Boolean);
    var seen=new Set(), unique=[];
    list.forEach(function(name){ var key=name.toLocaleLowerCase(); if(!seen.has(key)){seen.add(key);unique.push(name);} });
    return unique;
  }
  function replaceStudents(text) {
    var names=parseBulk(text); if (!names.length) { toast('Введите ФИО по одному в строке'); return; }
    if (!confirm('Заменить список группы на ' + names.length + ' студентов? История совпавших ФИО будет сохранена.')) return;
    var oldByName=new Map(state.students.map(function(s){return [s.name.toLocaleLowerCase(),s.id];}));
    state.students=sortStudents(names.map(function(name,index){ return {id:oldByName.get(name.toLocaleLowerCase()) || uid('student')+'-'+index,name:name}; }));
    state.absences=normalizeAbsences(state.absences,state.students); state.bulkNames=names.join('\n'); persistNow(); render(); toast('Список загружен и отсортирован по алфавиту');
  }
  function restoreTemplate() {
    if (!confirm('Вернуть список из 25 ФИО шаблона? Совпавшая история будет сохранена.')) return;
    var oldByName=new Map(state.students.map(function(s){return [s.name.toLocaleLowerCase(),s.id];}));
    state.students=sortStudents(TEMPLATE_NAMES.map(function(name,index){return {id:oldByName.get(name.toLocaleLowerCase()) || 'student-template-' + (index+1),name:name};}));
    state.absences=normalizeAbsences(state.absences,state.students); persistNow(); render(); toast('Шаблон восстановлен');
  }
  function savePairs() {
    var rows=Array.from(document.querySelectorAll('[data-pair-row]')).map(function(row,index){
      return {id:row.dataset.pairId||uid('pair'),number:Number(row.querySelector('[data-pair-number]').value)||index+1,start:row.querySelector('[data-pair-start]').value,end:row.querySelector('[data-pair-end]').value,subject:row.querySelector('[data-pair-subject]').value,teacher:row.querySelector('[data-pair-teacher]').value};
    });
    rows=normalizePairs(rows); if(!rows.length){toast('Нужна хотя бы одна пара');return;}
    var used=new Set(); for(var i=0;i<rows.length;i++){if(used.has(rows[i].number)){toast('Номера пар не должны повторяться');return;}used.add(rows[i].number);}
    state.settings.pairs=rows;
    state.schedule=normalizeSchedule(state.schedule,rows);
    state.absences=normalizeAbsences(state.absences,state.students);
    persistNow(); render(); toast('Расписание пар сохранено');
  }
  function addPairRow() {
    state.settings.pairs=normalizePairs(state.settings.pairs).concat([{id:uid('pair'),number:Math.max.apply(null,normalizePairs(state.settings.pairs).map(function(p){return p.number;}).concat([0]))+1,start:'',end:'',subject:'',teacher:''}]);
    state.settings.pairs=normalizePairs(state.settings.pairs); render();
  }
  function removePairRow(id) {
    if(normalizePairs(state.settings.pairs).length<=1){toast('Оставь хотя бы одну пару');return;}
    state.settings.pairs=normalizePairs(state.settings.pairs).filter(function(p){return p.id!==id;});
    state.schedule=normalizeSchedule(state.schedule,state.settings.pairs);
    state.absences=normalizeAbsences(state.absences,state.students); persistNow(); render();
  }

  function saveSubjects() {
    var rows=Array.from(document.querySelectorAll('[data-subject-row]')).map(function(row){
      return {id:row.dataset.subjectId||uid('subject'),name:row.querySelector('[data-subject-name]').value,teacher:row.querySelector('[data-subject-teacher]').value};
    });
    var normalized=normalizeSubjects(rows);
    if(rows.length && !normalized.length){toast('Добавь хотя бы одно название занятия');return;}
    var oldIds=new Set(state.schedule.subjects.map(function(x){return x.id;}));
    var newIds=new Set(normalized.map(function(x){return x.id;}));
    if(normalized.length!==rows.length){toast('Названия занятий должны быть заполнены и не повторяться');return;}
    state.schedule.subjects=normalized;
    Object.keys(state.schedule.weekly).forEach(function(day){Object.keys(state.schedule.weekly[day]||{}).forEach(function(pairId){if(!newIds.has(state.schedule.weekly[day][pairId]))delete state.schedule.weekly[day][pairId];});});
    Object.keys(state.schedule.dateOverrides).forEach(function(date){Object.keys(state.schedule.dateOverrides[date]||{}).forEach(function(pairId){var v=state.schedule.dateOverrides[date][pairId];if(v!==null&&!newIds.has(v))delete state.schedule.dateOverrides[date][pairId];});});
    persistNow(); render(); toast('Занятия сохранены');
  }
  function addSubject() {
    state.schedule.subjects=state.schedule.subjects.concat([{id:uid('subject'),name:'',teacher:''}]); render();
  }
  function deleteSubject(id) {
    var subject=subjectById(id); if(!subject)return;
    if(!confirm('Удалить занятие «'+subject.name+'»? Оно будет убрано из недельного расписания и разовых замен.'))return;
    state.schedule.subjects=state.schedule.subjects.filter(function(s){return s.id!==id;});
    Object.keys(state.schedule.weekly).forEach(function(day){if(state.schedule.weekly[day])Object.keys(state.schedule.weekly[day]).forEach(function(pairId){if(state.schedule.weekly[day][pairId]===id)delete state.schedule.weekly[day][pairId];});});
    Object.keys(state.schedule.dateOverrides).forEach(function(date){if(state.schedule.dateOverrides[date])Object.keys(state.schedule.dateOverrides[date]).forEach(function(pairId){if(state.schedule.dateOverrides[date][pairId]===id)delete state.schedule.dateOverrides[date][pairId];});});
    persistNow(); render(); toast('Занятие удалено');
  }
  function saveWeeklySchedule() {
    var weekly={1:{},2:{},3:{},4:{},5:{},6:{}};
    document.querySelectorAll('[data-week-slot]').forEach(function(select){
      var day=Number(select.dataset.weekday),pairId=select.dataset.pairId,value=select.value;
      if(day>=1&&day<=6&&pairId){if(value)weekly[day][pairId]=value;}
    });
    state.schedule.weekly=weekly; state.schedule=cleanScheduleMaps(state.schedule,activePairs());
    persistNow(); render(); toast('Недельное расписание сохранено');
  }
  function saveScheduleDay() {
    var date=document.getElementById('scheduleDateInput').value||today();
    var isOff=!!document.getElementById('scheduleNonSchool').checked;
    var overrides={};
    document.querySelectorAll('[data-day-slot]').forEach(function(select){
      var pairId=select.dataset.pairId,value=select.value;
      if(value==='__weekly__'||!pairId)return;
      overrides[pairId]=value==='__none__' ? null : value;
    });
    if(isOff){
      state.schedule.nonSchoolDays[date]={label:'Выходной'};
      delete state.schedule.dateOverrides[date];
    } else {
      delete state.schedule.nonSchoolDays[date];
      if(Object.keys(overrides).length)state.schedule.dateOverrides[date]=overrides;else delete state.schedule.dateOverrides[date];
    }
    state.scheduleDate=date; state.schedule=cleanScheduleMaps(state.schedule,activePairs()); persistNow(); render(); toast(isOff?'День отмечен как выходной':'Изменения дня сохранены');
  }
  function resetScheduleDay() {
    var date=document.getElementById('scheduleDateInput') ? document.getElementById('scheduleDateInput').value : state.scheduleDate;
    delete state.schedule.dateOverrides[date]; delete state.schedule.nonSchoolDays[date]; state.scheduleDate=date; persistNow(); render(); toast('Изменения дня сброшены');
  }

  function generateReport(month) {
    try {
      var bytes=window.AttendanceDocx.buildAttendanceDocx(state.group,state.students,state.absences,month);
      var filename='Ведомость_' + safeFilename(state.group.group) + '_' + month + '.docx';
      state.reports=[{monthKey:month,generatedAt:new Date().toISOString(),filename:filename}].concat(state.reports.filter(function(r){return r.monthKey!==month;})).slice(0,24);
      persistNow();
      prepareExport(bytes,filename,window.AttendanceDocx.mimeType);
    } catch (error) {
      console.error(error); alert('Не удалось сформировать Word. Ошибка: ' + (error.message || error));
    }
  }

  function applyTheme() {
    var theme=state.settings.theme;
    if (theme==='system') { var dark=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; theme=dark?'dark':'light'; }
    document.documentElement.dataset.theme=theme;
  }
  function openScreen(screen) { state.screen=screen; state.drawer=false; state.modal=null; if(screen==='group') state.bulkNames=state.bulkNames || state.students.map(function(s){return s.name;}).join('\n'); render(); }
  function showInstallHelp() { alert('На iPhone: открой адрес в Safari → Поделиться → «На экран Домой» → включи «Открыть как веб‑приложение» → Добавить.'); }

  function exportReadyHtml() {
    if (!state.pendingExport) return '';
    var p=state.pendingExport;
    var share='<button class="btn" data-action="share-file">Поделиться</button>';
    return '<div class="page-card export-ready"><div class="export-title">Файл готов</div><div class="export-name">' + esc(p.filename) + '</div><div class="toolbar"><button class="btn primary" data-action="open-file">Открыть файл</button>' + share + '<a class="btn" href="' + esc(p.url) + '" download="' + esc(p.filename) + '" target="_blank" rel="noopener">Сохранить</a><button class="btn ghost" data-action="close-export">Скрыть</button></div><p>На iPhone можно открыть файл, затем выбрать «Поделиться» → «Сохранить в Файлы».</p></div>'; 
  }

  function render() {
    applyTheme();
    document.querySelectorAll('.toast').forEach(function(node){ if(node.parentNode) node.parentNode.removeChild(node); });
    app.innerHTML=state.loading ? '<div class="loading-screen"><div class="boot-card"><strong>Посещаемость</strong><span>Загрузка данных…</span></div></div>' : renderApp();
    if (state.toast) {
      var toast=document.createElement('div'); toast.className='toast'; toast.textContent=state.toast; document.body.appendChild(toast);
    }
  }

  function topbar(title,subtitle) {
    return '<header class="topbar"><button class="icon-btn" data-action="menu" aria-label="Меню">☰</button><div class="topbar-title"><div class="title">'+esc(title)+'</div>'+(subtitle?'<div class="subtitle">'+esc(subtitle)+'</div>':'')+'</div><button class="icon-btn" data-action="home" aria-label="Главная">⌂</button></header>';
  }
  function titleForScreen() { return ({home:'Посещаемость',report:'Ведомость',history:'История',schedule:'Расписание',group:'Группа',backup:'Резервная копия',settings:'Настройки'})[state.screen] || 'Посещаемость'; }
  function subtitleForScreen() { return state.screen==='home' ? state.group.group + ' · ' + formatDate(today()) : ''; }
  function renderHome() {
    var st=statsForToday();
    return '<section class="hero"><div class="eyebrow">Сегодня · '+esc(state.group.group)+'</div><h1>'+esc(formatDate(today()))+'</h1><div class="date">Отмечай только НБ — ведомость и итоги приложение заполнит само.</div><div class="stats"><div class="stat"><div class="n">'+st.students+'</div><div class="l">студентов</div></div><div class="stat"><div class="n">'+st.marked+'</div><div class="l">с НБ сегодня</div></div><div class="stat"><div class="n">'+st.hours+'</div><div class="l">часов НБ</div></div></div></section><div class="section-title"><h2>Группа</h2><span class="hint">Нажми на студента</span></div><div class="student-list">'+(state.students.length ? state.students.map(function(s){var a=currentRecord(s.id,today());var label=a ? (a.allDay ? 'Весь день НБ' : 'НБ · '+a.hours+' ч.') : 'Нет НБ';return '<button class="student-card" data-action="attendance" data-student="'+esc(s.id)+'"><div class="student-main"><div class="student-name">'+esc(s.name)+'</div><div class="student-meta">'+esc(a?reasonInfo(a.reason).label:'Посещаемость без НБ')+'</div></div><span class="badge '+(a?'nb':'none')+'">'+esc(label)+'</span></button>';}).join('') : '<div class="page-card"><div class="empty">Пока нет студентов. Добавь их в разделе «Группа».</div></div>')+'</div><div class="section-title"><h2>Быстрые действия</h2></div><div class="toolbar"><button class="btn primary" data-action="screen" data-screen="report">📄 Ведомость</button><button class="btn" data-action="screen" data-screen="history">🕘 История</button><button class="btn" data-action="screen" data-screen="backup">💾 Backup</button></div>';
  }
  function reportSummary(month) { var rows=state.absences.filter(function(a){return a.date.indexOf(month+'-')===0;}); var total=0,ok=0,bad=0; rows.forEach(function(a){total+=a.hours;if(a.reason==='none')bad+=a.hours;else ok+=a.hours;}); return {records:rows.length,total:total,ok:ok,bad:bad}; }
  function renderReportTable(month) {
    var days=daysInMonth(month), grand=0,ok=0,bad=0;
    var rows=state.students.map(function(s,index){
      var total=0,good=0,badRow=0,notes=new Set();
      var cells=Array.from({length:31},function(_,i){
        var d=i+1, date=month+'-'+String(d).padStart(2,'0'), sun=d<=days&&dayOfWeek(month,d)===0, a=d<=days?currentRecord(s.id,date):null;
        if(!a) return '<td class="'+(sun?'sun ':'')+'empty">'+(d<=days?'':'—')+'</td>';
        total+=a.hours; if(a.reason==='none')badRow+=a.hours; else good+=a.hours; var n=reasonInfo(a.reason).short; if(n!=='без причины')notes.add(n);
        return '<td class="'+(sun?'sun ':'')+'filled"><button data-action="edit-record" data-student="'+esc(s.id)+'" data-date="'+date+'">'+a.hours+'</button></td>';
      }).join('');
      grand+=total;ok+=good;bad+=badRow;
      return '<tr><td>'+(index+1)+'</td><td class="name">'+esc(s.name)+'</td>'+cells+'<td class="total">'+(total||'—')+'</td><td class="total">'+(good||'—')+'</td><td class="total">'+(badRow||'—')+'</td><td class="name">'+esc(Array.from(notes).join(' · '))+'</td></tr>';
    }).join('');
    return '<div class="report-table-wrap"><table class="report-table"><thead><tr><th rowspan="2">№</th><th rowspan="2" class="name">ФИ студента</th><th colspan="31">Числа месяца</th><th rowspan="2">Итог</th><th colspan="2">Из них по причинам</th><th rowspan="2">Примечание</th></tr><tr>'+Array.from({length:31},function(_,i){var d=i+1,sun=d<=days&&dayOfWeek(month,d)===0;return '<th class="'+(sun?'sun':'')+'">'+d+'</th>';}).join('')+'<th>ува-жит</th><th>не-ув</th></tr></thead><tbody>'+rows+'<tr><td colspan="2" class="name"><strong>ИТОГО</strong></td>'+Array(31).fill('<td></td>').join('')+'<td class="total">'+(grand||'—')+'</td><td class="total">'+(ok||'—')+'</td><td class="total">'+(bad||'—')+'</td><td></td></tr></tbody></table></div>';
  }
  function renderReport() {
    var m=state.reportMonth,s=reportSummary(m), prior=state.reports.filter(function(r){return r.monthKey!==m;}).sort(function(a,b){return String(b.generatedAt).localeCompare(String(a.generatedAt));}).slice(0,8);
    return '<div class="page-card"><h3>Ведомость за '+esc(monthTitle(m))+'</h3><p>Итоги считаются из дневных отметок. Никакие старые итоговые числа из Word не переносятся в новый документ.</p><div class="month-row"><button class="btn small" data-action="month-shift" data-kind="report" data-by="-1">‹</button><div class="month-caption">'+esc(monthTitle(m))+'</div><button class="btn small" data-action="month-shift" data-kind="report" data-by="1">›</button><input id="reportMonthInput" type="month" value="'+esc(m)+'"></div><div class="stats mini"><div class="stat"><div class="n">'+s.total+'</div><div class="l">всего часов</div></div><div class="stat"><div class="n">'+s.ok+'</div><div class="l">уважительных</div></div><div class="stat"><div class="n">'+s.bad+'</div><div class="l">неуважительных</div></div></div><div class="toolbar"><button class="btn primary" data-action="generate-report">📄 Сформировать Word</button><button class="btn" data-action="screen" data-screen="history">Открыть историю</button></div></div>'+exportReadyHtml()+renderReportTable(m)+'<div class="section-title"><h2>Последние ведомости</h2></div><div class="page-card">'+(prior.length ? prior.map(function(r){return '<div class="history-row"><div class="history-main"><div class="history-title">'+esc(monthTitle(r.monthKey))+'</div><div class="history-sub">Создана '+esc(new Date(r.generatedAt).toLocaleString('ru-RU'))+'</div></div><button class="btn small" data-action="regenerate" data-month="'+esc(r.monthKey)+'">Word</button></div>';}).join('') : '<div class="empty">Здесь будут последние сформированные ведомости.</div>')+'</div>';
  }
  function renderHistory() {
    var records=state.absences.filter(function(a){
      var inPeriod=state.historyMode==='day' ? a.date===state.historyDay : a.date.indexOf(state.historyMonth+'-')===0;
      if(!inPeriod || (state.historyStudentId!=='all' && a.studentId!==state.historyStudentId)) return false;
      if(state.historyMode==='subject' && state.historySubjectName!=='all') return absencePairsForSubject(a,a.date,state.historySubjectName).length>0;
      if(state.historyMode==='pair' && state.historyPair!=='all') return pairNumbersFromRecord(a).indexOf(Number(state.historyPair))>=0;
      return true;
    });
    records.sort(function(a,b){return a.date.localeCompare(b.date)||compareNames(studentName(a.studentId),studentName(b.studentId));});

    var controls='<div class="history-tabs"><button class="btn small '+(state.historyMode==='month'?'active':'')+'" data-action="history-mode" data-mode="month">По месяцу</button><button class="btn small '+(state.historyMode==='day'?'active':'')+'" data-action="history-mode" data-mode="day">По дню</button><button class="btn small '+(state.historyMode==='subject'?'active':'')+'" data-action="history-mode" data-mode="subject">По предмету</button></div>';
    var dateControls=state.historyMode==='day' ? '<div class="field"><label>День</label><input id="historyDayInput" type="date" value="'+esc(state.historyDay)+'"></div>' : '<div class="month-row"><button class="btn small" data-action="month-shift" data-kind="history" data-by="-1">‹</button><div class="month-caption">'+esc(monthTitle(state.historyMonth))+'</div><button class="btn small" data-action="month-shift" data-kind="history" data-by="1">›</button><input id="historyMonthInput" type="month" value="'+esc(state.historyMonth)+'"></div>';
    var subjectControl=state.historyMode==='subject' ? '<div class="field"><label>Предмет</label><select id="historySubject"><option value="all">Все предметы</option>'+allHistorySubjectNames().map(function(name){return '<option value="'+esc(name)+'" '+(String(state.historySubjectName).toLocaleLowerCase()===String(name).toLocaleLowerCase()?'selected':'')+'>'+esc(name)+'</option>';}).join('')+'</select></div>' : '';
    var pairControl=state.historyMode==='pair' ? '<div class="field"><label>Номер пары</label><select id="historyPair"><option value="all">Все пары</option>'+allHistoryPairNumbers().map(function(n){return '<option value="'+n+'" '+(String(state.historyPair)===String(n)?'selected':'')+'>'+esc(pairLabel(n))+'</option>';}).join('')+'</select></div>' : '';

    if(state.historyMode==='subject'){
      var subjectName=state.historySubjectName==='all' ? null : state.historySubjectName;
      var subjectDates=[];
      if(subjectName){
        var month=state.historyMonth, days=daysInMonth(month);
        for(var day=1;day<=days;day++){
          var date=month+'-'+String(day).padStart(2,'0');
          if(subjectPairsOnDate(date,subjectName).length) subjectDates.push(date);
        }
      }
      var subjectRows=subjectDates.map(function(date){
        var matching=records.filter(function(a){return a.date===date && absencePairsForSubject(a,date,subjectName).length>0;});
        var students=matching.map(function(a){return {name:studentName(a.studentId),id:a.studentId,reason:reasonInfo(a.reason).label,pairs:absencePairsForSubject(a,date,subjectName)};}).sort(function(a,b){return compareNames(a.name,b.name);});
        var content=students.length ? '<div class="history-subject-list">'+students.map(function(item){return '<div class="history-subject-student"><div><strong>'+esc(item.name)+'</strong><div class="history-sub">НБ · '+esc(item.pairs.map(function(n){return n+' пара';}).join(', '))+' · '+esc(item.reason)+'</div></div><button class="btn small" data-action="edit-record" data-student="'+esc(item.id)+'" data-date="'+esc(date)+'">Изменить</button></div>';}).join('')+'</div>' : '<div class="history-subject-none">НБ нет</div>';
        return '<div class="history-subject-day"><div class="history-title">'+esc(shortDate(date))+'</div>'+content+'</div>';
      }).join('');
      if(!subjectName) subjectRows='<div class="empty">Выбери предмет, чтобы увидеть список дат.</div>';
      else if(!subjectDates.length) subjectRows='<div class="empty">В '+esc(monthTitle(state.historyMonth))+' этот предмет по расписанию не стоит.</div>';
      return '<div class="page-card"><h3>История по предмету</h3><p>Для каждой даты показывается, кто отсутствовал на выбранном предмете. Если НБ нет — так и указано. Разовые замены учитываются.</p>'+controls+dateControls+subjectControl+'<div class="field"><label>Студент</label><select id="historyStudent"><option value="all">Все студенты</option>'+state.students.map(function(s){return '<option value="'+esc(s.id)+'" '+(state.historyStudentId===s.id?'selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</select></div></div><div class="page-card">'+subjectRows+'</div>';
    }

    var countText=state.historyMode==='pair' ? 'Записи за '+monthTitle(state.historyMonth)+' по выбранной паре.' : 'Смотри историю как по месяцу, по конкретному дню или по названию предмета.';
    var rows=[];
    records.forEach(function(a){
      var pairs=pairNumbersFromRecord(a);
      var visiblePairs=state.historyMode==='pair'&&state.historyPair!=='all'?pairs.filter(function(n){return n===Number(state.historyPair);}):pairs;
      visiblePairs.forEach(function(n){
        var pairObj=activePairs().find(function(p){return p.number===n;});
        var subject=pairObj ? actualSubjectLabel(a.date,pairObj.id) : 'Пара';
        rows.push('<div class="history-row"><div class="history-date">'+esc(shortDate(a.date))+'</div><div class="history-main"><div class="history-title">'+esc(studentName(a.studentId))+' · '+esc(n+' пара')+'</div><div class="history-sub">НБ · 2 ч. · '+esc(subject)+' · '+esc(reasonInfo(a.reason).label)+'</div></div><button class="btn small" data-action="edit-record" data-student="'+esc(a.studentId)+'" data-date="'+esc(a.date)+'">Изменить</button></div>');
      });
    });
    return '<div class="page-card"><h3>История НБ</h3><p>'+esc(countText)+'</p>'+controls+dateControls+pairControl+'<div class="field"><label>Студент</label><select id="historyStudent"><option value="all">Все студенты</option>'+state.students.map(function(s){return '<option value="'+esc(s.id)+'" '+(state.historyStudentId===s.id?'selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</select></div></div><div class="page-card">'+(rows.length?rows.join(''):'<div class="empty">За выбранный период записей нет.</div>')+'</div>';
  }
  function renderGroup() {
    var g=state.group;
    return '<div class="page-card"><h3>Данные ведомости</h3><p>Эти сведения автоматически попадут в Word.</p><div class="form-grid"><div class="field full"><label>Учреждение</label><input id="gInstitution" value="'+esc(g.institution)+'"></div><div class="field"><label>Короткое название</label><input id="gInstitutionShort" value="'+esc(g.institutionShort)+'"></div><div class="field"><label>Группа</label><input id="gGroup" value="'+esc(g.group)+'"></div><div class="field full"><label>Специальность</label><input id="gSpecialty" value="'+esc(g.specialty)+'"></div><div class="field"><label>Классный руководитель</label><input id="gCurator" value="'+esc(g.curator)+'"></div><div class="field"><label>Староста</label><input id="gLeader" value="'+esc(g.groupLeader)+'"></div></div><div class="toolbar"><button class="btn primary" data-action="save-group">Сохранить данные группы</button></div></div><div class="page-card"><h3>Студенты · '+state.students.length+'</h3><p>Список всегда сортируется по алфавиту. При переименовании ID студента сохраняется, поэтому история не пропадает.</p><div class="student-list management-list">'+state.students.map(function(s,i){return '<div class="student-card"><div class="student-main"><div class="student-name">'+(i+1)+'. '+esc(s.name)+'</div></div><button class="btn small" data-action="edit-student" data-student="'+esc(s.id)+'">Изменить</button><button class="btn small danger" data-action="delete-student" data-student="'+esc(s.id)+'">Удалить</button></div>';}).join('')+'</div><div class="toolbar"><button class="btn primary" data-action="new-student">＋ Добавить студента</button></div></div><div class="page-card"><h3>Загрузить список целиком</h3><p>Вставь ФИО по одному в строке. Номера «1.» автоматически убираются. После загрузки список сортируется.</p><div class="field"><textarea id="bulkNames" placeholder="1. Иванов И.И.\n2. Петров П.П.\n3. ...">'+esc(state.bulkNames)+'</textarea></div><div class="toolbar"><button class="btn" data-action="bulk-load">Загрузить список</button><button class="btn ghost" data-action="restore-template">Вернуть 25 ФИО из шаблона</button></div></div>';
  }
  function renderBackup() {
    var size=(new Blob([JSON.stringify(snapshot())]).size/1024).toFixed(1);
    return '<div class="page-card"><h3>Резервная копия</h3><p>В backup входят группа, весь список студентов, вся история НБ за все годы, отчёты, пары и расписание.</p><div class="toolbar"><button class="btn primary" data-action="export-backup">⬇ Создать backup</button><button class="btn" data-action="import-backup">⬆ Восстановить backup</button></div><div class="footer-note">Размер текущих данных примерно '+size+' КБ. После создания файла его можно сохранить в «Файлы» на iPhone.</div></div>'+exportReadyHtml()+'<div class="page-card"><h3>Надёжность хранения</h3><p>Основное хранилище — IndexedDB. Дополнительно приложение держит локальную копию состояния и запрашивает persistent storage, когда браузер это поддерживает. Backup остаётся отдельной независимой копией.</p></div>';
  }
  function renderSchedule() {
    var pairs=activePairs(), weekPairs=weeklyPairs(), subjects=state.schedule.subjects;
    var optionHtml=function(selected,allowBase){
      var out=allowBase?'<option value="__weekly__" '+(selected==='__weekly__'?'selected':'')+'>По недельному расписанию</option>':'';
      out+='<option value="__none__" '+(selected==='__none__'?'selected':'')+'>Нет занятия</option>';
      out+=subjects.map(function(s){return '<option value="'+esc(s.id)+'" '+(selected===s.id?'selected':'')+'>'+esc(s.name+(s.teacher?' · '+s.teacher:''))+'</option>';}).join('');
      return out;
    };
    var subjectRows=subjects.map(function(s){return '<div class="subject-row" data-subject-row data-subject-id="'+esc(s.id)+'"><div class="field"><label>Занятие</label><input data-subject-name value="'+esc(s.name)+'" placeholder="Например, Математика"></div><div class="field"><label>Преподаватель</label><input data-subject-teacher value="'+esc(s.teacher||'')+'" placeholder="Необязательно"></div><button class="btn small danger" data-action="delete-subject" data-subject-id="'+esc(s.id)+'">Удалить</button></div>';}).join('');
    var weekDays=WEEK_DAYS.map(function(day){
      var slots=weekPairs.map(function(p){var value=weeklySubjectId(day.index,p.id);return '<div class="schedule-slot"><div class="schedule-slot-head"><strong>'+esc(schedulePairLabel(p))+'</strong></div><select data-week-slot data-weekday="'+day.index+'" data-pair-id="'+esc(p.id)+'"><option value="">Нет занятия</option>'+subjects.map(function(s){return '<option value="'+esc(s.id)+'" '+(value===s.id?'selected':'')+'>'+esc(s.name+(s.teacher?' · '+s.teacher:''))+'</option>';}).join('')+'</select></div>';}).join('');
      return '<div class="week-day"><h4>'+esc(day.name)+'</h4>'+slots+'</div>';
    }).join('');
    var date=state.scheduleDate||today(),isOff=!!state.schedule.nonSchoolDays[date],overrides=state.schedule.dateOverrides[date]||{};
    var dayRows=pairs.map(function(p){
      var override=Object.prototype.hasOwnProperty.call(overrides,p.id), value=override?(overrides[p.id]===null?'__none__':overrides[p.id]):'__weekly__';
      return '<div class="schedule-day-row"><div class="schedule-pair-info"><strong>'+esc(schedulePairLabel(p))+'</strong><small>'+esc(actualSubjectLabel(date,p.id))+'</small></div><select data-day-slot data-pair-id="'+esc(p.id)+'" '+(isOff?'disabled':'')+'>'+optionHtml(value,true)+'</select></div>';
    }).join('');
    return '<div class="page-card"><h3>Все занятия</h3><p>Здесь хранится библиотека предметов и занятий. Она не показывается на главном экране.</p><div class="subjects-list">'+(subjectRows||'<div class="empty">Добавь первое занятие.</div>')+'</div><div class="toolbar"><button class="btn" data-action="add-subject">＋ Добавить занятие</button><button class="btn primary" data-action="save-subjects">Сохранить занятия</button></div></div><div class="page-card"><h3>Недельное расписание</h3><p>В обычной неделе — максимум 3 пары на день, с понедельника по субботу. Если пары нет, оставь «Нет занятия». Изменения конкретной даты ниже не меняют недельный шаблон.</p><div class="week-grid">'+weekDays+'</div><div class="toolbar"><button class="btn primary" data-action="save-weekly">Сохранить неделю</button></div></div><div class="page-card"><h3>Изменить конкретный день</h3><p>Для выбранной даты можно заменить занятия, отменить их или добавить дополнительные 4–6 пары. Эти изменения действуют только на эту дату.</p><div class="month-row"><button class="btn small" data-action="schedule-date-shift" data-by="-1">‹</button><div class="month-caption">'+esc(formatDate(date))+'</div><button class="btn small" data-action="schedule-date-shift" data-by="1">›</button><input id="scheduleDateInput" type="date" value="'+esc(date)+'"></div><label class="toggle-line"><input id="scheduleNonSchool" type="checkbox" '+(isOff?'checked':'')+'> <span><strong>Выходной / занятий нет</strong></span></label><div class="schedule-day-list">'+dayRows+'</div><div class="toolbar"><button class="btn primary" data-action="save-schedule-day">Сохранить день</button><button class="btn ghost" data-action="reset-schedule-day">Сбросить изменения дня</button></div></div>';
  }
  function renderSettings() {
    return '<div class="page-card"><h3>Внешний вид</h3><div class="field"><label>Тема</label><select id="themeSelect"><option value="light" '+(state.settings.theme==='light'?'selected':'')+'>Светлая</option><option value="dark" '+(state.settings.theme==='dark'?'selected':'')+'>Тёмная</option><option value="system" '+(state.settings.theme==='system'?'selected':'')+'>Как в системе</option></select></div><p class="theme-note">Тёмная тема переработана для текста, полей, таблиц, кнопок и окон.</p></div><div class="page-card"><h3>Установка на iPhone</h3><p>Открой приложение в Safari → Поделиться → «На экран Домой» → «Открыть как веб‑приложение» → Добавить.</p><div class="toolbar"><button class="btn" data-action="show-install">Показать инструкцию</button></div></div><div class="page-card"><h3>О приложении</h3><p>Версия '+APP_VERSION+'. PWA без аккаунтов и без сервера для хранения посещаемости.</p></div>';
  }
  function renderDrawer() {
    var items=[['home','🏠','Сегодня'],['report','📄','Ведомость'],['history','🕘','История'],['schedule','📅','Расписание'],['group','👥','Группа'],['backup','💾','Backup'],['settings','⚙️','Настройки']];
    return '<div class="drawer" data-action="close-menu"><aside class="drawer-panel" data-stop="1"><div class="drawer-brand">Посещаемость</div><div class="drawer-caption">'+esc(state.group.group)+' · офлайн</div><div class="menu-list">'+items.map(function(item){return '<button class="menu-item '+(state.screen===item[0]?'active':'')+'" data-action="screen" data-screen="'+item[0]+'"><span class="menu-icon">'+item[1]+'</span><span>'+item[2]+'</span></button>';}).join('')+'</div><div class="drawer-foot">Староста отмечает только НБ. Ведомость и итоги формирует приложение.</div></aside></div>';
  }
  function renderModal() {
    if (!state.modal) return '';
    var m=state.modal;
    if(m.type==='student') return '<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>'+ (m.studentId?'Изменить студента':'Новый студент') +'</h3><button class="modal-close" data-action="close-modal">✕</button></div><div class="field"><label>ФИО</label><input id="studentNameInput" value="'+esc(m.name)+'" autocomplete="off"></div><div class="modal-actions"><button class="btn ghost" data-action="close-modal">Отмена</button><button class="btn primary" data-action="save-student">Сохранить</button></div></div></div>';
    var record=currentRecord(m.studentId,m.date), existing=!!record, pairs=activePairs().filter(function(p){ return attendancePairsForDate(m.date,record).indexOf(p.number)>=0; }), scheduled=scheduledPairNumbers(m.date), selected=new Set((m.pairs||[]).map(Number));
    var pairChoices=pairs.map(function(p){var active=selected.has(p.number);var sub=[p.start&&p.end?p.start+'–'+p.end:'',actualSubjectLabel(m.date,p.id)].filter(Boolean).join(' · ');return '<button class="pair-choice '+(active?'active':'')+'" data-action="toggle-pair" data-pair="'+esc(p.number)+'"><span class="pair-number">'+esc(p.number)+'</span><span><strong>'+esc(p.number+' пара')+'</strong><small>'+esc(sub||'НБ за эту пару')+'</small></span></button>';}).join('');
    var pairHint=scheduled.length ? '' : '<div class="empty">На эту дату по расписанию занятий нет.</div>';
    return '<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>'+esc(studentName(m.studentId))+'</h3><button class="modal-close" data-action="close-modal">✕</button></div><div class="field"><label>Дата</label><input id="attendanceDate" type="date" value="'+esc(m.date)+'"></div><div class="field"><label>Пропущенные пары · '+esc(hoursFromPairs(m.pairs||[]))+' ч.</label>'+pairHint+'<div class="pair-choice-grid">'+pairChoices+'</div><div class="toolbar"><button class="btn small" data-action="select-all-pairs">Весь день</button><button class="btn small ghost" data-action="clear-pairs">Снять все</button></div></div><div class="field"><label>Причина</label><div class="reason-list">'+REASONS.map(function(r){return '<button class="reason '+(m.reason===r.key?'active':'')+'" data-action="set-reason" data-reason="'+r.key+'"><span class="radio"></span><span><strong>'+esc(r.label)+'</strong><br><small>'+(r.respected?'Попадёт в «уважит.»':'Попадёт в «неув.»')+'</small></span></button>';}).join('')+'</div></div><div class="modal-actions">'+(existing?'<button class="btn danger" data-action="remove-attendance">Снять НБ</button>':'')+'<button class="btn primary" data-action="save-attendance">'+((m.pairs||[]).length?'Сохранить НБ':'Сохранить')+'</button></div></div></div>';
  }
  function renderApp() {
    var body=state.screen==='home'?renderHome():state.screen==='report'?renderReport():state.screen==='history'?renderHistory():state.screen==='schedule'?renderSchedule():state.screen==='group'?renderGroup():state.screen==='backup'?renderBackup():renderSettings();
    return topbar(titleForScreen(),subtitleForScreen())+'<main class="app-shell"><div class="content">'+body+'<div class="footer-note">AttendanceJournal хранит данные локально. Регулярно делай backup.</div></div></main>'+(state.drawer?renderDrawer():'')+(state.modal?renderModal():'');
  }

  document.addEventListener('click', function(event){
    var el=event.target.closest ? event.target.closest('[data-action]') : null; if(!el) return;
    var action=el.dataset.action;
    if(action==='menu'){state.drawer=true;render();return;}
    if(action==='close-menu'){if(event.target===el){state.drawer=false;render();}return;}
    if(el.dataset.stop) return;
    if(action==='home'){openScreen('home');return;}
    if(action==='screen'){openScreen(el.dataset.screen);return;}
    if(action==='attendance'){openAttendance(el.dataset.student,today());return;}
    if(action==='close-modal'){state.modal=null;render();return;}
    if(action==='toggle-pair'){if(state.modal){var n=Number(el.dataset.pair), set=new Set(state.modal.pairs||[]);if(set.has(n))set.delete(n);else set.add(n);state.modal.pairs=Array.from(set).sort(function(a,b){return a-b;});state.modal.hours=hoursFromPairs(state.modal.pairs);render();}return;}
    if(action==='select-all-pairs'){if(state.modal){state.modal.pairs=scheduledPairNumbers(state.modal.date);state.modal.hours=hoursFromPairs(state.modal.pairs);render();}return;}
    if(action==='clear-pairs'){if(state.modal){state.modal.pairs=[];state.modal.hours=0;render();}return;}
    if(action==='set-reason'){if(state.modal){state.modal.reason=el.dataset.reason;render();}return;}
    if(action==='save-attendance'){saveAttendance();return;}
    if(action==='remove-attendance'){removeAttendance();return;}
    if(action==='new-student'){state.modal={type:'student',studentId:null,name:''};render();return;}
    if(action==='edit-student'){var s=state.students.find(function(x){return x.id===el.dataset.student;});if(s){state.modal={type:'student',studentId:s.id,name:s.name};render();}return;}
    if(action==='save-student'){saveStudent();return;}
    if(action==='delete-student'){deleteStudent(el.dataset.student);return;}
    if(action==='save-group'){saveGroup();return;}
    if(action==='save-pairs'){savePairs();return;}
    if(action==='add-pair'){addPairRow();return;}
    if(action==='delete-pair'){removePairRow(el.dataset.pairId);return;}
    if(action==='delete-subject'){deleteSubject(el.dataset.subjectId);return;}
    if(action==='add-subject'){addSubject();return;}
    if(action==='save-subjects'){saveSubjects();return;}
    if(action==='save-weekly'){saveWeeklySchedule();return;}
    if(action==='save-schedule-day'){saveScheduleDay();return;}
    if(action==='reset-schedule-day'){resetScheduleDay();return;}
    if(action==='schedule-date-shift'){var sd=new Date((state.scheduleDate||today())+'T12:00:00');sd.setDate(sd.getDate()+Number(el.dataset.by||0));state.scheduleDate=iso(sd);render();return;}
    if(action==='history-mode'){state.historyMode=el.dataset.mode;render();return;}
    if(action==='bulk-load'){replaceStudents(document.getElementById('bulkNames').value);return;}
    if(action==='restore-template'){restoreTemplate();return;}
    if(action==='month-shift'){var by=Number(el.dataset.by);if(el.dataset.kind==='report')state.reportMonth=shiftMonth(state.reportMonth,by);else {state.historyMonth=shiftMonth(state.historyMonth,by);state.historyDay=state.historyMonth+'-01';}render();return;}
    if(action==='generate-report'){generateReport(state.reportMonth);return;}
    if(action==='regenerate'){generateReport(el.dataset.month);return;}
    if(action==='edit-record'){openAttendance(el.dataset.student,el.dataset.date);return;}
    if(action==='export-backup'){exportBackup();return;}
    if(action==='import-backup'){backupFile.click();return;}
    if(action==='open-file'){if(state.pendingExport){window.AttendanceExporter.open(state.pendingExport) || toast('Не удалось открыть файл. Используй кнопку «Сохранить».');}return;}
    if(action==='share-file'){if(state.pendingExport){window.AttendanceExporter.share(state.pendingExport).then(function(){toast('Файл открыт в «Поделиться».');}).catch(function(error){if(!(error&&error.name==='AbortError'))toast('Поделиться не открылось. Используй «Сохранить».');});}return;}
    if(action==='close-export'){closePendingExport();render();return;}
    if(action==='show-install'){showInstallHelp();return;}
  });

  document.addEventListener('input', function(event){
    if(event.target.id==='studentNameInput' && state.modal) state.modal.name=event.target.value;
    if(event.target.id==='bulkNames') state.bulkNames=event.target.value;
  });
  document.addEventListener('change', function(event){
    if(event.target.id==='reportMonthInput'){state.reportMonth=event.target.value;render();}
    if(event.target.id==='historyMonthInput'){state.historyMonth=event.target.value;render();}
    if(event.target.id==='historyStudent'){state.historyStudentId=event.target.value;render();}
    if(event.target.id==='historyPair'){state.historyPair=event.target.value;render();}
    if(event.target.id==='historySubject'){state.historySubjectName=event.target.value;render();}
    if(event.target.id==='scheduleDateInput'){state.scheduleDate=event.target.value||today();render();}
    if(event.target.id==='historyDayInput'){state.historyDay=event.target.value;state.historyMonth=String(event.target.value||'').slice(0,7);render();}
    if(event.target.id==='themeSelect'){state.settings.theme=event.target.value;persistNow();applyTheme();render();}
    if(event.target.id==='attendanceDate' && state.modal){state.modal.date=event.target.value;var a=currentRecord(state.modal.studentId,state.modal.date);state.modal.hours=a?a.hours:0;state.modal.pairs=a?pairNumbersFromRecord(a):[];state.modal.periods=a?pairNumbersFromRecord(a):[];state.modal.reason=a?a.reason:'none';render();}
  });
  backupFile.addEventListener('change', function(){ if(backupFile.files && backupFile.files[0]) importBackup(backupFile.files[0]); });

  if (window.matchMedia) {
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){ if(state.settings.theme==='system'){applyTheme();render();} }); } catch (_) {}
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){ navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(function(reg){return reg.update();}).catch(function(){}); });
  }

  window.addEventListener('beforeunload', function(){
    if (state.pendingExport) window.AttendanceExporter.revoke(state.pendingExport);
  });

  loadData();
})();
