// ==========================================================================
//  Quét bảng định tuyến: hành động nào KHÔNG kiểm quyền người gọi.
//
//  Mọi hành động trong Code.gs đều đi qua một hàm auth ở dòng đầu (authUser_,
//  authAdmin_, authFinance_, authRole_, authAnyRole_, authAdminOrHr_...). Thiếu
//  nó nghĩa là ai gõ đúng tên hành động cũng gọi được, kể cả người lạ.
//
//  Một số hành động CỐ Ý mở cho khách chưa đăng nhập (đăng ký, đăng nhập, gửi
//  đơn tư vấn, báo lỗi, tra từ điển). Chúng nằm trong danh sách MO_CONG_KHAI
//  dưới đây, kèm lý do, để người đọc sau biết đó là lựa chọn chứ không phải sót.
//
//  Chạy: node scripts/check-quyen.js
// ==========================================================================
const fs = require('fs');
const path = require('path');

const nguon = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8').split('\r\n').join('\n');

// Hành động mở cho mọi người, có chủ ý.
const MO_CONG_KHAI = {
  // Khong kiem dang nhap nguoi dung vi KHONG phai nguoi dung goi: Worker tu goi
  // sau khi hoc vien nop bai, de AI cham thu cau viet. Cua nay doi co noi bo
  // __aiNoiBo, va Worker xoa sach moi khoa bat dau bang hai gach duoi trong du
  // lieu nhan tu mang truoc khi tu dat lai, nen nguoi ngoai khong gia duoc.
  lt_cham_ai: 'chỉ Worker gọi, chắn bằng cờ nội bộ __aiNoiBo',
  ping: 'kiểm tra máy chủ sống',
  schema_info: 'xem phiên bản cấu trúc, không có dữ liệu',
  kiemtra: 'trang kiểm tra bản triển khai',
  login: 'đăng nhập',
  register_start: 'đăng ký, bước gửi mã',
  register_verify: 'đăng ký, bước xác nhận mã',
  forgot_start: 'quên mật khẩu, bước gửi mã',
  forgot_verify: 'quên mật khẩu, bước xác nhận mã',
  forgot_reset: 'quên mật khẩu, bước đặt lại',
  session_check: 'tự kiểm phiên đăng nhập',
  logout: 'đăng xuất',
  submit_student: 'khách gửi đơn đăng ký tư vấn',
  submit_member: 'khách gửi đơn ứng tuyển',
  bug_report_submit: 'ai cũng báo lỗi được, kể cả khi chưa đăng nhập được',
  public_team: 'trang đội ngũ công khai',
  public_stats: 'số liệu công khai trên trang chủ',
  dict_lookup: 'tra từ điển, dùng ngay trong lúc làm bài',
  track: 'ghi nhận lượt xem trang',
  changelog_list: 'danh sách bản cập nhật',
  thu_gui_ngay: 'Worker gọi về, tự kiểm khoá đồng bộ bên trong',
  d1_nhap_kho: 'công cụ kho, tự kiểm khoá đồng bộ bên trong',
  d1_xuat_bang: 'công cụ kho, tự kiểm khoá đồng bộ bên trong',
  batch: 'gói nhiều lời gọi; mỗi lời gọi con chạy qua chayHanhDong_ và tự kiểm quyền, còn BATCH_CAM_ chặn đăng nhập và các bước OTP để không ai thử tám mật khẩu trong một lượt'
};

// Dấu hiệu một hàm có kiểm quyền. Ngoài các hàm auth* gọi thẳng, vài màn hình
// kiểm quyền qua một hàm trung gian. Bốn hàm dưới đây đã đọc tận nơi ngày
// 08/10/2026: tất cả đều gọi authUser_ ở dòng đầu.
const AUTH_GIAN_TIEP = ['ranhQuyen_', 'errorLogManagerAuth_', 'satAuthAccess_',
  'satAuthUpload_', 'satReportAuth_'];
const DAU_AUTH = new RegExp('\\bauth[A-Za-z]*_\\s*\\(|trim_\\(p\\.khoa\\)|' +
  AUTH_GIAN_TIEP.map(function (x) { return '\\b' + x + '\\s*\\('; }).join('|'));

// ---- Đọc bảng định tuyến ----
const dsHanhDong = [];
const reCase = /case\s+'([a-z0-9_]+)'\s*:\s*out\s*=\s*([A-Za-z0-9_$]+)\s*\(/g;
let m;
while ((m = reCase.exec(nguon)) !== null) dsHanhDong.push({ act: m[1], ham: m[2] });

if (dsHanhDong.length < 50) {
  console.log('CHUA DOC DUOC BANG DINH TUYEN (chi thay ' + dsHanhDong.length + ' hanh dong).');
  process.exit(1);
}

// ---- Lấy thân của một hàm ----
function thanHam(ten) {
  const i = nguon.indexOf('function ' + ten + '(');
  if (i < 0) return null;
  let sau = nguon.indexOf('{', i);
  if (sau < 0) return null;
  let sau2 = sau, mo = 0;
  for (; sau2 < nguon.length; sau2++) {
    if (nguon[sau2] === '{') mo++;
    else if (nguon[sau2] === '}') { mo--; if (!mo) break; }
  }
  return nguon.slice(sau, sau2 + 1);
}

const thieu = [], khongThayHam = [];
dsHanhDong.forEach(function (x) {
  if (MO_CONG_KHAI[x.act]) return;
  const than = thanHam(x.ham);
  if (than === null) { khongThayHam.push(x); return; }
  if (!DAU_AUTH.test(than)) thieu.push(x);
});

let hong = 0;
if (khongThayHam.length) {
  hong++;
  console.log('KHONG TIM THAY THAN HAM cua ' + khongThayHam.length + ' hanh dong:');
  khongThayHam.forEach(x => console.log('  ' + x.act + ' -> ' + x.ham));
}
if (thieu.length) {
  hong++;
  console.log('CO ' + thieu.length + ' HANH DONG KHONG KIEM QUYEN:');
  thieu.forEach(x => console.log('  ' + x.act + ' -> ' + x.ham + '()'));
  console.log('\nThem ham auth vao dau cac ham tren, hoac neu co y mo cong khai thi');
  console.log('khai bao trong MO_CONG_KHAI cua scripts/check-quyen.js kem ly do.');
}

if (!hong) {
  console.log('Da soat ' + dsHanhDong.length + ' hanh dong: ' +
    Object.keys(MO_CONG_KHAI).length + ' mo cong khai co chu y, con lai deu kiem quyen.');
  process.exit(0);
}
process.exit(1);
