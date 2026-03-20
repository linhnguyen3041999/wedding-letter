/**
 * Wedding RSVP — Google Apps Script
 *
 * HƯỚNG DẪN DEPLOY:
 * 1. Mở Google Sheets mới, đặt tên tiêu đề ở hàng 1:
 *    Họ Tên | Số Điện Thoại | Tham Dự | Số Người | Điểm Đón | Lời Chúc | Thời Gian
 *
 * 2. Trong Sheets: menu Extensions → Apps Script
 * 3. Xóa code mặc định, dán toàn bộ file này vào
 * 4. Lưu (Ctrl+S)
 * 5. Deploy → New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Nhấn Deploy → copy URL dạng:
 *    https://script.google.com/macros/s/XXXX/exec
 * 7. Dán URL đó vào biến RSVP_ENDPOINT trong index.html
 */

const SHEET_NAME = 'Sheet1'; // đổi nếu tên sheet khác
const HEADERS = ['Họ Tên', 'Số Điện Thoại', 'Tham Dự', 'Số Người', 'Điểm Đón', 'Lời Chúc', 'Thời Gian'];

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#7B2030').setFontColor('#FFFFFF');
    return HEADERS;
  }

  const currentHeader = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(function(v) { return String(v).trim(); })
    .filter(function(v) { return v !== ''; });

  const finalHeader = currentHeader.slice();
  HEADERS.forEach(function(h) {
    if (finalHeader.indexOf(h) === -1) {
      finalHeader.push(h);
    }
  });

  sheet.getRange(1, 1, 1, finalHeader.length).setValues([finalHeader]);
  sheet.getRange(1, 1, 1, finalHeader.length).setFontWeight('bold').setBackground('#7B2030').setFontColor('#FFFFFF');
  return finalHeader;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
    const header = ensureHeaders(sheet);

    const attendText = data.attend === 'yes' ? '✅ Có tham dự' : '❌ Vắng mặt';
    const rowData = {
      'Họ Tên': data.name || '',
      'Số Điện Thoại': data.phone || '',
      'Tham Dự': attendText,
      'Số Người': data.guests || '1',
      'Điểm Đón': data.pickup || '',
      'Lời Chúc': data.message || '',
      'Thời Gian': data.submitted_at || new Date().toLocaleString('vi-VN')
    };

    const row = header.map(function(h) {
      return rowData[h] || '';
    });

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Dùng để test thủ công trong editor
function testPost() {
  doPost({
    postData: {
      contents: JSON.stringify({
        name: 'Nguyễn Văn Test',
        phone: '0901234567',
        attend: 'yes',
        guests: '2',
        pickup: 'Ngã tư Hàng Xanh',
        message: 'Chúc hai bạn hạnh phúc!',
        submitted_at: new Date().toLocaleString('vi-VN')
      })
    }
  });
}
