// ==========================================================================
//  Bắt chỗ nhúng dữ liệu vào THUỘC TÍNH HTML mà chỉ dùng esc().
//
//  esc() chỉ thoát &, < và >. Nó đúng cho nội dung bên trong thẻ, nhưng KHÔNG
//  đủ cho thuộc tính: giá trị chứa một dấu nháy là thoát ra khỏi thuộc tính và
//  gắn được thuộc tính khác, ví dụ onerror. Mà rất nhiều giá trị ở đây do người
//  dùng gõ: tên lớp, link tài liệu, tên từ vựng, ghi chú xử lý lỗi.
//
//  Ngày 08/10/2026 có 42 chỗ như vậy, đã đổi hết sang escAttr(). Bước kiểm tra
//  này giữ cho chúng không quay lại.
//
//  Chạy: node scripts/check-xss.js
// ==========================================================================
const fs = require('fs');
const path = require('path');

const tep = path.join(__dirname, '..', 'index.html');
const dong = fs.readFileSync(tep, 'utf8').split('\r\n').join('\n').split('\n');

// Mở đầu một giá trị thuộc tính rồi nối thẳng esc(...) vào.
const MAU = [
  { re: /="'\s*\+\s*esc\(/, ten: 'thuộc tính nháy kép dùng esc' },
  { re: /='"\s*\+\s*esc\(/, ten: 'thuộc tính nháy đơn dùng esc' },
  { re: /=\\"'\s*\+\s*esc\(/, ten: 'thuộc tính trong chuỗi lồng dùng esc' }
];

const loi = [];
dong.forEach((d, i) => {
  MAU.forEach(m => { if (m.re.test(d)) loi.push({ dong: i + 1, ten: m.ten, ma: d.trim().slice(0, 120) }); });
});

if (!loi.length) {
  console.log('Moi thuoc tinh HTML deu dung escAttr.');
  process.exit(0);
}
console.log('CO ' + loi.length + ' CHO NHUNG DU LIEU VAO THUOC TINH MA CHI DUNG esc():');
loi.forEach(x => console.log('  dong ' + x.dong + '  (' + x.ten + ')\n    ' + x.ma));
console.log('\nDoi esc( thanh escAttr( o nhung cho tren. escAttr thoat ca dau nhay.');
process.exit(1);
