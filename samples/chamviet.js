// ======================================================================
//  AI CHẤM THỬ BÀI VIẾT VÀ BÀI NÓI
//
//  Người dùng chốt ngày 14/10/2026: AI chấm trước cho học viên thấy ngay, rồi
//  người dạy duyệt lại. Điểm AI là ĐIỂM TẠM, không phải điểm cuối, và giao diện
//  phải nói rõ điều đó.
//
//  Vì sao không để AI chấm thẳng thành điểm cuối: mô hình đọc một đoạn tiếng
//  Pháp A1 hay một đoạn chữ Hán HSK3 vẫn sai được, nhất là khi học viên viết
//  sai chính tả tới mức đổi nghĩa. Sai điểm mà không ai soát lại thì học viên
//  chịu thiệt mà không biết đường kêu.
//
//  ---- v54: CHẤM THEO KHUNG CỦA BỘ MÔN ----
//
//  Trước v54 mọi bài đều chấm bằng một khung chung bốn tiêu chí thang 10. Nay
//  mỗi câu chọn khung riêng: IELTS Writing Task 2 thì ra band, DELF B1 thì ra
//  điểm trên 25 theo đúng năm tiêu chí của grille chính thức. Khung nằm ở
//  khungcham.js, kèm nguyên văn mô tả từng mốc điểm để mô hình đọc mà chấm.
// ======================================================================

import { goiAI, layJSON, LoiAI } from './ai.js';
import { layKhung, nhacKhung, tinhTheoKhung, KHUNG_MAC_DINH } from './khungcham.js';

const trim = (v) => String(v === undefined || v === null ? '' : v).trim();

export const CHAM_VIET_TOI_DA_CHU = 6000;

export function gomNhanXet(kq, bao) {
  const ra = [];
  if (bao) ra.push('[' + bao + ']');
  if (trim(kq.nhanXet)) ra.push(trim(kq.nhanXet));
  const loi = Array.isArray(kq.loiChinh) ? kq.loiChinh.map(trim).filter(Boolean).slice(0, 5) : [];
  if (loi.length) ra.push('Lỗi cần sửa: ' + loi.join('; '));
  return ra.join(' ').slice(0, 1600);
}

// Chấm một bài. Trả về { ok, diem, nhanXet, chiTiet } hoặc { ok:false, error }.
//
// `o` gồm: deBai, baiLam, toiDa, soTuToiThieu, khung (mã khung), kyNang, capDo.
export async function chamMotBai(env, o) {
  const bai = trim(o.baiLam).slice(0, CHAM_VIET_TOI_DA_CHU);
  const kyNang = trim(o.kyNang) === 'noi' ? 'noi' : 'viet';
  if (!bai) return { ok: true, diem: 0, nhanXet: kyNang === 'noi' ? 'Không có bài nói.' : 'Bài bỏ trống.' };

  const khung = await layKhung(env, trim(o.khung) || KHUNG_MAC_DINH[kyNang], kyNang);
  const soTu = Number(o.soTuToiThieu) > 0 ? Number(o.soTuToiThieu) : Number(khung.soTuToiThieu) || 0;

  let nhac = nhacKhung(khung);
  if (soTu > 0) nhac += '\n\nĐề yêu cầu tối thiểu ' + soTu + ' từ. Bài làm có ' +
    bai.split(/\s+/).filter(Boolean).length + ' từ.';
  if (trim(o.capDo)) nhac += '\nĐề này ghi trình độ: ' + trim(o.capDo) + '.';
  if (kyNang === 'noi') nhac += '\n\nBài dưới đây là BẢN GỠ CHỮ của đoạn ghi âm học viên nói, ' +
    'nên dấu câu và chính tả không phải lỗi của học viên. Đừng trừ điểm chính tả.';

  let t;
  try {
    t = await goiAI(env, [
      { role: 'system', content: nhac },
      { role: 'user', content: 'Đề bài:\n' + trim(o.deBai) +
        (kyNang === 'noi' ? '\n\nBản gỡ chữ bài nói của học viên:\n' : '\n\nBài làm của học viên:\n') + bai }
    ], { max: 900, nhiet: 0.2 });
  } catch (e) {
    return { ok: false, error: trim(e && e.message).slice(0, 200), hetHanMuc: !!(e && e.hetHanMuc) };
  }
  const kq = layJSON(t);
  if (!kq) return { ok: false, error: 'AI trả lời không đúng khuôn.' };

  // Mô hình có lúc trả điểm phẳng ở gốc thay vì trong "diem". Nhận cả hai.
  const diem = (kq.diem && typeof kq.diem === 'object') ? kq.diem : kq;
  const tinh = tinhTheoKhung(khung, diem, o.toiDa);
  return { ok: true, diem: tinh.diemCau, nhanXet: gomNhanXet(kq, tinh.baoNhan),
           chiTiet: { khung: khung.ma, khungTen: khung.ten, thangBao: khung.thangBao,
                      bao: tinh.bao, baoNhan: tinh.baoNhan, tong: tinh.tongTieuChi,
                      thangTong: khung.thangTong, theoTieuChi: tinh.theoTieuChi,
                      tenTieuChi: khung.tieuChi.map(function (x) {
                        return { ma: x.ma, ten: x.ten, toiDa: x.diemToiDa };
                      }) } };
}

// Chấm mọi câu cần chấm của một lượt làm bài. Gọi ngay sau khi học viên nộp.
//
// Không ghi đè điểm người dạy đã cho: câu nào đã có người chấm thì bỏ qua.
export async function chamBaiNop(env, cauCham) {
  const ra = [];
  for (const c of (cauCham || [])) {
    const kq = await chamMotBai(env, c);
    if (!kq.ok) {
      ra.push({ ma: c.ma, ok: false, error: kq.error });
      if (kq.hetHanMuc) break;
      continue;
    }
    ra.push({ ma: c.ma, ok: true, diem: kq.diem, nhanXet: kq.nhanXet, chiTiet: kq.chiTiet });
  }
  return ra;
}
