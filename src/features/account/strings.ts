import { PRIVACY_CONTACT_EMAIL } from '../../services/account';

export const ACCOUNT_TEXT = {
  title: 'บัญชี · Account',
  optional: 'ไม่บังคับ: ใช้แอปได้ครบโดยไม่ต้องเข้าสู่ระบบ ตอนนี้ยังไม่มีการ sync ข้อมูลการเรียน · Optional: the app works fully without an account. Learning data is not synced yet.',
  readPrivacy: 'อ่านความเป็นส่วนตัวก่อนเข้าสู่ระบบ · Read the privacy notice before signing in',
  privacy: 'ความเป็นส่วนตัว · Privacy',
  signIn: 'เข้าสู่ระบบด้วย Google · Sign in with Google',
  checking: 'กำลังตรวจสถานะบัญชี… · Checking the account…',
  checkingOffline: 'ออฟไลน์ · ตรวจสถานะบัญชีไม่ได้ จะตรวจอีกครั้งเมื่อออนไลน์ · Offline: the account will be checked when you are back online.',
  signedInAs: 'เข้าสู่ระบบเป็น · Signed in as',
  offlineSignedIn: 'ออฟไลน์ · ยังเข้าสู่ระบบอยู่ ตรวจกับเซิร์ฟเวอร์ไม่ได้ · Offline: still signed in, not checked with the server.',
  accountInvalid: 'บัญชีหมดอายุหรือถูกลบ · เข้าสู่ระบบใหม่ได้ · The account expired or was deleted. You can sign in again.',
  signOut: 'ออกจากระบบบนอุปกรณ์นี้ · Sign out on this device',
  signOutScope: 'มีผลกับทุกแท็บและแอปที่ติดตั้งบนอุปกรณ์นี้ ไม่มีผลกับอุปกรณ์อื่น · Applies to every tab and the installed app on this device, not to other devices.',
  signOutConfirm: 'ออกจากระบบ · Sign out',
  deleteAccount: 'ลบบัญชี · Delete account',
  deleteConfirm: 'ยืนยันตัวตนและลบบัญชี · Verify and delete',
  deleteExplain:
    'ระบบจะขอให้ยืนยันตัวตนกับ Google อีกครั้ง แล้วลบบัญชีของแอปนี้ แอปยังไม่ได้เก็บข้อมูลการเรียนบน Cloud ข้อมูลการเรียนในเครื่องจะยังอยู่ เว้นแต่คุณเลือกลบ · You will verify with Google again, then the account for this app is deleted. The app stores no learning data in the cloud. Learning data on this device stays unless you choose to delete it.',
  understand: 'ฉันเข้าใจ · I understand',
  cancel: 'ยกเลิก · Cancel',
  deleteLocal: 'ลบความคืบหน้าการเรียนในเครื่องนี้ด้วย · Also delete learning progress on this device',
  sharedDevice: 'ถ้าใช้เครื่องนี้ร่วมกับคนอื่น ข้อมูลการเรียนจะยังอยู่ในเครื่องหลังออกจากระบบ · On a shared device your learning data stays on it after signing out.',
  busy: 'กำลังดำเนินการ… · Working…',
  signInCancelled: '',
  signInBlocked: 'เบราว์เซอร์บล็อกหน้าต่าง Google · กดอีกครั้ง หรืออนุญาต pop-up · The browser blocked the Google window. Tap again or allow pop-ups.',
  signInNetwork: 'ออฟไลน์หรือเชื่อมต่อไม่ได้ · ลองใหม่เมื่อออนไลน์ · Offline or no connection. Try again when online.',
  signInFailed: 'เข้าสู่ระบบไม่สำเร็จ · ลองใหม่อีกครั้ง · Sign-in failed. Please try again.',
  signedOut: 'ออกจากระบบแล้ว · Signed out.',
  signOutFailed: 'ออกจากระบบไม่สำเร็จ · ยังเข้าสู่ระบบอยู่ · Sign-out failed; you are still signed in.',
  localKept: 'ข้อมูลการเรียนในเครื่องยังอยู่ · Learning data on this device is kept.',
  localDeleted: 'ลบความคืบหน้าการเรียนในเครื่องแล้ว · Learning progress on this device was deleted.',
  localFailed: 'ลบข้อมูลในเครื่องไม่สำเร็จ · ข้อมูลยังอยู่ · Deleting the data on this device failed; it is still there.',
  retryLocal: 'ลองลบข้อมูลในเครื่องอีกครั้ง · Try deleting the data on this device again',
  accountDeleted: 'ลบบัญชีแล้ว · The account was deleted.',
  noCloudData: 'แอปยังไม่ได้เก็บข้อมูลการเรียนบน Cloud · The app stored no learning data in the cloud.',
  deleteCancelled: 'ยังไม่ได้ลบบัญชี (ยกเลิกการยืนยันตัวตน) · The account was not deleted (verification cancelled).',
  deleteFailed: 'ลบบัญชีไม่สำเร็จ · ไม่มีข้อมูลใดถูกลบ ลองใหม่ได้ · Deleting the account failed; nothing was deleted. You can try again.',
  deleteNetwork: 'ออฟไลน์หรือเชื่อมต่อไม่ได้ · ยังไม่ได้ลบบัญชี · Offline or no connection; the account was not deleted.',
} as const;

export const PRIVACY_LINKS = {
  google: 'https://policies.google.com/privacy',
  firebase: 'https://firebase.google.com/support/privacy',
} as const;

/** C3: what is stored, why, for how long, what deletion does, and what the app cannot promise. */
export const PRIVACY_TEXT = {
  title: 'ความเป็นส่วนตัว · Privacy',
  back: 'กลับ · Back',
  th: {
    heading: 'ภาษาไทย',
    sections: [
      ['ไม่ต้องมีบัญชี', 'การเข้าสู่ระบบเป็นทางเลือก ใช้แอปได้ครบโดยไม่มีบัญชี ข้อมูลการเรียนเก็บในเครื่องของคุณ และตอนนี้ยังไม่มีการ sync ขึ้น Cloud'],
      ['เก็บอะไร', 'เมื่อเข้าสู่ระบบด้วย Google บริการ Firebase Authentication ของ Google จะเก็บข้อมูลบัญชี ได้แก่ รหัสผู้ใช้ (uid), อีเมล, ชื่อและรูปโปรไฟล์ตามที่ Google ส่งมา และเวลาที่สร้างบัญชีและเข้าสู่ระบบล่าสุด แอปแสดงเฉพาะอีเมล แอปไม่เก็บข้อมูลการเรียนบน Cloud ไม่มี Analytics และไม่ส่งรหัสอุปกรณ์ไปที่ใด'],
      ['ใช้ทำอะไร', 'ใช้ระบุตัวคุณเพื่อเตรียมรองรับการใช้งานหลายเครื่องในอนาคต ซึ่งจะแจ้งให้ทราบก่อนเปิดใช้ ไม่ใช้เพื่อโฆษณาและไม่ขายข้อมูล'],
      ['เก็บนานเท่าไร', 'เก็บจนกว่าคุณจะลบบัญชีในแอป (ตั้งค่า → บัญชี → ลบบัญชี) หรือขอให้ลบผ่านอีเมลด้านล่าง การออกจากระบบไม่ได้ลบบัญชี'],
      ['การลบบัญชี', 'ลบบัญชีของแอปนี้ออกจาก Firebase Authentication ถ้าเข้าสู่ระบบอีกครั้งจะได้บัญชีใหม่ ข้อมูลการเรียนในเครื่องจะถูกลบเฉพาะเมื่อคุณเลือก การลบบัญชีในแอปไม่ได้ลบบัญชี Google ของคุณ'],
      ['สิ่งที่แอปรับรองไม่ได้', 'Google / Firebase อาจเก็บข้อมูลบางส่วนต่อตามนโยบายของตนเอง เช่น log และ backup ของระบบ ซึ่งอยู่นอกการควบคุมของแอป ตามที่ Firebase ระบุ ข้อมูล Authentication จะถูกลบออกจากระบบหลักและ backup ภายใน 180 วันหลังลบผู้ใช้ แอปรับรองได้เฉพาะสิ่งที่ระบบของแอปทำ'],
      ['ติดต่อ', `เรื่องความเป็นส่วนตัวหรือการลบบัญชี: ${PRIVACY_CONTACT_EMAIL}`],
    ],
  },
  en: {
    heading: 'English',
    sections: [
      ['No account needed', 'Signing in is optional; the app works fully without an account. Your learning data stays on your device and is not synced to the cloud yet.'],
      ['What is stored', "When you sign in with Google, Google's Firebase Authentication stores your account data: user id (uid), e-mail, the name and profile picture Google provides, and when the account was created and last used. The app shows only the e-mail. The app stores no learning data in the cloud, has no analytics, and sends the device id nowhere."],
      ['Why', 'To identify you, in preparation for using the app on several devices in the future (you will be told before that is switched on). Never for advertising; never sold.'],
      ['How long', 'Until you delete the account in the app (Settings → Account → Delete account) or ask for deletion at the e-mail below. Signing out does not delete the account.'],
      ['Deleting the account', 'Removes this app’s account from Firebase Authentication; signing in again creates a new account. Learning data on your device is deleted only if you choose so. Deleting the account here does not delete your Google account.'],
      ['What the app cannot promise', 'Google / Firebase may keep some data under their own policies, such as system logs and backups, outside the app’s control. Firebase states that Authentication data is removed from live and backup systems within 180 days after the user is deleted. The app can only vouch for what its own system does.'],
      ['Contact', `Privacy or account deletion: ${PRIVACY_CONTACT_EMAIL}`],
    ],
  },
  links: 'นโยบายของผู้ให้บริการ · Provider policies',
  googleLink: 'นโยบายความเป็นส่วนตัวของ Google · Google Privacy Policy',
  firebaseLink: 'ความเป็นส่วนตัวและความปลอดภัยใน Firebase · Privacy and Security in Firebase',
} as const;
