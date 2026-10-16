// ======================================================================
//  TÁCH ĐỀ TỪ TỆP
//
//  Người dạy tải nguyên một tệp đề thi lên kho, rồi bấm "Tách thành câu hỏi".
//  Máy chủ đọc chữ trong tệp bằng khoá Google của trung tâm, cắt thành từng
//  khúc vừa sức mô hình, rồi nhờ AI dựng lại thành đề có cấu trúc. Người dạy
//  soát lại và sửa trước khi lưu, vì AI đọc sai là chuyện bình thường.
//
//  Vì sao không bắt AI đọc cả tệp một lần: đề DELF hay HSK dài vài nghìn chữ,
//  nhét hết vào một lượt thì mô hình bỏ sót nửa sau mà vẫn trả lời như thật.
//  Cắt khúc rồi ghép lại thì mỗi câu đều được nhìn tới.
// ======================================================================

import { goiAI, layJSON, LoiAI } from './ai.js';
import { googleBat, docChuTrongTep } from './google.js';

const trim = (v) => String(v === undefined || v === null ? '' : v).trim();

// Mỗi khúc chừng này chữ. Để quá to thì mô hình đọc lướt, quá nhỏ thì tốn nhiều
// lượt gọi và dễ cắt ngang một câu hỏi.
export const KHUC_CHU = 2600;
export const KHUC_TOI_DA = 8;
export const TEP_CHU_TOI_DA = 400000;

// Cắt theo dòng trống trước, vì đề thi hay cách dòng giữa các câu. Không có thì
// cắt theo dòng, cuối cùng mới cắt cứng theo số chữ.
export function catKhuc(chu, co) {
  co = co || KHUC_CHU;
  const s = String(chu || '').replace(/\r\n/g, '\n');
  const doan = s.split(/\n\s*\n/);
  const ra = [];
  let dem = '';
  doan.forEach(function (d) {
    if (!trim(d)) return;
    if ((dem + '\n\n' + d).length > co && dem) { ra.push(dem); dem = d; }
    else dem = dem ? dem + '\n\n' + d : d;
  });
  if (trim(dem)) ra.push(dem);
  // Khúc nào vẫn quá dài thì cắt tiếp cho vừa.
  const cuoi = [];
  ra.forEach(function (k) {
    if (k.length <= co * 1.6) { cuoi.push(k); return; }
    for (let i = 0; i < k.length; i += co) cuoi.push(k.slice(i, i + co));
  });
  // Trả về đủ mọi khúc. Giới hạn số lượt gọi AI áp ở nơi gọi, và nơi đó phải
  // NÓI RA là đã bỏ lại phần nào, đừng lặng lẽ cắt mất nửa đề.
  return cuoi;
}

const LUAT = `Bạn là trợ lý soạn đề của một trung tâm ngoại ngữ. Người dùng đưa một đoạn đề thi đã được máy đọc ra chữ. Nhiệm vụ: dựng lại đoạn đó thành câu hỏi có cấu trúc.

Trả lời DUY NHẤT một khối JSON, không giải thích gì thêm, theo đúng khuôn:
{"cau":[{"kieu":"tn","deBai":"...","doanVan":"","luaChon":["..."],"dapAn":"...","giaiThich":"","diem":1}]}

Các giá trị cho "kieu":
- "tn": trắc nghiệm một đáp án. "luaChon" là mảng các lựa chọn, "dapAn" là đúng một lựa chọn, chép y nguyên chữ của lựa chọn đó.
- "tn_nhieu": chọn nhiều đáp án. "dapAn" là mảng.
- "dung_sai": đúng hay sai. "luaChon" bỏ trống, "dapAn" là "dung" hoặc "sai".
- "dien": điền vào chỗ trống. "dapAn" là chữ cần điền. Thêm "dapAnPhu" là mảng các cách viết khác cũng đúng, nếu có.
- "ghep": ghép đôi. "cotTrai" và "cotPhai" là hai mảng, "dapAn" là mảng: phần tử thứ i là mục ở cột phải ghép với mục thứ i của cột trái.
- "sap_xep": sắp xếp thành câu đúng. "manh" là mảng các mảnh đã xáo trộn, "dapAn" là mảng theo đúng thứ tự.
- "viet": viết đoạn. Không có đáp án. Thêm "soTuToiThieu" nếu đề có nêu.

Quy tắc bắt buộc:
- Giữ nguyên ngôn ngữ của đề. Đề tiếng Pháp thì giữ tiếng Pháp, đề tiếng Trung thì giữ chữ Hán.
- "doanVan" là đoạn văn hay hội thoại dùng chung cho câu đó, nếu có. Không bịa thêm.
- Không tự nghĩ ra câu hỏi không có trong đoạn. Thà trả về ít câu còn hơn bịa.
- Nếu đoạn không chứa câu hỏi nào thì trả {"cau":[]}.
- Không chắc đáp án thì để "dapAn" là chuỗi rỗng, đừng đoán bừa.`;

const KIEU_OK = ['tn', 'tn_nhieu', 'dung_sai', 'dien', 'ghep', 'sap_xep', 'viet'];

// Nắn lại thứ AI trả về cho đúng khuôn. Mô hình hay trả đáp án là chữ cái "A"
// thay vì chép lại nội dung lựa chọn, nên phải quy đổi.
export function nanCau(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const kieu = KIEU_OK.indexOf(trim(c.kieu)) >= 0 ? trim(c.kieu) : 'tn';
  const luaChon = Array.isArray(c.luaChon) ? c.luaChon.map(function (x) { return trim(x); }).filter(Boolean) : [];
  const ra = {
    kieu: kieu,
    deBai: trim(c.deBai || c.cauHoi || c.question),
    doanVan: trim(c.doanVan || c.passage),
    luaChon: luaChon,
    diem: Number(c.diem) > 0 ? Number(c.diem) : 1,
    giaiThich: trim(c.giaiThich)
  };
  if (kieu === 'ghep') {
    ra.cotTrai = Array.isArray(c.cotTrai) ? c.cotTrai.map(trim).filter(Boolean) : [];
    ra.cotPhai = Array.isArray(c.cotPhai) ? c.cotPhai.map(trim).filter(Boolean) : [];
    ra.dapAn = Array.isArray(c.dapAn) ? c.dapAn.map(trim) : [];
  } else if (kieu === 'sap_xep') {
    ra.manh = Array.isArray(c.manh) ? c.manh.map(trim).filter(Boolean) : [];
    ra.dapAn = Array.isArray(c.dapAn) ? c.dapAn.map(trim) : [];
  } else if (kieu === 'tn_nhieu') {
    ra.dapAn = (Array.isArray(c.dapAn) ? c.dapAn : [c.dapAn]).map(trim).filter(Boolean).map(function (d) {
      return doiChuCaiThanhLuaChon(d, luaChon);
    });
  } else if (kieu === 'viet') {
    ra.dapAn = '';
    ra.soTuToiThieu = Number(c.soTuToiThieu) > 0 ? Number(c.soTuToiThieu) : 0;
  } else if (kieu === 'dung_sai') {
    const d = trim(c.dapAn).toLowerCase();
    ra.dapAn = /^(d|dung|đúng|true|vrai|v|t|对|正确)$/i.test(d) ? 'dung'
             : /^(s|sai|false|faux|f|错|错误)$/i.test(d) ? 'sai' : '';
  } else if (kieu === 'dien') {
    ra.dapAn = trim(c.dapAn);
    ra.dapAnPhu = Array.isArray(c.dapAnPhu) ? c.dapAnPhu.map(trim).filter(Boolean) : [];
  } else {
    ra.dapAn = doiChuCaiThanhLuaChon(trim(c.dapAn), luaChon);
  }
  return ra;
}

// "A" hay "a)" hay "1" đều quy về nội dung lựa chọn tương ứng, để lúc chấm chỉ
// phải so một kiểu duy nhất.
export function doiChuCaiThanhLuaChon(dapAn, luaChon) {
  const d = trim(dapAn);
  if (!d || !luaChon.length) return d;
  if (luaChon.indexOf(d) >= 0) return d;
  const m = /^([A-Za-z])[).\].]?$/.exec(d);
  if (m) {
    const i = m[1].toUpperCase().charCodeAt(0) - 65;
    if (i >= 0 && i < luaChon.length) return luaChon[i];
  }
  const n = /^(\d+)[).\].]?$/.exec(d);
  if (n) {
    const i = Number(n[1]) - 1;
    if (i >= 0 && i < luaChon.length) return luaChon[i];
  }
  // AI đôi khi chép cả "A. Paris". Bỏ phần đánh dấu đầu dòng rồi so lại.
  const bo = d.replace(/^[A-Za-z0-9][).\].]\s*/, '');
  if (luaChon.indexOf(bo) >= 0) return bo;
  return d;
}

// Câu nào không dùng được thì bỏ, đừng để lọt vào đề rồi người dạy mới phát hiện.
export function cauDungDuoc(c) {
  if (!trim(c.deBai)) return false;
  if (c.kieu === 'tn' || c.kieu === 'tn_nhieu') return c.luaChon.length >= 2;
  if (c.kieu === 'ghep') return c.cotTrai.length > 0 && c.cotPhai.length > 0;
  if (c.kieu === 'sap_xep') return c.manh.length >= 2;
  return true;
}

export async function tachDeTuChu(env, chu, nhacThem) {
  const tatCa = catKhuc(chu);
  if (!tatCa.length) return { cau: [], soKhuc: 0, loi: [] };
  const khuc = tatCa.slice(0, KHUC_TOI_DA);
  const cau = [], loi = [];
  if (tatCa.length > khuc.length)
    loi.push('Tệp quá dài: mới đọc ' + khuc.length + ' phần đầu trên tổng ' + tatCa.length +
             '. Hãy tách tệp đề thành vài tệp nhỏ rồi làm lại cho đủ.');
  for (let i = 0; i < khuc.length; i++) {
    const nhac = LUAT + (trim(nhacThem) ? '\n\nNgười soạn dặn thêm: ' + trim(nhacThem) : '');
    let t;
    try {
      t = await goiAI(env, [
        { role: 'system', content: nhac },
        { role: 'user', content: 'Đoạn ' + (i + 1) + ' trên ' + khuc.length + ':\n\n' + khuc[i] }
      ], { max: 1800, nhiet: 0.2 });
    } catch (e) {
      loi.push('Đoạn ' + (i + 1) + ': ' + trim(e && e.message).slice(0, 160));
      if (e instanceof LoiAI && e.hetHanMuc) break;
      continue;
    }
    const o = layJSON(t);
    const ds = o && Array.isArray(o.cau) ? o.cau : [];
    if (!ds.length) { loi.push('Đoạn ' + (i + 1) + ': không tách được câu nào.'); continue; }
    ds.forEach(function (x) {
      const c = nanCau(x);
      if (cauDungDuoc(c)) cau.push(c);
    });
  }
  return { cau: cau, soKhuc: khuc.length, tongKhuc: tatCa.length, loi: loi };
}

// Cửa chính: nhận mã tài liệu đã có trong kho, trả về danh sách câu hỏi.
export async function tachDeTuTaiLieu(p, env, nguoi, kho, docTep) {
  if (!googleBat(env)) return { ok: false, error: 'Chưa cấp khoá Google nên máy chủ chưa đọc được tệp đề.' };
  const id = trim(p.taiLieuId);
  if (!id) return { ok: false, error: 'Chưa chọn tệp đề.' };
  const kq = await docTep(env, nguoi, kho, id, true);
  if (kq.loi) return { ok: false, error: kq.loi };

  let chu = '';
  try {
    const than = await kq.tep.arrayBuffer();
    if (/^text\//i.test(trim(kq.dong.loai)) || /\.(txt|md|csv)$/i.test(trim(kq.dong.ten)))
      chu = new TextDecoder().decode(than);
    else
      chu = await docChuTrongTep(env, than, trim(kq.dong.ten), trim(kq.dong.loai));
  } catch (e) {
    return { ok: false, error: 'Không đọc được chữ trong tệp: ' + trim(e && e.message).slice(0, 200) };
  }
  chu = trim(chu).slice(0, TEP_CHU_TOI_DA);
  if (!chu) return { ok: false, error: 'Tệp này không có chữ nào đọc được. Nếu là bản chụp thì phải gõ lại hoặc dùng bản có chữ.' };

  const ra = await tachDeTuChu(env, chu, p.nhac);
  if (!ra.cau.length)
    return { ok: false, error: 'Không tách được câu hỏi nào. ' + (ra.loi[0] || 'Hãy kiểm tra lại tệp đề.') };
  return { ok: true, cau: ra.cau, soKhuc: ra.soKhuc, loi: ra.loi,
           message: 'Đã tách được ' + ra.cau.length + ' câu. Hãy soát lại trước khi lưu, AI có thể đọc sai.' };
}
