// ============================================================
// D.I.Y. Teamwork — Auth.gs
// ฟังก์ชันจัดการ Authentication ทั้งหมด
// ============================================================

/**
 * checkAdminPassword(pass)
 * ตรวจสอบรหัสผ่าน Admin จาก Settings sheet
 * เรียกจาก Login.html
 */
function checkAdminPassword(pass) {
  try {
    if (!pass || typeof pass !== 'string') {
      return { success: false, error: 'Invalid password input' };
    }

    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    const settings = getSheetData(ss, 'Settings');
    const row      = settings.find(s => s.key === 'admin_password');
    const stored   = row ? String(row.value) : 'admin1234'; // default fallback

    if (pass.trim() === stored.trim()) {
      return { success: true, role: 'admin' };
    } else {
      return { success: false, error: 'รหัสผ่านไม่ถูกต้อง' };
    }
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * checkHostPassword(pass)
 * ตรวจสอบรหัสผ่าน Host (ถ้า feature เปิดอยู่)
 * Default: ไม่ต้องใช้รหัสผ่าน Host
 */
function checkHostPassword(pass) {
  try {
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    const settings = getSheetData(ss, 'Settings');

    // เช็คว่า feature host_password_enabled เปิดอยู่หรือเปล่า
    const featureRow  = settings.find(s => s.key === 'host_password_enabled');
    const isEnabled   = featureRow && featureRow.value === 'true';

    if (!isEnabled) {
      return { success: true, role: 'host' }; // ไม่ต้องรหัสผ่าน
    }

    const pwRow  = settings.find(s => s.key === 'host_password');
    const stored = pwRow ? String(pwRow.value) : '';

    if (!stored || pass.trim() === stored.trim()) {
      return { success: true, role: 'host' };
    } else {
      return { success: false, error: 'รหัสผ่าน Host ไม่ถูกต้อง' };
    }
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * validateSession(sessionToken)
 * ตรวจสอบว่า token ยังใช้งานได้ (simple version - เก็บใน PropertiesService)
 * สำหรับ production จริงควรต่อยอดให้ครบ
 */
function validateSession(sessionToken) {
  try {
    if (!sessionToken) return { valid: false };
    const props = PropertiesService.getScriptProperties();
    const stored = props.getProperty('session_' + sessionToken);
    if (!stored) return { valid: false };

    const data = JSON.parse(stored);
    const now  = Date.now();
    // session หมดอายุหลัง 8 ชั่วโมง
    if (now - data.createdAt > 8 * 60 * 60 * 1000) {
      props.deleteProperty('session_' + sessionToken);
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, role: data.role };
  } catch (err) {
    return { valid: false, error: err.toString() };
  }
}

/**
 * createSessionToken(role)
 * สร้าง token หลัง login สำเร็จ (เก็บใน ScriptProperties)
 */
function createSessionToken(role) {
  try {
    const token = Utilities.getUuid();
    const props = PropertiesService.getScriptProperties();
    props.setProperty('session_' + token, JSON.stringify({
      role,
      createdAt: Date.now()
    }));
    return { success: true, token };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * logout(sessionToken)
 * ลบ token ออกจาก ScriptProperties
 */
function logout(sessionToken) {
  try {
    if (sessionToken) {
      PropertiesService.getScriptProperties().deleteProperty('session_' + sessionToken);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * changeAdminPassword(oldPass, newPass)
 * เปลี่ยนรหัสผ่าน Admin — ต้องตรวจ old password ก่อน
 */
function changeAdminPassword(oldPass, newPass) {
  try {
    const check = checkAdminPassword(oldPass);
    if (!check.success) return { success: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' };
    if (!newPass || newPass.trim().length < 4) {
      return { success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' };
    }
    return saveSettings({ admin_password: newPass.trim() });
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}