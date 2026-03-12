/**
 * Wedding RSVP — Google Apps Script
 *
 * HƯỚNG DẪN DEPLOY:
 * 1. Mở Google Sheets mới, đặt tên tiêu đề ở hàng 1:
 *    Họ Tên | Tham Dự | Số Người | Điểm Đón | Lời Chúc | Thời Gian
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

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

    // Tạo header nếu sheet còn trống
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Họ Tên', 'Tham Dự', 'Số Người', 'Điểm Đón', 'Lời Chúc', 'Thời Gian']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#7B2030').setFontColor('#FFFFFF');
    }

    const attendText = data.attend === 'yes' ? '✅ Có tham dự' : '❌ Vắng mặt';

    sheet.appendRow([
      data.name        || '',
      attendText,
      data.guests      || '1',
      data.pickup      || '',
      data.message     || '',
      data.submitted_at || new Date().toLocaleString('vi-VN')
    ]);

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
        attend: 'yes',
        guests: '2',
        pickup: 'Ngã tư Hàng Xanh',
        message: 'Chúc hai bạn hạnh phúc!',
        submitted_at: new Date().toLocaleString('vi-VN')
      })
    }
  });
}
