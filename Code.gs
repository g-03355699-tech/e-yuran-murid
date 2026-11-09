/**
 * e-Yuran Murid — rekod bayaran yuran murid ke Google Sheets, dengan resit dari WhatsApp ibu bapa.
 * https://github.com/g-03355699-tech/e-yuran-murid
 *
 * Satu web app untuk semua guru (Execute as: User accessing the web app).
 * Kali pertama dibuka, Google Sheet "e-Yuran Murid" dicipta secara automatik dalam Drive guru tersebut,
 * dan guru itu menjadi Pentadbir. Guru lain dijemput melalui Tetapan > Guru, kemudian membuka
 * pautan jemputan (…/exec?sertai=ID_SHEET) untuk menggunakan Sheet yang sama.
 */

const VERSI = '1.1.0';

const NAMA_SS = 'e-Yuran Murid';
const NAMA_FOLDER_RESIT = 'Resit e-Yuran Murid';
const SAIZ_CEBISAN = 45000;     // had sel Sheets ialah 50,000 aksara

const SH_MURID = 'Murid', SH_YURAN = 'Yuran', SH_BAYARAN = 'Bayaran', SH_GURU = 'Guru',
      SH_TETAPAN = 'Tetapan', SH_RESIT = 'ResitData', SH_RINGKASAN = 'Ringkasan';

const HDR = {
  Murid: ['No KP', 'Nama', 'Kelas', 'Jantina', 'Rumah', 'Kebenaran Suntikan', 'Kebenaran Photo',
          'Pend Bapa', 'Pend Ibu', 'Kadar Harian', 'Penaja', 'Yuran Ditaja', 'No Tel Penjaga', 'Catatan'],
  Yuran: ['Kod', 'Nama Yuran', 'Amaun Lelaki', 'Amaun Perempuan', 'Ikut Kadar Harian', 'Bil Hari', 'Susunan', 'Aktif'],
  Bayaran: ['ID', 'No KP', 'Nama', 'Kelas', 'Kod Yuran', 'Amaun', 'Tarikh Bayar', 'No Rujukan', 'Kaedah', 'Bank',
            'Resit ID', 'Resit URL', 'Catatan', 'Direkod Oleh', 'Masa Rekod'],
  Guru: ['Emel', 'Nama', 'Peranan', 'Kelas'],
  Tetapan: ['Kunci', 'Nilai', 'Keterangan'],
  ResitData: ['Resit ID', 'Bahagian', 'Data']
};

// Lajur yang mesti kekal teks (supaya digit tidak bertukar jadi nombor / hilang sifar di depan)
const LAJUR_TEKS = {
  Murid: ['No KP', 'No Tel Penjaga'],
  Bayaran: ['ID', 'No KP', 'No Rujukan'],
  Guru: ['Emel'],
  ResitData: ['Resit ID']
};

const YURAN_LALAI = [
  ['YMA', 'Yuran Makan Asrama (YMA)', 0, 0, 'Y', 278, 1, 'Y'],
  ['PIBG_SUMB', 'Sumbangan PIBG', 170, 170, 'T', '', 2, 'Y'],
  ['PIBG_KEC', 'Kecemerlangan PIBG', 250, 250, 'T', '', 3, 'Y'],
  ['DOBI', 'Dobi', 180, 220, 'T', '', 4, 'T']
];

const TETAPAN_LALAI = [
  ['NAMA_SEKOLAH', 'Nama Sekolah', 'Nama sekolah dalam mesej WhatsApp'],
  ['TAHUN', String(new Date().getFullYear()), 'Tahun persekolahan'],
  ['HAD_PENDAPATAN', '5000', 'Jumlah pendapatan isi rumah KURANG daripada nilai ini guna kadar rendah'],
  ['KADAR_RENDAH', '1', 'Kadar harian (RM) bagi pendapatan rendah'],
  ['KADAR_BIASA', '3', 'Kadar harian (RM) biasa']
];

/* ===================== Web app ===================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('e-Yuran Murid')
    .setFaviconUrl('https://raw.githubusercontent.com/g-03355699-tech/e-yuran-murid/main/docs/app/ikon-192.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ===================== Sheet setiap guru & perkongsian ===================== */

let SS_CACHE = null;
const props_ = () => PropertiesService.getUserProperties();
function emelSemasa_() { return (Session.getEffectiveUser().getEmail() || '').toLowerCase(); }
function bukaSS_(id) { try { return SpreadsheetApp.openById(id); } catch (e) { return null; } }

/** Sheet milik guru sendiri — dicipta automatik kali pertama. */
function ssSendiri_() {
  const id = props_().getProperty('SS_ID');
  if (id) { const ss = bukaSS_(id); if (ss) return ss; }
  const ss = SpreadsheetApp.create(NAMA_SS);
  ss.setSpreadsheetTimeZone('Asia/Kuala_Lumpur');
  props_().setProperty('SS_ID', ss.getId());
  SS_CACHE = ss;
  sediaTab_(ss);
  return ss;
}

function sediaTab_(ss) {
  Object.keys(HDR).forEach(n => sh_(n, ss));
  const y = ss.getSheetByName(SH_YURAN);
  if (y.getLastRow() < 2) y.getRange(2, 1, YURAN_LALAI.length, YURAN_LALAI[0].length).setValues(YURAN_LALAI);
  const t = ss.getSheetByName(SH_TETAPAN);
  if (t.getLastRow() < 2) t.getRange(2, 1, TETAPAN_LALAI.length, 3).setNumberFormat('@').setValues(TETAPAN_LALAI);
  const g = ss.getSheetByName(SH_GURU);
  if (g.getLastRow() < 2) g.getRange(2, 1, 1, 4).setNumberFormat('@').setValues([[emelSemasa_(), '', 'ADMIN', '']]);
  ss.getSheetByName(SH_RESIT).hideSheet();
  ss.getSheets().filter(s => !HDR[s.getName()] && s.getName() !== SH_RINGKASAN).forEach(s => {
    if (ss.getSheets().length > 1) ss.deleteSheet(s);       // buang "Sheet1" lalai
  });
}

function senaraiSertai_() {
  try { return JSON.parse(props_().getProperty('SERTAI') || '[]'); } catch (e) { return []; }
}

/** Sheet yang sedang aktif: Sheet sendiri, atau Sheet guru lain yang telah disertai. */
function ss_() {
  if (SS_CACHE) return SS_CACHE;
  const aktif = props_().getProperty('AKTIF_ID');
  if (aktif && aktif !== props_().getProperty('SS_ID')) {
    const ss = bukaSS_(aktif);
    if (ss) return (SS_CACHE = ss);
    props_().deleteProperty('AKTIF_ID');        // akses telah ditarik balik
  }
  return (SS_CACHE = ssSendiri_());
}

function namaRuang_(ss) {
  const t = ss.getSheetByName(SH_TETAPAN);
  if (t) {
    const v = t.getDataRange().getValues().find(r => r[0] === 'NAMA_SEKOLAH');
    if (v && v[1] && v[1] !== 'Nama Sekolah') return String(v[1]);
  }
  try { return 'Sheet ' + ss.getOwner().getEmail(); } catch (e) { return ss.getName(); }
}

function maklumatRuang_() {
  const ss = ss_();
  const sendiriId = props_().getProperty('SS_ID');
  const senarai = [{ id: sendiriId, nama: 'Sheet saya', sendiri: true }];
  senaraiSertai_().forEach(id => {
    const s = bukaSS_(id);
    if (s) senarai.push({ id, nama: namaRuang_(s), sendiri: false });
  });
  return {
    id: ss.getId(), url: ss.getUrl(), sendiri: ss.getId() === sendiriId,
    nama: ss.getId() === sendiriId ? 'Sheet saya' : namaRuang_(ss),
    senarai: senarai.map(r => Object.assign(r, { aktif: r.id === ss.getId() }))
  };
}

/** Sertai Sheet guru lain menggunakan kod (ID Sheet), pautan Sheet atau pautan jemputan. */
function sertai(kod) {
  const m = String(kod || '').match(/[-\w]{25,}/);
  if (!m) throw new Error('Kod jemputan tidak sah.');
  const id = m[0];
  if (id === props_().getProperty('SS_ID')) throw new Error('Ini Sheet anda sendiri.');
  const ss = bukaSS_(id);
  if (!ss) throw new Error('Akaun ' + emelSemasa_() + ' tiada akses kepada Sheet ini. Minta pentadbir menambah emel anda dalam Tetapan > Guru.');
  if (!ss.getSheetByName(SH_BAYARAN) || !ss.getSheetByName(SH_MURID)) throw new Error('Sheet ini bukan Sheet e-Yuran Murid.');
  const s = senaraiSertai_();
  if (s.indexOf(id) < 0) s.push(id);
  props_().setProperty('SERTAI', JSON.stringify(s));
  props_().setProperty('AKTIF_ID', id);
  SS_CACHE = null;
  return muat_(akses_());
}

function tukarRuang(id) {
  if (id === props_().getProperty('SS_ID')) props_().deleteProperty('AKTIF_ID');
  else if (senaraiSertai_().indexOf(id) >= 0) props_().setProperty('AKTIF_ID', id);
  else throw new Error('Sheet tidak dijumpai dalam senarai anda.');
  SS_CACHE = null;
  return muat_(akses_());
}

function tinggalkanRuang(id) {
  props_().setProperty('SERTAI', JSON.stringify(senaraiSertai_().filter(x => x !== id)));
  if (props_().getProperty('AKTIF_ID') === id) props_().deleteProperty('AKTIF_ID');
  SS_CACHE = null;
  return muat_(akses_());
}

/* ===================== Utiliti Sheet ===================== */

function sh_(nama, ssArg) {
  const ss = ssArg || ss_();
  let s = ss.getSheetByName(nama);
  if (!s) {
    s = ss.insertSheet(nama);
    const h = HDR[nama];
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#12386b').setFontColor('#ffffff');
    s.setFrozenRows(1);
    (LAJUR_TEKS[nama] || []).forEach(k => s.getRange(2, h.indexOf(k) + 1, s.getMaxRows() - 1, 1).setNumberFormat('@'));
  }
  return s;
}

/** Baca tab sebagai { s, hdr, idx, rows:[{r, baris}] }. Lajur dicari ikut nama header, bukan kedudukan. */
function baca_(nama) {
  const s = sh_(nama);
  const v = s.getDataRange().getValues();
  const hdr = (v.shift() || []).map(h => String(h).trim());
  HDR[nama].forEach(h => {             // tambah lajur yang hilang (cth. selepas naik taraf)
    if (hdr.indexOf(h) < 0) {
      s.getRange(1, hdr.length + 1).setValue(h).setFontWeight('bold').setBackground('#12386b').setFontColor('#ffffff');
      hdr.push(h);
      v.forEach(r => r.push(''));
    }
  });
  const idx = {};
  hdr.forEach((h, i) => { idx[h] = i; });
  return { s, hdr, idx, rows: v.map((r, i) => ({ r, baris: i + 2 })).filter(x => x.r.some(c => c !== '')) };
}

function n_(d, row, h) { const i = d.idx[h]; return i == null ? '' : row.r[i]; }

function barisBaru_(d, obj, asas) {
  const a = asas ? asas.slice() : new Array(d.hdr.length).fill('');
  Object.keys(obj).forEach(k => { if (d.idx[k] != null) a[d.idx[k]] = obj[k]; });
  return a;
}

function tulisBaris_(d, nama, baris, data) {
  const s = d.s;
  (LAJUR_TEKS[nama] || []).forEach(k => s.getRange(baris, d.idx[k] + 1, data.length, 1).setNumberFormat('@'));
  s.getRange(baris, 1, data.length, d.hdr.length).setValues(data);
}

function tambahBaris_(d, nama, data) {
  if (!data.length) return;
  tulisBaris_(d, nama, d.s.getLastRow() + 1, data);
}

function padamBaris_(s, senarai) {
  if (!senarai.length) return;
  const perlu = senarai.length + s.getFrozenRows() + 1;
  if (s.getMaxRows() < perlu) s.insertRowsAfter(s.getMaxRows(), perlu - s.getMaxRows());
  if (s.getMaxRows() - senarai.length <= s.getFrozenRows()) s.insertRowsAfter(s.getMaxRows(), 1);
  senarai.slice().sort((a, b) => b - a).forEach(b => s.deleteRow(b));
}

function kp_(v) {
  if (typeof v === 'number') return String(Math.round(v)).padStart(12, '0');
  return String(v == null ? '' : v).replace(/[\s-]/g, '').trim();
}
function num_(v) {
  if (v === '' || v == null) return '';
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? '' : n;
}
function r2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function yt_(v) {
  v = String(v == null ? '' : v).trim().toUpperCase();
  if (!v) return '';
  return (v === 'Y' || v === 'YA' || v === 'TRUE' || v === '1') ? 'Y' : 'T';
}
function teks_(v) { return String(v == null ? '' : v).trim(); }
function tarikhStr_(v, fmt) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Asia/Kuala_Lumpur', fmt || 'yyyy-MM-dd');
  return teks_(v);
}
function keTarikh_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) throw new Error('Tarikh bayaran tidak sah.');
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
function senaraiKod_(v) { return teks_(v).toUpperCase().split(/[,;\s]+/).filter(Boolean); }

/* ===================== Tetapan, guru & akses ===================== */

function tetapan_() {
  const o = {};
  TETAPAN_LALAI.forEach(r => { o[r[0]] = r[1]; });
  const d = baca_(SH_TETAPAN);
  d.rows.forEach(row => { const k = teks_(n_(d, row, 'Kunci')); if (k) o[k] = teks_(n_(d, row, 'Nilai')); });
  return {
    namaSekolah: o.NAMA_SEKOLAH, tahun: o.TAHUN,
    had: Number(o.HAD_PENDAPATAN) || 0, kadarRendah: Number(o.KADAR_RENDAH) || 0, kadarBiasa: Number(o.KADAR_BIASA) || 0
  };
}

function senaraiGuru_() {
  const d = baca_(SH_GURU);
  return d.rows.map(row => ({
    emel: teks_(n_(d, row, 'Emel')).toLowerCase(),
    nama: teks_(n_(d, row, 'Nama')),
    peranan: teks_(n_(d, row, 'Peranan')).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'GURU',
    kelas: teks_(n_(d, row, 'Kelas')).split(',').map(s => s.trim()).filter(Boolean)
  })).filter(g => g.emel);
}

/** Profil guru dalam Sheet aktif. Pemilik Sheet sentiasa Pentadbir; editor lain yang tiada dalam senarai = Guru (semua kelas). */
function akses_() {
  const emel = emelSemasa_();
  if (!emel) throw new Error('TIADA_AKSES');
  const g = senaraiGuru_().find(x => x.emel === emel);
  if (g) return g;
  let pemilik = '';
  try { pemilik = (ss_().getOwner().getEmail() || '').toLowerCase(); } catch (e) {}
  return { emel, nama: '', peranan: pemilik === emel ? 'ADMIN' : 'GURU', kelas: [] };
}

function admin_(g) { if (g.peranan !== 'ADMIN') throw new Error('Hanya pentadbir boleh membuat perubahan ini.'); }
function boleh_(g, kelas) { return g.peranan === 'ADMIN' || !g.kelas.length || g.kelas.indexOf(kelas) >= 0; }

/* ===================== Data ===================== */

function bacaYuran_() {
  const d = baca_(SH_YURAN);
  return d.rows.map(row => ({
    kod: teks_(n_(d, row, 'Kod')).toUpperCase(),
    nama: teks_(n_(d, row, 'Nama Yuran')),
    amaunL: Number(n_(d, row, 'Amaun Lelaki')) || 0,
    amaunP: Number(n_(d, row, 'Amaun Perempuan')) || 0,
    ikutKadar: yt_(n_(d, row, 'Ikut Kadar Harian')) === 'Y',
    hari: Number(n_(d, row, 'Bil Hari')) || 0,
    susunan: Number(n_(d, row, 'Susunan')) || 99,
    aktif: yt_(n_(d, row, 'Aktif')) !== 'T'
  })).filter(y => y.kod).sort((a, b) => a.susunan - b.susunan);
}

function muridDariBaris_(d, row) {
  return {
    kp: kp_(n_(d, row, 'No KP')),
    nama: teks_(n_(d, row, 'Nama')),
    kelas: teks_(n_(d, row, 'Kelas')),
    jantina: teks_(n_(d, row, 'Jantina')).toUpperCase().charAt(0),
    rumah: teks_(n_(d, row, 'Rumah')),
    suntikan: yt_(n_(d, row, 'Kebenaran Suntikan')),
    photo: yt_(n_(d, row, 'Kebenaran Photo')),
    pendBapa: num_(n_(d, row, 'Pend Bapa')),
    pendIbu: num_(n_(d, row, 'Pend Ibu')),
    kadarManual: num_(n_(d, row, 'Kadar Harian')),
    penaja: teks_(n_(d, row, 'Penaja')),
    ditaja: senaraiKod_(n_(d, row, 'Yuran Ditaja')),
    tel: teks_(n_(d, row, 'No Tel Penjaga')),
    catatan: teks_(n_(d, row, 'Catatan'))
  };
}

function bayaranDariBaris_(d, row) {
  return {
    id: teks_(n_(d, row, 'ID')),
    kp: kp_(n_(d, row, 'No KP')),
    kod: teks_(n_(d, row, 'Kod Yuran')).toUpperCase(),
    amaun: r2_(n_(d, row, 'Amaun')),
    tarikh: tarikhStr_(n_(d, row, 'Tarikh Bayar')),
    rujukan: teks_(n_(d, row, 'No Rujukan')),
    kaedah: teks_(n_(d, row, 'Kaedah')),
    bank: teks_(n_(d, row, 'Bank')),
    resitId: teks_(n_(d, row, 'Resit ID')),
    resitUrl: teks_(n_(d, row, 'Resit URL')),
    catatan: teks_(n_(d, row, 'Catatan')),
    oleh: teks_(n_(d, row, 'Direkod Oleh')),
    masa: tarikhStr_(n_(d, row, 'Masa Rekod'), 'yyyy-MM-dd HH:mm')
  };
}

function muat_(g) {
  const t = tetapan_();
  const dm = baca_(SH_MURID);
  const murid = dm.rows.map(r => muridDariBaris_(dm, r)).filter(m => m.kp && m.nama && boleh_(g, m.kelas));
  const ada = {};
  murid.forEach(m => { ada[m.kp] = 1; });
  const db = baca_(SH_BAYARAN);
  const bayaran = db.rows.map(r => bayaranDariBaris_(db, r)).filter(b => ada[b.kp]);
  const out = {
    versi: VERSI,
    user: { emel: g.emel, nama: g.nama, peranan: g.peranan, kelas: g.kelas },
    tetapan: { namaSekolah: t.namaSekolah, tahun: t.tahun, had: t.had, kadarRendah: t.kadarRendah, kadarBiasa: t.kadarBiasa },
    ruang: maklumatRuang_(),
    appUrl: ScriptApp.getService().getUrl(),
    yuran: bacaYuran_(),
    murid, bayaran
  };
  if (g.peranan === 'ADMIN') out.guru = senaraiGuru_();
  return out;
}

function mula() { return muat_(akses_()); }

function cariMurid_(kp) {
  const d = baca_(SH_MURID);
  const row = d.rows.find(r => kp_(n_(d, r, 'No KP')) === kp);
  return row ? { d, row, m: muridDariBaris_(d, row) } : null;
}

/* ===================== Bayaran & resit ===================== */

/**
 * d = { id?, kp, tarikh:'yyyy-MM-dd', rujukan, kaedah, bank, catatan,
 *       item:[{kod, amaun}], resit?:{b64, mime}, buangResit? }
 * Satu bayaran (satu resit) boleh dibahagikan kepada beberapa yuran — disimpan satu baris setiap yuran dengan ID yang sama.
 */
function simpanBayaran(d) {
  const g = akses_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cm = cariMurid_(kp_(d.kp));
    if (!cm) throw new Error('Murid tidak dijumpai.');
    const m = cm.m;
    if (!boleh_(g, m.kelas)) throw new Error('Anda tiada akses untuk kelas ' + m.kelas + '.');
    const sahKod = {};
    bacaYuran_().forEach(y => { sahKod[y.kod] = 1; });
    const item = (d.item || []).map(x => ({ kod: teks_(x.kod).toUpperCase(), amaun: r2_(x.amaun) }))
      .filter(x => x.amaun > 0 && sahKod[x.kod]);
    if (!item.length) throw new Error('Masukkan sekurang-kurangnya satu amaun bayaran.');
    const tarikh = keTarikh_(d.tarikh);

    const db = baca_(SH_BAYARAN);
    let resitId = '', resitUrl = '', lama = [];
    if (d.id) {
      lama = db.rows.filter(r => teks_(n_(db, r, 'ID')) === d.id);
      if (!lama.length) throw new Error('Rekod bayaran tidak dijumpai (mungkin telah dipadam).');
      if (kp_(n_(db, lama[0], 'No KP')) !== m.kp) throw new Error('Rekod bayaran bukan milik murid ini.');
      resitId = teks_(n_(db, lama[0], 'Resit ID'));
      resitUrl = teks_(n_(db, lama[0], 'Resit URL'));
    }
    if (d.resit && d.resit.b64) {
      const f = simpanResit_(m, d.resit);
      if (resitId) buangFail_(resitId);
      resitId = f.id; resitUrl = f.url;
    } else if (d.buangResit && resitId) {
      buangFail_(resitId);
      resitId = ''; resitUrl = '';
    }
    const id = d.id || ('B' + Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyMMddHHmmss') +
                        Math.floor(Math.random() * 1000).toString().padStart(3, '0'));
    const masa = new Date();
    const data = item.map(x => barisBaru_(db, {
      'ID': id, 'No KP': m.kp, 'Nama': m.nama, 'Kelas': m.kelas, 'Kod Yuran': x.kod, 'Amaun': x.amaun,
      'Tarikh Bayar': tarikh, 'No Rujukan': teks_(d.rujukan).slice(0, 80), 'Kaedah': teks_(d.kaedah).slice(0, 40),
      'Bank': teks_(d.bank).slice(0, 40), 'Resit ID': resitId, 'Resit URL': resitUrl,
      'Catatan': teks_(d.catatan).slice(0, 300), 'Direkod Oleh': g.nama ? g.nama + ' <' + g.emel + '>' : g.emel, 'Masa Rekod': masa
    }));
    padamBaris_(db.s, lama.map(r => r.baris));
    tambahBaris_(db, SH_BAYARAN, data);
    SpreadsheetApp.flush();
    const out = muat_(g);
    out.idSimpan = id;
    return out;
  } finally {
    lock.releaseLock();
  }
}

function padamBayaran(id) {
  const g = akses_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const db = baca_(SH_BAYARAN);
    const rows = db.rows.filter(r => teks_(n_(db, r, 'ID')) === teks_(id));
    if (!rows.length) throw new Error('Rekod bayaran tidak dijumpai.');
    if (!boleh_(g, teks_(n_(db, rows[0], 'Kelas')))) throw new Error('Anda tiada akses untuk rekod ini.');
    const resitId = teks_(n_(db, rows[0], 'Resit ID'));
    padamBaris_(db.s, rows.map(r => r.baris));
    if (resitId) buangFail_(resitId);
    SpreadsheetApp.flush();
    return muat_(g);
  } finally {
    lock.releaseLock();
  }
}

function folderResit_() {
  const id = props_().getProperty('FOLDER_RESIT');
  if (id) {
    try { const f = Drive.Files.get(id, { fields: 'id,trashed' }); if (!f.trashed) return id; } catch (e) { /* folder dipadam */ }
  }
  const f = Drive.Files.create({ name: NAMA_FOLDER_RESIT, mimeType: 'application/vnd.google-apps.folder' });
  props_().setProperty('FOLDER_RESIT', f.id);
  return f.id;
}

/**
 * Resit disimpan di dua tempat:
 *  1. Google Drive guru yang memuat naik (folder "Resit e-Yuran Murid") — untuk arkib.
 *  2. Tab tersembunyi ResitData dalam Sheet — supaya semua guru yang berkongsi Sheet boleh melihatnya.
 */
function simpanResit_(m, resit) {
  if (resit.b64.length > 7 * 1024 * 1024) throw new Error('Fail resit terlalu besar (had 5 MB).');
  const mime = resit.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg';
  const ext = mime === 'application/pdf' ? 'pdf' : 'jpg';
  const cop = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyyMMdd_HHmmss');
  const nama = ((m.kelas ? m.kelas + '_' : '') + m.nama + '_' + cop + '.' + ext).replace(/[\\/:*?"<>|]/g, '');
  const blob = Utilities.newBlob(Utilities.base64Decode(resit.b64), mime, nama);
  const f = Drive.Files.create({ name: nama, parents: [folderResit_()] }, blob, { fields: 'id,webViewLink' });
  simpanDataResit_(f.id, 'data:' + mime + ';base64,' + resit.b64);
  return { id: f.id, url: f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view') };
}

function simpanDataResit_(id, data) {
  const d = baca_(SH_RESIT);
  const rows = [];
  for (let i = 0, n = 0; i < data.length; i += SAIZ_CEBISAN, n++) {
    rows.push(barisBaru_(d, { 'Resit ID': id, 'Bahagian': n, 'Data': data.slice(i, i + SAIZ_CEBISAN) }));
  }
  tambahBaris_(d, SH_RESIT, rows);
}

function bacaDataResit_(id) {
  const d = baca_(SH_RESIT);
  const rows = d.rows.filter(r => teks_(n_(d, r, 'Resit ID')) === id)
    .sort((a, b) => Number(n_(d, a, 'Bahagian')) - Number(n_(d, b, 'Bahagian')));
  return rows.length ? rows.map(r => String(n_(d, r, 'Data'))).join('') : '';
}

function buangFail_(id) {
  const d = baca_(SH_RESIT);
  padamBaris_(d.s, d.rows.filter(r => teks_(n_(d, r, 'Resit ID')) === id).map(r => r.baris));
  try { Drive.Files.update({ trashed: true }, id); }
  catch (e) { console.warn('Resit ' + id + ' dalam Drive guru lain — tidak dibuang: ' + e); }
}

/** Papar resit dalam app. Hanya resit yang dirujuk dalam tab Bayaran (dan kelas yang dibenarkan) boleh dibaca. */
function lihatResit(id) {
  const g = akses_();
  id = teks_(id).replace(/[^-\w]/g, '');
  const db = baca_(SH_BAYARAN);
  const row = db.rows.find(r => teks_(n_(db, r, 'Resit ID')) === id);
  if (!id || !row || !boleh_(g, teks_(n_(db, row, 'Kelas')))) return { ok: false };
  const data = bacaDataResit_(id);
  return data ? { ok: true, url: data } : { ok: false };
}

/* ===================== Murid ===================== */

function simpanMurid(m, kpAsal) {
  const g = akses_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const kp = kp_(m.kp), nama = teks_(m.nama).toUpperCase(), kelas = teks_(m.kelas);
    if (!nama) throw new Error('Nama murid diperlukan.');
    if (!kp) throw new Error('No. kad pengenalan diperlukan.');
    if (!boleh_(g, kelas)) throw new Error('Anda hanya boleh menambah murid bagi kelas: ' + g.kelas.join(', '));
    const d = baca_(SH_MURID);
    const cari = k => d.rows.find(r => kp_(n_(d, r, 'No KP')) === k);
    const row = kpAsal ? cari(kp_(kpAsal)) : null;
    if (kpAsal && !row) throw new Error('Rekod murid asal tidak dijumpai.');
    if (row && !boleh_(g, teks_(n_(d, row, 'Kelas')))) throw new Error('Anda tiada akses untuk murid ini.');
    if (kp !== kp_(kpAsal) && cari(kp)) throw new Error('No. KP ' + kp + ' sudah wujud.');

    const obj = {
      'No KP': kp, 'Nama': nama, 'Kelas': kelas, 'Jantina': teks_(m.jantina).toUpperCase().charAt(0),
      'Rumah': teks_(m.rumah), 'Kebenaran Suntikan': yt_(m.suntikan), 'Kebenaran Photo': yt_(m.photo),
      'Pend Bapa': num_(m.pendBapa), 'Pend Ibu': num_(m.pendIbu), 'Kadar Harian': num_(m.kadarManual),
      'Penaja': teks_(m.penaja), 'Yuran Ditaja': (m.ditaja || []).join(','), 'No Tel Penjaga': teks_(m.tel),
      'Catatan': teks_(m.catatan).slice(0, 300)
    };
    if (row) tulisBaris_(d, SH_MURID, row.baris, [barisBaru_(d, obj, row.r)]);
    else tambahBaris_(d, SH_MURID, [barisBaru_(d, obj)]);

    if (row) {   // kemas kini salinan nama/kelas/KP dalam tab Bayaran
      const db = baca_(SH_BAYARAN);
      db.rows.filter(r => kp_(n_(db, r, 'No KP')) === kp_(kpAsal)).forEach(r => {
        tulisBaris_(db, SH_BAYARAN, r.baris, [barisBaru_(db, { 'No KP': kp, 'Nama': nama, 'Kelas': kelas }, r.r)]);
      });
    }
    SpreadsheetApp.flush();
    const out = muat_(g);
    out.kpSimpan = kp;
    return out;
  } finally {
    lock.releaseLock();
  }
}

function padamMurid(kp) {
  const g = akses_();
  admin_(g);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    kp = kp_(kp);
    const db = baca_(SH_BAYARAN);
    if (db.rows.some(r => kp_(n_(db, r, 'No KP')) === kp)) throw new Error('Murid ini ada rekod bayaran. Padam rekod bayaran dahulu.');
    const d = baca_(SH_MURID);
    const row = d.rows.find(r => kp_(n_(d, r, 'No KP')) === kp);
    if (!row) throw new Error('Murid tidak dijumpai.');
    padamBaris_(d.s, [row.baris]);
    return muat_(g);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Tampal baris yang disalin terus dari Google Sheet lama (tab-separated).
 * Susunan lajur: [Bil] Nama, No KP, Jantina, Rumah, Keb. Suntikan, Keb. Photo, Pend Bapa, Pend Ibu
 */
function tambahMuridPukal(kelas, teks) {
  const g = akses_();
  kelas = teks_(kelas);
  if (!kelas) throw new Error('Sila isi nama kelas.');
  if (!boleh_(g, kelas)) throw new Error('Anda tiada akses untuk kelas ' + kelas + '.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = baca_(SH_MURID);
    const ada = {};
    d.rows.forEach(r => { ada[kp_(n_(d, r, 'No KP'))] = 1; });
    const data = [], langkau = [];
    String(teks || '').split(/\r?\n/).forEach(baris => {
      let c = baris.split('\t').map(s => s.trim());
      if (c.length < 2) c = baris.split(/\s{2,}|,/).map(s => s.trim());
      if (/^\d{1,4}$/.test(c[0] || '')) c.shift();          // buang lajur Bil
      const nama = (c[0] || '').toUpperCase(), kp = kp_(c[1]);
      if (!nama || !kp) return;
      if (!/^\d{12}$/.test(kp)) { langkau.push(nama + ' (No KP tidak sah)'); return; }
      if (ada[kp]) { langkau.push(nama + ' (sudah wujud)'); return; }
      ada[kp] = 1;
      data.push(barisBaru_(d, {
        'No KP': kp, 'Nama': nama, 'Kelas': kelas, 'Jantina': (c[2] || '').toUpperCase().charAt(0), 'Rumah': c[3] || '',
        'Kebenaran Suntikan': yt_(c[4]), 'Kebenaran Photo': yt_(c[5]), 'Pend Bapa': num_(c[6]), 'Pend Ibu': num_(c[7])
      }));
    });
    tambahBaris_(d, SH_MURID, data);
    SpreadsheetApp.flush();
    const out = muat_(g);
    out.pukal = { tambah: data.length, langkau };
    return out;
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Tetapan (admin) ===================== */

function simpanYuran(senarai) {
  const g = akses_();
  admin_(g);
  const kodSah = /^[A-Z0-9_]{2,20}$/;
  const lihat = {};
  const rows = (senarai || []).map((y, i) => {
    const kod = teks_(y.kod).toUpperCase();
    if (!kodSah.test(kod)) throw new Error('Kod yuran "' + kod + '" tidak sah (huruf besar, nombor, _ sahaja).');
    if (lihat[kod]) throw new Error('Kod yuran ' + kod + ' berulang.');
    lihat[kod] = 1;
    if (!teks_(y.nama)) throw new Error('Nama yuran bagi ' + kod + ' diperlukan.');
    return [kod, teks_(y.nama), r2_(y.amaunL), r2_(y.amaunP), y.ikutKadar ? 'Y' : 'T',
            y.ikutKadar ? (Number(y.hari) || 0) : '', i + 1, y.aktif ? 'Y' : 'T'];
  });
  const db = baca_(SH_BAYARAN);
  const dipakai = {};
  db.rows.forEach(r => { dipakai[teks_(n_(db, r, 'Kod Yuran')).toUpperCase()] = 1; });
  bacaYuran_().forEach(y => {
    if (!lihat[y.kod] && dipakai[y.kod]) throw new Error('Yuran ' + y.kod + ' ada rekod bayaran — nyahaktifkan sahaja, jangan padam.');
  });
  const s = sh_(SH_YURAN);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent();
  if (rows.length) s.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return muat_(g);
}

function simpanGuru(senarai) {
  const g = akses_();
  admin_(g);
  const lihat = {};
  const rows = (senarai || []).map(x => {
    const emel = teks_(x.emel).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emel)) throw new Error('Emel tidak sah: ' + emel);
    if (lihat[emel]) throw new Error('Emel berulang: ' + emel);
    lihat[emel] = 1;
    return [emel, teks_(x.nama), x.peranan === 'ADMIN' ? 'ADMIN' : 'GURU', teks_(x.kelas)];
  });
  if (!rows.some(r => r[0] === g.emel && r[2] === 'ADMIN')) {
    throw new Error('Anda tidak boleh membuang peranan Pentadbir anda sendiri.');
  }
  // Kongsi / tarik balik akses edit Sheet
  const ss = ss_();
  let pemilik = '';
  try { pemilik = (ss.getOwner().getEmail() || '').toLowerCase(); } catch (e) {}
  const lama = senaraiGuru_().map(x => x.emel);
  const gagal = [];
  rows.forEach(r => {
    if (r[0] !== pemilik && lama.indexOf(r[0]) < 0) {
      try { ss.addEditor(r[0]); } catch (e) { gagal.push(r[0]); }
    }
  });
  lama.filter(e => e !== pemilik && e !== g.emel && !lihat[e]).forEach(e => {
    try { ss.removeEditor(e); } catch (err) { /* sudah tiada akses */ }
  });
  const s = sh_(SH_GURU);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent();
  if (rows.length) s.getRange(2, 1, rows.length, 4).setNumberFormat('@').setValues(rows);
  const out = muat_(g);
  if (gagal.length) out.amaran = 'Gagal berkongsi Sheet dengan: ' + gagal.join(', ') + '. Kongsi secara manual dari Google Sheets.';
  return out;
}

function simpanTetapan(t) {
  const g = akses_();
  admin_(g);
  const nilai = {
    NAMA_SEKOLAH: teks_(t.namaSekolah), TAHUN: teks_(t.tahun), HAD_PENDAPATAN: String(num_(t.had) || 0),
    KADAR_RENDAH: String(num_(t.kadarRendah) || 0), KADAR_BIASA: String(num_(t.kadarBiasa) || 0)
  };
  const d = baca_(SH_TETAPAN);
  Object.keys(nilai).forEach(k => {
    const row = d.rows.find(r => teks_(n_(d, r, 'Kunci')) === k);
    if (row) d.s.getRange(row.baris, d.idx['Nilai'] + 1).setNumberFormat('@').setValue(nilai[k]);
    else {
      const lalai = TETAPAN_LALAI.find(r => r[0] === k);
      d.s.appendRow([k, nilai[k], lalai ? lalai[2] : '']);
    }
  });
  if (nilai.NAMA_SEKOLAH) { try { ss_().rename(NAMA_SS + ' — ' + nilai.NAMA_SEKOLAH); } catch (e) {} }
  return muat_(g);
}

/* ===================== Ringkasan dalam Sheet ===================== */

function kadar_(m, t) {
  if (m.kadarManual !== '') return Number(m.kadarManual);
  const j = (Number(m.pendBapa) || 0) + (Number(m.pendIbu) || 0);
  return j < t.had ? t.kadarRendah : t.kadarBiasa;
}
function caj_(m, y, t) { return y.ikutKadar ? r2_(kadar_(m, t) * y.hari) : (m.jantina === 'P' ? y.amaunP : y.amaunL); }
function ditaja_(m, kod) { return !!m.penaja && (!m.ditaja.length || m.ditaja.indexOf(kod) >= 0); }

function janaRingkasan(kelas) {
  const g = akses_();
  return janaRingkasan_(g, teks_(kelas));
}
function janaRingkasan_(g, kelas) {
  const data = muat_(g);
  const t = tetapan_();
  const yuran = data.yuran.filter(y => y.aktif);
  const murid = data.murid.filter(m => !kelas || m.kelas === kelas)
    .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
  const bayar = {};
  data.bayaran.forEach(b => {
    const k = b.kp + '|' + b.kod;
    bayar[k] = bayar[k] || { amaun: 0, tarikh: [] };
    bayar[k].amaun = r2_(bayar[k].amaun + b.amaun);
    bayar[k].tarikh.push(b.tarikh);
  });

  const hdr = ['Bil', 'Nama', 'No KP', 'Kelas', 'Penaja'];
  yuran.forEach(y => hdr.push(y.kod + ' Dikenakan', y.kod + ' Dibayar', y.kod + ' Tarikh'));
  hdr.push('Jumlah Baki', 'Status');

  const rows = murid.map((m, i) => {
    const r = [i + 1, m.nama, m.kp, m.kelas, m.penaja];
    let baki = 0, caj = 0, dibayar = 0;
    yuran.forEach(y => {
      const tj = ditaja_(m, y.kod);
      const c = tj ? 0 : caj_(m, y, t);
      const b = bayar[m.kp + '|' + y.kod] || { amaun: 0, tarikh: [] };
      caj += c; dibayar += b.amaun; baki += Math.max(0, c - b.amaun);
      r.push(tj ? 'DITAJA' : c, b.amaun || '', b.tarikh.join(', '));
    });
    const status = caj === 0 && m.penaja ? 'Ditaja' : baki <= 0.005 ? 'Selesai' : dibayar > 0 ? 'Separa' : 'Belum bayar';
    r.push(r2_(baki), status);
    return r;
  });

  const ss = ss_();
  const s = ss.getSheetByName(SH_RINGKASAN) || ss.insertSheet(SH_RINGKASAN);
  s.clear();
  s.getRange(1, 1).setValue('Ringkasan Yuran ' + (kelas || 'Semua Kelas') + ' ' + t.tahun + ' — dijana ' +
    Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm')).setFontWeight('bold').setFontSize(12);
  s.getRange(2, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold').setBackground('#12386b').setFontColor('#ffffff').setWrap(true);
  if (rows.length) {
    s.getRange(3, 6, rows.length, hdr.length - 6).setNumberFormat('#,##0.00');
    s.getRange(3, 3, rows.length, 1).setNumberFormat('@');
    yuran.forEach((y, i) => s.getRange(3, 8 + i * 3, rows.length, 1).setNumberFormat('@'));
    s.getRange(3, 1, rows.length, hdr.length).setValues(rows);
    const warna = { 'Selesai': '#e6f4ea', 'Separa': '#fff6dc', 'Belum bayar': '#fde8e6', 'Ditaja': '#e7eef8' };
    s.getRange(3, hdr.length, rows.length, 1).setBackgrounds(rows.map(r => [warna[r[r.length - 1]] || '#ffffff']));
  }
  s.setFrozenRows(2);
  s.setFrozenColumns(2);
  s.autoResizeColumns(1, hdr.length);
  return { url: ss.getUrl() + '#gid=' + s.getSheetId(), bil: rows.length };
}
