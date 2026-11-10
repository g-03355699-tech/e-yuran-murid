/**
 * e-Yuran Murid — rekod bayaran yuran murid ke Google Sheets, dengan resit dari WhatsApp ibu bapa.
 * https://github.com/g-03355699-tech/e-yuran-murid
 *
 * Satu web app untuk semua guru (Execute as: User accessing the web app).
 * Kali pertama dibuka, Google Sheet "e-Yuran Murid" dicipta secara automatik dalam Drive guru tersebut,
 * dan guru itu menjadi Pentadbir. Guru lain dijemput melalui Tetapan > Guru, kemudian membuka
 * pautan jemputan (…/exec?sertai=ID_SHEET) untuk menggunakan Sheet yang sama.
 */

const VERSI = '1.3.0';

const NAMA_SS = 'e-Yuran Murid';
const NAMA_FOLDER_RESIT = 'Resit e-Yuran Murid';
const NAMA_FOLDER_PENYATA = 'Penyata e-Yuran Murid';
const SAIZ_CEBISAN = 45000;     // had sel Sheets ialah 50,000 aksara

const SH_MURID = 'Murid', SH_YURAN = 'Yuran', SH_BAYARAN = 'Bayaran', SH_GURU = 'Guru',
      SH_TETAPAN = 'Tetapan', SH_RESIT = 'ResitData', SH_RINGKASAN = 'Ringkasan', SH_LOG = 'Log';

const HDR = {
  Murid: ['No KP', 'Nama', 'Kelas', 'Jantina', 'Rumah', 'Kebenaran Suntikan', 'Kebenaran Photo',
          'Pend Bapa', 'Pend Ibu', 'Kadar Harian', 'Penaja', 'Yuran Ditaja', 'No Tel Penjaga', 'Catatan', 'Penyata ID'],
  Yuran: ['Kod', 'Nama Yuran', 'Amaun Lelaki', 'Amaun Perempuan', 'Ikut Kadar Harian', 'Bil Hari', 'Susunan', 'Aktif',
          'Bank Bayaran', 'No Akaun', 'Nama Akaun'],
  Bayaran: ['ID', 'No KP', 'Nama', 'Kelas', 'Kod Yuran', 'Amaun', 'Tarikh Bayar', 'No Rujukan', 'Kaedah', 'Bank',
            'Resit ID', 'Resit URL', 'Catatan', 'Direkod Oleh', 'Masa Rekod', 'Dipadam', 'Dipadam Oleh'],
  Guru: ['Emel', 'Nama', 'Peranan', 'Kelas'],
  Tetapan: ['Kunci', 'Nilai', 'Keterangan'],
  ResitData: ['Resit ID', 'Bahagian', 'Data'],
  Log: ['Masa', 'Oleh', 'Tindakan', 'No KP', 'Nama', 'Butiran']
};

// Lajur yang mesti kekal teks (supaya digit tidak bertukar jadi nombor / hilang sifar di depan)
const LAJUR_TEKS = {
  Murid: ['No KP', 'No Tel Penjaga'],
  Bayaran: ['ID', 'No KP', 'No Rujukan'],
  Yuran: ['No Akaun'],
  Guru: ['Emel'],
  ResitData: ['Resit ID'],
  Log: ['No KP']
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
  ['KADAR_BIASA', '3', 'Kadar harian (RM) biasa'],
  ['ARAHAN_BAYARAN', 'Sila nyatakan nama murid dan kelas sebagai rujukan bayaran, kemudian hantar resit melalui WhatsApp kepada guru kelas.', 'Arahan bayaran dalam mesej WhatsApp & penyata']
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
    had: Number(o.HAD_PENDAPATAN) || 0, kadarRendah: Number(o.KADAR_RENDAH) || 0, kadarBiasa: Number(o.KADAR_BIASA) || 0,
    arahan: o.ARAHAN_BAYARAN || ''
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
    aktif: yt_(n_(d, row, 'Aktif')) !== 'T',
    bank: teks_(n_(d, row, 'Bank Bayaran')),
    akaun: teks_(n_(d, row, 'No Akaun')).replace(/^'/, ''),
    namaAkaun: teks_(n_(d, row, 'Nama Akaun'))
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
    catatan: teks_(n_(d, row, 'Catatan')),
    penyataId: teks_(n_(d, row, 'Penyata ID')),
    penyataUrl: teks_(n_(d, row, 'Penyata ID')) ? 'https://drive.google.com/file/d/' + teks_(n_(d, row, 'Penyata ID')) + '/view' : ''
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
    masa: tarikhStr_(n_(d, row, 'Masa Rekod'), 'yyyy-MM-dd HH:mm'),
    dipadam: tarikhStr_(n_(d, row, 'Dipadam'), 'yyyy-MM-dd HH:mm'),
    dipadamOleh: teks_(n_(d, row, 'Dipadam Oleh'))
  };
}

function muat_(g) {
  const t = tetapan_();
  const dm = baca_(SH_MURID);
  const murid = dm.rows.map(r => muridDariBaris_(dm, r)).filter(m => m.kp && m.nama && boleh_(g, m.kelas));
  const ada = {};
  murid.forEach(m => { ada[m.kp] = 1; });
  const db = baca_(SH_BAYARAN);
  const semua = db.rows.map(r => bayaranDariBaris_(db, r)).filter(b => ada[b.kp]);
  const bayaran = semua.filter(b => !b.dipadam);
  const sampah = semua.filter(b => b.dipadam);
  const out = {
    versi: VERSI,
    user: { emel: g.emel, nama: g.nama, peranan: g.peranan, kelas: g.kelas },
    tetapan: { namaSekolah: t.namaSekolah, tahun: t.tahun, had: t.had, kadarRendah: t.kadarRendah, kadarBiasa: t.kadarBiasa, arahan: t.arahan },
    ruang: maklumatRuang_(),
    appUrl: ScriptApp.getService().getUrl(),
    yuran: bacaYuran_(),
    murid, bayaran, sampah
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
      if (teks_(n_(db, lama[0], 'Dipadam'))) throw new Error('Rekod ini berada dalam Sampah. Pulihkan dahulu sebelum mengedit.');
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
    const sebelum = lama.length ? ringkasBayaran_(lama.map(r => bayaranDariBaris_(db, r))) : '';
    padamBaris_(db.s, lama.map(r => r.baris));
    tambahBaris_(db, SH_BAYARAN, data);
    const selepas = ringkasBayaran_(item.map(x => ({ kod: x.kod, amaun: x.amaun, tarikh: d.tarikh, rujukan: teks_(d.rujukan), resitId })));
    if (lama.length) log_(g, 'UBAH_BAYARAN', m, id + ' · Sebelum: ' + sebelum + ' → Selepas: ' + selepas);
    else log_(g, 'TAMBAH_BAYARAN', m, id + ' · ' + selepas);
    SpreadsheetApp.flush();
    const amaran = kemasPenyataSenyap_(g, m.kp);
    const out = muat_(g);
    out.idSimpan = id;
    if (amaran) out.amaran = amaran;
    return out;
  } finally {
    lock.releaseLock();
  }
}

/** Padam lembut: rekod dipindahkan ke Sampah dan boleh dipulihkan. Resit tidak dibuang. */
function padamBayaran(id) { return tandaPadam_(id, true); }
function pulihBayaran(id) { return tandaPadam_(id, false); }

function tandaPadam_(id, padam) {
  const g = akses_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let kp;
  try {
    const db = baca_(SH_BAYARAN);
    const rows = db.rows.filter(r => teks_(n_(db, r, 'ID')) === teks_(id));
    if (!rows.length) throw new Error('Rekod bayaran tidak dijumpai.');
    if (!boleh_(g, teks_(n_(db, rows[0], 'Kelas')))) throw new Error('Anda tiada akses untuk rekod ini.');
    const sudah = !!teks_(n_(db, rows[0], 'Dipadam'));
    if (padam && sudah) throw new Error('Rekod ini sudah berada dalam Sampah.');
    if (!padam && !sudah) throw new Error('Rekod ini tidak berada dalam Sampah.');
    const nilai = padam ? { 'Dipadam': new Date(), 'Dipadam Oleh': oleh_(g) } : { 'Dipadam': '', 'Dipadam Oleh': '' };
    rows.forEach(r => tulisBaris_(db, SH_BAYARAN, r.baris, [barisBaru_(db, nilai, r.r)]));
    const b0 = bayaranDariBaris_(db, rows[0]);
    kp = b0.kp;
    log_(g, padam ? 'PADAM_BAYARAN' : 'PULIH_BAYARAN', { kp, nama: teks_(n_(db, rows[0], 'Nama')) },
         id + ' · ' + ringkasBayaran_(rows.map(r => bayaranDariBaris_(db, r))));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  const amaran = kemasPenyataSenyap_(g, kp);
  const out = muat_(g);
  if (amaran) out.amaran = amaran;
  return out;
}

/** Padam kekal dari Sampah (pentadbir sahaja) — resit juga dibuang. */
function padamKekalBayaran(id) {
  const g = akses_();
  admin_(g);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const db = baca_(SH_BAYARAN);
    const rows = db.rows.filter(r => teks_(n_(db, r, 'ID')) === teks_(id));
    if (!rows.length) throw new Error('Rekod bayaran tidak dijumpai.');
    if (!teks_(n_(db, rows[0], 'Dipadam'))) throw new Error('Hanya rekod dalam Sampah boleh dipadam kekal.');
    const resitId = teks_(n_(db, rows[0], 'Resit ID'));
    log_(g, 'PADAM_KEKAL_BAYARAN', { kp: kp_(n_(db, rows[0], 'No KP')), nama: teks_(n_(db, rows[0], 'Nama')) },
         id + ' · ' + ringkasBayaran_(rows.map(r => bayaranDariBaris_(db, r))));
    padamBaris_(db.s, rows.map(r => r.baris));
    if (resitId && !db.rows.some(r => rows.indexOf(r) < 0 && teks_(n_(db, r, 'Resit ID')) === resitId)) buangFail_(resitId);
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
    if (row) {
      const ubah = Object.keys(obj).filter(k => String(n_(d, row, k) === '' ? '' : (k === 'No KP' ? kp_(n_(d, row, k)) : n_(d, row, k))) !== String(obj[k]))
        .map(k => /^Pend /.test(k) ? k + ' diubah' : k + ': ' + (teks_(n_(d, row, k)) || '-') + ' → ' + (obj[k] === '' ? '-' : obj[k]));
      tulisBaris_(d, SH_MURID, row.baris, [barisBaru_(d, obj, row.r)]);
      if (ubah.length) log_(g, 'UBAH_MURID', { kp, nama }, ubah.join('; '));
    } else {
      tambahBaris_(d, SH_MURID, [barisBaru_(d, obj)]);
      log_(g, 'TAMBAH_MURID', { kp, nama }, 'Kelas ' + kelas);
    }

    if (row) {   // kemas kini salinan nama/kelas/KP dalam tab Bayaran
      const db = baca_(SH_BAYARAN);
      db.rows.filter(r => kp_(n_(db, r, 'No KP')) === kp_(kpAsal)).forEach(r => {
        tulisBaris_(db, SH_BAYARAN, r.baris, [barisBaru_(db, { 'No KP': kp, 'Nama': nama, 'Kelas': kelas }, r.r)]);
      });
    }
    SpreadsheetApp.flush();
    const amaran = row ? kemasPenyataSenyap_(g, kp) : '';
    const out = muat_(g);
    out.kpSimpan = kp;
    if (amaran) out.amaran = amaran;
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
    const milik = db.rows.filter(r => kp_(n_(db, r, 'No KP')) === kp);
    if (milik.some(r => !teks_(n_(db, r, 'Dipadam')))) throw new Error('Murid ini ada rekod bayaran. Padam rekod bayaran dahulu.');
    const d = baca_(SH_MURID);
    const row = d.rows.find(r => kp_(n_(d, r, 'No KP')) === kp);
    if (!row) throw new Error('Murid tidak dijumpai.');
    const m = muridDariBaris_(d, row);
    if (m.penyataId) buangPenyata_(m.penyataId);
    padamBaris_(d.s, [row.baris]);
    const resit = {};
    milik.forEach(r => { const id = teks_(n_(db, r, 'Resit ID')); if (id) resit[id] = 1; });
    padamBaris_(db.s, milik.map(r => r.baris));
    Object.keys(resit).forEach(buangFail_);
    log_(g, 'PADAM_MURID', m, 'Kelas ' + m.kelas + (milik.length ? ' · ' + milik.length + ' baris bayaran dalam Sampah dipadam kekal' : ''));
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
    if (data.length) log_(g, 'IMPORT_MURID', { kp: '', nama: '' }, data.length + ' murid ditambah ke kelas ' + kelas + (langkau.length ? ' · ' + langkau.length + ' dilangkau' : ''));
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
    const akaun = teks_(y.akaun).replace(/[^\d\- ]/g, '').trim();
    return [kod, teks_(y.nama), r2_(y.amaunL), r2_(y.amaunP), y.ikutKadar ? 'Y' : 'T',
            y.ikutKadar ? (Number(y.hari) || 0) : '', i + 1, y.aktif ? 'Y' : 'T',
            teks_(y.bank).slice(0, 60), akaun.slice(0, 30), teks_(y.namaAkaun).slice(0, 80)];
  });
  const db = baca_(SH_BAYARAN);
  const dipakai = {};
  db.rows.forEach(r => { dipakai[teks_(n_(db, r, 'Kod Yuran')).toUpperCase()] = 1; });
  bacaYuran_().forEach(y => {
    if (!lihat[y.kod] && dipakai[y.kod]) throw new Error('Yuran ' + y.kod + ' ada rekod bayaran — nyahaktifkan sahaja, jangan padam.');
  });
  const teksY = r => r[0] + ' (' + r[1] + '): ' + (r[4] === 'Y' ? 'kadar × ' + r[5] + ' hari' : 'L ' + r[2] + ' / P ' + r[3]) + (r[7] === 'Y' ? '' : ', tidak aktif') +
    (r[9] ? ', akaun ' + r[8] + ' ' + r[9] + (r[10] ? ' (' + r[10] + ')' : '') : '');
  const asal = {};
  bacaYuran_().forEach(y => { asal[y.kod] = teksY([y.kod, y.nama, y.amaunL, y.amaunP, y.ikutKadar ? 'Y' : 'T', y.hari, 0, y.aktif ? 'Y' : 'T', y.bank, y.akaun, y.namaAkaun]); });
  const ubah = rows.filter(r => asal[r[0]] !== teksY(r)).map(r => (asal[r[0]] ? 'Ubah ' : 'Tambah ') + teksY(r))
    .concat(Object.keys(asal).filter(k => !lihat[k]).map(k => 'Buang ' + k));
  const dy = baca_(SH_YURAN);
  const kunci = HDR.Yuran;
  if (dy.s.getLastRow() > 1) dy.s.getRange(2, 1, dy.s.getLastRow() - 1, dy.s.getLastColumn()).clearContent();
  if (rows.length) {
    const data = rows.map(r => { const o = {}; kunci.forEach((k, i) => { o[k] = r[i]; }); return barisBaru_(dy, o); });
    tulisBaris_(dy, SH_YURAN, 2, data);
  }
  if (ubah.length) log_(g, 'TETAPAN_YURAN', null, ubah.join('; '));
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
  const asalG = {};
  senaraiGuru_().forEach(x => { asalG[x.emel] = x.peranan + ' ' + (x.kelas.join(',') || 'semua kelas'); });
  const ubahG = rows.filter(r => asalG[r[0]] !== r[2] + ' ' + (r[3] ? r[3].split(',').map(x => x.trim()).filter(Boolean).join(',') : 'semua kelas'))
    .map(r => (asalG[r[0]] ? 'Ubah ' : 'Tambah ') + r[0] + ' (' + r[2] + ', ' + (r[3] || 'semua kelas') + ')')
    .concat(Object.keys(asalG).filter(e => !lihat[e]).map(e => 'Buang ' + e));
  if (ubahG.length) log_(g, 'TETAPAN_GURU', null, ubahG.join('; '));
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
    KADAR_RENDAH: String(num_(t.kadarRendah) || 0), KADAR_BIASA: String(num_(t.kadarBiasa) || 0),
    ARAHAN_BAYARAN: teks_(t.arahan).slice(0, 500)
  };
  const d = baca_(SH_TETAPAN);
  const ubahT = [];
  Object.keys(nilai).forEach(k => {
    const row = d.rows.find(r => teks_(n_(d, r, 'Kunci')) === k);
    const asal = row ? teks_(n_(d, row, 'Nilai')) : '';
    if (asal !== nilai[k]) ubahT.push(k + ': ' + (asal || '-') + ' → ' + nilai[k]);
    if (row) d.s.getRange(row.baris, d.idx['Nilai'] + 1).setNumberFormat('@').setValue(nilai[k]);
    else {
      const lalai = TETAPAN_LALAI.find(r => r[0] === k);
      d.s.appendRow([k, nilai[k], lalai ? lalai[2] : '']);
    }
  });
  if (nilai.NAMA_SEKOLAH) { try { ss_().rename(NAMA_SS + ' — ' + nilai.NAMA_SEKOLAH); } catch (e) {} }
  if (ubahT.length) log_(g, 'TETAPAN_UMUM', null, ubahT.join('; '));
  return muat_(g);
}

/* ===================== Log audit ===================== */

function oleh_(g) { return g.nama ? g.nama + ' <' + g.emel + '>' : g.emel; }

function ringkasBayaran_(senarai) {
  if (!senarai.length) return '-';
  const b = senarai[0];
  return senarai.map(x => x.kod + ' RM' + r2_(x.amaun).toFixed(2)).join(', ') +
    ' · ' + (b.tarikh || '') + (b.rujukan ? ' · Ruj ' + b.rujukan : '') + (b.resitId ? ' · ada resit' : '');
}

/** Tambah satu baris ke tab Log. Tidak pernah menggagalkan operasi utama. */
function log_(g, tindakan, m, butiran) {
  try {
    const d = baca_(SH_LOG);
    tambahBaris_(d, SH_LOG, [barisBaru_(d, {
      'Masa': new Date(), 'Oleh': oleh_(g), 'Tindakan': tindakan,
      'No KP': m ? m.kp || '' : '', 'Nama': m ? m.nama || '' : '', 'Butiran': String(butiran || '').slice(0, 2000)
    })]);
  } catch (e) { console.error('Gagal tulis log: ' + e); }
}

/** Log terkini (300 terbaharu). Tanpa kp: pentadbir sahaja. Dengan kp: guru yang ada akses kepada murid itu. */
function bacaLog(kp) {
  const g = akses_();
  kp = kp_(kp || '');
  if (kp) {
    const cm = cariMurid_(kp);
    if (cm && !boleh_(g, cm.m.kelas)) throw new Error('Anda tiada akses untuk murid ini.');
  } else admin_(g);
  const d = baca_(SH_LOG);
  return d.rows.map(r => ({
    masa: tarikhStr_(n_(d, r, 'Masa'), 'yyyy-MM-dd HH:mm'), oleh: teks_(n_(d, r, 'Oleh')), tindakan: teks_(n_(d, r, 'Tindakan')),
    kp: kp_(n_(d, r, 'No KP')), nama: teks_(n_(d, r, 'Nama')), butiran: teks_(n_(d, r, 'Butiran'))
  })).filter(x => !kp || x.kp === kp).reverse().slice(0, 300);
}

/* ===================== OCR resit ===================== */

/** Tukar gambar/PDF resit kepada teks dengan OCR Google Drive, kemudian cari jumlah, tarikh, No. rujukan & bank. */
function bacaResit(resit) {
  akses_();
  if (!resit || !resit.b64) return { ok: false };
  if (resit.b64.length > 7 * 1024 * 1024) return { ok: false, ralat: 'Fail terlalu besar untuk dibaca.' };
  const mime = resit.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg';
  const blob = Utilities.newBlob(Utilities.base64Decode(resit.b64), mime, 'ocr-resit');
  let id = '';
  try {
    const f = Drive.Files.create({ name: 'OCR sementara e-Yuran', mimeType: 'application/vnd.google-apps.document' },
                                 blob, { ocrLanguage: 'en', fields: 'id' });
    id = f.id;
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text%2Fplain', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return { ok: false, ralat: 'OCR gagal (' + res.getResponseCode() + ').' };
    const teks = res.getContentText('UTF-8');
    const isi = huraiResit_(teks);
    // Padankan nombor akaun penerima dalam resit dengan akaun bayaran setiap yuran
    const digit = teks.replace(/\D/g, '');
    isi.yuranAkaun = bacaYuran_().filter(y => y.aktif && y.akaun.replace(/\D/g, '').length >= 8 &&
      digit.indexOf(y.akaun.replace(/\D/g, '')) >= 0).map(y => y.kod);
    return { ok: true, isi, teks: teks.slice(0, 3000) };
  } catch (e) {
    return { ok: false, ralat: String(e.message || e) };
  } finally {
    if (id) { try { Drive.Files.remove(id); } catch (e) { try { Drive.Files.update({ trashed: true }, id); } catch (e2) {} } }
  }
}

const BANK_OCR_ = [
  [/maybank|m2u|\bmae\b|malayan banking/i, 'Maybank'], [/cimb|octo/i, 'CIMB'], [/bank\s*islam|\bbimb\b|go\s*by\s*bank\s*islam/i, 'Bank Islam'],
  [/\brhb\b/i, 'RHB'], [/public\s*bank|\bpbe\b|pb\s*engage/i, 'Public Bank'], [/\bbsn\b|bank\s*simpanan/i, 'BSN'],
  [/bank\s*rakyat|irakyat/i, 'Bank Rakyat'], [/ambank|amonline/i, 'AmBank'], [/hong\s*leong|\bhlb\b/i, 'Hong Leong'],
  [/affin/i, 'Affin'], [/agrobank|agronet/i, 'Agrobank'], [/muamalat/i, 'Bank Muamalat'], [/alliance/i, 'Alliance'],
  [/touch\s*'?n\s*go|\btng\b/i, "Touch 'n Go eWallet"], [/\bboost\b/i, 'Boost'], [/gxbank|\bgx\b/i, 'GXBank'],
  [/bank\s*of\s*china/i, 'Bank of China'], [/\buob\b/i, 'UOB'], [/\bocbc\b/i, 'OCBC'], [/hsbc/i, 'HSBC'], [/standard\s*chartered/i, 'Standard Chartered']
];
const BULAN_OCR_ = { jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogo: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12 };

function huraiResit_(teks) {
  const baris = String(teks || '').replace(/\r/g, '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = {};
  const sel = i => baris[i] || '';

  // --- Jumlah
  const KATA_JUM = /(amount|jumlah|amaun|total|nilai|paid|dibayar|bayaran|transfer)/i;
  const BUKAN = /(fee|caj|charge|baki|balance|available|limit|had)/i;
  const reRM = /(?:RM|MYR)\s*:?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i;
  const reNom = /(^|\s)([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})(\s|$)/;
  const calon = [];
  baris.forEach((b, i) => {
    let m = b.match(reRM), nilai = null, skor = 0, rujuk = b;
    if (m) nilai = m[1];
    else if (KATA_JUM.test(b)) {
      m = b.match(reNom);
      if (m) nilai = m[2];
      else { const n = sel(i + 1); const m2 = n.match(reRM) || n.match(reNom); if (m2) { nilai = m2[1] || m2[2]; rujuk = b + ' ' + n; } }
    }
    if (nilai == null) return;
    const v = Number(String(nilai).replace(/,/g, ''));
    if (!(v > 0 && v < 100000)) return;
    skor += KATA_JUM.test(rujuk) ? 3 : 0;
    skor += /RM|MYR/i.test(rujuk) ? 2 : 0;
    skor += /\.\d{2}\b/.test(String(nilai)) ? 1 : 0;
    if (BUKAN.test(b)) skor -= 5;
    calon.push({ v, skor, i });
  });
  calon.sort((a, b) => b.skor - a.skor || a.i - b.i);
  if (calon.length && calon[0].skor > 0) out.jumlah = calon[0].v;

  // --- Tarikh
  const kini = new Date();
  const sah = (y, mo, d) => {
    if (y < 100) y += 2000;
    const t = new Date(y, mo - 1, d);
    if (t.getMonth() !== mo - 1 || t.getDate() !== d) return null;
    const hari = (kini - t) / 86400000;
    if (hari < -2 || hari > 730) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  };
  const cariTarikh = b => {
    let m = b.match(/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
    if (m) { const r = sah(+m[1], +m[2], +m[3]); if (r) return r; }
    m = b.match(/\b(\d{1,2})\s*[-\/ ]?\s*([A-Za-z]{3,9})\.?\s*[-\/ ,]?\s*(\d{4}|\d{2})\b/);
    if (m) { const mo = BULAN_OCR_[m[2].slice(0, 3).toLowerCase()]; if (mo) { const r = sah(+m[3], mo, +m[1]); if (r) return r; } }
    m = b.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (m) { const mo = BULAN_OCR_[m[1].slice(0, 3).toLowerCase()]; if (mo) { const r = sah(+m[3], mo, +m[2]); if (r) return r; } }
    m = b.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})\b/);
    if (m) { const r = sah(+m[3], +m[2], +m[1]); if (r) return r; }
    return null;
  };
  const urut = baris.map((b, i) => i).sort((a, b) => (/(date|tarikh|time|masa)/i.test(baris[b]) ? 1 : 0) - (/(date|tarikh|time|masa)/i.test(baris[a]) ? 1 : 0));
  for (const i of urut) {
    const r = cariTarikh(baris[i]) || (/(date|tarikh)/i.test(baris[i]) ? cariTarikh(sel(i + 1)) : null);
    if (r) { out.tarikh = r; break; }
  }

  // --- No. rujukan
  const KATA_RUJ = /(reference\s*(no|number|id)?|ref\.?\s*(no|id)?\b|rujukan|no\.?\s*resit|receipt\s*(no|number)|transaction\s*(id|no|ref|number)|id\s*transaksi|no\.?\s*transaksi|txn\s*(id|no)?|approval\s*code|trace\s*no|seq(uence)?\s*no)/i;
  const token = t => {
    const m = String(t || '').match(/\b([A-Z0-9][A-Z0-9\-\/]{5,39})\b/gi);
    return m ? m.find(x => /\d/.test(x) && !/^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/.test(x) && !/^RM/i.test(x)) : null;
  };
  for (let i = 0; i < baris.length && !out.rujukan; i++) {
    const b = baris[i];
    if (!KATA_RUJ.test(b) || /(recipient|penerima|beneficiary)/i.test(b)) continue;
    const lepas = b.replace(KATA_RUJ, '').replace(/^[\s:.\-#]+/, '');
    out.rujukan = token(lepas) || token(sel(i + 1)) || undefined;
  }
  if (!out.rujukan) delete out.rujukan;

  // --- Bank & kaedah
  const semua = baris.join(' ');
  for (const [re, nama] of BANK_OCR_) { if (re.test(semua)) { out.bank = nama; break; } }
  if (/(cash\s*deposit|\bcdm\b|deposit\s*tunai)/i.test(semua)) out.kaedah = 'Deposit tunai / CDM';
  else if (/(cheque|\bcek\b)/i.test(semua)) out.kaedah = 'Cek';
  else if (/(duitnow|\bfpx\b|\bibg\b|instant\s*transfer|interbank|fund\s*transfer|pindahan|transfer|jompay)/i.test(semua)) out.kaedah = 'Pindahan online / FPX';
  return out;
}

/* ===================== Penyata untuk ibu bapa ===================== */

/** Bahagian "Cara bayaran" dalam penyata: akaun bagi yuran yang masih ada baki (dikumpul ikut akaun). */
function caraBayarHtml_(yuran, m, t, jk) {
  if (jk <= 0) return '';
  const kump = {};
  yuran.filter(y => y.akaun && !ditaja_(m, y.kod)).forEach(y => {
    const k = y.bank + '|' + y.akaun;
    (kump[k] = kump[k] || { y, nama: [] }).nama.push(y.nama);
  });
  const baris = Object.keys(kump).map(k => {
    const g = kump[k];
    return '<tr><td>' + eh_(g.nama.join(', ')) + '</td><td>' + eh_(g.y.bank) + '</td><td><b>' + eh_(g.y.akaun) + '</b></td><td>' + eh_(g.y.namaAkaun || '') + '</td></tr>';
  }).join('');
  if (!baris && !t.arahan) return '';
  return '<h2>Cara bayaran</h2>' + (baris ? '<table class="j"><tr><th>Yuran</th><th>Bank</th><th>No. akaun</th><th>Nama akaun</th></tr>' + baris + '</table>' : '') +
    (t.arahan ? '<p style="font-size:10pt;color:#3b4350;margin:8px 0 0">' + eh_(t.arahan) + '</p>' : '');
}

function folderPenyata_() {
  const id = props_().getProperty('FOLDER_PENYATA');
  if (id) {
    try { const f = Drive.Files.get(id, { fields: 'id,trashed' }); if (!f.trashed) return id; } catch (e) { /* folder dipadam */ }
  }
  const f = Drive.Files.create({ name: NAMA_FOLDER_PENYATA, mimeType: 'application/vnd.google-apps.folder' });
  props_().setProperty('FOLDER_PENYATA', f.id);
  return f.id;
}

function eh_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function rmS_(n) { return 'RM ' + r2_(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function tarikhBM_(s) {
  const b = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? (+m[3]) + ' ' + b[+m[2] - 1] + ' ' + m[1] : (s || '');
}

/** PDF penyata yuran seorang murid (tanpa maklumat pendapatan). */
function blobPenyata_(m) {
  const t = tetapan_();
  const yuran = bacaYuran_().filter(y => y.aktif);
  const db = baca_(SH_BAYARAN);
  const bayar = db.rows.map(r => bayaranDariBaris_(db, r)).filter(b => b.kp === m.kp && !b.dipadam)
    .sort((a, b) => a.tarikh.localeCompare(b.tarikh));
  let jc = 0, jb = 0, jk = 0;
  const baris = yuran.map(y => {
    const tj = ditaja_(m, y.kod);
    const c = tj ? 0 : caj_(m, y, t);
    const b = r2_(bayar.filter(x => x.kod === y.kod).reduce((s, x) => s + x.amaun, 0));
    const k = r2_(Math.max(0, c - b));
    jc += c; jb += b; jk += k;
    const st = tj ? '<span class="st biru">Ditaja</span>' : c === 0 ? '<span class="st hijau">Tiada caj</span>' :
      k <= 0 ? '<span class="st hijau">Selesai</span>' : '<span class="st merah">Baki ' + rmS_(k) + '</span>';
    return '<tr><td>' + eh_(y.nama) + '</td><td class="n">' + (tj ? '-' : rmS_(c)) + '</td><td class="n">' + rmS_(b) + '</td><td>' + st + '</td></tr>';
  }).join('');
  const nama = k => { const y = yuran.find(x => x.kod === k) || bacaYuran_().find(x => x.kod === k); return y ? y.nama : k; };
  const sej = bayar.map(b => '<tr><td>' + eh_(tarikhBM_(b.tarikh)) + '</td><td>' + eh_(nama(b.kod)) + '</td><td>' + eh_(b.rujukan || '-') +
    '</td><td class="n">' + rmS_(b.amaun) + '</td></tr>').join('');
  const kini = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm');
  const kpS = m.kp.length === 12 ? m.kp.slice(0, 6) + '-••-••' + m.kp.slice(10) : m.kp;
  const html = '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#1b1f24;font-size:11pt;margin:0}' +
    '.kepala{background:#12386b;color:#fff;padding:18px 22px}.kepala h1{margin:0;font-size:17pt}.kepala div{opacity:.85;font-size:10pt;margin-top:3px}' +
    '.isi{padding:18px 22px}.info td{padding:2px 14px 2px 0;font-size:10.5pt}.info td:first-child{color:#5f6670}' +
    'table.j{width:100%;border-collapse:collapse;margin-top:8px}table.j th{background:#eef1f5;text-align:left;font-size:9.5pt;padding:7px 8px;color:#3b4350}' +
    'table.j td{border-bottom:1px solid #e3e8ef;padding:7px 8px;font-size:10pt}.n{text-align:right;white-space:nowrap}' +
    'h2{font-size:12pt;margin:20px 0 4px;color:#12386b}.st{font-size:9pt;font-weight:bold;padding:2px 7px;border-radius:8px}' +
    '.hijau{background:#e6f4ea;color:#1e7a3a}.merah{background:#fde8e6;color:#a5221a}.biru{background:#e7eef8;color:#2a5ea8}' +
    '.jum{margin-top:14px;padding:12px 14px;border-radius:8px;font-size:12pt;font-weight:bold}' +
    '.kaki{margin-top:22px;font-size:8.5pt;color:#5f6670;border-top:1px solid #e3e8ef;padding-top:8px}' +
    '</style></head><body><div class="kepala"><h1>Penyata Yuran ' + eh_(t.tahun) + '</h1><div>' + eh_(t.namaSekolah) + '</div></div><div class="isi">' +
    '<table class="info"><tr><td>Nama murid</td><td><b>' + eh_(m.nama) + '</b></td></tr><tr><td>Kelas</td><td>' + eh_(m.kelas || '-') +
    '</td></tr><tr><td>No. KP</td><td>' + eh_(kpS) + '</td></tr>' + (m.penaja ? '<tr><td>Penaja</td><td>' + eh_(m.penaja) + '</td></tr>' : '') +
    '<tr><td>Status pada</td><td>' + eh_(kini) + '</td></tr></table>' +
    '<h2>Status yuran</h2><table class="j"><tr><th>Yuran</th><th class="n">Dikenakan</th><th class="n">Dibayar</th><th>Status</th></tr>' + baris +
    '<tr><td><b>Jumlah</b></td><td class="n"><b>' + rmS_(jc) + '</b></td><td class="n"><b>' + rmS_(jb) + '</b></td><td></td></tr></table>' +
    '<div class="jum ' + (jk > 0 ? 'merah' : 'hijau') + '">' + (jk > 0 ? 'Baki tertunggak: ' + rmS_(jk) : 'Semua yuran telah dijelaskan. Terima kasih!') + '</div>' +
    caraBayarHtml_(yuran, m, t, jk) +
    '<h2>Sejarah bayaran</h2>' + (sej ? '<table class="j"><tr><th>Tarikh</th><th>Yuran</th><th>No. rujukan</th><th class="n">Amaun</th></tr>' + sej + '</table>' :
    '<p style="color:#5f6670">Belum ada bayaran direkodkan.</p>') +
    '<div class="kaki">Penyata ini dijana secara automatik oleh e-Yuran Murid dan dikemas kini setiap kali bayaran direkodkan. ' +
    'Sebarang pertanyaan, sila hubungi guru kelas.</div></div></body></html>';
  return Utilities.newBlob(html, 'text/html', 'penyata.html').getAs('application/pdf')
    .setName('Penyata Yuran ' + t.tahun + ' - ' + m.nama + '.pdf');
}

/** Cipta PDF baharu dalam Drive pengguna semasa, dikongsi "sesiapa yang ada pautan" (lihat sahaja). */
function ciptaPenyata_(m) {
  const blob = blobPenyata_(m);
  const f = Drive.Files.create({ name: blob.getName(), parents: [folderPenyata_()] }, blob, { fields: 'id' });
  try {
    Drive.Permissions.create({ role: 'reader', type: 'anyone' }, f.id);
  } catch (e) {
    try { Drive.Files.update({ trashed: true }, f.id); } catch (e2) {}
    throw new Error('Akaun Google anda tidak membenarkan perkongsian “sesiapa yang ada pautan” (tetapan domain). Gunakan akaun Gmail untuk ciri penyata.');
  }
  return f.id;
}

function tulisPenyataId_(kp, id) {
  const d = baca_(SH_MURID);
  const row = d.rows.find(r => kp_(n_(d, r, 'No KP')) === kp);
  if (row) tulisBaris_(d, SH_MURID, row.baris, [barisBaru_(d, { 'Penyata ID': id }, row.r)]);
}

/** Kemas kini kandungan penyata sedia ada. Jika fail milik guru lain (tiada akses), cipta yang baharu. Pulangkan {id, baharu}. */
function kemasPenyata_(m) {
  if (m.penyataId) {
    try {
      const blob = blobPenyata_(m);
      Drive.Files.update({ name: blob.getName() }, m.penyataId, blob);
      return { id: m.penyataId, baharu: false };
    } catch (e) { console.warn('Tidak dapat kemas kini penyata ' + m.penyataId + ': ' + e); }
  }
  const id = ciptaPenyata_(m);
  tulisPenyataId_(m.kp, id);
  return { id, baharu: true, lama: m.penyataId };
}

/** Dipanggil selepas bayaran berubah — tidak pernah menggagalkan simpanan. Pulangkan amaran (jika ada). */
function kemasPenyataSenyap_(g, kp) {
  try {
    const cm = cariMurid_(kp);
    if (!cm || !cm.m.penyataId) return '';
    const r = kemasPenyata_(cm.m);
    if (r.baharu) {
      log_(g, 'PENYATA_BAHARU', cm.m, 'Pautan penyata ditukar (fail lama milik guru lain): ' + r.id);
      return 'Pautan penyata ' + cm.m.nama + ' telah ditukar. Hantar pautan baharu kepada penjaga.';
    }
  } catch (e) {
    return 'Penyata ibu bapa tidak dapat dikemas kini: ' + (e.message || e);
  }
  return '';
}

/** Cipta atau kemas kini penyata murid, pulangkan data app + URL. */
function janaPenyata(kp) {
  const g = akses_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cm = cariMurid_(kp_(kp));
    if (!cm) throw new Error('Murid tidak dijumpai.');
    if (!boleh_(g, cm.m.kelas)) throw new Error('Anda tiada akses untuk murid ini.');
    const r = kemasPenyata_(cm.m);
    if (!cm.m.penyataId) log_(g, 'PENYATA_CIPTA', cm.m, 'Pautan penyata ibu bapa dicipta');
    else if (r.baharu) log_(g, 'PENYATA_BAHARU', cm.m, 'Pautan penyata ditukar: ' + r.id);
    SpreadsheetApp.flush();
    const out = muat_(g);
    out.penyataUrl = 'https://drive.google.com/file/d/' + r.id + '/view';
    out.penyataBaharu = !!(cm.m.penyataId && r.baharu);
    return out;
  } finally {
    lock.releaseLock();
  }
}

function buangPenyata_(id) {
  try { Drive.Files.update({ trashed: true }, id); return true; }
  catch (e) {
    try { Drive.Permissions.remove(id, 'anyoneWithLink'); return true; } catch (e2) { return false; }
  }
}

/** Tarik balik pautan penyata (fail dibuang ke Sampah Drive). */
function batalPenyata(kp) {
  const g = akses_();
  const cm = cariMurid_(kp_(kp));
  if (!cm) throw new Error('Murid tidak dijumpai.');
  if (!boleh_(g, cm.m.kelas)) throw new Error('Anda tiada akses untuk murid ini.');
  if (!cm.m.penyataId) return muat_(g);
  const ok = buangPenyata_(cm.m.penyataId);
  tulisPenyataId_(cm.m.kp, '');
  log_(g, 'PENYATA_BATAL', cm.m, 'Pautan penyata ditarik balik' + (ok ? '' : ' (fail milik guru lain — minta pemilik membuangnya dari Drive)'));
  const out = muat_(g);
  if (!ok) out.amaran = 'Pautan dibuang dari app, tetapi fail PDF milik guru lain dan masih boleh dibuka. Minta guru tersebut membuangnya dari folder “' + NAMA_FOLDER_PENYATA + '”.';
  return out;
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
